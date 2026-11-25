import 'dart:typed_data';

import '../../config/policy.dart';
import '../../core/clock.dart';
import '../../core/util.dart';
import '../../domain/meds.dart';
import '../ctx.dart';
import '../schema.dart';
import '../store.dart';

/// Append-only clinical entries, ported from web src/db/repos/entries.ts. Rules enforced here, below every screen:
///  - the acting nurse is active and still signed in; the patient is the verified patient
///  - an entry, its child row and its audit rows are saved in one transaction
///  - values are never edited; a correction is a NEW entry (supersedes_id) with a reason
///  - a high-alert dose needs a valid second-nurse attestation for exactly this content
///  - a blocked dose (hold, duplicate slot, order interval) is refused again here
///  - [clientKey] makes a repeated tap or a retry return the first saved entry (exactly once)
Entry createEntry(
  Ctx c, {
  required String type,
  required String patientId,
  required String careTime,
  required Doc values,
  required String clientKey,
  String rawInputKind = 'typed',
  String? rawInputRef,
  Doc? photoCheck,
  String status = 'confirmed',
  String? scheduledTime,
  String? supersedesId,
  String? correctionReason,
  String? attestationId,
  void Function(Entry saved)? also,
}) {
  final s = c.store;
  return s.tx(() {
    final who = c.nurse();
    c.patient(patientId);
    final done = s.get('m_entry_key', clientKey);
    if (done != null) {
      final first = Entry(s.get('entry', done['entry_id'] as String)!);
      // The same key may only repeat the same save; a draft saved under it is not the confirmed record asked for now.
      if (first.isDraft && status != 'draft') throw const AppError('This form was saved as a draft before. Confirm that draft.');
      return first;
    }

    final enc = s.where('encounter', 'patient_id', patientId).firstOrNull;
    if (enc == null) throw const AppError('This patient has no encounter in the patient list.');
    final now = c.clock.nowIso();
    if (ms(careTime) > ms(now) + 60000) throw const AppError('The time cannot be in the future.');
    Entry? old;
    if (supersedesId != null) {
      final row = s.get('entry', supersedesId);
      if (row == null) throw const AppError('The record being corrected was not found.');
      old = Entry(row);
      if (!old.isConfirmed) throw const AppError('Only a confirmed record can be corrected.');
      if (old.patientId != patientId) throw const AppError('A correction must stay with the same patient.');
      if (old.type != type) throw const AppError('A correction must be the same kind of record.');
      if ((correctionReason ?? '').trim().isEmpty) throw const AppError('A reason is required to fix a record.');
    }
    final confirmed = status == 'confirmed';
    final vals = {...values};
    if (type == 'med_admin' && confirmed) {
      _checkMed(c, patientId, vals, careTime, scheduledTime, attestationId, who, ignoreEntryId: supersedesId);
    }
    final id = newId('e');
    final entry = <String, Object?>{
      'id': id, 'type': type, 'patient_id': patientId, 'encounter_id': enc['id'], 'care_time': careTime, 'entry_time': now,
      'scheduled_time': scheduledTime, 'counter': s.nextCounter(c.deviceId), 'device_id': c.deviceId, 'performer_id': c.userId, 'enterer_id': null,
      'raw_input_kind': rawInputKind, 'raw_input_ref': rawInputRef ?? 'typed:$id', 'ai_proposal': null, 'inference_source': null,
      'confirmed': confirmed ? vals : null, 'confirmed_by': confirmed ? c.userId : null, 'confirmed_at': confirmed ? now : null,
      'status': status, 'supersedes_id': supersedesId, 'photo_check': photoCheck, 'change_reason': old == null ? null : correctionReason!.trim(),
    };
    s.insert('entry', entry);
    s.insert(type, {...vals, 'id': newId(type.replaceAll('_', '').substring(0, 3)), 'entry_id': id});
    s.insert('m_entry_key', {'id': clientKey, 'entry_id': id});
    c.audit('entry_saved_raw', 'entry/$id', 'raw:${entry['raw_input_ref']}');
    if (confirmed) c.audit('entry_confirmed', 'entry/$id', vals);
    if (old != null) {
      s.update('entry', old.id, {'status': 'corrected'});
      c.audit('entry_corrected', 'entry/${old.id}', {'status': 'corrected', 'superseded_by': id, 'change_reason': entry['change_reason']}, before: {'status': old.status});
    }
    if (attestationId != null && confirmed) s.put('m_entry_key', {'id': 'att:$attestationId', 'entry_id': id});
    also?.call(Entry(entry));
    return Entry(entry);
  });
}

void _checkMed(Ctx c, String patientId, Doc vals, String careTime, String? scheduledTime, String? attestationId, Practitioner who, {String? ignoreEntryId}) {
  final s = c.store;
  final m = MedAdmin(vals);
  final orderRow = m.orderId == null ? null : s.get('active_order', m.orderId!);
  if (m.orderId != null && orderRow == null) throw const AppError('The order of this record was not found. Nothing was saved.');
  if (orderRow != null) {
    final o = ActiveOrder(orderRow);
    final enc = s.get('encounter', o.encounterId);
    if (enc == null || enc['patient_id'] != patientId) throw const AppError('This order belongs to another patient. Nothing was saved.');
    if (o.status != 'active') throw const AppError('This order is not active any more. Nothing was saved.');
    final locks = doseLocks(s, o, listPatientEntries(s, patientId), careTime: careTime, scheduledTime: scheduledTime, event: m.event, ignoreEntryId: ignoreEntryId, newRate: m.rate);
    if (locks.isNotEmpty) throw DoseLockedError(locks);
  }
  if (!needsSecondNurse(m.drugName, m.event)) return;
  if (attestationId == null) throw const AppError('A second nurse must check this high-alert drug.');
  final att = s.get('m_attestation', attestationId);
  if (att == null || att['outcome'] != 'given') throw const AppError('A second nurse must check this high-alert drug.');
  if (s.get('m_entry_key', 'att:$attestationId') != null) throw const AppError('This second check was already used. Ask for a new one.');
  final witnessId = att['witness_id'] as String;
  if (witnessId == c.userId) throw const AppError('The second check must be done by a different nurse.');
  final w = s.get('practitioner', witnessId);
  if (w == null || !Practitioner(w).active || !kSecondCheckerRoles.contains(w['role'])) throw const AppError('This person cannot be the second checker.');
  if (att['content_hash'] != attestationHash(patientId: patientId, primaryId: c.userId, careTime: careTime, scheduledTime: scheduledTime, values: vals, checklist: (att['checklist'] as List).cast<String>())) {
    throw const AppError('The details changed after the second check. The check is not valid any more. Ask the second nurse again.');
  }
  vals['double_checked'] = true;
  vals['double_checked_by'] = witnessId;
}

class DoseLockedError extends AppError {
  final List<DoseLock> locks;
  DoseLockedError(this.locks) : super('${locks.first.title}. ${locks.first.reason} Nothing was saved.');
}

/// Fingerprint of exactly what the second nurse checked. The double-check fields themselves are left out.
String attestationHash({required String patientId, required String primaryId, required String careTime, String? scheduledTime, required Doc values, required List<String> checklist}) {
  final v = {...values}
    ..remove('double_checked')
    ..remove('double_checked_by');
  return sha256Text(canonicalJson({
    'patient_id': patientId, 'primary_id': primaryId, 'care_time': careTime, 'scheduled_time': scheduledTime, 'values': v, 'checklist': checklist,
  }));
}

/// The second nurse decided. Saved with its exact content; the PIN was checked by the caller (AppState.cosign).
String recordAttestation(Ctx c, {required String witnessId, required String outcome, required String patientId, required String careTime, String? scheduledTime, required Doc values, required List<String> checklist, String? reason}) {
  final s = c.store;
  return s.tx(() {
    c.nurse();
    c.patient(patientId);
    final w = s.get('practitioner', witnessId);
    if (w == null || !Practitioner(w).active || !kSecondCheckerRoles.contains(w['role'])) throw const AppError('This person cannot be the second checker.');
    if (witnessId == c.userId) throw const AppError('The second check must be done by a different nurse.');
    final id = newId('att');
    final row = {
      'id': id, 'time': c.clock.nowIso(), 'outcome': outcome, 'primary_id': c.userId, 'witness_id': witnessId, 'patient_id': patientId,
      'order_id': values['order_id'], 'checklist': checklist, 'reason': reason,
      // A decline is written down by the primary nurse for the named colleague; no PIN was entered for it.
      'witness_pin_checked': outcome == 'given',
      'content_hash': attestationHash(patientId: patientId, primaryId: c.userId, careTime: careTime, scheduledTime: scheduledTime, values: values, checklist: checklist),
    };
    s.insert('m_attestation', row);
    c.audit(outcome == 'given' ? 'cosign_given' : 'cosign_declined', 'attestation/$id', row);
    return id;
  });
}

/// Mark an entry as entered in error. Values stay; the record is shown crossed out.
void markEnteredInError(Ctx c, String entryId, String reason) {
  final s = c.store;
  if (reason.trim().isEmpty) throw const AppError('A reason is required.');
  s.tx(() {
    c.nurse();
    final row = s.get('entry', entryId);
    if (row == null) throw const AppError('Record not found.');
    final e = Entry(row);
    c.patient(e.patientId);
    // A draft can be put aside the same way (mobile): it was never confirmed, so it is never exported.
    if (!e.isConfirmed && !e.isDraft) throw const AppError('Only a confirmed record can be marked as a mistake.');
    s.update('entry', entryId, {'status': 'entered-in-error', 'change_reason': reason.trim()});
    c.audit('entered_in_error', 'entry/$entryId', {'status': 'entered-in-error', 'change_reason': reason.trim()}, before: {'status': e.status});
  });
}

/// Confirm a saved draft with the values the nurse checked.
Entry confirmDraft(Ctx c, String entryId, Doc values, {String? careTime, String? attestationId, void Function(Entry saved)? also}) {
  final s = c.store;
  return s.tx(() {
    final who = c.nurse();
    final row = s.get('entry', entryId);
    if (row == null) throw const AppError('Record not found.');
    final e = Entry(row);
    c.patient(e.patientId);
    if (!e.isDraft) throw const AppError('This draft was already handled.');
    if (ms(careTime ?? e.careTime) > ms(c.clock.nowIso()) + 60000) throw const AppError('The time cannot be in the future.');
    final vals = {...values}
      ..remove('id')
      ..remove('entry_id');
    if (e.type == 'med_admin') _checkMed(c, e.patientId, vals, careTime ?? e.careTime, e.scheduledTime, attestationId, who, ignoreEntryId: e.id);
    final now = c.clock.nowIso();
    final child = s.where(e.type, 'entry_id', entryId).firstOrNull;
    final updated = {...row, 'status': 'confirmed', 'confirmed': vals, 'confirmed_by': c.userId, 'confirmed_at': now, 'care_time': careTime ?? e.careTime};
    s.put('entry', updated);
    s.put(e.type, {...vals, 'id': child?['id'] ?? newId(e.type.replaceAll('_', '').substring(0, 3)), 'entry_id': entryId});
    c.audit('entry_confirmed', 'entry/$entryId', vals, before: e.aiProposal ?? child ?? const {});
    if (attestationId != null) s.put('m_entry_key', {'id': 'att:$attestationId', 'entry_id': entryId});
    also?.call(Entry(updated));
    return Entry(updated);
  });
}

EntryX? getEntry(Store s, String id) {
  final e = s.get('entry', id);
  return e == null ? null : EntryX(Entry(e), s.where(e['type'] as String, 'entry_id', id).firstOrNull);
}

/// Newest care time first; ties by entry time, then by this phone's counter, then id (stable).
List<EntryX> listPatientEntries(Store s, String patientId) {
  final list = [for (final e in s.where('entry', 'patient_id', patientId)) EntryX(Entry(e), s.where(e['type'] as String, 'entry_id', e['id'] as String).firstOrNull)];
  list.sort((a, b) {
    var r = ms(b.entry.careTime).compareTo(ms(a.entry.careTime));
    if (r == 0) r = ms(b.entry.entryTime).compareTo(ms(a.entry.entryTime));
    if (r == 0) r = b.entry.counter.compareTo(a.entry.counter);
    return r == 0 ? b.entry.id.compareTo(a.entry.id) : r;
  });
  return list;
}

/// All versions of a record, oldest first.
List<EntryX> versionChain(Store s, String id) {
  final ids = <String>[];
  var cur = s.get('entry', id);
  while (cur != null && !ids.contains(cur['id'])) {
    ids.insert(0, cur['id'] as String);
    final prev = cur['supersedes_id'] as String?;
    cur = prev == null ? null : s.get('entry', prev);
  }
  var tip = ids.isEmpty ? null : ids.last;
  while (tip != null) {
    final next = s.where('entry', 'supersedes_id', tip).firstOrNull;
    if (next == null || ids.contains(next['id'])) break;
    tip = next['id'] as String;
    ids.add(tip);
  }
  return [for (final i in ids) getEntry(s, i)!];
}

/* ------------------------------ Paper photos ------------------------------ */

/// Saves the photo with its hash and an audit row, before any clinical record exists. Returns its reference.
String savePhoto(Ctx c, {required String patientId, required Uint8List bytes, required String mime, required Doc check}) {
  if (!mime.startsWith('image/')) throw const AppError('This file is not a picture.');
  final ref = 'vault/raw/${uuid()}.${mime == 'image/png' ? 'png' : 'jpg'}';
  return c.store.tx(() {
    c.nurse();
    c.patient(patientId);
    final row = {'id': ref, 'patient_id': patientId, 'type': mime, 'size': bytes.length, 'sha256': sha256Hex(bytes), 'saved_at': c.clock.nowIso(), 'check': check};
    c.store.insertPhoto(row, bytes);
    c.audit('photo_saved', ref, {'patient_id': patientId, 'sha256': row['sha256'], 'size': bytes.length, 'type': mime});
    c.audit('photo_check', ref, check);
    return ref;
  });
}

/// A rejected picture is not kept. Only the fact and the reason are recorded.
void recordPhotoRejected(Ctx c, {required String patientId, required Doc check}) => c.store.tx(() {
      c.nurse();
      c.patient(patientId);
      c.audit('photo_rejected', 'patient/$patientId', check);
    });

/// True when the stored bytes still equal the hash saved at capture time.
bool verifyPhoto(Store s, String ref) {
  final row = s.get('m_photo', ref), bytes = s.photoBytes(ref);
  return row != null && bytes != null && sha256Hex(bytes) == row['sha256'];
}

/* ------------------------------ Drafts ------------------------------ */

/// Unfinished form, kept encrypted for its owner and patient only.
void saveDraft(Ctx c, {required String id, required String kind, String? patientId, required Doc payload}) => c.store.tx(() {
      c.person();
      if (patientId != null) c.patient(patientId);
      c.store.put('m_draft', {'id': id, 'kind': kind, 'patient_id': patientId, 'owner_id': c.userId, 'payload': payload, 'updated_at': c.clock.nowIso()});
    });

List<Doc> listDrafts(Store s, String ownerId, {String? kind, String? patientId}) => [
      for (final d in s.where('m_draft', 'owner_id', ownerId))
        if ((kind == null || d['kind'] == kind) && (patientId == null || d['patient_id'] == patientId)) d,
    ];

Doc? getDraft(Store s, String id, String ownerId) {
  final d = s.get('m_draft', id);
  return d != null && d['owner_id'] == ownerId ? d : null;
}

void discardDraft(Ctx c, String id, {bool audit = true}) => c.store.tx(() {
      c.person();
      final d = c.store.get('m_draft', id);
      if (d == null) return;
      if (d['owner_id'] != c.userId) throw const NotAllowedError('This draft belongs to another person.');
      c.store.delete('m_draft', id);
      if (audit) c.audit('draft_discarded', 'draft/$id', {'kind': d['kind'], 'patient_id': d['patient_id']});
    });
