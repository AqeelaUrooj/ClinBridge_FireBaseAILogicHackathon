import '../../config/policy.dart';
import '../../core/clock.dart';
import '../../core/util.dart';
import '../../domain/fhir.dart';
import '../../domain/recovery.dart';
import '../ctx.dart';
import '../schema.dart';
import '../store.dart';
import 'entries.dart';

/// Downtime, recovery, handover and export operations, ported from web src/db/repos/{admin,worklist,handoff,export}.ts.
/// Every operation checks the role itself and writes its audit row in the same transaction.

/* ------------------------------ Phase ------------------------------ */

enum Phase { ready, down, online }

const Map<Phase, String> kPhaseLabel = {Phase.ready: 'Normal', Phase.down: 'System down', Phase.online: 'Back online'};

DowntimeEvent? currentEvent(Store s) {
  final open = s.all('downtime_event').map(DowntimeEvent.new).where((e) => e.endedAt == null).toList()..sort((a, b) => ms(b.declaredAt).compareTo(ms(a.declaredAt)));
  return open.firstOrNull;
}

Phase derivePhase(DowntimeEvent? ev) => ev == null ? Phase.ready : (ev.networkClearedAt == null ? Phase.down : Phase.online);

/// Practice only: close the open practice outage and start a fresh one (web startPracticeOutageDrill).
String startPracticeOutage(Ctx c) => c.store.tx(() {
      c.admin();
      for (final row in c.store.all('downtime_event').where((e) => e['ended_at'] == null)) {
        final now = c.clock.nowIso();
        c.store.update('downtime_event', row['id'] as String, {'ended_at': now});
        c.audit('practice_drill_closed', 'downtime_event/${row['id']}', {'ended_at': now, 'practice_drill': true}, before: {'ended_at': null});
      }
      final now = c.clock.nowIso();
      final id = 'dt-${now.substring(0, 16).replaceAll(RegExp('[:T]'), '-')}-${uuid().substring(0, 4)}';
      final row = {'id': id, 'declared_at': now, 'declared_by': c.userId, 'network_cleared_at': null, 'cleared_by': null, 'ended_at': null};
      c.store.insert('downtime_event', row);
      c.audit('downtime_declared', 'downtime_event/$id', {'declared_at': now});
      return id;
    });

/// Local Practice transition to Back online: every checklist item + the admin's own PIN (checked by the caller).
/// It opens no connection and sends nothing.
void clearNetwork(Ctx c, List<String> ticked, {required bool pinOk}) => c.store.tx(() {
      c.admin();
      if (kNetworkChecklist.any((x) => !ticked.contains(x))) throw const AppError('Tick every checklist item first.');
      if (!pinOk) throw const AppError('PIN is not right.');
      final ev = currentEvent(c.store);
      if (ev == null) throw const AppError('No downtime is open.');
      if (ev.networkClearedAt != null) throw const AppError('The network was already cleared.');
      final now = c.clock.nowIso();
      c.store.update('downtime_event', ev.id, {'network_cleared_at': now, 'cleared_by': c.userId});
      c.audit('network_cleared', 'downtime_event/${ev.id}', {'network_cleared_at': now, 'checklist': ticked}, before: {'network_cleared_at': null});
    });

void endDowntime(Ctx c) => c.store.tx(() {
      c.admin();
      final ev = currentEvent(c.store);
      if (ev == null) throw const AppError('No downtime is open.');
      if (ev.networkClearedAt == null) throw const AppError('Clear the network (Back online) before ending.');
      final open = c.store.all('worklist_item').where((w) => w['signed_off_at'] == null).length;
      if (open > 0) throw AppError('$open worklist items are not signed off yet.');
      final now = c.clock.nowIso();
      c.store.update('downtime_event', ev.id, {'ended_at': now});
      c.audit('downtime_ended', 'downtime_event/${ev.id}', {'ended_at': now}, before: {'ended_at': null});
    });

/* ------------------------------ Downtime checklist ------------------------------ */

/// Tick or untick one checklist item. Admin only; actor and time are kept. [eventId] scopes ticks to one downtime.
void setChecklistItem(Ctx c, {required String eventId, required String itemId, required bool done}) => c.store.tx(() {
      c.admin();
      final id = '$eventId/$itemId';
      final before = c.store.get('m_checklist', id);
      final row = {'id': id, 'event_id': eventId, 'item_id': itemId, 'done': done, 'by': c.userId, 'time': c.clock.nowIso()};
      c.store.put('m_checklist', row);
      c.audit('checklist_changed', 'checklist/$id', {'done': done}, before: {'done': before?['done'] ?? false});
    });

Map<String, Doc> checklistState(Store s, String eventId) => {for (final r in s.all('m_checklist')) if (r['event_id'] == eventId) r['item_id'] as String: r};

/* ------------------------------ Recovery worklist ------------------------------ */

DowntimeEvent _requireOnline(Ctx c) {
  final ev = currentEvent(c.store);
  if (ev?.networkClearedAt == null) throw const AppError('Recovery starts after an admin clears the network (Back online).');
  return ev!;
}

/// Adds an item for every confirmed downtime record that has none yet. Existing items are not touched.
int buildWorklist(Ctx c) => c.store.tx(() {
      c.person();
      final ev = _requireOnline(c);
      final s = c.store;
      final existing = {for (final w in s.all('worklist_item')) w['entry_id']};
      final orders = {for (final o in s.all('active_order')) o['id'] as String: ActiveOrder(o)};
      var added = 0;
      for (final p in s.all('patient')) {
        final all = [for (final x in listPatientEntries(s, p['id'] as String)) if (x.entry.isConfirmed) x];
        for (final x in all) {
          if (existing.contains(x.entry.id) || !inDowntime(x.entry, ev)) continue;
          final f = flagEntry(x, all, orders);
          s.insert('worklist_item', {
            'id': 'wl-${uuid().substring(0, 8)}', 'entry_id': x.entry.id, 'patient_id': p['id'], 'category': kCategory[x.entry.type],
            'priority': queuePriority(x.entry.type, f.flags), 'flags': f.flags, 'billable': null, 'assigned_to': null, 'signed_off_by': null,
            'signed_off_at': null, 'exported_at': null, 'second_look_status': null, 'second_look_reading': null, 'mismatch_fields': null,
          });
          added++;
        }
      }
      if (added > 0) c.audit('worklist_built', 'worklist', {'added': added, 'method': 'rules-only'});
      return added;
    });

/// A person confirms the item was checked against its sources. [reason] is required when the item is flagged.
/// The record itself and the other readings stay exactly as they are.
void signOffItem(Ctx c, String itemId, {String? reason, String decision = 'record_kept'}) => c.store.tx(() {
      final s = c.store;
      c.person();
      _requireOnline(c);
      final row = s.get('worklist_item', itemId);
      if (row == null) throw const AppError('Worklist item not found.');
      final item = WorklistItem(row);
      if (item.signedOffAt != null) throw const AppError('Already signed off.');
      final e = getEntry(s, item.entryId);
      if (e?.entry.isDraft ?? false) throw const AppError('Confirm the draft before signing off.');
      if (item.flags.isNotEmpty && (reason ?? '').trim().isEmpty) throw const AppError('Write the reason for your decision.');
      final now = c.clock.nowIso();
      if ((reason ?? '').trim().isNotEmpty) {
        final id = newId('res');
        final r = {'id': id, 'item_id': itemId, 'decision': decision, 'reason': reason!.trim(), 'by': c.userId, 'time': now, 'flags': item.flags};
        s.insert('m_resolution', r);
        c.audit('recovery_decision', 'worklist_item/$itemId', r);
      }
      s.update('worklist_item', itemId, {'signed_off_by': c.userId, 'signed_off_at': now});
      c.audit('worklist_signed_off', 'worklist_item/$itemId', {'signed_off_by': c.userId, 'entry_status': e?.entry.status ?? 'missing'});
    });

List<Doc> resolutionsFor(Store s, String itemId) => s.where('m_resolution', 'item_id', itemId);

/* ------------------------------ SBAR handover ------------------------------ */

Map<String, String> validateHandoff({required String shift, required String situation, required String background, required String assessment}) => {
      if (shift.trim().isEmpty) 'shift': 'Say which handover this is',
      if (situation.trim().isEmpty) 'situation': 'Write the situation',
      if (background.trim().isEmpty) 'background': 'Write the background',
      if (assessment.trim().isEmpty) 'assessment': 'Write the assessment',
    };

/// Final SBAR note: append-only, linked only to confirmed records of the same patient. [clientKey] = exactly once.
Handoff createHandoff(Ctx c, {required String patientId, required String shift, required String situation, required String background, required String assessment, required List<String> openItems, required List<String> sourceEntryIds, required String clientKey, String? draftId}) =>
    c.store.tx(() {
      final s = c.store;
      c.nurse();
      c.patient(patientId);
      final done = s.get('m_entry_key', clientKey);
      if (done != null) return Handoff(s.get('handoff', done['entry_id'] as String)!);
      final errors = validateHandoff(shift: shift, situation: situation, background: background, assessment: assessment);
      if (errors.isNotEmpty) throw AppError(errors.values.first);
      final ids = sourceEntryIds.toSet().toList();
      for (final id in ids) {
        final e = s.get('entry', id);
        if (e == null) throw AppError('Linked record $id was not found.');
        if (e['patient_id'] != patientId) throw const AppError('A linked record belongs to another patient.');
        if (e['status'] != 'confirmed') throw const AppError('Only confirmed records can be linked to a handover.');
      }
      final row = <String, Object?>{
        'id': newId('ho'), 'patient_id': patientId, 'shift': shift.trim(), 'situation': situation.trim(), 'background': background.trim(),
        'assessment': assessment.trim(), 'open_items': [for (final x in openItems) if (x.trim().isNotEmpty) x.trim()], 'source_entry_ids': ids, 'created_by': c.userId,
      };
      s.insert('handoff', row);
      s.insert('m_entry_key', {'id': clientKey, 'entry_id': row['id']});
      c.audit('handoff_saved', 'handoff/${row['id']}', row);
      if (draftId != null && s.get('m_draft', draftId) != null) s.delete('m_draft', draftId);
      return Handoff(row);
    });

class HandoffWithTime {
  final Handoff handoff;

  /// Null for the notes that came with the practice dataset.
  final String? savedAt;
  const HandoffWithTime(this.handoff, this.savedAt);
}

List<HandoffWithTime> listHandoffs(Store s, String patientId) {
  final times = {for (final a in s.where('audit_log', 'action', 'handoff_saved')) (a['entity'] as String).replaceFirst('handoff/', ''): a['time'] as String};
  final out = [for (final h in s.where('handoff', 'patient_id', patientId)) HandoffWithTime(Handoff(h), times[h['id']])];
  out.sort((a, b) => (b.savedAt ?? '').compareTo(a.savedAt ?? ''));
  return out;
}

/// The shift a time belongs to (seed: night 19:00–07:00, day 07:00–19:00). Returns (label, startIso).
(String, String) shiftOf(String iso) {
  final h = int.parse(iso.substring(11, 13)), off = iso.substring(19);
  if (h >= 7 && h < 19) return ('Day shift (07:00–19:00)', '${iso.substring(0, 10)}T07:00:00$off');
  if (h >= 19) return ('Night shift (19:00–07:00)', '${iso.substring(0, 10)}T19:00:00$off');
  return ('Night shift (19:00–07:00)', PracticeClock.toIso(ms('${iso.substring(0, 10)}T19:00:00$off') - 86400000));
}

/// SBAR notes saved in the current shift, by patient (latest wins).
Map<String, HandoffWithTime> shiftHandoffs(Store s, String nowIso) {
  final start = ms(shiftOf(nowIso).$2);
  final out = <String, HandoffWithTime>{};
  for (final p in s.all('patient')) {
    final l = listHandoffs(s, p['id'] as String).where((h) => h.savedAt != null && ms(h.savedAt!) >= start).firstOrNull;
    if (l != null) out[p['id'] as String] = l;
  }
  return out;
}

/// Latest sign-off of this shift; of one outgoing nurse when [outgoingId] is given.
Doc? shiftSignoff(Store s, String nowIso, {String? outgoingId}) {
  final start = shiftOf(nowIso).$2;
  return s.all('m_shift_signoff').where((r) => r['shift_start'] == start && (outgoingId == null || r['outgoing_id'] == outgoingId)).lastOrNull;
}

/// Patients this nurse hands over: the own list plus everyone the nurse recorded care for in this shift
/// (taking a patient off the list does not remove that duty); the whole ward when there is none.
List<String> handoverRoster(Store s, String nurseId, String nowIso) {
  final start = ms(shiftOf(nowIso).$2), mine = assignedPatients(s, nurseId);
  final out = [
    for (final p in s.all('patient').map((p) => p['id'] as String))
      if (mine.contains(p) || s.where('entry', 'patient_id', p).any((e) => e['performer_id'] == nurseId && e['status'] == 'confirmed' && ms(e['entry_time'] as String) >= start)) p,
  ];
  return out.isEmpty ? [for (final p in s.all('patient')) p['id'] as String] : out;
}

/// Two different people sign the shift handover. Blocked while any patient of [handoverRoster] has no final SBAR this shift.
/// Both PINs were checked by the caller (AppState.shiftSignoff). There is no bypass.
void recordShiftSignoff(Ctx c, {required List<String> roster, required String incomingId}) => c.store.tx(() {
      final s = c.store;
      c.nurse();
      if (incomingId == c.userId) throw const AppError('The incoming nurse must be a different person.');
      final inc = s.get('practitioner', incomingId);
      if (inc == null || !Practitioner(inc).active || !kSecondCheckerRoles.contains(inc['role'])) throw const AppError('This person cannot co-sign the handover.');
      final now = c.clock.nowIso();
      if (shiftSignoff(s, now, outgoingId: c.userId) != null) throw const AppError('You already signed off this shift.');
      final have = shiftHandoffs(s, now);
      final all = {...roster, ...handoverRoster(s, c.userId, now)};
      if (all.isEmpty) throw const AppError('There is no patient on this handover.');
      final missing = all.where((p) => !have.containsKey(p)).length;
      if (missing > 0) throw AppError('$missing patient${missing == 1 ? ' has' : 's have'} no final SBAR note for this shift. Finish the notes first.');
      final row = {
        'id': newId('sh'), 'time': now, 'shift': shiftOf(now).$1, 'shift_start': shiftOf(now).$2, 'outgoing_id': c.userId, 'incoming_id': incomingId,
        'handoff_ids': [for (final p in all) have[p]!.handoff.id],
      };
      s.insert('m_shift_signoff', row);
      c.audit('shift_signed_off', 'shift/${row['id']}', row);
    });

/* ------------------------------ Assignment ------------------------------ */

Set<String> assignedPatients(Store s, String practitionerId) => {for (final r in s.where('m_assignment', 'practitioner_id', practitionerId)) r['patient_id'] as String};

void setAssigned(Ctx c, String patientId, bool on) => c.store.tx(() {
      c.nurse();
      final id = '${c.userId}/$patientId';
      if (on) {
        c.store.put('m_assignment', {'id': id, 'practitioner_id': c.userId, 'patient_id': patientId, 'time': c.clock.nowIso()});
      } else {
        c.store.delete('m_assignment', id);
      }
      c.audit('assignment_changed', 'assignment/$id', {'on': on});
    });

/* ------------------------------ FHIR export ------------------------------ */

class ExportFile {
  final Doc bundle;
  final String json;
  final List<String> errors;
  final int drafts, openItems, blockers;
  const ExportFile(this.bundle, this.json, this.errors, this.drafts, this.openItems, this.blockers);
  List get entries => bundle['entry'] as List;
  Map<String, int> get counts {
    final m = <String, int>{};
    for (final e in entries) {
      final t = ((e as Map)['resource'] as Map)['resourceType'] as String;
      m[t] = (m[t] ?? 0) + 1;
    }
    return m;
  }
}

/// Builds the FHIR R4 bundle from the stored records and checks the exact text that would be saved.
ExportFile prepareExport(Store s, String nowIso) {
  final entries = [for (final e in s.all('entry')) if (e['status'] != 'draft') EntryX(Entry(e), s.where(e['type'] as String, 'entry_id', e['id'] as String).firstOrNull)];
  entries.sort((a, b) {
    final r = a.entry.careTime.compareTo(b.entry.careTime);
    return r == 0 ? a.entry.id.compareTo(b.entry.id) : r;
  });
  List<Doc> byId(String t) => s.all(t)..sort((a, b) => (a['id'] as String).compareTo(b['id'] as String));
  final bundle = buildBundle(
    patients: byId('patient'), encounters: byId('encounter'), allergies: byId('allergy'), orders: byId('active_order'), practitioners: byId('practitioner'),
    entries: entries, exportedAt: nowIso, deviceLabels: {for (final d in s.all('device')) d['id'] as String: d['label'] as String},
  );
  final json = jsonText(bundle, indent: '  ');
  final work = s.all('worklist_item').map(WorklistItem.new).toList();
  return ExportFile(bundle, json, validateBundleText(json), s.all('entry').where((e) => e['status'] == 'draft').length, work.where((w) => w.signedOffAt == null).length,
      work.where((w) => w.signedOffAt == null && w.flags.isNotEmpty).length);
}

/// Recorded only after the file was really saved by the person. Marks signed-off items as exported.
String recordExport(Ctx c, String json, String fileName) => c.store.tx(() {
      c.admin();
      final ev = currentEvent(c.store);
      if (ev?.networkClearedAt == null) throw const AppError('Export is available after an admin clears the network (Back online).');
      final hash = sha256Text(json);
      final now = c.clock.nowIso();
      for (final w in c.store.all('worklist_item')) {
        if (w['signed_off_at'] != null && w['exported_at'] == null) c.store.update('worklist_item', w['id'] as String, {'exported_at': now});
      }
      c.audit('fhir_export', 'bundle', {'sha256': hash, 'bytes': json.length, 'file': fileName});
      return hash;
    });

void recordFile(Ctx c, {required String action, required String entity, required Doc after}) => c.store.tx(() {
      c.person();
      c.audit(action, entity, after);
    });

/// Written before Android's save screen opens, so a file that is saved while the app locks behind it is still in the log.
void recordSaving(Ctx c, String entity, String fileName, List<int> bytes) =>
    recordFile(c, action: 'file_saving', entity: entity, after: {'file': fileName, 'bytes': bytes.length, 'sha256': sha256Hex(bytes)});

/// Verified patient, with staff, patient, time and the identifiers that were confirmed.
void recordPatientVerified(Ctx c, String patientId, List<String> identifiers) => c.store.tx(() {
      c.person();
      if (c.store.get('patient', patientId) == null) throw const AppError('This patient is not in the patient list.');
      if (identifiers.length < 2) throw const AppError('Confirm two identifiers.');
      c.audit('patient_verified', 'patient/$patientId', {'identifiers': identifiers});
    });
