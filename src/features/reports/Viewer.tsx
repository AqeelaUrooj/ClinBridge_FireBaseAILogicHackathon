import { useEffect, useState, type ReactNode } from 'react';
import { useWidth } from '../../components/useWidth';
import { Badge, Icon } from '../../components/ui';

const ZOOMS = [1, 1.5, 2, 3];
const TOOL = 'inline-flex items-center gap-1 min-h-11 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container font-body-sm text-body-sm font-semibold text-primary disabled:text-outline disabled:cursor-not-allowed';

/** Zoom and turn change the view only. */
export function Viewer({ svgKey, ratio, children }: { svgKey: string; ratio: number; children: ReactNode }) {
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
