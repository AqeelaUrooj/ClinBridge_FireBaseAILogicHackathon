import type { ReportData } from './reportData';
import { Box, Check, Cross, Figure, Fill, H, Ink, NotRecorded, Paper, Print, SyntheticLabel, Tick, V, Value, onFigure, type Look } from './ink';
import type { Item, Pen } from '../../lib/handwriting/hand';
import { allergyText, bp, cardiac, gi, givenMeds, glucose, gu, ivLines, labFor, lastObs, medOrders, neuro, otherLabs, otherNotes, plan, resp, safetyNotes, shortDay, sizeLine, skinNotes, tests } from './reportText';
import { dayLabel, hm } from '../../lib/time';
import { fullName } from '../patient/patientData';
import { formatDose } from '../../lib/dose';
import { Footer, LabValue, sheetDesc, sheetTitle, sitesOnFigure } from './sheet';

const W = 1040, HH = 1480;
const LEFT = ['Hgb', 'Hct', 'WBC', 'Plt', 'Na', 'K', 'Mg'], RIGHT = ['Phos', 'Cr', 'BUN', 'PT/INR', 'Troponin'];

const Head = ({ x, y, w, t, h = 38, size = 24 }: { x: number; y: number; w: number; t: string; h?: number; size?: number }) => (
  <><Box x={x} y={y} w={w} h={h} s={1.4} fill="#00000012" /><Print x={x + w / 2} y={y + h * 0.7} t={t} size={size} bold anchor="middle" /></>
);
const Label = ({ x, y, t }: { x: number; y: number; t: string }) => <Print x={x} y={y} t={t} size={19} bold />;

/** Reference "Patient Background" sheet: three columns under a wide patient block, body figures at the lower right. */
export function AssessmentSheet({ d, pen, seed, look }: { d: ReportData; pen: Pen; seed: string; look: Look }) {
  const { patient: p, encounter: e } = d.bundle;
  const obs = lastObs(d, 4), sugar = glucose(d).slice(-3), other = otherLabs(d, [...LEFT, ...RIGHT, 'Gluc']), sites = sitesOnFigure(d);
  const iso = e?.isolation ?? '';
  const diet: Item[] = [...(e?.diet ? [{ t: e.diet }] : []), ...d.orders.filter((o) => o.type === 'diet').map((o) => ({ t: o.text }))];
  const A: [string, number, number, Item[]][] = [
    ['Neuro:', 490, 106, neuro(d)], ['Cardiac:', 596, 112, cardiac(d)], ['Respiratory:', 708, 136, resp(d)], ['GI:', 844, 120, gi(d)],
    ['GU:', 964, 120, gu(d)], ['Musculoskeletal:', 1084, 196, safetyNotes(d)], ['Diet:', 1280, 148, diet],
  ];
  const fx = [716, 892] as const, fy = 786, fh = 262;
  return (
    <Paper w={W} h={HH} look={look} desk="scan" seed={seed} title={sheetTitle(d, 'Nursing assessment sheet')} desc={sheetDesc(d)}>
      <Ink pen={pen} seed={seed}>
        <SyntheticLabel x={270} y={8} w={500} size={14} />
        <Value x={44} y={38} w={900} h={40} t={`Admitted: ${e?.unit ?? ''}`} size={29} calm={false} under />

        <Head x={10} y={86} w={1020} t="PATIENT BACKGROUND" size={27} />
        <Box x={10} y={86} w={1020} h={356} s={1.8} />
        <H x={10} y={168} w={1020} /><H x={10} y={216} w={1020} /><H x={10} y={258} w={1020} />
        <V x={335} y={124} h={44} /><V x={478} y={124} h={134} /><V x={690} y={124} h={92} />
        <Label x={20} y={154} t="Name:" /><Value x={88} y={126} w={240} h={42} t={fullName(p)} size={30} tag="name" />
        <Value x={346} y={126} w={126} h={42} t={e?.code_status} size={26} tag="code" />
        <Label x={490} y={154} t="Age:" /><Value x={545} y={126} w={138} h={42} t={`${d.age} y/o`} size={28} tag="age" />
        <Label x={702} y={154} t="Sex:" /><Check x={776} y={139} /><Print x={800} y={154} t="Male" size={19} /><Check x={892} y={139} /><Print x={916} y={154} t="Female" size={19} />
        {p.sex === 'male' && <Tick x={776} y={138} />}{p.sex === 'female' && <Tick x={892} y={138} />}
        {(p.sex === 'other' || p.sex === 'unknown') && <Value x={745} y={148} w={80} h={20} t={p.sex} size={18} />}
        <Label x={20} y={199} t="Admit Reason:" /><NotRecorded x={165} y={199} />
        <Label x={490} y={199} t="Room:" /><Value x={562} y={170} w={120} h={46} t={e?.bed} size={30} tag="bed" />
        <Label x={702} y={199} t="Allergies:" /><Value x={800} y={170} w={226} h={46} t={allergyText(d)} size={26} tag="allergies" />
        <Label x={20} y={244} t="Admit Date:" /><Value x={142} y={218} w={320} h={40} t={e ? `${dayLabel(e.admit_time)}, ${hm(e.admit_time)}` : null} size={27} />
        <Label x={490} y={244} t="MRN:" /><Value x={550} y={218} w={170} h={40} t={p.mrn} size={27} tag="mrn" />
        <Label x={735} y={244} t="Born:" /><Value x={800} y={218} w={222} h={40} t={dayLabel(p.birth_date)} size={27} tag="born" />

        <V x={380} y={258} h={184} /><V x={655} y={258} h={184} /><V x={848} y={258} h={184} /><H x={10} y={306} w={370} /><H x={380} y={340} w={275} />
        <Label x={20} y={288} t="Primary Dx:" /><NotRecorded x={142} y={288} />
        <Label x={20} y={332} t="Tests/Procedures:" /><Fill x={22} y={338} w={352} h={100} items={tests(d)} size={22} min={14} />
        <Label x={392} y={284} t="Attending" /><Fill x={394} y={290} w={254} h={44} items={e?.attending ? [{ t: e.attending, mark: 'star' }] : []} size={25} />
        <Label x={392} y={366} t="Medical History:" /><NotRecorded x={394} y={394} />
        <Label x={700} y={286} t="Situation" />
        {['Fall risk', 'Alarm', 'Confused', 'Restraints'].map((t, i) => <g key={t}><Check x={672} y={302 + i * 30} /><Print x={696} y={316 + i * 30} t={t} size={17} /></g>)}
        <Print x={672} y={433} t="Not recorded" size={11} italic fill="#80858f" />
        <Label x={875} y={286} t="Precaution" />
        {['None', 'Contact', 'Droplet', 'Airborne'].map((t, i) => <g key={t}><Check x={872} y={302 + i * 30} /><Print x={896} y={316 + i * 30} t={t} size={17} />{iso.toLowerCase() === t.toLowerCase() && <Tick x={872} y={300 + i * 30} s={17} />}</g>)}
        {!iso && <Print x={872} y={433} t="Not recorded" size={11} italic fill="#80858f" />}

        <Box x={10} y={452} w={325} h={988} s={1.8} /><Head x={10} y={452} w={325} t="ASSESSMENTS" />
        {A.map(([t, y, h, items], i) => <g key={t}>{i > 0 && <H x={10} y={y} w={325} />}<Label x={20} y={y + 25} t={t} /><Fill x={34} y={y + 31} w={290} h={h - 36} items={items} size={25} min={14} slips indent={6} /></g>)}

        <Box x={342} y={452} w={346} h={248} s={1.8} /><Head x={342} y={452} w={346} t="IV LINES / FLUIDS" />
        <Fill x={358} y={500} w={320} h={188} items={[...ivLines(d), ...d.io.filter((x) => x.x.category.startsWith('iv')).map((x) => ({ t: `IV in ${x.x.volume_ml} mL @ ${hm(x.time)}` }))]} size={25} min={14} lead={1.35} />
        <Box x={695} y={452} w={335} h={248} s={1.8} /><Head x={695} y={452} w={335} t="PLAN" />
        <Fill x={708} y={498} w={314} h={194} items={[...plan(d), ...medOrders(d).map((x) => ({ ...x, mark: 'star' as const }))]} size={24} min={13} />

        <Box x={342} y={708} w={346} h={268} s={1.8} /><Head x={342} y={708} w={346} t="VITALS/ACCU CHECK" size={22} />
        <V x={412} y={746} h={152} /><V x={508} y={746} h={152} /><H x={342} y={898} w={346} />
        {obs.map((x, i) => (
          <g key={x.time}>
            <Print x={352} y={770 + i * 38} t={hm(x.time)} size={16} />{x.fromList && <Print x={352} y={780 + i * 38} t="hospital list" size={8.5} italic fill="#80858f" />}
            <Value x={418} y={749 + i * 38} w={86} h={32} t={bp(x.v) || '—'} size={25} />
            <Print x={516} y={772 + i * 38} t="HR" size={14} /><Value x={540} y={749 + i * 38} w={48} h={32} t={x.v.heart_rate?.toString() ?? '—'} size={24} />
            <Print x={594} y={772 + i * 38} t="T" size={14} /><Value x={608} y={749 + i * 38} w={78} h={32} t={x.v.temp_c != null ? `${formatDose(x.v.temp_c)}°C` : '—'} size={23} />
          </g>
        ))}
        {!obs.length && <NotRecorded x={420} y={772} />}
        <Print x={362} y={926} t="ACCU:" size={17} bold />
        <Fill x={434} y={903} w={248} h={70} items={sugar.map((x) => ({ t: `${hm(x.time)} – ${x.value} ${x.unit}${x.time.slice(0, 10) === d.nowIso.slice(0, 10) ? '' : ` (${shortDay(x.time)})`}`, calm: true }))} size={21} min={14} />

        <Box x={342} y={985} w={346} h={306} s={1.8} /><Head x={342} y={985} w={346} t="LABS" />
        <V x={520} y={1023} h={231} />
        {LEFT.map((t, i) => <g key={t}><H x={342} y={1023 + (i + 1) * 33} w={178} s={0.9} /><Print x={354} y={1046 + i * 33} t={t} size={17} /><LabValue x={404} y={1026 + i * 33} w={114} l={labFor(d, t)} /></g>)}
        {RIGHT.map((t, i) => <g key={t}><H x={520} y={1023 + (i + 1) * 33} w={168} s={0.9} /><Print x={530} y={1046 + i * 33} t={t} size={17} /><LabValue x={598} y={1026 + i * 33} w={90} l={labFor(d, t)} size={20} /></g>)}
        <H x={520} y={1221} w={168} s={0.9} /><H x={342} y={1254} w={346} />
        <Print x={354} y={1279} t="Other:" size={17} /><Fill x={414} y={1257} w={268} h={32} items={other.map((l) => ({ t: `${l.name} ${l.value} ${l.unit} (${l.fromList ? shortDay(l.time) : hm(l.time)})`, calm: true }))} size={19} min={12} />

        <Box x={695} y={708} w={335} h={582} s={1.8} /><Head x={695} y={708} w={335} t="SKIN INTEGRITY" size={22} /><H x={695} y={1108} w={335} />
        {['Intact', 'Wound', 'Surgical'].map((t, i) => <g key={t}><Check x={712 + i * 104} y={757} s={14} /><Print x={732 + i * 104} y={770} t={t} size={16} /></g>)}
        <Figure x={fx[0]} y={fy} h={fh} view="front" color={pen.ink} sw={1.7} /><Figure x={fx[1]} y={fy} h={fh} view="back" color={pen.ink} sw={1.7} />
        <Print x={fx[0] + 40} y={fy + fh + 16} t="Front" size={15} anchor="middle" /><Print x={fx[1] + 40} y={fy + fh + 16} t="Back" size={15} anchor="middle" />
        {sites.map(({ at, n }) => { const [x, y] = onFigure(fx[0], fy, fh, at); return <g key={n}><Cross x={x} y={y} s={11} /><Value x={n % 2 ? x - 20 : x + 8} y={y - 22} w={20} h={22} t={String(n)} size={16} /></g>; })}
        {sites.length > 0 && <Fill x={808} y={800} w={80} h={150} items={sites.map((s) => ({ t: `${s.n} ${s.site}`, calm: true }))} size={16} min={11} />}
        <Print x={705} y={1086} t="Boxes: not recorded. X: site in a medicine record." size={11} italic fill="#80858f" />
        <Print x={705} y={1100} t={`The right side of the patient is on the left of the front figure.`} size={9.5} italic fill="#80858f" />
        <Label x={706} y={1132} t="Treatment:" /><Fill x={712} y={1138} w={312} h={146} items={[...givenMeds(d), ...skinNotes(d).map((x) => ({ ...x, mark: 'star' as const }))]} size={21} min={12} />

        <Box x={342} y={1300} w={688} h={140} s={1.8} /><Head x={342} y={1300} w={688} t="NOTES" h={34} size={22} />
        <Fill x={356} y={1339} w={664} h={98} items={[...otherNotes(d), ...(sizeLine(d) ? [{ t: `${sizeLine(d)} (hospital list)`, mark: 'dash' as const }] : [])]} size={24} min={14} slips />
        <Footer d={d} w={W} y={1472} />
      </Ink>
    </Paper>
  );
}
