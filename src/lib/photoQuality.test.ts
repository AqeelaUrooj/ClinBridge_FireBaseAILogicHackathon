import { describe, expect, it } from 'vitest';
import { assessQuality } from './photoQuality';

const img = (w: number, h: number, f: (x: number, y: number) => number) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y); const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; }
  return { width: w, height: h, data };
};

describe('photo quality hints (technical only, never blocking)', () => {
  it('a sharp, well-lit page with lines is fine', () => {
    const q = assessQuality(img(200, 260, (x, y) => (y % 12 < 2 || x % 40 < 2 ? 30 : 235)), 1200);
    expect(q.problem).toBe('none');
    expect(q.hints).toEqual([]);
  });
  it('flags dark, washed-out, blurry and small photos with plain hints', () => {
    expect(assessQuality(img(100, 100, (_x, y) => (y % 10 < 2 ? 40 : 20)), 1200).problem).toBe('too_dark');
    expect(assessQuality(img(100, 100, () => 250), 1200).problem).toBe('glare');
    const blurry = assessQuality(img(100, 100, (x) => 120 + x * 0.5), 1200);
    expect(blurry.problem).toBe('blurry');
    expect(blurry.hints.join(' ')).toMatch(/blurry/);
    expect(assessQuality(img(100, 100, (_x, y) => (y % 12 < 2 ? 30 : 235)), 300).hints.join(' ')).toMatch(/small/);
  });
});
