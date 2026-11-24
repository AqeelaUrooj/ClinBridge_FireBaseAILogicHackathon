import { beforeEach, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DowntimeDB } from '../../db/db';
import { importPracticeSeed } from '../../db/seed';
import { fullName } from '../patient/patientData';
import { loadReportData, PracticeOnlyError, type ReportData } from './reportData';
import { defaultTemplate, HandwrittenNursingReport, penFor, TEMPLATES, templateById } from './templates';
import { LABEL } from './ink';
import { medLine, medNote } from './reportText';

const NOW = '2026-11-14T13:20:00-05:00';
let db: DowntimeDB;
beforeEach(async () => { db = new DowntimeDB('practice', `report-${crypto.randomUUID()}`); await importPracticeSeed(db); });

const draw = (d: ReportData, template: (typeof TEMPLATES)[number]['id'], look: 'photo' | 'print' = 'photo') => {
  const { container } = render(<HandwrittenNursingReport d={d} template={template} look={look} />);
  const svg = container.querySelector('svg')!;
  // Words are separate texts. Without spaces, so that line breaks do not matter.
  const text = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent).join(' ').replace(/\s+/g, ' ');
  const field = (tag: string) => (svg.querySelector(`[data-field="${tag}"]`)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const out = { svg, text, bare: text.replace(/\s/g, ''), field, title: svg.querySelector('title')!.textContent! };
  cleanup();
  return out;
};
const load = async (id: string) => (await loadReportData(db, id, NOW))!;
const bare = (s: string) => s.replace(/\s/g, '');

describe('synthetic handwritten reports: one patient, only recorded facts', () => {
  it('every patient in every design: own name, MRN, birth date and allergies, and nobody else\'s', async () => {
    const all = await Promise.all((await db.patient.toArray()).map((p) => load(p.id)));
    expect(all).toHaveLength(10);
    for (const d of all) {
      const p = d.bundle.patient;
      for (const t of TEMPLATES) {
        const r = draw(d, t.id);
        const at = `${p.id} ${t.id}`;
        expect(r.field('name'), at).toContain(fullName(p));
        expect(r.bare, at).toContain(p.mrn);
        expect(r.title, at).toContain(`${fullName(p)}, MRN ${p.mrn}`);
        expect(r.text, at).toContain(LABEL);
        expect(r.text, at).toContain(`(fictional patient ${p.id})`);
        const real = d.bundle.allergies.filter((a) => !/^no known/i.test(a.substance));
        for (const a of real) expect(r.bare, at).toContain(bare(a.substance));
        if (!real.length) expect(r.bare, at).toContain('Noknownallergies');
        for (const other of all) {
          if (other === d) continue;
          const q = other.bundle.patient;
          expect(r.bare, `${at} shows ${q.id}`).not.toContain(q.mrn);
          expect(r.bare, `${at} shows ${q.id}`).not.toContain(bare(fullName(q)));
        }
      }
    }
  });

  it('medicines, vitals and labs on the sheet are this patient\'s records', async () => {
    const d = await load('pt-01');
    const meds = (await db.entry.where('patient_id').equals('pt-01').toArray()).filter((e) => e.type === 'med_admin' && e.status === 'confirmed');
    expect(d.meds).toHaveLength(meds.length);
    const r = draw(d, 'assessment');
    expect(r.bare).toContain('09:00amLODIPine50mgPO—ordered5mg'); // as recorded; the different order stands beside it
    expect(r.bare).toContain('134/80');
    expect(draw(await load('pt-03'), 'worksheet').field('lab-Potassium')).toBe('6.2'); // newest value, not 5.4 of the day before
    expect(draw(await load('pt-10'), 'assessment').field('lab-Hemoglobin')).toBe('11.8');
  });

  it('held, refused and rate changes are never written as given', async () => {
    const held = (await load('pt-03')).meds.find((x) => x.m.event === 'held')!;
    expect(medNote(held.m)).toMatch(/^HELD, heart rate 54/);
    const refused = (await load('pt-08')).meds.find((x) => x.m.event === 'refused')!;
    expect(medNote(refused.m)).toMatch(/^REFUSED/);
    const rate = (await load('pt-05')).meds.find((x) => x.m.event === 'rate_changed')!;
    expect(medLine(rate.m)).toBe('heparin rate 1,000 to 1,150 units/h');
    const given = draw(await load('pt-03'), 'shift');
    expect(given.text).toMatch(/furosemide 40 mg IV held/);
  });

  it('drafts and records marked as a mistake are left out; a fixed value shows the old one crossed out', async () => {
    // e-048 (BP 146/88) is a draft of pt-08, e-042 (231 mg/dL) of pt-10 is marked as a mistake.
    for (const t of TEMPLATES) {
      expect(draw(await load('pt-08'), t.id).bare).not.toContain('146/88');
      expect(draw(await load('pt-10'), t.id).bare).not.toContain('231');
    }
    const r = draw(await load('pt-06'), 'shift'); // e-040 (HR 18, RR 78) was replaced by e-041 (HR 78, RR 18)
    expect(Array.from(r.svg.querySelectorAll('[data-was]')).map((e) => e.getAttribute('data-was'))).toEqual(['18', '78']);
    expect((await load('pt-06')).vitals.filter((v) => !v.fromList)).toHaveLength(1);
  });

  it('what is not recorded stays empty and the sheet says so; no box, score or signature is made up', async () => {
    const d = await load('pt-10');
    expect(d.io).toEqual([]);
    expect(d.notes).toEqual([]);
    const shift = draw(d, 'shift');
    expect(shift.text).toContain('No handover saved');
    expect(shift.text).toContain('not signed (synthetic)');
    expect(shift.text.match(/Not recorded/g)!.length).toBeGreaterThan(8);
    for (const t of TEMPLATES) {
      const r = draw(d, t.id);
      expect(r.text).not.toMatch(/A&O|PERRL|lungs clear|NKDA|K\. Patel|J\. Rivera|Rivermere|Carter|Ronald|J\. ?D\.|\bCK\b/); // words of the reference sheets
      for (const s of await db.practitioner.toArray()) expect(r.text).not.toContain(s.name); // no nurse signs
    }
    await db.encounter.where('patient_id').equals('pt-10').delete();
    await db.allergy.where('patient_id').equals('pt-10').delete();
    await db.snapshot_result.where('patient_id').equals('pt-10').delete();
    const empty = await load('pt-10');
    for (const t of TEMPLATES) {
      const r = draw(empty, t.id);
      expect(r.field('name')).toContain('Aisha Rahman');
      expect(r.text.toLowerCase()).toContain('not recorded');
      expect(r.text).not.toMatch(/undefined|null|NaN/);
      expect(r.bare).not.toContain('Noknownallergies'); // unknown is not "none"
    }
  });

  it('long names and an unusual sex value are written out in full', async () => {
    await db.patient.update('pt-02', { given_name: 'Maria-Magdalena Alexandrina Konstantinidou', family_name: 'von Wolfeschlegelsteinhausenberger', sex: 'other' });
    const d = await load('pt-02');
    for (const t of TEMPLATES) for (const look of ['photo', 'print'] as const) expect(bare(draw(d, t.id, look).field('name'))).toContain(bare(fullName(d.bundle.patient)));
  });

  it('four different designs; the first one depends on the patient, the pen too', async () => {
    const d = await load('pt-01');
    expect(new Set(TEMPLATES.map((t) => draw(d, t.id).svg.getAttribute('viewBox'))).size).toBe(4);
    expect(new Set(TEMPLATES.map((t) => t.pen.main)).size).toBe(4);
    expect(new Set(['pt-01', 'pt-02', 'pt-03', 'pt-04'].map((id) => defaultTemplate(id).id)).size).toBe(4);
    expect(defaultTemplate('a9c1-real-uuid').id).toBeTruthy();
    expect(templateById('nope')).toBeUndefined();
    expect(penFor(TEMPLATES[0]!, 'pt-01')).not.toEqual(penFor(TEMPLATES[0]!, 'pt-02'));
  });

  it('reads only: no record, photo or change-log row is written', async () => {
    const count = async () => [await db.audit_log.count(), await db.entry.count(), await db.worklist_item.count(), await db.handoff.count()];
    const before = await count();
    for (const p of await db.patient.toArray()) draw(await load(p.id), 'assessment');
    expect(await count()).toEqual(before);
  });

  it('refuses Real records, and an unknown patient gets no sheet', async () => {
    const live = new DowntimeDB('live', `report-live-${crypto.randomUUID()}`);
    await expect(loadReportData(live, 'pt-01', NOW)).rejects.toBeInstanceOf(PracticeOnlyError);
    expect(await loadReportData(db, 'pt-99', NOW)).toBeNull();
  });
});
