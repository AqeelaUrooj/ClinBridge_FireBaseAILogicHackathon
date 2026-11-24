import { stack } from './fonts';

/**
 * Layout of handwriting: uneven size, baseline, spacing and pressure from a seeded random source, so the same report
 * always looks the same. Only the LOOK changes. The words are the given text, complete and in order.
 */
export type Rand = () => number;

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function rand(seed: string): Rand {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const between = (r: Rand, a: number, b: number) => a + (b - a) * r();

export interface Pen {
  main: string;
  /** A second, similar hand: some words are written with it, so letters do not repeat exactly. */
  alt: string;
  altShare: number;
  ink: string;
  /** Degrees to the right. */
  slant: number;
  /** Extra line thickness. */
  weight: number;
  /** 0 = tidy, 1 = rushed. */
  mess: number;
}

/** Fonts differ in letter height; this makes their sizes comparable. */
const SCALE: Record<string, number> = { 'CB Caveat': 1.24, 'CB Kalam': 0.94, 'CB Nothing': 0.9, 'CB Architect': 0.88, 'CB Indie': 0.92, 'CB Grace': 1.14, 'CB JustMe': 1.2 };

export const NUMBERS = 'CB Caveat';
const CLEAR = /\d|\bIV\b/;

let ctx: CanvasRenderingContext2D | null | undefined;
export function measure(text: string, family: string, size: number): number {
  if (ctx === undefined) {
    try { ctx = typeof document === 'undefined' || typeof FontFace === 'undefined' ? null : document.createElement('canvas').getContext('2d'); } catch { ctx = null; }
  }
  const px = size * (SCALE[family] ?? 1);
  if (!ctx) return text.length * px * 0.46;
  ctx.font = `${px.toFixed(2)}px ${stack(family)}`;
  return ctx.measureText(text).width;
}

export interface Word {
  t: string;
  x: number;
  y: number;
  w: number;
  family: string;
  px: number;
  opacity: number;
  stroke: number;
  /** The whole word: its own lean and width, and a small turn. */
  lean: number;
  wide: number;
  turn: number;
  /** Per letter, in degrees and in relative pixels (SVG lists). */
  rotate: string;
  dy: string;
  dx: string;
}
export interface Line { words: Word[]; w: number; tilt: number }

const n1 = (n: number) => String(Math.round(n * 10) / 10);

function makeWord(t: string, pen: Pen, size: number, r: Rand, calm: boolean): Word {
  const m = calm ? pen.mess * 0.45 : pen.mess;
  // Numbers, and IV (elsewhere like an N), always in the one hand that cannot be mixed up. Names with capitals (ceFAZolin) stay in the main hand.
  const family = CLEAR.test(t) ? NUMBERS : !calm && /^[a-z]+[.,;:]?$/.test(t) && r() < pen.altShare ? pen.alt : pen.main;
  const px = size * between(r, 1 - 0.11 * m, 1 + 0.11 * m);
  const wide = between(r, 1 - 0.1 * m, 1 + 0.09 * m);
  const letters = Array.from(t);
  let drift = 0, last = 0, squeeze = 0;
  const dys: string[] = [], rots: string[] = [], dxs: string[] = [];
  const slope = between(r, -0.05, 0.05) * m;
  letters.forEach((_, i) => {
    drift = drift * 0.6 + between(r, -0.07, 0.07) * m * px;
    const at = drift + slope * i * px * 0.25;
    dys.push(n1(at - last));
    last = at;
    rots.push(n1(between(r, -7, 7) * m));
    const gap = i === 0 ? 0 : between(r, -0.015, 0.06) * m * px;
    squeeze += gap;
    dxs.push(n1(gap));
  });
  return {
    t, x: 0, y: between(r, -0.07, 0.07) * m * px, w: (measure(t, family, px) + squeeze) * wide, lean: between(r, -5, 6) * m, wide, turn: between(r, -1.6, 1.6) * m, family, px: px * (SCALE[family] ?? 1),
    opacity: between(r, 1 - 0.14 * pen.mess, 1), stroke: pen.weight * between(r, 0.45, 1.35), rotate: rots.join(' '), dy: dys.join(' '), dx: dxs.join(' '),
  };
}

/** Breaks one text into lines no wider than `width`. A word that is wider than the line is broken, never cut off. */
export function layout(text: string, pen: Pen, size: number, width: number, seed: string, calm = false): Line[] {
  const r = rand(seed);
  const lines: Line[] = [];
  let cur: Word[] = [], x = 0;
  const flush = () => {
    if (cur.length) lines.push({ words: cur, w: x, tilt: between(r, -0.55, 0.45) * (calm ? 0.4 : 1) * pen.mess });
    cur = []; x = 0;
  };
  const put = (w: Word) => {
    const gap = cur.length ? size * between(r, 0.3, 0.3 + 0.2 * pen.mess) : 0;
    if (cur.length && x + gap + w.w > width) { flush(); w.x = 0; } else w.x = x + gap;
    x = w.x + w.w;
    cur.push(w);
  };
  for (const t of text.split(/\s+/).filter(Boolean)) {
    const w = makeWord(t, pen, size, r, calm);
    if (w.w <= width) { put(w); continue; }
    let part = '';
    for (const ch of t) {
      if (part && measure(part + ch, pen.main, size) * 1.06 > width) { put(makeWord(part, pen, size, r, calm)); flush(); part = ''; }
      part += ch;
    }
    if (part) put(makeWord(part, pen, size, r, calm));
  }
  flush();
  return lines;
}

export interface Item {
  t: string;
  /** Drawn by hand in front of the first line. Not part of the text. */
  mark?: 'star' | 'dot' | 'dash' | 'box' | 'arrow';
  /** Values, names and doses: written more carefully. */
  calm?: boolean;
  under?: boolean;
  ring?: boolean;
}
export interface Placed { item: Item; line: Line; first: boolean; last: boolean; x: number; y: number; size: number }
export interface Fitted { lines: Placed[]; size: number; step: number; dropped: number; cut: boolean }

/**
 * Writes items into a box: first smaller letters, and only if the smallest size is still too much, whole items are left
 * out and counted. One text that is longer than the whole box is cut after a full line. Both are said on the sheet.
 */
export function fit(items: Item[], pen: Pen, box: { x: number; y: number; w: number; h: number }, o: { size: number; min?: number; lead?: number; seed: string; indent?: number }): Fitted {
  const min = o.min ?? o.size * 0.62, lead = o.lead ?? 1.22, indent = o.indent ?? 0;
  const at = (size: number) => items.map((item, i) => layout(item.t, pen, size, box.w - (item.mark ? size * 0.95 : indent), `${o.seed}|${i}|${item.t}`, item.calm));
  // A long word makes the writing smaller before it is ever broken in two.
  const longest = items.flatMap((i) => i.t.split(/\s+/).map((t) => ({ t, room: box.w - (i.mark ? o.size * 0.95 : indent) })));
  const wordFits = (size: number) => longest.every((x) => measure(x.t, CLEAR.test(x.t) ? NUMBERS : pen.main, size) * 1.16 <= x.room);
  let size = o.size, all = at(size);
  const lines = (a: Line[][]) => a.reduce((n, l) => n + l.length, 0);
  while (size > min && (lines(all) * size * lead > box.h || !wordFits(size))) { size = Math.max(min, size - 0.75); all = at(size); }
  const step = size * lead;
  const room = Math.max(1, Math.floor((box.h + 0.5) / step));
  const placed: Placed[] = [];
  let used = 0, dropped = 0, cut = false;
  all.forEach((l, i) => {
    if (dropped || cut || (used + l.length > room && used > 0)) { dropped += 1; return; }
    cut = l.length > room;
    l.slice(0, room).forEach((line, k) => {
      const inset = items[i]!.mark ? size * 0.95 : indent;
      const r = rand(`${o.seed}|${i}|${k}|place`);
      placed.push({ item: items[i]!, line, first: k === 0, last: k === Math.min(l.length, room) - 1, x: box.x + inset + between(r, -0.12, 0.22) * size * pen.mess, y: box.y + (used + k + 0.78) * step + between(r, -0.06, 0.06) * size * pen.mess, size });
    });
    used += Math.min(l.length, room);
  });
  return { lines: placed, size, step, dropped, cut };
}

/* ------------------------------ Hand-drawn strokes (SVG paths) ------------------------------ */

const P = (x: number, y: number) => `${n1(x)},${n1(y)}`;

export function strokeLine(x1: number, y1: number, x2: number, y2: number, r: Rand, wob = 1.4): string {
  const mx = (x1 + x2) / 2 + between(r, -wob, wob) * 2, my = (y1 + y2) / 2 + between(r, -wob, wob);
  return `M${P(x1 + between(r, -wob, wob), y1 + between(r, -wob, wob) * 0.6)} Q${P(mx, my)} ${P(x2 + between(r, -wob, wob), y2 + between(r, -wob, wob) * 0.6)}`;
}
export const tickPath = (x: number, y: number, s: number, r: Rand) =>
  `M${P(x + between(r, -0.06, 0.06) * s, y + s * between(r, 0.45, 0.6))} Q${P(x + s * 0.22, y + s * 0.78)} ${P(x + s * 0.34, y + s * between(r, 0.88, 1))} Q${P(x + s * 0.55, y + s * 0.4)} ${P(x + s * between(r, 1.05, 1.35), y - s * between(r, 0.1, 0.4))}`;
export function arrowPath(x1: number, y1: number, x2: number, y2: number, r: Rand): string {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 6 + r() * 2.5;
  const head = (d: number) => `M${P(x2, y2)} L${P(x2 - h * Math.cos(a + d), y2 - h * Math.sin(a + d))}`;
  return `${strokeLine(x1, y1, x2, y2, r, 1)} ${head(0.5 + r() * 0.2)} ${head(-0.45 - r() * 0.2)}`;
}
/** A pen ring that does not quite close. */
export function ringPath(x: number, y: number, w: number, h: number, r: Rand): string {
  const cx = x + w / 2, cy = y + h / 2, n = 11, start = between(r, -2.6, -2.1);
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = start + (i / n) * (Math.PI * 2 + 0.28), k = 1 + between(r, -0.05, 0.05) + (i / n) * 0.05;
    return [cx + Math.cos(t) * (w / 2) * k, cy + Math.sin(t) * (h / 2) * k] as const;
  });
  return pts.slice(1).reduce((d, p, i) => {
    const q = pts[i]!;
    return `${d} Q${P(q[0], q[1])} ${P((q[0] + p[0]) / 2, (q[1] + p[1]) / 2)}`;
  }, `M${P(pts[0]![0], pts[0]![1])}`);
}
/** A slip of the pen that was crossed out. Holds no letters and no numbers. */
export function scribblePath(x: number, y: number, w: number, h: number, r: Rand): string {
  const n = Math.max(9, Math.round(w / 2.4));
  let d = `M${P(x, y + h * 0.6)}`;
  for (let i = 1; i <= n; i++) d += ` Q${P(x + (w * (i - 0.5)) / n + between(r, -5, 5), y + (i % 2 ? between(r, -0.5, 0.2) : between(r, 0.75, 1.4)) * h)} ${P(x + (w * i) / n + between(r, -4, 4), y + between(r, 0.1, 0.9) * h)}`;
  return `${d} ${strokeLine(x + w, y + h * 0.4, x - 2, y + h * 0.55, r)} ${strokeLine(x - 1, y + h * 0.7, x + w + 3, y + h * 0.45, r)}`;
}
export function starPath(x: number, y: number, s: number, r: Rand): string {
  return [0, 60, 120].map((deg) => {
    const a = (deg * Math.PI) / 180 + between(r, -0.15, 0.15), l = s * between(r, 0.42, 0.56);
    return `M${P(x - Math.cos(a) * l, y - Math.sin(a) * l)} L${P(x + Math.cos(a) * l, y + Math.sin(a) * l)}`;
  }).join(' ');
}
export function boxPath(x: number, y: number, s: number, r: Rand): string {
  const j = () => between(r, -0.08, 0.08) * s;
  return `M${P(x + j(), y + j())} L${P(x + s + j(), y + j())} L${P(x + s + j(), y + s + j())} L${P(x + j(), y + s + j())} Z`;
}
