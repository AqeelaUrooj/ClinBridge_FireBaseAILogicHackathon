import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPhoto, verifyPhoto } from '../../db/photos';
import { useApp } from '../../state/app';
import { dateTimeLabel } from '../../lib/time';
import { Badge, Icon } from '../../components/ui';

/** Shows a stored photo full width with a link to open it at full size. */
export function PhotoView({ refId }: { refId: string }) {
  const { dataset } = useApp();
  const photo = useLiveQuery(async () => (await getPhoto(dataset, refId)) ?? null, [dataset, refId]);
  const [url, setUrl] = useState<string | null>(null);
  const [intact, setIntact] = useState<boolean | null>(null);
  useEffect(() => {
    if (!photo) return;
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    void verifyPhoto(photo).then(setIntact);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  if (photo === undefined) return <p role="status">Loading photo…</p>;
  if (photo === null) {
    return (
      <div className="rounded-lg border border-dashed border-card-border p-space-md text-secondary flex items-center gap-2">
        <Icon name="image_not_supported" />Photo file is not on this laptop ({refId}). Practice data has no real image files.
      </div>
    );
  }
  return (
    <figure className="flex flex-col gap-1">
      {url && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Photo of the paper form" className="w-full max-h-[70vh] object-contain rounded-lg border border-card-border bg-white" /></a>}
      <figcaption className="font-body-sm text-secondary flex flex-wrap gap-2 items-center">
        Saved {dateTimeLabel(photo.saved_at)} · {(photo.size / 1024).toFixed(0)} KB
        {intact === true && <Badge tone="green" icon="verified">Unchanged since saved</Badge>}
        {intact === false && <Badge tone="red" icon="gpp_bad">Changed since saved</Badge>}
      </figcaption>
    </figure>
  );
}

