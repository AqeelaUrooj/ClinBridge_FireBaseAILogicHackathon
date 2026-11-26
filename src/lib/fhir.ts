import { LIFECYCLE_NOTE, isLifecycleNote } from './charting';
import type { ActiveOrder, Allergy, Encounter, Entry, IntakeOutput, LabEvent, MedAdmin, Note, Patient, Practitioner, VitalSign } from '../db/schema';

/**
 * FHIR R4 export (Data & Database Plan §7): one Bundle (type "collection") built from local records.
 * It is a FILE for the hospital EHR team to load. Nothing is sent to any EHR.
 *  - Vitals → Observation (vital-signs category, LOINC + UCUM per the FHIR vital-signs profile)
 *  - Medicines → MedicationAdministration; orders → MedicationRequest
 *  - Fluids, risk scores, labs → Observation (text-coded where no code is agreed yet; see post-hackathon list)
 *  - Notes → DocumentReference
 *  - Every entry → Provenance (care vs typed time, who, source photo, revision of a corrected record)
 *  - Corrected / mistaken versions → status entered-in-error. Drafts are never exported. AI proposals never exported.
 *  - Every resource carries a "downtime-documentation" meta tag.
 */
type R = Record<string, unknown>;
const BASE = 'https://clinbridge.example/fhir';
const TAG = { system: 'https://clinbridge.example/fhir/tags', code: 'downtime-documentation', display: 'Documented during EHR downtime' };
const LOINC = 'http://loinc.org';
/** Namespaces of identifiers made on this laptop (never a hospital's). */
const LOCAL_ID_SYSTEM = 'https://clinbridge.example/fhir/identifier/local-temporary-patient-id';
const VISIT_SYSTEM = 'https://clinbridge.example/fhir/identifier/visit-number';
const LIFECYCLE_TAGS: Record<string, { code: string; display: string }> = {
  admission_registered: { code: 'registered-locally', display: 'Registered on the downtime laptop by admissions' },
  nurse_provisional: { code: 'provisional-identity', display: 'Provisional identity registered by a nurse during downtime' },
};
/** Extra meta tags for a locally registered patient, on top of the downtime tag every resource carries. */
const patientTags = (p: Patient): { _tags?: R[] } => {
  const t = p.origin ? LIFECYCLE_TAGS[p.origin] : undefined;
  if (!t) return {};
  const tags: R[] = [{ system: 'https://clinbridge.example/fhir/tags', ...t }];
  if (p.identity_status === 'pending_verification' || p.identity_status === 'under_review') tags.push({ system: 'https://clinbridge.example/fhir/tags', code: 'identity-reconciliation-pending', display: 'Identity not yet reconciled with the hospital record' });
  return { _tags: tags };
};
const UCUM = 'http://unitsofmeasure.org';

const meta = (profile?: string) => ({ ...(profile ? { profile: [`${VS}${profile}`] } : {}), tag: [TAG] });
const ref = (type: string, id: string) => ({ reference: `${type}/${id}` });
const qty = (value: number, unit: string, code: string) => ({ value, unit, system: UCUM, code });
const loinc = (code: string, display: string) => ({ coding: [{ system: LOINC, code, display }], text: display });
const textCode = (text: string) => ({ text });

/** FHIR R4 core vital-signs profiles (http://hl7.org/fhir/R4/observation-vitalsigns.html). */
const VS = 'http://hl7.org/fhir/StructureDefinition/';
const VITAL_CODES: { key: keyof VitalSign; code: string; display: string; unit: string; ucum: string; profile?: string }[] = [
  { key: 'heart_rate', code: '8867-4', display: 'Heart rate', unit: '/min', ucum: '/min', profile: 'heartrate' },
  { key: 'resp_rate', code: '9279-1', display: 'Respiratory rate', unit: '/min', ucum: '/min', profile: 'resprate' },
  { key: 'temp_c', code: '8310-5', display: 'Body temperature', unit: 'Cel', ucum: 'Cel', profile: 'bodytemp' },
  { key: 'spo2', code: '2708-6', display: 'Oxygen saturation in Arterial blood', unit: '%', ucum: '%', profile: 'oxygensat' },
  { key: 'pain_0_10', code: '72514-3', display: 'Pain severity - 0-10 verbal numeric rating [Score] - Reported', unit: '{score}', ucum: '{score}' },
  { key: 'glucose_mgdl', code: '2339-0', display: 'Glucose [Mass/volume] in Blood', unit: 'mg/dL', ucum: 'mg/dL' },
  { key: 'o2_flow_lpm', code: '3151-8', display: 'Inhaled oxygen flow rate', unit: 'L/min', ucum: 'L/min' },
];

export interface ExportInput {
  patients: Patient[];
  encounters: Encounter[];
  allergies: Allergy[];
  orders: ActiveOrder[];
  practitioners: Practitioner[];
  entries: { entry: Entry; child: unknown }[];
  exportedAt: string;
  deviceLabels: Map<string, string>;
}

const obsStatus = (e: Entry) => (e.status === 'confirmed' ? 'final' : 'entered-in-error');

export function buildBundle(input: ExportInput): R {
  const res: R[] = [];
  const add = (r: R) => {
    const { _profile, _tags, ...rest } = r as R & { _profile?: string; _tags?: R[] };
    const m = meta(_profile);
    res.push({ ...rest, meta: _tags ? { ...m, tag: [...m.tag, ..._tags] } : m, text: narrative(rest) });
  };
  const encOf = new Map(input.encounters.map((e) => [e.patient_id, e]));

  for (const p of input.patients) {
    // A temporary local identifier is never sent as an MRN: own system, no "MR" type, usual = temp.
    const identifier = p.identifier_kind === 'local_temporary'
      ? [{ use: 'temp', system: LOCAL_ID_SYSTEM, value: p.mrn }] // the namespace says what it is; no hospital identifier type applies
      : [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR', display: 'Medical record number' }], text: 'MRN' }, value: p.mrn }];
    add({ resourceType: 'Patient', id: p.id, ...patientTags(p), identifier, name: [{ family: p.family_name, given: [p.given_name] }], gender: p.sex, birthDate: p.birth_date });
  }
  for (const e of input.encounters) {
    const finished = e.status === 'discharged' && !!e.discharge_time;
    const places = e.location_history?.length ? e.location_history : e.bed ? [{ unit: e.unit, room: e.room ?? null, bed: e.bed, from: e.admit_time, to: finished ? e.discharge_time : null }] : [];
    add({
      resourceType: 'Encounter', id: e.id, ...(e.visit_number ? { identifier: [{ system: VISIT_SYSTEM, value: e.visit_number }] } : {}),
      status: finished ? 'finished' : 'in-progress', class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP', display: 'inpatient encounter' },
      ...(e.admission_type ? { type: [textCode(e.admission_type)] } : {}),
      subject: ref('Patient', e.patient_id),
      ...(e.responsible_nurse_id && input.practitioners.some((p) => p.id === e.responsible_nurse_id) ? { participant: [{ type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'PART', display: 'Participation' }], text: 'Responsible nurse' }], individual: ref('Practitioner', e.responsible_nurse_id) }] } : {}),
      period: { start: e.admit_time, ...(finished ? { end: e.discharge_time } : {}) },
      ...(e.admit_reason ? { reasonCode: [textCode(e.admit_reason)] } : {}),
      ...(finished && e.discharge_destination ? { hospitalization: { dischargeDisposition: textCode(e.discharge_destination) } } : {}),
      ...(places.length ? { location: places.map((l, i) => {
        const current = i === places.length - 1 && !finished;
        const end = l.to ?? (i === places.length - 1 && finished ? e.discharge_time : null);
        return { location: { display: `${l.unit}${l.room ? `, room ${l.room}` : ''}, bed ${l.bed}` }, status: current ? 'active' : 'completed', period: { start: l.from, ...(end ? { end } : {}) } };
      }) } : {}),
    });
  }
  for (const pr of input.practitioners) add({ resourceType: 'Practitioner', id: pr.id, name: [{ text: pr.name }], active: pr.active });
  for (const a of input.allergies) {
    if (/^no known/i.test(a.substance)) continue;
    add({ resourceType: 'AllergyIntolerance', id: a.id, clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: a.status }] }, patient: ref('Patient', a.patient_id), code: textCode(a.substance), ...(a.reaction ? { reaction: [{ manifestation: [textCode(a.reaction)], ...(a.severity ? { severity: a.severity } : {}) }] } : {}) });
  }
  for (const o of input.orders) {
    if (o.type !== 'med' && o.type !== 'iv') continue;
    const enc = input.encounters.find((e) => e.id === o.encounter_id);
    if (!enc) continue;
    add({ resourceType: 'MedicationRequest', id: o.id, status: o.status === 'active' ? 'active' : o.status === 'completed' ? 'completed' : 'unknown', intent: 'order', medicationCodeableConcept: textCode(o.drug_name ?? o.text), subject: ref('Patient', enc.patient_id), encounter: ref('Encounter', enc.id), dosageInstruction: [{ text: o.text }] });
  }

  for (const { entry: e, child } of input.entries) {
    if (e.status === 'draft' || !child) continue;
    const enc = input.encounters.find((x) => x.id === e.encounter_id) ?? encOf.get(e.patient_id); // the record's own stay
    const common = { subject: ref('Patient', e.patient_id), ...(enc ? { encounter: ref('Encounter', enc.id) } : {}), effectiveDateTime: e.care_time, performer: [ref('Practitioner', e.performer_id)] };
    let target: { type: string; id: string } | null = null;

    if (e.type === 'vital_sign') {
      const v = child as VitalSign;
      const parts: R[] = [];
      if (v.bp_systolic != null && v.bp_diastolic != null) {
        parts.push({ resourceType: 'Observation', id: `${e.id}-bp`, _profile: 'bp', status: obsStatus(e), category: [vitalCat()], code: loinc('85354-9', 'Blood pressure panel with all children optional'), ...common,
          component: [{ code: loinc('8480-6', 'Systolic blood pressure'), valueQuantity: qty(v.bp_systolic, 'mm[Hg]', 'mm[Hg]') }, { code: loinc('8462-4', 'Diastolic blood pressure'), valueQuantity: qty(v.bp_diastolic, 'mm[Hg]', 'mm[Hg]') }] });
      }
      for (const c of VITAL_CODES) {
        const val = v[c.key];
        if (typeof val === 'number') parts.push({ resourceType: 'Observation', id: `${e.id}-${c.key.replace(/_/g, '')}`, ...(c.profile ? { _profile: c.profile } : {}), status: obsStatus(e), category: [vitalCat()], code: loinc(c.code, c.display), ...common, valueQuantity: qty(val, c.unit, c.ucum) });
      }
      if (v.consciousness) parts.push({ resourceType: 'Observation', id: `${e.id}-consc`, status: obsStatus(e), category: [vitalCat()], code: textCode('Level of consciousness (AVPU)'), ...common, valueString: v.consciousness });
      if (v.o2_device) parts.push({ resourceType: 'Observation', id: `${e.id}-o2dev`, status: obsStatus(e), category: [vitalCat()], code: textCode('Oxygen delivery method'), ...common, valueString: v.o2_device });
      parts.forEach(add);
      parts.forEach((p) => add(provenance(e, 'Observation', p.id as string, input)));
      continue;
    }
    if (e.type === 'med_admin') {
      const m = child as MedAdmin;
      const given = m.event === 'administered' || m.event === 'rate_changed';
      add({ resourceType: 'MedicationAdministration', id: e.id, status: e.status !== 'confirmed' ? 'entered-in-error' : given ? 'completed' : 'not-done',
        ...(!given && m.reason ? { statusReason: [textCode(`${m.event}: ${m.reason}`)] } : {}),
        medicationCodeableConcept: textCode(m.drug_name), subject: common.subject, ...(enc ? { context: ref('Encounter', enc.id) } : {}),
        effectiveDateTime: e.care_time, performer: [{ actor: ref('Practitioner', e.performer_id) }], ...(m.order_id && input.orders.some((o) => o.id === m.order_id) ? { request: ref('MedicationRequest', m.order_id) } : {}),
        ...(m.double_checked_by ? { note: [{ text: `Second nurse check: ${m.double_checked_by}` }] } : {}),
        ...dosageOf(m) });
      target = { type: 'MedicationAdministration', id: e.id };
    } else if (e.type === 'intake_output') {
      const io = child as IntakeOutput;
      add({ resourceType: 'Observation', id: e.id, status: obsStatus(e), code: textCode(`Fluid ${io.direction === 'in' ? 'intake' : 'output'}: ${io.category}`), ...common, valueQuantity: qty(io.volume_ml, 'mL', 'mL'),
        ...(io.start_time && io.end_time ? { effectivePeriod: { start: io.start_time, end: io.end_time }, effectiveDateTime: undefined } : {}), ...(io.method ? { method: textCode(io.method) } : {}) });
      target = { type: 'Observation', id: e.id };
    } else if (e.type === 'note') {
      const n = child as Note;
      if (n.category === 'risk_score' && n.score_value != null) {
        add({ resourceType: 'Observation', id: `${e.id}-score`, status: obsStatus(e), code: textCode(n.score_name ?? 'Risk score'), ...common, valueInteger: n.score_value, note: [{ text: n.text }] });
        add(provenance(e, 'Observation', `${e.id}-score`, input));
      }
      add({ resourceType: 'DocumentReference', id: e.id, status: e.status === 'confirmed' ? 'current' : 'entered-in-error', type: textCode(isLifecycleNote(n.category) ? `Stay record: ${LIFECYCLE_NOTE[n.category]}` : `Nursing note: ${n.category}`), subject: common.subject, date: e.entry_time,
        author: [ref('Practitioner', e.performer_id)], content: [{ attachment: { contentType: 'text/plain', data: b64(n.text) } }], ...(enc ? { context: { encounter: [ref('Encounter', enc.id)] } } : {}) });
      target = { type: 'DocumentReference', id: e.id };
    } else if (e.type === 'lab_event') {
      const l = child as LabEvent;
      const hasResult = l.status === 'resulted' || l.status === 'critical';
      add({ resourceType: 'Observation', id: e.id, status: e.status !== 'confirmed' ? 'entered-in-error' : hasResult ? 'final' : 'registered', category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
        code: textCode(l.test_name), ...common, ...(l.value_num != null ? { valueQuantity: { value: l.value_num, ...(l.unit ? { unit: l.unit } : {}) } } : l.value_text ? { valueString: l.value_text } : {}),
        ...(l.status === 'critical' ? { interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'AA', display: 'Critical abnormal' }], text: 'Critical result phoned by the lab' }] } : {}),
        ...(l.called_to ? { note: [{ text: `Told: ${l.called_to}. Read back: ${l.read_back ? 'yes' : 'no'}.` }] } : {}) });
      target = { type: 'Observation', id: e.id };
    }
    if (target) add(provenance(e, target.type, target.id, input));
  }

  return {
    resourceType: 'Bundle', id: `export-${input.exportedAt.replace(/[^0-9]/g, '').slice(0, 14)}`, type: 'collection', timestamp: input.exportedAt, meta: meta(),
    entry: res.map((r) => ({ fullUrl: `${BASE}/${r.resourceType}/${r.id}`, resource: JSON.parse(JSON.stringify(r)) })),
  };
}

function vitalCat() {
  return { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] };
}
function b64(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function provenance(e: Entry, type: string, id: string, input: ExportInput): R {
  const entities: R[] = [];
  if (e.raw_input_kind === 'photo') entities.push({ role: 'source', what: { display: `Paper form photo ${e.raw_input_ref} (kept on the downtime laptop)` } });
  if (e.supersedes_id) entities.push({ role: 'revision', what: { display: `Corrects record ${e.supersedes_id}${e.change_reason ? `: ${e.change_reason}` : ''}` } });
  return {
    resourceType: 'Provenance', id: `prov-${id}`, target: [ref(type, id)], occurredDateTime: e.care_time, recorded: e.entry_time,
    agent: [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'author' }] }, who: ref('Practitioner', e.performer_id) },
      { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'enterer' }] }, who: { display: `Laptop ${input.deviceLabels.get(e.device_id) ?? e.device_id} #${e.counter}` } }],
    ...(entities.length ? { entity: entities } : {}),
    ...(e.status === 'entered-in-error' && e.change_reason ? { reason: [textCode(`Entered in error: ${e.change_reason}`)] } : {}),
  };
}

/* ------------------------------ Validation ------------------------------ */

const ID = /^[A-Za-z0-9\-.]{1,64}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED: Record<string, string[]> = {
  Patient: [], Encounter: ['status', 'class', 'subject'], Practitioner: [], AllergyIntolerance: ['patient'],
  MedicationRequest: ['status', 'intent', 'medicationCodeableConcept', 'subject'],
  MedicationAdministration: ['status', 'medicationCodeableConcept', 'subject', 'effectiveDateTime'],
  Observation: ['status', 'code', 'subject'], DocumentReference: ['status', 'content', 'subject'], Provenance: ['target', 'recorded', 'agent'],
};
const STATUS: Record<string, string[]> = {
  Observation: ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'],
  MedicationAdministration: ['in-progress', 'not-done', 'on-hold', 'completed', 'entered-in-error', 'stopped', 'unknown'],
  DocumentReference: ['current', 'superseded', 'entered-in-error'],
  Encounter: ['planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished', 'cancelled', 'entered-in-error', 'unknown'],
  MedicationRequest: ['active', 'on-hold', 'cancelled', 'completed', 'entered-in-error', 'stopped', 'draft', 'unknown'],
};

/** Structural check of the bundle (required fields, ids, codes, dates, references). Returns problems; empty = valid. */
export function validateBundle(b: R): string[] {
  const errs: string[] = [];
  if (b.resourceType !== 'Bundle') errs.push('Not a Bundle');
  if (b.type !== 'collection') errs.push('Bundle.type must be collection');
  if (typeof b.timestamp !== 'string' || !DATETIME.test(b.timestamp)) errs.push('Bundle.timestamp missing or not a dateTime');
  const entries = (b.entry as { fullUrl: string; resource: R }[]) ?? [];
  const keys = new Set<string>();
  for (const { resource: r, fullUrl } of entries) {
    const key = `${r.resourceType}/${r.id}`;
    if (keys.has(key)) errs.push(`Duplicate resource ${key}`);
    keys.add(key);
    if (fullUrl !== `${BASE}/${key}`) errs.push(`${key}: fullUrl does not match`);
  }
  const walk = (node: unknown, where: string, cb: (k: string, v: unknown, path: string) => void) => {
    if (Array.isArray(node)) node.forEach((x, i) => walk(x, `${where}[${i}]`, cb));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) { cb(k, v, `${where}.${k}`); walk(v, `${where}.${k}`, cb); }
  };
  for (const { resource: r } of entries) {
    const key = `${r.resourceType}/${r.id}`;
    if (!REQUIRED[r.resourceType as string]) { errs.push(`${key}: unsupported resource type`); continue; }
    if (typeof r.id !== 'string' || !ID.test(r.id)) errs.push(`${key}: invalid id`);
    for (const f of REQUIRED[r.resourceType as string]!) if (r[f] == null || (Array.isArray(r[f]) && !(r[f] as unknown[]).length)) errs.push(`${key}: missing ${f}`);
    const st = STATUS[r.resourceType as string];
    if (st && !st.includes(r.status as string)) errs.push(`${key}: invalid status "${String(r.status)}"`);
    if (r.resourceType === 'Patient' && r.birthDate && !DATE.test(r.birthDate as string)) errs.push(`${key}: birthDate not a date`);
    if (r.resourceType === 'Observation' && !r.effectiveDateTime && !r.effectivePeriod) errs.push(`${key}: missing effective time`);
    if (!((r.meta as { tag?: unknown[] } | undefined)?.tag ?? []).length) errs.push(`${key}: missing downtime tag`);
    walk(r, key, (k, v, path) => {
      if (k === 'reference' && typeof v === 'string' && !keys.has(v)) errs.push(`${path}: reference ${v} not in bundle`);
      if (/(DateTime|^recorded|^start|^end|^date)$/.test(k) && typeof v === 'string' && !DATETIME.test(v)) errs.push(`${path}: not a dateTime`);
      if (k === 'coding' && Array.isArray(v)) for (const c of v as R[]) if (!c.system || !c.code) errs.push(`${path}: coding needs system and code`);
      if ((k === 'valueQuantity' || k === 'dose' || k === 'rateQuantity') && v && typeof (v as R).value !== 'number') errs.push(`${path}: quantity value must be a number`);
    });
  }
  return errs;
}

/**
 * FHIR mad-1: a dosage block needs a dose or a rate. A dose that was held or refused has
 * neither, so its dosage block (route/site only) is left out rather than sent invalid.
 */
function dosageOf(m: MedAdmin): { dosage?: Record<string, unknown> } {
  const dose = m.dose_given != null && m.dose_given_unit ? { dose: { value: m.dose_given, unit: m.dose_given_unit } } : {};
  const rate = m.infusion_rate != null && m.infusion_rate_unit ? { rateQuantity: { value: m.infusion_rate, unit: m.infusion_rate_unit } } : {};
  if (!('dose' in dose) && !('rateQuantity' in rate)) return {};
  return { dosage: { ...(m.route ? { route: textCode(m.route) } : {}), ...(m.site ? { site: textCode(m.site) } : {}), ...dose, ...rate } };
}

/* ---------- Narrative (FHIR dom-6) ---------- */

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain-text rendering of an element, using only what the element itself holds. */
function show(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(show).filter(Boolean).join('; ');
  const o = v as R;
  if (typeof o.text === 'string' && !('div' in o)) return o.text;
  if (Array.isArray(o.coding) && o.coding.length) return show((o.coding[0] as R).display ?? (o.coding[0] as R).code);
  if (typeof o.reference === 'string') return o.reference + (typeof o.display === 'string' ? ` (${o.display})` : '');
  if ('value' in o && ('unit' in o || 'code' in o)) return `${show(o.value)} ${show(o.unit ?? o.code)}`.trim();
  return Object.entries(o).map(([k, x]) => (show(x) ? `${k}: ${show(x)}` : '')).filter(Boolean).join(', ');
}

/**
 * Human-readable summary, status "generated": FHIR's term for a narrative made ENTIRELY from the resource's own
 * structured elements. Nothing is added, interpreted or coded here; it restates the fields one by one.
 */
export function narrative(r: R): { status: 'generated'; div: string } {
  const rows = Object.entries(r)
    .filter(([k]) => !['resourceType', 'id', 'meta', 'text'].includes(k))
    .map(([k, v]) => [k, show(v)] as const)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`)
    .join('');
  return { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml"><p><b>${esc(String(r.resourceType))}</b> ${esc(String(r.id ?? ''))}</p><ul>${rows}</ul></div>` };
}
