import { describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { DowntimeDB } from '../../db/db';
import { importPracticeSeed } from '../../db/seed';
import { loadReportData } from './reportData';
import { HandwrittenNursingReport, TEMPLATES } from './templates';

const NOW = '2026-11-14T13:20:00-05:00', T = '2026-11-14T12:30:00-05:00';
const KINDS = ['Allergy', 'Order', 'ListLab', 'Vital', 'Drug', 'Site', 'Fluid', 'Note', 'Lab', 'Hand', 'Open'] as const;

describe('no value of one patient ever appears on the sheet of another', () => {
  it('marker values in every table of every patient stay with that patient, in all designs', async () => {
    const db = new DowntimeDB('practice', `leak-${crypto.randomUUID()}`);
    await importPracticeSeed(db);
    const ids = (await db.patient.toArray()).map((p) => p.id);
    const systolic = (id: string) => 500 + Number(id.slice(3));
    for (const id of ids) {
      const enc = (await db.encounter.where('patient_id').equals(id).first())!;
      const m = (kind: (typeof KINDS)[number]) => `Mark${kind}of${id}end`;
      const entry = async (n: number, type: 'vital_sign' | 'med_admin' | 'intake_output' | 'note' | 'lab_event') => {
        const e = `mk-${id}-${n}`;
        await db.entry.put({ id: e, type, patient_id: id, encounter_id: enc.id, care_time: T, entry_time: T, counter: 900 + n, device_id: 'dev-01', performer_id: 'pr-okafor', raw_input_kind: 'typed', raw_input_ref: 'x', confirmed_by: 'pr-okafor', confirmed_at: T, status: 'confirmed', confirmed: {} });
        return e;
      };
      await db.allergy.put({ id: `mk-a-${id}`, patient_id: id, substance: m('Allergy'), status: 'active' });
      await db.active_order.put({ id: `mk-o-${id}`, encounter_id: enc.id, type: 'nursing', text: m('Order'), status: 'active' });
      await db.snapshot_result.put({ id: `mk-l-${id}`, patient_id: id, kind: 'lab', name: m('ListLab'), value_text: '1', time: T });
      await db.snapshot_result.put({ id: `mk-v-${id}`, patient_id: id, kind: 'vital', code: '8480-6', name: 'Systolic blood pressure', value_num: systolic(id), time: '2026-11-14T00:30:00-05:00' });
      await db.vital_sign.put({ id: `mk1-${id}`, entry_id: await entry(1, 'vital_sign'), consciousness: m('Vital') });
      await db.med_admin.put({ id: `mk2-${id}`, entry_id: await entry(2, 'med_admin'), drug_name: m('Drug'), event: 'administered', site: m('Site') });
      await db.intake_output.put({ id: `mk3-${id}`, entry_id: await entry(3, 'intake_output'), direction: 'in', category: m('Fluid'), volume_ml: 1 });
      await db.note.put({ id: `mk4-${id}`, entry_id: await entry(4, 'note'), category: 'other', text: m('Note') });
      await db.lab_event.put({ id: `mk5-${id}`, entry_id: await entry(5, 'lab_event'), test_name: m('Lab'), status: 'resulted', value_text: '1' });
      await db.handoff.put({ id: `mk-h-${id}`, patient_id: id, shift: 's', situation: m('Hand'), background: '', assessment: '', open_items: [m('Open')], source_entry_ids: [], created_by: 'pr-okafor' });
    }
    // A saved handover without a time comes last: the marker one must be the newest for the patients that have another.
    for (const h of await db.handoff.toArray()) if (!h.id.startsWith('mk-')) await db.handoff.delete(h.id);

    for (const id of ids) {
      const d = (await loadReportData(db, id, NOW))!;
      const data = JSON.stringify(d, (_, v: unknown) => (v instanceof Map ? [...v] : v));
      for (const kind of KINDS) expect(data, `${id} ${kind}`).toContain(`Mark${kind}of${id}end`);
      expect(d.vitals.map((v) => v.v.bp_systolic ?? 0).filter((n) => n > 500), id).toEqual([systolic(id)]);
      const sheets = TEMPLATES.flatMap((t) => (['photo', 'print'] as const).map((look) => {
        const text = render(<HandwrittenNursingReport d={d} template={t.id} look={look} />).container.textContent!.replace(/\s/g, '');
        cleanup();
        return text;
      }));
      for (const text of [data, ...sheets]) {
        expect([...new Set(Array.from(text.matchAll(/of(pt-\d+)end/g), (x) => x[1]))], id).toEqual([id]);
        for (const other of ids) if (other !== id) expect(text, `${id} shows ${other}`).not.toContain(`${systolic(other)}/`);
      }
    }
  }, 60_000);
});
