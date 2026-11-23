import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPhoto, verifyPhoto, type StoredPhoto } from '../../db/photos';
import { useApp } from '../../state/app';
import { dateTimeLabel } from '../../lib/time';
import { useWidth } from '../../components/useWidth';
import { Badge, Icon } from '../../components/ui';

const ZOOMS = [1, 1.5, 2, 3];
const TOOL = 'inline-flex items-center gap-1 min-h-11 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container font-body-sm text-body-sm font-semibold text-primary disabled:text-outline disabled:cursor-not-allowed';

/** Zoom and turn change the view only. The stored photo is never changed. */
function Viewer({ url, actions }: { url: string; actions?: ReactNode }) {
  const { ref, width } = useWidth(480);
  const [size, setSize] = useState<[number, number] | null>(null);
  const [zoom, setZoom] = useState(0);
  const [turn, setTurn] = useState(0);
  const sideways = turn % 180 !== 0;
  const [vw, vh] = size ? (sideways ? [size[1], size[0]] : size) : [1, 1];
  const fit = Math.min((width - 2) / vw, Math.min(window.innerHeight * 0.7, 820) / vh);
  const w = vw * fit * ZOOMS[zoom]!, h = vh * fit * ZOOMS[zoom]!;
  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex flex-wrap gap-2 print:hidden" role="group" aria-label="Photo tools">
        <button type="button" className={TOOL} disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}><Icon name="zoom_out" className="text-[18px]" /><span className="sr-only">Zoom out</span></button>
        <span role="status" className="min-h-11 flex items-center font-code-tabular text-body-sm text-secondary">{ZOOMS[zoom]! * 100}%</span>
        <button type="button" className={TOOL} disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(zoom + 1)}><Icon name="zoom_in" className="text-[18px]" />Zoom in</button>
        <button type="button" className={TOOL} onClick={() => setTurn((turn + 90) % 360)}><Icon name="rotate_right" className="text-[18px]" />Rotate 90°</button>
        {actions}
      </div>
      <div ref={ref}>
        <div role="group" tabIndex={0} aria-label="Paper photo. When zoomed in, scroll to move around." data-testid="photo-box"
          className="overflow-auto rounded-lg border border-card-border bg-surface-container-low" style={{ height: size ? Math.ceil(vh * fit) + 2 : undefined }}>
          <div className="relative mx-auto" style={size ? { width: Math.floor(w), height: Math.floor(h) } : undefined}>
            <img src={url} alt="Photo of the paper form" draggable={false} onLoad={(e) => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
              className={size ? 'absolute left-1/2 top-1/2 max-w-none bg-white' : 'w-full'}
              style={size ? { width: Math.floor(sideways ? h : w), height: Math.floor(sideways ? w : h), transform: `translate(-50%, -50%) rotate(${turn}deg)` } : undefined} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stored({ photo, actions }: { photo: StoredPhoto; actions?: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  const [intact, setIntact] = useState<boolean | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(photo.blob);
    let current = true;
    setUrl(u);
    void verifyPhoto(photo).then((ok) => { if (current) setIntact(ok); });
    return () => { current = false; URL.revokeObjectURL(u); };
  }, [photo]);
  return (
    <figure className="flex flex-col gap-space-sm">
      {url && <Viewer url={url} actions={actions} />}
      <figcaption className="font-body-sm text-body-sm text-secondary flex flex-wrap gap-x-3 gap-y-1 items-center justify-between">
        <span className="flex flex-wrap gap-2 items-center">
          Saved {dateTimeLabel(photo.saved_at)} · {(photo.size / 1024).toFixed(0)} KB
          {intact === true && <Badge tone="green" icon="verified">Unchanged since saved</Badge>}
          {intact === false && <Badge tone="red" icon="gpp_bad">Changed since saved</Badge>}
        </span>
        <span className="flex flex-wrap gap-x-3 items-center">
          <span>Fingerprint <span className="font-code-tabular">{photo.sha256.slice(0, 8)}</span></span>
          {url && <a href={url} target="_blank" rel="noreferrer" className="underline print:hidden">Open full size</a>}
        </span>
      </figcaption>
    </figure>
  );
}

/** Shows a stored photo with zoom and turn. `actions`: extra buttons in the toolbar (for example Retake). */
export function PhotoView({ refId, actions }: { refId: string; actions?: ReactNode }) {
  const { db } = useApp();
  const photo = useLiveQuery(async () => (await getPhoto(db, refId)) ?? null, [db, refId]);
  if (photo === undefined) return <p role="status">Loading photo…</p>;
  if (photo === null) {
    return (
      <div className="rounded-lg border border-dashed border-card-border p-space-md text-secondary flex items-center gap-2">
        <Icon name="image_not_supported" />Photo file is not on this laptop ({refId}). Practice data has no real image files.
      </div>
    );
  }
  return <Stored key={photo.ref} photo={photo} actions={actions} />;
}
