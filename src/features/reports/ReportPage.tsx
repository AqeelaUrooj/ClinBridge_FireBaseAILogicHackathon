import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../state/app';
import { useWidth } from '../../components/useWidth';
import { Badge, Breadcrumbs, Button, ButtonLink, EmptyState, Icon } from '../../components/ui';
import { PatientFrame } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { loadReportData, type ReportData } from './reportData';
import { loadReportFonts } from '../../lib/handwriting/fonts';
import { sheetToPng } from './exportPng';
import { defaultTemplate, HandwrittenNursingReport, TEMPLATES, templateById } from './templates';
import { LABEL } from './ink';

const ZOOMS = [1, 1.5, 2, 3];
const TOOL = 'inline-flex items-center gap-1 min-h-11 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container font-body-sm text-body-sm font-semibold text-primary disabled:text-outline disabled:cursor-not-allowed';

function useFonts(): 'loading' | 'ready' | 'failed' {
  const [state, set] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    let current = true;
    loadReportFonts().then(() => { if (current) set('ready'); }, () => { if (current) set('failed'); });
    return () => { current = false; };
  }, []);
  return state;
}

/** Zoom and turn change the view only. */
function Viewer({ svgKey, ratio, children }: { svgKey: string; ratio: number; children: ReactNode }) {
  const [zoom, setZoom] = useState(0);
  const [turn, setTurn] = useState(0);
  useEffect(() => { setTurn(0); }, [svgKey]);
  const { ref, width } = useWidth(700);
  const sideways = turn % 180 !== 0;
  const fit = Math.min(width - 2, 900);
  const w = (sideways ? fit / ratio : fit) * ZOOMS[zoom]!, h = w * ratio;
  return (
    <div ref={ref} className="print:hidden flex flex-col gap-space-sm">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Report tools">
        <button type="button" className={TOOL} disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}><Icon name="zoom_out" className="text-[18px]" /><span className="sr-only">Zoom out</span></button>
        <span role="status" className="min-h-11 flex items-center font-code-tabular text-body-sm text-secondary">{ZOOMS[zoom]! * 100}%</span>
        <button type="button" className={TOOL} disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(zoom + 1)}><Icon name="zoom_in" className="text-[18px]" />Zoom in</button>
        <button type="button" className={TOOL} onClick={() => setTurn((turn + 90) % 360)}><Icon name="rotate_right" className="text-[18px]" />Rotate 90°</button>
        <Badge tone="red" icon="science">Synthetic</Badge>
      </div>
      <div role="group" tabIndex={0} aria-label="Synthetic report. When zoomed in, scroll to move around." data-testid="report-box" className="overflow-auto rounded-lg border border-card-border bg-surface-container-low" style={{ height: Math.ceil((sideways ? fit : fit * ratio) + 2) }}>
        <div className="relative mx-auto" style={{ width: Math.floor(sideways ? h : w), height: Math.floor(sideways ? w : h) }}>
          <div className="absolute left-1/2 top-1/2" style={{ width: Math.floor(w), height: Math.floor(h), transform: `translate(-50%, -50%) rotate(${turn}deg)` }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

function Report({ d }: { d: ReportData }) {
  const p = d.bundle.patient;
  const [params, setParams] = useSearchParams();
  const template = templateById(params.get('sheet')) ?? defaultTemplate(p.id);
  const fonts = useFonts();
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(1.4);
  useEffect(() => {
    const v = box.current?.querySelector('svg[data-look="photo"]')?.getAttribute('viewBox')?.split(' ').map(Number);
    if (v) setRatio(v[3]! / v[2]!);
  }, [template.id, fonts]);

  const choose = (id: string) => { setMessage(null); setParams((x) => { x.set('sheet', id); return x; }, { replace: true }); };

  const save = async () => {
    const svg = box.current?.querySelector<SVGSVGElement>('svg[data-look="photo"]');
    if (!svg) return;
    setBusy(true);
    setMessage(null);
    try {
      const url = URL.createObjectURL(await sheetToPng(svg, { name: fullName(p), mrn: p.mrn }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `PRACTICE-synthetic-${template.id}-${p.mrn}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage({ text: `Picture of ${fullName(p)}’s synthetic report saved as a file on this laptop. Nothing was added to the records.` });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="print:hidden flex flex-col gap-space-md">
        <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(p), to: `/patients/${p.id}` }, { label: 'Synthetic handwritten report' }]} />
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <h1 className="font-headline-lg text-headline-lg text-primary">Handwritten report · {template.name}</h1>
          <div className="flex flex-wrap gap-space-sm">
            <Button disabled={fonts !== 'ready'} onClick={() => window.print()}><Icon name="print" />Print Practice report</Button>
            <Button variant="secondary" disabled={fonts !== 'ready' || busy} onClick={() => void save()}><Icon name="download" />{busy ? 'Making the picture…' : 'Download Practice image'}</Button>
            <ButtonLink variant="secondary" to={`/patients/${p.id}`}>Back to patient</ButtonLink>
          </div>
        </div>
        <p role="note" className="flex items-start gap-2 rounded-lg bg-clinical-red-bg border border-clinical-red-border px-space-md py-space-sm font-body-md">
          <Icon name="science" className="text-[20px] mt-0.5 text-clinical-red" />
          <span><strong>{LABEL}.</strong> The program draws this sheet from the fictional Practice records of {fullName(p)}. No nurse wrote or signed it. It is not a photo of paper, it is not saved as a record and it is never used as paper evidence. What is not recorded stays empty.</span>
        </p>
        <nav aria-label="Report design" className="flex flex-wrap gap-1 rounded-lg bg-surface-container p-1 self-start max-w-full">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" aria-pressed={t.id === template.id} title={t.about} onClick={() => choose(t.id)}
              className={`min-h-11 px-3 rounded-lg inline-flex items-center gap-2 font-body-md text-body-md font-semibold ${t.id === template.id ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}>{t.name}</button>
          ))}
        </nav>
        {message && <p role={message.bad ? 'alert' : 'status'} className={message.bad ? 'text-clinical-red font-semibold' : 'font-body-md'}>{message.text}</p>}
      </div>
      {fonts === 'loading' && <p role="status" className="text-secondary mt-space-md print:hidden">Preparing the handwriting…</p>}
      {fonts === 'failed' && <p role="alert" className="text-clinical-red font-semibold mt-space-md">The handwriting fonts could not be opened on this laptop, so the report is not shown.</p>}
      {fonts === 'ready' && (
        <div ref={box} className="mt-space-sm print:mt-0">
          <Viewer svgKey={template.id} ratio={ratio}><HandwrittenNursingReport key={`${p.id}-${template.id}`} d={d} template={template.id} look="photo" /></Viewer>
          <div className="report-print hidden print:block" aria-hidden="true"><HandwrittenNursingReport key={`${p.id}-${template.id}-print`} d={d} template={template.id} look="print" /></div>
        </div>
      )}
    </>
  );
}

function Loader({ patientId }: { patientId: string }) {
  const { db, clock } = useApp();
  const d = useLiveQuery(() => loadReportData(db, patientId, clock.nowIso()), [db, patientId, clock]);
  if (d === undefined) return <p role="status" className="text-secondary">Preparing the report…</p>;
  if (d === null) return <EmptyState icon="person_off" text="This patient is not in the patient list." />;
  return <Report key={patientId} d={d} />;
}

/** /patients/:id/report. Practice only; the same patient check as every patient page comes first. */
export function ReportPage() {
  const { id } = useParams();
  const { dataset } = useApp();
  if (dataset !== 'practice') {
    return <EmptyState icon="block" text="Synthetic handwritten reports exist in Practice only. In Real records, use Photo of paper for a real sheet and the paper forms for printing." action={<ButtonLink variant="secondary" to="/ward">Back to My patients</ButtonLink>} />;
  }
  return <PatientFrame patientId={id} ownPrintHeader><Loader patientId={id!} /></PatientFrame>;
}
