/**
 * Printable downtime forms, after the Stitch v3 sheets DT-MAR-01, DT-VIT-02 and DT-SBAR-03.
 *
 * What these forms are: paper backup sheets pre-filled with what ClinBridge already holds (patient identifiers,
 * allergies, active orders, saved handover text, recent confirmed readings), with empty boxes to write in.
 *
 * What they are not, on purpose (see docs/V3_ZIP_COMPLETION_REPORT.md):
 * - no barcode, QR code, OCR fiducials or "provenance hash" (nothing verified to encode or scan);
 * - no NEWS2 or GCS calculation, escalation bands or targets (no approved algorithm);
 * - no invented doses, administrations, signatures or verifications;
 * - verbal-order and signature boxes are blank paper fields. ClinBridge does not authorise verbal orders or
 *   record countersignatures or handover sign-off.
 * Writing on a printed sheet does not put anything into ClinBridge; someone has to type it in.
 */
import type { ReactNode } from 'react';
import type { VitalSign } from '../../db/schema';
import { ROUTE_LABEL } from '../../config/medicationPolicy';
import { IO_IN, IO_OUT } from '../../lib/charting';
import { orderDose, type Slot } from '../../lib/meds';
import { ageOn, dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { isNoKnownAllergy, sexLabel } from '../patient/patientData';
import { FORMS, type FormKind, type PrintData } from './printData';

export interface SheetContext {
  nowIso: string;
  printedBy: string;
  practice: boolean;
  snapshotAt: string | null;
}

const cell = 'border border-black px-1 py-0.5 align-top';
const head = `${cell} bg-[#e8e8e8] font-semibold text-left`;

function Blank({ className = '' }: { className?: string }) {
  return <span className={`block border-b border-black/70 min-h-[18px] ${className}`} aria-hidden />;
}

function Lines({ n }: { n: number }) {
  return <div aria-label={`${n} blank lines for handwriting`}>{Array.from({ length: n }, (_, i) => <Blank key={i} className="min-h-[22px]" />)}</div>;
}

function allergyText(d: PrintData): string {
  const real = d.bundle.allergies.filter((a) => !isNoKnownAllergy(a));
  if (real.length) return real.map((a) => `${a.substance.toUpperCase()}${a.reaction ? ` (${a.reaction}${a.severity ? `, ${a.severity}` : ''})` : ''}`).join(' · ');
  return d.bundle.allergies.length ? 'No known allergies' : 'Allergies not recorded in ClinBridge: ask and write here ____________';
}

/** Patient identification strip. It sits in a table header, so the browser repeats it on every printed page. */
function IdStrip({ kind, d, ctx }: { kind: FormKind; d: PrintData; ctx: SheetContext }) {
  const { patient: p, encounter: e } = d.bundle;
  const f = FORMS[kind];
  return (
    <div className="pb-1.5 mb-1.5 border-b-2 border-black">
      {ctx.practice && (
        <p className="text-center font-bold tracking-wide border-2 border-black mb-1 py-0.5" data-testid="practice-label">
          PRACTICE · FICTIONAL PATIENT · NOT A MEDICAL RECORD
        </p>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-bold text-[13px] uppercase">{f.title}</p>
        <p className="font-mono text-[11px] whitespace-nowrap">FORM {f.code}</p>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto_1fr_auto_1fr] gap-x-2 gap-y-0.5 mt-1 text-[11px]">
        <span className="font-semibold">Name</span><span className="font-bold text-[13px]" data-testid="print-name">{p.family_name.toUpperCase()}, {p.given_name}</span>
        <span className="font-semibold">MRN</span><span className="font-mono font-bold" data-testid="print-mrn">{p.mrn}</span>
        <span className="font-semibold">Bed</span><span className="font-bold">{e?.bed ?? '____'}{e?.unit ? ` · ${e.unit}` : ''}</span>
        <span className="font-semibold">Born</span><span>{dayLabel(p.birth_date)} ({ageOn(p.birth_date, ctx.nowIso)}y, {sexLabel(p.sex)})</span>
        <span className="font-semibold">Doctor</span><span>{e?.attending ?? '____________'}</span>
        <span className="font-semibold">Code</span><span className="font-semibold">{e?.code_status ?? '____________'}</span>
      </div>
      <p className="mt-1 text-[11px]"><span className="font-bold">ALLERGIES: </span><span className="font-semibold" data-testid="print-allergies">{allergyText(d)}</span>
        {e?.isolation && <span className="ml-3 font-bold">ISOLATION: {e.isolation.toUpperCase()}</span>}
      </p>
    </div>
  );
}

function SheetFooter({ kind, ctx }: { kind: FormKind; ctx: SheetContext }) {
  return (
    <div className="mt-2 pt-1 border-t border-black text-[9.5px] flex flex-col gap-0.5">
      <p>Form {FORMS[kind].code} · printed from ClinBridge {dateTimeLabel(ctx.nowIso)} by {ctx.printedBy}{ctx.snapshotAt ? ` · patient list from ${dateTimeLabel(ctx.snapshotAt)}` : ''}</p>
      <p className="font-semibold">Confidential patient information. Anything written on this sheet is not in ClinBridge until it is typed in.</p>
    </div>
  );
}

function Sheet({ kind, d, ctx, breakBefore, children }: { kind: FormKind; d: PrintData; ctx: SheetContext; breakBefore: boolean; children: ReactNode }) {
  return (
    <article className={`print-sheet bg-white text-black text-[11px] leading-snug ${breakBefore ? 'print-break' : ''}`}
      aria-label={`${FORMS[kind].short} for ${d.bundle.patient.given_name} ${d.bundle.patient.family_name}`} data-form={kind} data-patient={d.bundle.patient.id}>
      <table className="w-full border-collapse">
        <thead><tr><td><IdStrip kind={kind} d={d} ctx={ctx} /></td></tr></thead>
        <tbody><tr><td>{children}<SheetFooter kind={kind} ctx={ctx} /></td></tr></tbody>
      </table>
    </article>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-2 break-inside-avoid-page">
      <h3 className="font-bold uppercase text-[11.5px] bg-black text-white px-1 py-0.5">{title}</h3>
      {note && <p className="text-[10px] mt-0.5">{note}</p>}
      <div className="mt-1">{children}</div>
    </section>
  );
}

/* ------------------------------ DT-MAR-01 ------------------------------ */

function slotText(s: Slot): string | null {
  if (s.status === 'due' || s.status === 'overdue') return null;
  if (s.status === 'draft') return 'draft in ClinBridge, not confirmed';
  const label = s.status === 'given' ? 'Given' : s.status === 'held' ? 'Held' : 'Refused';
  return `${label} ${hm(s.entry?.care_time)} (in ClinBridge)`;
}

export function MarSheet({ d, ctx, breakBefore = false }: { d: PrintData; ctx: SheetContext; breakBefore?: boolean }) {
  return (
    <Sheet kind="mar" d={d} ctx={ctx} breakBefore={breakBefore}>
      <p className="text-[10px]">Active medicine orders from the patient list. Write the time and your initials for every dose given, held or refused. Held and refused need a reason. Times already recorded in ClinBridge today ({dayLabel(ctx.nowIso)}) are shown for reference.</p>
      <Section title="Active medicine orders">
        {d.orders.length === 0 ? <p className="italic" data-testid="mar-no-orders">No active medicine orders in ClinBridge for this patient.</p> : (
          <table className="w-full border-collapse" data-testid="mar-orders">
            <thead>
              <tr>
                <th className={`${head} w-[26%]`}>Medicine and order</th>
                <th className={`${head} w-[18%]`}>Dose · route · how often</th>
                <th className={`${head} w-[26%]`}>Times today: time given · initials</th>
                <th className={`${head} w-[14%]`}>2nd nurse initials</th>
                <th className={`${head} w-[16%]`}>Site / reason if held or refused</th>
              </tr>
            </thead>
            <tbody>
              {d.orders.map(({ order: o, group, highAlert, slots }) => (
                <tr key={o.id} className="break-inside-avoid" data-order={o.id}>
                  <td className={cell}>
                    <span className="font-bold">{o.drug_name ?? o.text}</span>
                    {o.drug_name && o.text !== o.drug_name && <span className="block text-[10px]">{o.text}</span>}
                    {o.ordered_by && <span className="block text-[10px]">Ordered by {o.ordered_by}</span>}
                    {highAlert && <span className="block font-bold text-[10px] border border-black px-0.5 mt-0.5">HIGH-ALERT: second nurse checks</span>}
                  </td>
                  <td className={cell}>
                    {orderDose(o) || '____'}<br />{o.route ? (ROUTE_LABEL[o.route] ?? o.route) : '____'}<br />{o.frequency ?? ''}{group === 'prn' ? ' (as needed)' : ''}
                  </td>
                  <td className={cell}>
                    {group === 'scheduled' && slots.length > 0 ? slots.map((s) => (
                      <div key={s.time} className="flex items-baseline gap-1 py-0.5">
                        <span className="font-mono font-bold w-10">{hm(s.time)}</span>
                        {slotText(s) ? <span className="text-[10px] italic">{slotText(s)}</span> : <span className="flex-1"><Blank /></span>}
                      </div>
                    )) : [0, 1, 2].map((i) => (
                      <div key={i} className="flex items-baseline gap-1 py-0.5"><span className="font-mono w-10">__:__</span><span className="flex-1"><Blank /></span></div>
                    ))}
                  </td>
                  <td className={cell}>{highAlert ? <Lines n={Math.max(slots.length, 3)} /> : <span className="text-[10px]">Not needed</span>}</td>
                  <td className={cell}><Lines n={2} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Medicines ordered on paper during the outage" note="Blank rows. Write the full order as given by the prescriber.">
        <table className="w-full border-collapse">
          <thead><tr><th className={`${head} w-[44%]`}>Medicine, dose, route, how often</th><th className={`${head} w-[20%]`}>Prescriber</th><th className={`${head} w-[36%]`}>Time given · initials</th></tr></thead>
          <tbody>{[0, 1, 2].map((i) => <tr key={i}><td className={`${cell} h-[30px]`} /><td className={cell} /><td className={cell} /></tr>)}</tbody>
        </table>
      </Section>
      <Section title="Initials key">
        <table className="w-full border-collapse"><tbody>{[0, 1].map((i) => <tr key={i}><td className={`${cell} w-[15%]`}>Initials</td><td className={`${cell} w-[35%]`} /><td className={`${cell} w-[15%]`}>Full name</td><td className={cell} /></tr>)}</tbody></table>
      </Section>
    </Sheet>
  );
}

/* ------------------------------ DT-VIT-02 ------------------------------ */

const TIME_COLS = 8;
function TimeGrid({ rows, cols = TIME_COLS, label }: { rows: string[]; cols?: number; label: string }) {
  return (
    <table className="w-full border-collapse" aria-label={label}>
      <thead>
        <tr><th className={`${head} w-[26%]`}>Time →</th>{Array.from({ length: cols }, (_, i) => <th key={i} className={head}>__:__</th>)}</tr>
      </thead>
      <tbody>{rows.map((r) => <tr key={r}><th scope="row" className={`${cell} font-semibold text-left`}>{r}</th>{Array.from({ length: cols }, (_, i) => <td key={i} className={`${cell} h-[24px]`} />)}</tr>)}</tbody>
    </table>
  );
}

function vitalsLine(v: VitalSign): string {
  const o2 = [v.o2_device, v.o2_flow_lpm != null ? `${v.o2_flow_lpm} L/min` : null].filter(Boolean).join(' ');
  return [
    v.bp_systolic != null ? `BP ${v.bp_systolic}/${v.bp_diastolic ?? '?'}` : null,
    v.heart_rate != null ? `pulse ${v.heart_rate}` : null,
    v.resp_rate != null ? `breathing ${v.resp_rate}` : null,
    v.spo2 != null ? `SpO₂ ${v.spo2}%${o2 ? ` (${o2})` : ''}` : null,
    v.temp_c != null ? `temp ${v.temp_c} °C` : null,
    v.pain_0_10 != null ? `pain ${v.pain_0_10}/10` : null,
    v.consciousness ? `awake: ${v.consciousness}` : null,
  ].filter(Boolean).join(' · ') || 'no values';
}

export function VitalsSheet({ d, ctx, breakBefore = false }: { d: PrintData; ctx: SheetContext; breakBefore?: boolean }) {
  return (
    <Sheet kind="vit" d={d} ctx={ctx} breakBefore={breakBefore}>
      <p className="text-[10px]">Write the time at the top of each column. Circle anything unusual and tell the nurse in charge. This sheet calculates nothing: there is no score, target or escalation band on it.</p>
      <Section title="1. Vital signs">
        <TimeGrid label="Vital signs grid" rows={['Blood pressure (mmHg)', 'Pulse (/min)', 'Breathing rate (/min)', 'SpO₂ (%) and oxygen (device, L/min)', 'Temperature (°C)', 'Pain (0–10) and where', 'Awake? (consciousness level)', 'Blood sugar (mg/dL)', 'Initials']} />
        <div className="mt-1 text-[10px]" data-testid="vit-recent">
          <span className="font-semibold">Last confirmed in ClinBridge: </span>
          {d.recentVitals.length === 0 ? 'none saved yet.' : (
            <ul className="list-none">{d.recentVitals.map((r) => <li key={r.entryId}>{dateTimeLabel(r.time)} · {vitalsLine(r.v)}</li>)}</ul>
          )}
        </div>
      </Section>
      <Section title="2. Neurological observations" note="Blank boxes only. Write the observed responses; ClinBridge does not calculate a coma scale total or any score.">
        <TimeGrid label="Neurological observations grid" cols={4} rows={['Eyes open', 'Talks (verbal response)', 'Moves (motor response)', 'Total written by the nurse', 'Left pupil: size (mm), reacts?', 'Right pupil: size (mm), reacts?', 'Arms: strength left / right', 'Legs: strength left / right']} />
      </Section>
      <Section title="3. Fluid balance (mL)" note="Write the period at the top of each column (for example 07–09). Totals are plain sums written by the nurse.">
        <TimeGrid label="Fluid balance grid" cols={6} rows={[...IO_IN.map((c) => `In: ${c.label}`), 'Total in', ...IO_OUT.map((c) => `Out: ${c.label}`), 'Total out', 'In minus out']} />
        <p className="mt-1 text-[10px]" data-testid="vit-io-today">
          <span className="font-semibold">Confirmed in ClinBridge today ({dayLabel(d.ioToday.day)}): </span>
          {d.ioToday.count === 0 ? 'no fluid records yet.' : `in ${d.ioToday.totalIn} mL · out ${d.ioToday.totalOut} mL · in minus out ${d.ioToday.balance > 0 ? '+' : ''}${d.ioToday.balance} mL (${d.ioToday.count} records)`}
        </p>
      </Section>
      <Section title="4. Notes"><Lines n={5} /></Section>
    </Sheet>
  );
}

/* ------------------------------ DT-SBAR-03 ------------------------------ */

export function SbarSheet({ d, ctx, breakBefore = false }: { d: PrintData; ctx: SheetContext; breakBefore?: boolean }) {
  const h = d.handoff?.handoff;
  const part = (title: string, text: string | null, blankLines: number) => (
    <div className="mt-1 break-inside-avoid">
      <p className="font-bold">{title}</p>
      {text ? <p className="whitespace-pre-wrap border-l-2 border-black pl-1">{text}</p> : null}
      <p className="text-[9.5px] mt-0.5">{text ? 'Additions on paper:' : ''}</p>
      <Lines n={blankLines} />
    </div>
  );
  return (
    <Sheet kind="sbar" d={d} ctx={ctx} breakBefore={breakBefore}>
      <Section title="Part 1 · SBAR handover"
        note={h ? `Printed from the handover saved in ClinBridge: ${h.shift}${d.handoff?.savedAt ? `, saved ${dateTimeLabel(d.handoff.savedAt)}` : ''}${d.handoff?.author ? ` by ${d.handoff.author}` : ''}. Check it is still true before you rely on it.` : 'No handover saved in ClinBridge for this patient. Write the handover below.'}>
        <div data-testid="sbar-parts">
          {part('S · Situation', h?.situation ?? null, h ? 2 : 4)}
          {part('B · Background', h?.background ?? null, h ? 2 : 4)}
          {part('A · Assessment', h?.assessment ?? null, h ? 2 : 4)}
          {part('R · Recommendation and open items', h?.open_items.length ? h.open_items.map((x) => `• ${x}`).join('\n') : null, h ? 2 : 4)}
        </div>
      </Section>
      <Section title="Part 2 · Verbal and telephone orders taken on paper"
        note="Blank paper record. ClinBridge does not take, authorise or track verbal orders, and does not track prescriber countersignatures. Follow the hospital's verbal-order policy.">
        <table className="w-full border-collapse" data-testid="sbar-verbal-orders">
          <thead><tr><th className={`${head} w-[14%]`}>Date and time</th><th className={`${head} w-[18%]`}>Prescriber</th><th className={`${head} w-[34%]`}>Order (medicine, dose, route, how often, or care instruction)</th><th className={`${head} w-[14%]`}>Read back by (initials)</th><th className={`${head} w-[20%]`}>Prescriber signature and date</th></tr></thead>
          <tbody>{[0, 1, 2, 3].map((i) => <tr key={i}><td className={`${cell} h-[34px]`} /><td className={cell} /><td className={cell} /><td className={cell} /><td className={cell} /></tr>)}</tbody>
        </table>
      </Section>
      <Section title="Part 3 · Handover names and signatures (paper)" note="Paper signatures only. ClinBridge does not record handover sign-off.">
        <table className="w-full border-collapse">
          <thead><tr><th className={head}>Role</th><th className={head}>Name</th><th className={head}>Signature</th><th className={head}>Time</th></tr></thead>
          <tbody>{['Outgoing nurse', 'Incoming nurse'].map((r) => <tr key={r}><td className={`${cell} h-[30px] font-semibold`}>{r}</td><td className={cell} /><td className={cell} /><td className={cell} /></tr>)}</tbody>
        </table>
      </Section>
    </Sheet>
  );
}

export function FormSheet({ kind, d, ctx, breakBefore = false }: { kind: FormKind; d: PrintData; ctx: SheetContext; breakBefore?: boolean }) {
  if (kind === 'mar') return <MarSheet d={d} ctx={ctx} breakBefore={breakBefore} />;
  if (kind === 'vit') return <VitalsSheet d={d} ctx={ctx} breakBefore={breakBefore} />;
  return <SbarSheet d={d} ctx={ctx} breakBefore={breakBefore} />;
}
