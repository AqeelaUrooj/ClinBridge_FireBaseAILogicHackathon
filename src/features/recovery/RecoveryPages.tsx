import { useState } from 'react';
import { useApp, useSession } from '../../state/app';
import { prepareExport, recordExport } from '../../db/repos/export';
import { Button, Card, Icon, PageTitle } from '../../components/ui';
import { RecoveryClosed } from './RecoveryWorklist';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export function ExportPage() {
  const { db, clock, deviceId, phase } = useApp();
  const { user } = useSession();
  const [state, setState] = useState<Awaited<ReturnType<typeof prepareExport>> | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  if (phase !== 'online') return <><PageTitle>Export</PageTitle><RecoveryClosed /></>;
  async function download() {
    if (!state) return;
    setError(null);
    try {
      const h = await recordExport(db, clock, { userId: user!.id, deviceId }, state.json);
      setHash(h);
      const url = URL.createObjectURL(new Blob([state.json], { type: 'application/fhir+json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `SENSITIVE-clinbridge-fhir-${clock.nowIso().slice(0, 16).replace(/[:T]/g, '-')}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(msg(e)); }
  }
  return (
    <>
      <PageTitle>Export (FHIR R4)</PageTitle>
      <Card className="flex flex-col gap-space-md">
        <p className="text-on-surface-variant">Makes one FHIR R4 file (a Bundle) of the downtime records for the hospital EHR team. <strong>It does not send anything to the EHR.</strong> Drafts and AI proposals are never included.</p>
        <Button className="self-start" onClick={async () => { setError(null); setHash(null); try { setState(await prepareExport(db, clock)); } catch (e) { setError(msg(e)); } }}><Icon name="build" />Prepare export file</Button>
        {state && (
          <>
            <ul className="font-body-md list-disc pl-6" data-testid="export-summary">
              <li>{state.resourceCount} resources in the file</li>
              <li>{state.errors.length === 0 ? 'Structure check passed' : `${state.errors.length} structure problems`}</li>
              <li>{state.drafts} drafts not included{state.drafts ? ' (confirm them first if they belong in the record)' : ''}</li>
              <li>{state.openItems} worklist items not signed off</li>
            </ul>
            {state.errors.length > 0 && <pre className="bg-clinical-red-bg p-space-sm rounded text-body-sm overflow-auto max-h-60">{state.errors.slice(0, 30).join('\n')}</pre>}
            {state.openItems > 0 && <p className="text-[#7a5410] font-body-md flex items-center gap-2"><Icon name="warning" />Some items are not signed off yet. You can still make a file, but the export should normally wait.</p>}
            <div role="note" className="rounded-lg border-2 border-clinical-red-border bg-clinical-red-bg p-space-md flex flex-col gap-space-sm">
              <p className="font-semibold text-clinical-red flex items-center gap-2"><Icon name="warning" />Sensitive: this file is NOT encrypted</p>
              <p className="font-body-md">It holds patient names, medicines and notes in plain text, because the EHR team&apos;s system must read it. The browser saves it in its downloads folder; ClinBridge cannot protect that folder. Hand it only to the authorised EHR team, by a route your hospital approves, then delete the local copy.</p>
              <label className="flex items-start gap-2 font-body-md"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-label="I understand this file is sensitive and not encrypted" className="mt-1 w-5 h-5" />I understand this file is sensitive and not encrypted.</label>
            </div>
            <Button className="self-start" disabled={state.errors.length > 0 || !ack} onClick={download}><Icon name="download" />Download file</Button>
          </>
        )}
        {hash && <p role="status" className="text-sync-green font-body-md">File saved. Fingerprint (SHA-256) recorded in the change log: <span className="font-code-tabular break-all">{hash}</span></p>}
        {error && <p role="alert" className="text-error">{error}</p>}
      </Card>
    </>
  );
}
