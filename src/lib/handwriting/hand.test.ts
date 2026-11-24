import { describe, expect, it } from 'vitest';
import { fit, layout, NUMBERS, type Pen } from './hand';

const PEN: Pen = { main: 'CB Kalam', alt: 'CB Caveat', altShare: 0.5, ink: '#000', slant: 4, weight: 0.5, mess: 1.2 };
const words = (lines: ReturnType<typeof layout>) => lines.flatMap((l) => l.words.map((w) => w.t));

describe('handwriting layout changes the look, never the words', () => {
  it('keeps every word, in order, and draws the same text the same way again', () => {
    const t = 'amLODIPine 5 mg by mouth once daily, held at 09:05 for BP 134/80';
    const a = layout(t, PEN, 24, 160, 's');
    expect(words(a)).toEqual(t.split(' '));
    expect(a.length).toBeGreaterThan(1);
    expect(layout(t, PEN, 24, 160, 's')).toEqual(a);
    expect(layout(t, PEN, 24, 160, 'other')).not.toEqual(a); // another patient, another hand
  });

  it('is uneven: sizes, leans and baselines differ between words', () => {
    const w = layout('one two three four five six', PEN, 24, 900, 's')[0]!.words;
    for (const k of ['px', 'lean', 'y', 'wide', 'rotate'] as const) expect(new Set(w.map((x) => x[k])).size).toBeGreaterThan(2);
  });

  it('numbers and IV are always written in the one clear hand; inner capitals are not mixed', () => {
    for (let i = 0; i < 40; i++) {
      for (const w of layout('0.5 mg IV DK-004512 ceFAZolin 1,150 units/h', PEN, 24, 900, `n${i}`).flatMap((l) => l.words)) {
        if (/\d|IV/.test(w.t)) expect(w.family, w.t).toBe(NUMBERS);
        if (w.t === 'ceFAZolin') expect(w.family).toBe(PEN.main);
      }
    }
  });

  it('a name longer than the line is broken into parts, never shortened', () => {
    const name = 'Wolfeschlegelsteinhausenbergerdorff';
    const lines = layout(name, PEN, 30, 120, 's');
    expect(lines.length).toBeGreaterThan(1);
    expect(words(lines).join('')).toBe(name);
    // In a box it first gets smaller so that it is not broken.
    const f = fit([{ t: `Anna ${name}`, calm: true }], PEN, { x: 0, y: 0, w: 300, h: 40 }, { size: 30, min: 8, seed: 's' });
    expect(f.lines.flatMap((l) => l.line.words.map((w) => w.t)).join(' ')).toBe(`Anna ${name}`);
    expect(f.size).toBeLessThan(30);
    expect(f.dropped).toBe(0);
  });

  it('says how many items do not fit instead of cutting them', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ t: `line ${i}` }));
    const f = fit(items, PEN, { x: 0, y: 0, w: 200, h: 100 }, { size: 24, min: 14, seed: 's' });
    expect(f.lines.length + f.dropped).toBe(30);
    expect(f.dropped).toBeGreaterThan(0);
    const long = fit([{ t: 'word '.repeat(400) }], PEN, { x: 0, y: 0, w: 200, h: 100 }, { size: 24, min: 14, seed: 's' });
    expect(long.cut).toBe(true);
    expect(long.lines.length * long.step).toBeLessThanOrEqual(101);
  });
});
