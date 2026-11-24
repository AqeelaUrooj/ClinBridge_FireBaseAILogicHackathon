import type { ReportData, ReportLab } from './reportData';
import { Box, Fill, H, Ink, NotRecorded, Paper, Print, Ring, SyntheticLabel, V, Value, type Look } from './ink';
import type { Item, Pen } from '../../lib/handwriting/hand';
import { allergyText, bp, cardiac, clock, drips, gi, glucose, gu, handoverText, ioAll, ivLines, labFor, lastObs, medOrders, neuro, o2, otherLabs, otherNotes, pendingLabs, resp, safetyNotes, shortDay, skinNotes } from './reportText';
import { dayLabel, hm } from '../../lib/time';
import { formatDose } from '../../lib/dose';
import { isMedOrder } from '../../lib/meds';
import { fullName } from '../patient/patientData';
import { Footer, sheetDesc, sheetTitle } from './sheet';

const W = 1100, HH = 1440;
const GREY = '#d9d9d9';
const FISH = ['Hgb', 'Hct', 'WBC', 'Plt', 'INR', 'PT', 'PTT', 'Na', 'Cl', 'BUN', 'K', 'CO2', 'Cr', 'Gluc', 'Ca', 'TP', 'AST', 'LDH', 'PO4', 'Alb', 'ALT', 'AP', 'Bili'];

const Lab = ({ x, y, t }: { x: number; y: number; t: string }) => <Print x={x} y={y} t={t} size={13.5} />;
const Shade = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => <rect x={x} y={y} width={w} height={h} fill={GREY} />;

/** A value of the lab fishbone: the printed short name stays under it in grey, as on the paper sheet. */
function Bone({ x, y, w = 46, t, l, box }: { x: number; y: number; w?: number; t: string; l: ReportLab | undefined; box?: number }) {
  return (
    <g>
      <Print x={x + w / 2} y={y + 19} t={t} size={15} bold anchor="middle" fill={l ? '#e6e6e6' : '#a3a3a3'} />
      {l && <Value x={x - 4} y={y + 1} w={w + 10} h={25} t={l.value} size={24} tag={`lab-${l.name}`} />}
      {l?.flag === 'critical' && <Ring x={x - 6} y={y - 3} w={(box ?? w) + 10} h={32} />}
    </g>
  );
}

function Fishbones({ d, y, empty }: { d: ReportData; y: number; empty?: boolean }) {
  const l = (k: string) => (empty || !(k in { Hgb: 1, Hct: 1, WBC: 1, Plt: 1, INR: 1, PT: 1, PTT: 1, Na: 1, Cl: 1, BUN: 1, K: 1, CO2: 1, Cr: 1, Gluc: 1, Ca: 1, TP: 1, AST: 1, LDH: 1, Alb: 1, ALT: 1, AP: 1, Bili: 1 }) ? undefined : labFor(d, k));
  const g = '#3a3a3a', s = 1.2;
  return (
    <g>
      <g stroke={g} strokeWidth={s} fill="none">
        <path d={`M422,${y + 2} L454,${y + 31} L488,${y + 31} L520,${y + 2} M454,${y + 31} L422,${y + 60} M488,${y + 31} L520,${y + 60}`} />
        <path d={`M552,${y + 2} L586,${y + 30} L620,${y + 2} M586,${y + 30} L586,${y + 60}`} />
        <path d={`M420,${y + 102} L520,${y + 102} M454,${y + 70} L454,${y + 132} M487,${y + 70} L487,${y + 132} M520,${y + 102} L552,${y + 70} M520,${y + 102} L552,${y + 130}`} />
        <path d={`M420,${y + 170} L552,${y + 170} M456,${y + 140} L456,${y + 200} M490,${y + 140} L490,${y + 200} M522,${y + 140} L522,${y + 200} M552,${y + 170} L586,${y + 140} M552,${y + 170} L586,${y + 198}`} />
      </g>
      <Bone x={450} y={y + 2} w={42} t="Hgb" l={l('Hgb')} /><Bone x={450} y={y + 32} w={42} t="Hct" l={l('Hct')} /><Bone x={400} y={y + 18} w={44} t="WBC" l={l('WBC')} /><Bone x={494} y={y + 18} w={40} t="Plt" l={l('Plt')} />
      <Bone x={566} y={y - 6} w={40} t="INR" l={l('INR')} /><Bone x={546} y={y + 24} w={36} t="PT" l={l('PT')} /><Bone x={592} y={y + 24} w={40} t="PTT" l={l('PTT')} />
      <Bone x={418} y={y + 74} w={34} t="Na" l={l('Na')} /><Bone x={456} y={y + 74} w={30} t="Cl" l={l('Cl')} /><Bone x={490} y={y + 74} w={38} t="BUN" l={l('BUN')} /><Bone x={418} y={y + 104} w={34} t="K" l={l('K')} /><Bone x={455} y={y + 104} w={32} t="CO2" l={l('CO2')} /><Bone x={489} y={y + 104} w={42} t="Creat" l={l('Cr')} /><Bone x={540} y={y + 88} w={46} t="Gluc" l={l('Gluc')} />
      <Bone x={418} y={y + 143} w={36} t="Ca" l={l('Ca')} /><Bone x={458} y={y + 143} w={32} t="TP" l={l('TP')} /><Bone x={490} y={y + 143} w={34} t="AST" l={l('AST')} /><Bone x={522} y={y + 143} w={38} t="LDH" l={l('LDH')} /><Bone x={418} y={y + 173} w={36} t="PO4" l={undefined} /><Bone x={458} y={y + 173} w={32} t="Alb" l={l('Alb')} /><Bone x={490} y={y + 173} w={34} t="ALT" l={l('ALT')} /><Bone x={522} y={y + 173} w={32} t="AP" l={l('AP')} /><Bone x={572} y={y + 158} w={40} t="Bili" l={l('Bili')} />
    </g>
  );
}

/** Reference bedside worksheet: heavy black grid, grey bars, lab fishbones, systems below, hours on the right. Black pen. */
export function WorksheetSheet({ d, pen, seed, look }: { d: ReportData; pen: Pen; seed: string; look: Look }) {
  const { patient: p, encounter: e } = d.bundle;
  const obs = lastObs(d, 3), sugar = glucose(d).slice(-2);
  const shown = d.labs.filter((l) => FISH.some((k) => k !== 'PO4' && labFor(d, k) === l));
  const hours = ['07', '08', '09', '10', '11', '12'].map((h) => ({
    h, items: d.orders.flatMap((o) => (o.scheduled_times ?? []).filter((t) => t.startsWith(`${h}:`)).map((t): Item => ({ t: `${isMedOrder(o) ? `${o.drug_name ?? o.text} ${o.dose != null ? `${formatDose(o.dose)} ${o.dose_unit ?? ''}` : ''}`.trim() : o.text}${t.endsWith(':00') ? '' : ` ${t.replace(':', '')}`}`, mark: 'box' }))),
  }));
  const rows: [string, string, string | null | undefined, string][] = [
    ['Room:', 'Admit:', e ? `${dayLabel(e.admit_time)} ${clock(e.admit_time)}` : null, 'admit'], ['Name:', 'POD:', null, 'pod'], ['Age/Sex:', 'Dx:', null, 'dx'], ['Code:', 'Allergy:', allergyText(d), 'allergies'], ['Precaution:', 'MRN:', `${p.mrn}, born ${dayLabel(p.birth_date)}`, 'mrn'],
  ];
  const left = [e?.bed, fullName(p), `${d.age} / ${p.sex === 'male' ? 'M' : p.sex === 'female' ? 'F' : p.sex}`, e?.code_status, e?.isolation];
  const B = 3.4;
  return (
    <Paper w={W} h={HH} look={look} desk="clean" seed={seed} title={sheetTitle(d, 'Bedside worksheet')} desc={sheetDesc(d)}>
      <Ink pen={pen} seed={seed}>
        <SyntheticLabel x={300} y={20} w={500} size={14} />
        {rows.map(([a, b, v, tag], i) => (
          <g key={a}>
            {i % 2 === 1 && <Shade x={34} y={75 + i * 27.6} w={626} h={27.6} />}
            <Lab x={40} y={95 + i * 27.4} t={a} /><Value x={i === 4 ? 130 : i === 2 ? 112 : 94} y={74 + i * 27.4} w={i === 4 ? 134 : 168} h={29} t={left[i]} size={25} tag={['bed', 'name', 'age', 'code', 'isolation'][i]} />
            <Lab x={274} y={95 + i * 27.4} t={b} /><Value x={i === 3 ? 340 : 330} y={74 + i * 27.4} w={312} h={29} t={v} size={24} tag={tag} />
          </g>
        ))}
        <Shade x={660} y={75} w={408} h={84} /><Lab x={668} y={97} t="Hx:" /><NotRecorded x={704} y={97} />
        <Lab x={668} y={180} t="Course:" /><Fill x={676} y={184} w={384} h={350} items={[...handoverText(d), ...otherNotes(d)]} size={25} min={14} slips lead={1.3} />
        <Lab x={40} y={232} t="Social:" /><NotRecorded x={96} y={232} />

        {/* Vital signs */}
        <Shade x={34} y={271} w={352} h={28} /><Shade x={34} y={327} w={352} h={28} /><Shade x={34} y={383} w={352} h={50} />
        {[0, 1, 2].map((i) => {
          const x = 34 + i * 117.3, o = obs[i], v = o?.v;
          return (
            <g key={i}>
              {i > 0 && <V x={x} y={271} h={162} s={1.4} />}
              <Lab x={x + 6} y={291} t={i === 0 ? 'VS:' : ''} /><Box x={x + (i === 0 ? 34 : 8)} y={279} w={11} h={11} s={1.2} />
              {o && <Value x={x + (i === 0 ? 52 : 26)} y={270} w={66} h={30} t={clock(o.time)} size={23} />}
              {o?.fromList && <Print x={x + 112} y={296} t="list" size={9} italic anchor="end" fill="#6a6a6a" />}
              {v ? <Value x={x + 4} y={298} w={110} h={30} t={[v.temp_c != null ? formatDose(v.temp_c) : '—', v.heart_rate ?? '—', v.resp_rate ?? '—'].join(' / ')} size={21} /> : <Lab x={x + 46} y={319} t="/     /" />}
              {v ? <Value x={x + 18} y={326} w={96} h={30} t={bp(v) || '—'} size={23} /> : <Lab x={x + 56} y={347} t="/" />}
              {v?.spo2 != null ? <Value x={x + 14} y={354} w={100} h={30} t={`${v.spo2}%${o2(v) ? ` ${o2(v)}` : ''}`} size={22} /> : <Lab x={x + 60} y={375} t="%" />}
              {v?.pain_0_10 != null ? <Value x={x + 18} y={384} w={90} h={30} t={`${v.pain_0_10} /10`} size={22} /> : <Lab x={x + 60} y={404} t="/10" />}
            </g>
          );
        })}
        {[299, 327, 355, 383].map((y) => <H key={y} x={34} y={y} w={352} s={0.9} />)}

        <Lab x={40} y={456} t="Access:" /><Fill x={102} y={436} w={278} h={50} items={ivLines(d).filter((x) => /IV line/.test(x.t))} size={22} min={12} />
        <Shade x={34} y={488} w={352} h={58} /><Lab x={40} y={510} t="Gtts:" /><Fill x={84} y={490} w={296} h={54} items={drips(d)} size={21} min={12} />
        <Lab x={40} y={568} t="Tubes/Drains:" /><Fill x={142} y={550} w={238} h={46} items={d.io.filter((x) => ['drain', 'ng', 'tube'].includes(x.x.category)).map((x) => ({ t: `${hm(x.time)} ${x.x.category} ${x.x.volume_ml} mL` }))} size={20} />
        <Lab x={40} y={622} t="I & O:" /><Fill x={44} y={626} w={336} h={108} items={ioAll(d)} size={22} min={12} />

        {/* Labs: newest values in the upper fishbones; the lower set stays blank, as printed. */}
        <Lab x={392} y={234} t="Labs:" /><Fishbones d={d} y={248} />
        {d.labs.length > 0 && <Print x={440} y={234} size={10.5} fill="#444" t={shown.map((l) => `${l.name} ${l.fromList ? shortDay(l.time) : hm(l.time)}`).join(', ')} />}
        {otherLabs(d, FISH.filter((k) => k !== 'PO4')).length > 0 && <Fill x={560} y={318} w={96} h={60} items={otherLabs(d, FISH.filter((k) => k !== 'PO4')).map((l) => ({ t: `${l.name} ${l.value}` }))} size={16} min={10} />}
        <Fishbones d={d} y={482} empty />
        {pendingLabs(d).length > 0 && <Fill x={394} y={690} w={260} h={44} items={pendingLabs(d).map((x) => ({ ...x, mark: 'arrow' as const }))} size={19} min={11} />}

        <Shade x={660} y={545} w={408} h={56} /><Lab x={668} y={567} t="Diet:" /><Value x={710} y={546} w={352} h={30} t={e?.diet} size={24} tag="diet" />
        <Lab x={668} y={594} t="Pills:" /><Fill x={712} y={574} w={350} h={46} items={medOrders(d).filter((x) => /by mouth/i.test(x.t)).map((x) => ({ ...x, mark: undefined }))} size={19} min={10} lead={1.05} />
        <Lab x={668} y={640} t="CBG:" /><Value x={712} y={620} w={350} h={30} t={sugar.map((x) => `${clock(x.time)}: ${x.value}${x.time.slice(0, 10) === d.nowIso.slice(0, 10) ? '' : ` (${shortDay(x.time)})`}`).join('   ') || null} size={23} />
        <Shade x={660} y={656} w={408} h={82} /><Lab x={668} y={678} t="Mobility / ADLs / Safety:" /><Fill x={676} y={682} w={386} h={54} items={[...safetyNotes(d), ...d.orders.filter((o) => o.type === 'nursing').map((o) => ({ t: o.text }))]} size={20} min={11} lead={1.08} />

        {/* Systems */}
        {([['Neuro:', 34, 738, 352, 218, neuro(d)], ['Resp:', 34, 956, 352, 216, resp(d)], ['CV:', 34, 1172, 352, 218, cardiac(d)], ['GI:', 386, 738, 392, 162, gi(d)], ['GU:', 386, 900, 392, 163, gu(d)], ['Integ:', 386, 1063, 392, 163, [...skinNotes(d), ...d.sites.marked.map((m) => ({ t: m.site }))].filter((x, i, a) => a.findIndex((y) => y.t === x.t) === i)], ['MSK:', 386, 1226, 392, 164, []]] as [string, number, number, number, number, Item[]][]).map(([t, x, y, w, h, items]) => (
          <g key={t}><Box x={x} y={y} w={w} h={h} s={1.6} /><Lab x={x + 6} y={y + 21} t={t} /><Fill x={x + 12} y={y + 26} w={w - 22} h={h - 32} items={items} size={28} min={15} lead={1.35} slips /></g>
        ))}
        {hours.map(({ h, items }, i) => {
          const y = 738 + i * 108.6;
          return <g key={h}><Shade x={778} y={y} w={290} h={27} /><Box x={778} y={y} w={290} h={108.6} s={1.6} /><Value x={830} y={y - 2} w={80} h={30} t={`${h}00`} size={26} />{items.length > 0 && <Fill x={784} y={y + 30} w={136} h={74} items={items} size={20} min={10.5} lead={1.12} />}</g>;
        })}
        <V x={923} y={738} h={652} s={1.6} /><Print x={995} y={757} t="scheduled, not ticked" size={10} italic anchor="middle" fill="#6a6a6a" />

        {/* Heavy grid */}
        {([[34, 75, 234, 138], [268, 75, 392, 138], [660, 75, 408, 470], [34, 213, 352, 58], [34, 271, 352, 162], [34, 433, 352, 167], [34, 600, 352, 138], [386, 213, 274, 249], [386, 462, 274, 276], [660, 545, 408, 111], [660, 656, 408, 82], [34, 738, 1034, 652]] as const).map(([x, y, w, h]) => <Box key={`${x},${y}`} x={x} y={y} w={w} h={h} s={B} />)}
        <H x={34} y={488} w={352} s={0.9} /><H x={34} y={546} w={352} s={0.9} />
        <Footer d={d} w={W} y={1424} size={12} />
      </Ink>
    </Paper>
  );
}
