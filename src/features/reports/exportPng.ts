import { reportFontCss } from '../../lib/handwriting/fonts';

/**
 * A drawn sheet as a picture file, made in the browser (nothing is sent anywhere, nothing is saved in the app).
 * `expect` is the patient the caller means: a sheet of another patient, or one without the synthetic label, is refused.
 */
export async function sheetToPicture(svg: SVGSVGElement, expect: { name: string; mrn: string }, type: 'image/png' | 'image/jpeg', width = 1600): Promise<Blob> {
  const title = svg.querySelector('title')?.textContent ?? '';
  if (!title.includes(expect.name) || !title.includes(expect.mrn)) throw new Error('This sheet belongs to another patient. Nothing was saved.');
  if (!svg.querySelector('[data-testid="synthetic-label"]')) throw new Error('The sheet has no synthetic label. Nothing was saved.');
  const [, , vw, vh] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
  const height = Math.round((width * vh) / vw);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  copy.removeAttribute('class');
  copy.removeAttribute('style');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = await reportFontCss();
  copy.insertBefore(style, copy.firstChild);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.width = width;
    img.height = height;
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('The picture could not be drawn.')); img.src = url; });
    await img.decode();
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, width, height);
    g.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made.'))), type, 0.92));
  } finally {
    URL.revokeObjectURL(url);
  }
}
