import type { ReportData } from './reportData';
import { Arrow, Fill, H, Ink, NotRecorded, Paper, Print, SyntheticLabel, Value, type Look } from './ink';
import type { Item, Pen } from '../../lib/handwriting/hand';
import { allergyText, bp, clock, drips, gu, handoverText, ivLines, latest, medLine, medNote, o2, otherNotes, pendingLabs, plan, safetyNotes, skinNotes } from './reportText';
import { dayLabel } from '../../lib/time';
import { formatDose } from '../../lib/dose';
import { fullName } from '../patient/patientData';
import { Footer, sheetDesc, sheetTitle } from './sheet';

const W = 800, HH = 1250;

/** Reference pocket notepad: no printed grid, one pen, arrows to what is still open, held up at the bedside. */
export function PocketSheet({ d, pen, seed, look }: { d: ReportData; pen: Pen; seed: string; look: Look }) {
  const { patient: p, encounter: e } = d.bundle;
  const o = latest(d, (v) => v.heart_rate != null || v.bp_systolic != null), v = o?.v;
  const obs1 = v ? [bp(v) ? `BP ${bp(v)}` : '', v.heart_rate != null ? `HR ${v.heart_rate}` : '', v.resp_rate != null ? `RR ${v.resp_rate}` : ''].filter(Boolean).join(', ') : '';
  const obs2 = v ? [v.temp_c != null ? `Temp ${formatDose(v.temp_c)}°C` : '', v.spo2 != null ? `SpO2 ${v.spo2}%${o2(v) ? ` on ${o2(v)}` : ''}` : ''].filter(Boolean).join(', ') : '';
  const sugar = latest(d, (x) => x.glucose_mgdl != null);
  const body: Item[] = [
    ...(v?.consciousness || v?.pain_0_10 != null ? [{ t: [v.consciousness, v.pain_0_10 != null ? `pain ${v.pain_0_10}/10` : ''].filter(Boolean).join(', ') }] : []),
    ...(sugar ? [{ t: `glucose ${sugar.v.glucose_mgdl} mg/dL @ ${clock(sugar.time)}`, calm: true }] : []),
    ...ivLines(d).filter((x) => /IV line/.test(x.t)),
    ...drips(d),
    ...d.meds.map(({ time, m }): Item => ({ t: [`${medLine(m)} @ ${clock(time)}`, medNote(m)].filter(Boolean).join(' — '), calm: true })),
    ...gu(d),
    ...otherNotes(d).map((x) => ({ ...x, mark: undefined })), ...skinNotes(d), ...safetyNotes(d),
  ];
  const open: Item[] = [...handoverText(d), ...plan(d).map((x) => ({ ...x, mark: 'dash' as const }))];
  const waiting = pendingLabs(d);
  const split = Math.min(960, Math.max(720, 520 + body.length * 46));
  return (
    <Paper w={W} h={HH} look={look} desk="bedside" seed={seed} title={sheetTitle(d, 'Pocket notes')} desc={sheetDesc(d)}>
      <Ink pen={pen} seed={seed}>
        <path d={`M0,20 H${W}`} stroke="#b9b5aa" strokeWidth={2} strokeDasharray="3 5" />
        <SyntheticLabel x={100} y={34} w={600} size={16} />
        <Value x={42} y={74} w={716} h={62} t={`Pt: ${fullName(p)}, Rm ${e?.bed ?? '—'}`} size={50} tag="name" />
        <Value x={42} y={134} w={716} h={50} t={`MRN ${p.mrn}, born ${dayLabel(p.birth_date)}`} size={38} tag="mrn" />
        <Value x={42} y={184} w={716} h={54} t={`Allergy: ${allergyText(d) ?? '— not recorded'}`} size={39} tag="allergies" />
        <Value x={42} y={236} w={716} h={46} t={[e?.code_status, e?.isolation ? `${e.isolation} precautions` : ''].filter(Boolean).join(', ') || null} size={35} calm={false} />
        <H x={44} y={290} w={706} s={2.2} c={pen.ink} />
        {v ? <><Value x={48} y={300} w={710} h={58} t={obs1} size={44} tag="obs" /><Value x={48} y={356} w={710} h={56} t={`${obs2} @ ${clock(o!.time)}${o!.fromList ? ' (hospital list)' : ''}`} size={42} /></> : <NotRecorded x={52} y={340} t="Vital signs: not recorded" />}
        {body.length ? <Fill x={52} y={416} w={waiting.length ? 520 : 690} h={split - 430} items={body} size={37} min={17} lead={1.28} slips /> : <NotRecorded x={56} y={460} t="No medicines, fluids or notes recorded" />}
        {waiting.length > 0 && <><Fill x={600} y={470} w={176} h={150} items={[{ t: 'pending:', under: true }, ...waiting]} size={29} min={15} /><Arrow x1={546} y1={500} x2={590} y2={490} /></>}
        <Value x={46} y={split} w={340} h={54} t="Handoff/Plan" size={45} calm={false} under />
        {open.length ? <Fill x={54} y={split + 62} w={696} h={HH - split - 178} items={open} size={34} min={16} lead={1.26} slips /> : <NotRecorded x={58} y={split + 92} t="No handover or plan recorded" />}
        <Print x={744} y={1180} t="not signed (synthetic)" size={16} italic anchor="end" fill="#80858f" />
        <Value x={600} y={1182} w={150} h={40} t={clock(d.nowIso)} size={36} />
        <Footer d={d} w={W} y={1241} size={10.5} />
      </Ink>
    </Paper>
  );
}
