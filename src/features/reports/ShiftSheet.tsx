import type { ReportData } from './reportData';
import { Box, Check, Fill, H, Ink, NotRecorded, Paper, Print, Ring, Stroke, Struck, SyntheticLabel, Tick, V, Value, type Look } from './ink';
import { rand, starPath, type Item, type Pen } from '../../lib/handwriting/hand';
import { allergyText, bp, clock, gi, gu, handoverText, lastObs, medLine, medNote, medOrders, neuro, o2, otherNotes, pain, pendingLabs, plan, resp, cardiac, safetyNotes, skinNotes } from './reportText';
import { dayLabel } from '../../lib/time';
import { formatDose } from '../../lib/dose';
import { fullName } from '../patient/patientData';
import { Footer, sheetDesc, sheetTitle } from './sheet';

const W = 1120, HH = 1400, L = 78, R = 1094;
const G = '#4c525c';
const Title = ({ x, y, t, sub }: { x: number; y: number; t: string; sub?: string }) => <><Print x={x} y={y} t={t} size={18} bold />{sub && <Print x={x + t.length * 9.9} y={y} t={sub} size={16} />}</>;
const Small = ({ x, y, t, a = 'start' }: { x: number; y: number; t: string; a?: 'start' | 'middle' }) => <Print x={x} y={y} t={t} size={14} bold anchor={a} />;

/** Reference "Nursing Patient Report Sheet": thin printed tables, slanted pen, notes in the margin, a ring around what matters. */
export function ShiftSheet({ d, pen, seed, look }: { d: ReportData; pen: Pen; seed: string; look: Look }) {
  const { patient: p, encounter: e } = d.bundle;
  const obs = lastObs(d, 5), pains = pain(d).slice(-4), meds = d.meds.slice(-8), cut = d.meds.length - meds.length;
  const open = d.handoff?.h.open_items ?? [];
  const sum = (dir: 'in' | 'out', cat?: string) => { const rows = d.io.filter((x) => x.x.direction === dir && (!cat || (cat === 'other' ? x.x.category !== 'urine' : x.x.category.startsWith(cat)))); return rows.length ? `${rows.reduce((n, x) => n + x.x.volume_ml, 0).toLocaleString('en-US')} ml` : null; };
  const r = rand(`${seed}|shift`);
  const A: [string, Item[], number][] = [
    ['Neuro:', neuro(d), 38], ['Resp:', resp(d), 46], ['CVS:', cardiac(d), 46], ['GI:', gi(d), 34], ['GU:', gu(d), 34], ['Skin:', skinNotes(d), 46], ['Mobility:', safetyNotes(d), 46], ['Other:', otherNotes(d).slice(-2).map((x) => ({ ...x, mark: undefined })), 56],
  ];
  let ay = 792;
  return (
    <Paper w={W} h={HH} look={look} desk="wood" seed={seed} title={sheetTitle(d, 'Nursing patient report sheet')} desc={sheetDesc(d)}>
      <Ink pen={pen} seed={seed}>
        <SyntheticLabel x={310} y={10} w={500} size={14} />
        <rect x={L} y={48} width={30} height={30} rx={3} fill="#5b6067" /><path d={`M${L + 15},53 v20 M${L + 5},63 h20`} stroke="#fff" strokeWidth={6} />
        <Print x={L + 44} y={71} t="ClinBridge Practice Ward" size={22} fill="#5b6067" />
        <Print x={L} y={122} t="Nursing Patient Report Sheet" size={26} bold />
        <Value x={640} y={36} w={300} h={36} t="practice — synthetic!" size={27} calm={false} under />
        {['AM', 'PM', 'Night'].map((t, i) => <g key={t}><Check x={804 + i * 84} y={80} s={14} /><Print x={826 + i * 84} y={93} t={t} size={15} /></g>)}
        <Small x={804} y={126} t="Unit/Ward:" /><Value x={890} y={100} w={204} h={36} t={e?.unit} size={21} calm={false} /><H x={888} y={132} w={206} s={0.8} c={G} />

        <Box x={L} y={148} w={R - L} h={108} s={1.2} c={G} /><H x={L} y={184} w={R - L} s={1} c={G} /><H x={L} y={220} w={R - L} s={1} c={G} />
        <Small x={L + 14} y={172} t="Patient Name:" /><Value x={L + 122} y={148} w={330} h={36} t={fullName(p)} size={31} tag="name" />
        <V x={540} y={148} h={36} s={1} c={G} /><Small x={552} y={172} t="MRN:" /><Value x={600} y={148} w={200} h={36} t={p.mrn} size={29} tag="mrn" />
        <V x={830} y={148} h={36} s={1} c={G} /><Small x={842} y={172} t="Bed:" /><Value x={884} y={148} w={200} h={36} t={e?.bed} size={30} tag="bed" />
        <Small x={L + 14} y={208} t="Age:" /><Value x={L + 54} y={184} w={60} h={36} t={String(d.age)} size={27} tag="age" /><Small x={L + 122} y={208} t="Sex:" /><Value x={L + 160} y={184} w={80} h={36} t={p.sex === 'male' ? 'M' : p.sex === 'female' ? 'F' : p.sex} size={27} />
        <V x={L + 236} y={184} h={36} s={1} c={G} /><Small x={L + 248} y={208} t="Dx/Reason for Admit:" />{e?.admit_reason ? <Value x={L + 410} y={184} w={200} h={36} t={e.admit_reason.replace(/ \(practice scenario\)$/, '')} size={18} tag="reason" /> : <NotRecorded x={L + 410} y={208} />}
        <V x={690} y={184} h={36} s={1} c={G} /><Small x={702} y={208} t="Allergies:" /><Value x={776} y={184} w={314} h={36} t={allergyText(d)} size={25} tag="allergies" />
        <Small x={L + 14} y={244} t="Date:" /><Value x={L + 60} y={220} w={200} h={36} t={dayLabel(d.nowIso)} size={26} />
        <Small x={370} y={244} t="Born:" /><Value x={416} y={220} w={200} h={36} t={dayLabel(p.birth_date)} size={26} tag="born" />
        <Small x={640} y={244} t="Code:" /><Value x={688} y={220} w={120} h={36} t={e?.code_status} size={25} /><Small x={830} y={244} t="Nurse:" /><NotRecorded x={884} y={244} />

        {/* Vitals */}
        <Box x={L} y={272} w={534} h={196} s={1.2} c={G} /><Title x={L + 14} y={296} t="Vitals / Monitoring (Trend)" /><H x={L} y={306} w={534} s={1} c={G} />
        {([['Time', 0, 66], ['BP', 66, 90], ['HR', 156, 58], ['RR', 214, 54], ['SpO2', 268, 72], ['Temp', 340, 76], ['Notes', 416, 118]] as const).map(([t, x, w], i) => <g key={t}>{i > 0 && <V x={L + x} y={306} h={162} s={0.8} c={G} />}<Small x={L + x + w / 2} y={325} t={t} a="middle" /></g>)}
        {[0, 1, 2, 3, 4].map((i) => <H key={i} x={L} y={332 + i * 27} w={534} s={0.7} c={G} />)}
        {obs.map((x, i) => {
          const y = 332 + i * 27, was = x.was;
          return (
            <g key={`${x.time}${i}`} data-reading={x.time}>
              <Value x={L + 8} y={y} w={56} h={27} t={clock(x.time)} size={22} /><Value x={L + 72} y={y} w={84} h={27} t={bp(x.v) || '—'} size={23} />
              {was?.heart_rate != null && was.heart_rate !== x.v.heart_rate ? <><Struck x={L + 160} y={y + 6} t={String(was.heart_rate)} size={14} /><Value x={L + 188} y={y} w={28} h={27} t={x.v.heart_rate?.toString()} size={18} /></> : <Value x={L + 166} y={y} w={48} h={27} t={x.v.heart_rate?.toString() ?? '—'} size={23} />}
              {was?.resp_rate != null && was.resp_rate !== x.v.resp_rate ? <><Struck x={L + 218} y={y + 6} t={String(was.resp_rate)} size={14} /><Value x={L + 245} y={y} w={26} h={27} t={x.v.resp_rate?.toString()} size={18} /></> : <Value x={L + 224} y={y} w={44} h={27} t={x.v.resp_rate?.toString() ?? '—'} size={23} />}
              <Value x={L + 278} y={y} w={62} h={27} t={x.v.spo2 != null ? `${x.v.spo2}%` : '—'} size={23} /><Value x={L + 346} y={y} w={70} h={27} t={x.v.temp_c != null ? `${formatDose(x.v.temp_c)}${i === 0 ? '°C' : ''}` : '—'} size={22} />
              {(o2(x.v) || x.fromList || was) && <Value x={L + 420} y={y} w={112} h={27} t={[o2(x.v), x.fromList ? 'hospital list' : '', was ? 'corrected' : ''].filter(Boolean).join(', ')} size={20} calm={false} />}
            </g>
          );
        })}
        {!obs.length && <NotRecorded x={L + 80} y={352} />}

        {/* Pain */}
        <Box x={632} y={272} w={R - 632} h={166} s={1.2} c={G} /><Title x={646} y={296} t="Pain (0–10)" /><H x={632} y={306} w={R - 632} s={1} c={G} />
        <Small x={668} y={325} t="Time" a="middle" /><Small x={742} y={325} t="Score" a="middle" /><Small x={800} y={325} t="Location / Notes" /><V x={704} y={306} h={132} s={0.8} c={G} /><V x={780} y={306} h={132} s={0.8} c={G} />
        {[0, 1, 2, 3].map((i) => <H key={i} x={632} y={332 + i * 27} w={R - 632} s={0.7} c={G} />)}
        {pains.map((x, i) => <g key={x.time} data-pain={x.time}><Value x={644} y={332 + i * 27} w={58} h={27} t={clock(x.time)} size={22} /><Value x={718} y={332 + i * 27} w={60} h={27} t={`${x.score}/10`} size={23} /></g>)}
        {pains.length > 0 ? <NotRecorded x={794} y={352} /> : <NotRecorded x={794} y={352} />}

        {/* Medicines */}
        <Box x={L} y={480} w={612} h={268} s={1.2} c={G} /><Title x={L + 14} y={504} t="Medications (Shift)" /><H x={L} y={512} w={612} s={1} c={G} />
        {([['Time', 0, 76], ['Medication / Dose / Route', 76, 250], ['Given (✓)', 326, 84], ['Notes / Response', 410, 202]] as const).map(([t, x, w], i) => <g key={t}>{i > 0 && <V x={L + x} y={512} h={236} s={0.8} c={G} />}<Small x={L + x + w / 2} y={530} t={t} a="middle" /></g>)}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <H key={i} x={L} y={537 + i * 26.4} w={612} s={0.7} c={G} />)}
        {meds.map(({ time, m }, i) => {
          const y = 537 + i * 26.4;
          return (
            <g key={m.id}>
              <Value x={L + 10} y={y} w={64} h={26} t={clock(time)} size={22} /><Value x={L + 86} y={y} w={238} h={26} t={medLine(m)} size={23} tag="med" />
              {m.event === 'administered' ? <Tick x={L + 358} y={y + 4} s={17} /> : <Value x={L + 336} y={y} w={72} h={26} t={m.event === 'rate_changed' ? 'rate' : m.event} size={18} calm={false} />}
              {medNote(m) && <Value x={L + 418} y={y} w={192} h={26} t={medNote(m).replace(/^(HELD|REFUSED), /, '')} size={20} />}
            </g>
          );
        })}
        {!meds.length && <NotRecorded x={L + 88} y={556} t="No medicine recorded" />}
        {cut > 0 && <Print x={L + 606} y={746} t={`+ ${cut} more in ClinBridge`} size={9.5} anchor="end" fill="#5b6270" />}

        {/* I&O */}
        <Box x={706} y={452} w={R - 706} h={296} s={1.2} c={G} /><Title x={720} y={476} t="Intake / Output (I&O)" /><H x={706} y={486} w={R - 706} s={1} c={G} />
        <Small x={720} y={508} t="Intake (ml)" /><Small x={720} y={622} t="Output (ml)" />
        {([['PO:', 534, sum('in', 'oral')], ['IV:', 562, sum('in', 'iv')], ['Total:', 592, sum('in')], ['Urine:', 648, sum('out', 'urine')], ['Other:', 676, sum('out', 'other')], ['Total:', 704, sum('out')]] as const).map(([t, y, v]) => <g key={y}><Small x={738} y={y} t={t} /><H x={800} y={y + 4} w={270} s={0.7} c={G} />{v ? <Value x={828} y={y - 24} w={230} h={30} t={v} size={25} /> : <NotRecorded x={828} y={y} />}</g>)}
        <Small x={720} y={736} t="Balance (I−O):" />{d.io.length ? <><Value x={852} y={712} w={170} h={32} t={`${d.ioTotals.balance > 0 ? '+' : d.ioTotals.balance < 0 ? '−' : ''}${Math.abs(d.ioTotals.balance).toLocaleString('en-US')} ml`} size={27} /><Ring x={832} y={709} w={150} h={36} /></> : <NotRecorded x={852} y={736} />}

        {/* Assessments */}
        <Box x={L} y={760} w={564} h={386} s={1.2} c={G} /><Title x={L + 14} y={783} t="Assessments / Clinical Observations" sub="(recorded)" /><H x={L} y={792} w={564} s={1} c={G} />
        {A.map(([t, items, h], i) => {
          const y = ay; ay += h;
          return <g key={t}>{i > 0 && <H x={L} y={y} w={564} s={0.7} c={G} />}<Small x={L + 14} y={y + 23} t={t} /><Fill x={L + 88} y={y + 2} w={470} h={h - 4} items={items.length ? [{ t: items.map((x) => x.t).join(', '), calm: i < 5 }] : []} size={23} min={12} lead={1.08} slips={i > 6} tag={t} /></g>;
        })}
        {/* Plan */}
        <Box x={656} y={760} w={R - 656} h={386} s={1.2} c={G} /><Title x={670} y={783} t="Plan / Ongoing Care" /><H x={656} y={792} w={R - 656} s={1} c={G} />
        <Fill x={670} y={800} w={408} h={pendingLabs(d).length ? 220 : 330} items={[...plan(d), ...medOrders(d), ...d.orders.filter((o) => o.type === 'lab' || o.type === 'imaging').map((o) => ({ t: o.text }))].map((x) => ({ ...x, mark: 'box' as const }))} size={24} min={13} lead={1.2} />
        {pendingLabs(d).length > 0 && <><Ring x={694} y={1030} w={370} h={92} /><Fill x={728} y={1046} w={316} h={70} items={pendingLabs(d).map((x) => ({ ...x, mark: 'arrow' as const }))} size={22} min={13} /></>}

        {/* Handover */}
        <Box x={L} y={1158} w={R - L} h={150} s={1.2} c={G} /><Title x={L + 14} y={1182} t="Handover / Shift Summary" />
        {d.handoff ? <Fill x={L + 24} y={1188} w={open.length ? 690 : 960} h={114} items={handoverText(d)} size={24} min={14} slips /> : <NotRecorded x={L + 24} y={1214} t="No handover saved" />}
        {open.length > 0 && <><Ring x={812} y={1166} w={274} h={134} /><Value x={850} y={1172} w={140} h={28} t="To f/up:" size={25} calm={false} under /><Fill x={846} y={1204} w={222} h={84} items={open.map((t) => ({ t, mark: 'dot' as const }))} size={21} min={12} /></>}
        {open.length > 0 && <g><Stroke d={starPath(40, 520, 24, r)} w={1.6} /><g transform="translate(12 764) rotate(-87)"><Fill x={0} y={0} w={222} h={56} items={[{ t: open[0]!, under: true }]} size={22} min={13} /></g></g>}

        <Small x={L} y={1344} t="Signature (Off-going):" /><H x={L + 164} y={1347} w={140} s={0.8} c={G} /><Small x={L + 320} y={1344} t="Date/Time:" /><H x={L + 400} y={1347} w={110} s={0.8} c={G} /><Small x={L + 526} y={1344} t="Signature (On-coming):" /><H x={L + 696} y={1347} w={130} s={0.8} c={G} /><Small x={L + 842} y={1344} t="Date/Time:" /><H x={L + 922} y={1347} w={94} s={0.8} c={G} />
        <Print x={L + 168} y={1340} t="not signed (synthetic)" size={11.5} italic fill="#80858f" /><Print x={L + 700} y={1340} t="not signed" size={11.5} italic fill="#80858f" />
        <Footer d={d} w={W} y={1385} size={12} />
      </Ink>
    </Paper>
  );
}
