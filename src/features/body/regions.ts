/**
 * Body map regions — FIRST FUNCTIONAL MODEL, not final.
 * The 21 regions listed in the UI/UX document (master prompt, BODY MAP line). Owner decision 20 Nov 2026.
 * Region ids are DRAFT: they are not stored in the database yet (note.body_site waits on the final model, P-03).
 *
 * Left/right always mean the PATIENT'S anatomical left/right:
 *   front view → patient's left is on the viewer's RIGHT (x > 100)
 *   back view  → patient's left is on the viewer's LEFT  (x < 100)
 * Shapes use the Stitch artwork's coordinate box (viewBox 0 0 200 420) and only define tap areas.
 */
export type View = 'front' | 'back';
export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'poly'; points: [number, number][] };

export interface Region { id: string; label: string; view: View; shape: Shape }

const mirror = (s: Shape): Shape =>
  s.kind === 'rect' ? { ...s, x: 200 - s.x - s.w }
    : s.kind === 'ellipse' ? { ...s, cx: 200 - s.cx }
      : { kind: 'poly', points: s.points.map(([x, y]) => [200 - x, y] as [number, number]) };

// Shapes drawn on the viewer's LEFT of the front view = patient's RIGHT side.
const FRONT_RIGHT_SIDE: Record<string, Shape> = {
  UPPER_ARM: { kind: 'poly', points: [[55, 72], [70, 62], [74, 92], [72, 122], [59, 122], [56, 98]] },
  FOREARM: { kind: 'poly', points: [[59, 122], [77, 122], [75, 140], [74, 162], [77, 182], [52, 182], [58, 162], [62, 146]] },
  HAND: { kind: 'rect', x: 44, y: 182, w: 36, h: 28 },
  THIGH: { kind: 'poly', points: [[77, 170], [99, 170], [99, 250], [92, 320], [72, 320], [75, 250]] },
  LOWER_LEG: { kind: 'rect', x: 68, y: 320, w: 25, h: 75 },
  FOOT: { kind: 'rect', x: 64, y: 395, w: 28, h: 18 },
};

const sided = (part: string, label: string): Region[] => [
  { id: `RIGHT_${part}`, label: `Right ${label}`, view: 'front', shape: FRONT_RIGHT_SIDE[part]! },
  { id: `LEFT_${part}`, label: `Left ${label}`, view: 'front', shape: mirror(FRONT_RIGHT_SIDE[part]!) },
];

export const REGIONS: Region[] = [
  { id: 'HEAD', label: 'Head', view: 'front', shape: { kind: 'ellipse', cx: 100, cy: 28, rx: 16, ry: 19 } },
  { id: 'CHEST', label: 'Chest', view: 'front', shape: { kind: 'rect', x: 72, y: 54, w: 56, h: 48 } },
  // Front view: the patient's right half of the belly is on the viewer's left.
  { id: 'ABDOMEN_RIGHT', label: 'Abdomen, right side', view: 'front', shape: { kind: 'rect', x: 76, y: 102, w: 23.5, h: 52 } },
  { id: 'ABDOMEN_LEFT', label: 'Abdomen, left side', view: 'front', shape: { kind: 'rect', x: 100.5, y: 102, w: 23.5, h: 52 } },
  ...sided('UPPER_ARM', 'upper arm'),
  ...sided('FOREARM', 'forearm'),
  ...sided('HAND', 'hand'),
  ...sided('THIGH', 'thigh'),
  ...sided('LOWER_LEG', 'lower leg'),
  ...sided('FOOT', 'foot'),
  { id: 'UPPER_BACK', label: 'Upper back', view: 'back', shape: { kind: 'rect', x: 70, y: 52, w: 60, h: 60 } },
  { id: 'LOWER_BACK', label: 'Lower back', view: 'back', shape: { kind: 'rect', x: 74, y: 112, w: 52, h: 70 } },
  { id: 'BUTTOCKS', label: 'Buttocks', view: 'back', shape: { kind: 'rect', x: 70, y: 182, w: 60, h: 52 } },
  // Back view: the patient's left heel is on the viewer's left (Stitch heel shapes at x 76 and 124).
  { id: 'LEFT_HEEL', label: 'Left heel', view: 'back', shape: { kind: 'ellipse', cx: 76, cy: 404, rx: 13, ry: 10 } },
  { id: 'RIGHT_HEEL', label: 'Right heel', view: 'back', shape: { kind: 'ellipse', cx: 124, cy: 404, rx: 13, ry: 10 } },
];

export const regionById = (id: string) => REGIONS.find((r) => r.id === id);

/**
 * Fixed table: standard site words already used in med_admin.site → region.
 * Exact match only; anything else is listed as "not on the map", never guessed.
 */
export const SITE_TO_REGION: Record<string, string> = {
  'Abdomen, left side': 'ABDOMEN_LEFT',
  'Abdomen, right side': 'ABDOMEN_RIGHT',
  'Left forearm IV line': 'LEFT_FOREARM',
  'Right forearm IV line': 'RIGHT_FOREARM',
  'Left hand IV line': 'LEFT_HAND',
  'Right hand IV line': 'RIGHT_HAND',
};

export const siteRegion = (site: string | null | undefined): Region | undefined =>
  site ? regionById(SITE_TO_REGION[site.trim()] ?? '') : undefined;

/** Centre point of a region, for drawing a marker. */
export function centre(s: Shape): [number, number] {
  if (s.kind === 'rect') return [s.x + s.w / 2, s.y + s.h / 2];
  if (s.kind === 'ellipse') return [s.cx, s.cy];
  const xs = s.points.map((p) => p[0]), ys = s.points.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
