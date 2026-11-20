import type { PhotoCheck } from '../db/schema';

/**
 * Simple, local photo quality hints (no AI). Technical image checks only, never clinical.
 * The thresholds are engineering defaults for "worth retaking?" hints. They never block: the nurse can
 * always continue, and that choice is recorded (photo_check.overridden).
 */
export interface Pixels { width: number; height: number; data: Uint8ClampedArray | number[] }
export interface Quality { problem: PhotoCheck['problem']; hints: string[]; brightness: number; sharpness: number; shortSide: number }

export const QUALITY_DEFAULTS = { tooDark: 55, tooBright: 240, blurry: 60, minShortSide: 600 };

/** px = downscaled grayscale-able RGBA pixels; originalShortSide = short side of the full photo. */
export function assessQuality(px: Pixels, originalShortSide: number, t = QUALITY_DEFAULTS): Quality {
  const { width: w, height: h, data } = px;
  const g = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const v = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
    g[i] = v; sum += v;
  }
  const brightness = sum / (w * h);
  // Variance of the Laplacian: low = few sharp edges = probably blurry.
  let n = 0, mean = 0, m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = g[i - w]! + g[i + w]! + g[i - 1]! + g[i + 1]! - 4 * g[i]!;
      n++; const d = lap - mean; mean += d / n; m2 += d * (lap - mean);
    }
  }
  const sharpness = n > 1 ? m2 / (n - 1) : 0;
  const hints: string[] = [];
  let problem: PhotoCheck['problem'] = 'none';
  if (brightness < t.tooDark) { problem = 'too_dark'; hints.push('Photo looks dark. More light may help.'); }
  else if (brightness > t.tooBright) { problem = 'glare'; hints.push('Photo looks washed out or has glare.'); }
  if (sharpness < t.blurry) { if (problem === 'none') problem = 'blurry'; hints.push('Photo may be blurry. Hold still and retake.'); }
  if (originalShortSide < t.minShortSide) hints.push('Photo is small. Small writing may be hard to read.');
  return { problem, hints, brightness, sharpness, shortSide: originalShortSide };
}

/** Browser only: read a picture file into downscaled pixels. */
export async function readPixels(file: Blob, maxSide = 512): Promise<{ px: Pixels; shortSide: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const shortSide = Math.min(bmp.width, bmp.height);
  bmp.close();
  return { px: ctx.getImageData(0, 0, w, h), shortSide };
}
