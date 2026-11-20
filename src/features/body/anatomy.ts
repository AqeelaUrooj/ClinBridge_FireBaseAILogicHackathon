/**
 * Original vector anatomy for the ClinBridge body map (Theme 2: warm ivory + soft slate-blue).
 * Drawn for this project; replaces the Stitch figures (kept in ./art for reference).
 *
 * Coordinate box: 0 0 240 560, body centre line x = 120. Anatomical position (palms forward, thumbs out),
 * so the same outline works from the front and from behind. Shapes are defined for the side with x > 120
 * and mirrored. Which PATIENT side that is depends on the view (see regions.ts).
 */
export type Pt = [number, number];

export const mirrorPts = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [240 - x, y] as Pt);

/** Smooth closed path through points (Catmull-Rom → cubic Bézier). */
export function smoothClosed(pts: Pt[], tension = 1): string {
  const n = pts.length;
  const p = (i: number) => pts[(i + n) % n]!;
  let d = `M ${p(0)[0]},${p(0)[1]}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1: Pt = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2: Pt = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += ` C ${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return `${d} Z`;
}

/** Smooth open path (for detail lines). */
export function smoothOpen(pts: Pt[]): string {
  const n = pts.length;
  const p = (i: number) => pts[Math.max(0, Math.min(n - 1, i))]!;
  let d = `M ${p(0)[0]},${p(0)[1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** A centre-line shape from its right half (top-centre → bottom-centre). */
const symmetric = (half: Pt[]): Pt[] => [...half, ...mirrorPts(half.slice(1, -1)).reverse()];

/* ------------------------------ Silhouette parts ------------------------------ */

const HEAD_HALF: Pt[] = [[120, 22], [131, 24], [139, 31], [142.5, 42], [142.5, 54], [140, 64], [135.5, 72], [129, 78], [120, 81]];
const NECK_HALF: Pt[] = [[120, 70], [128, 70], [129, 84], [131, 94], [133, 100], [120, 102]];
const TORSO_HALF: Pt[] = [
  [120, 93], [131, 93], [142, 97], [154, 101], [164, 106], [168, 116], [167, 132], [165, 150],
  [164, 168], [162, 188], [158, 210], [155.5, 228], [157, 245], [162, 262], [165.5, 279], [165, 293],
  [158, 302], [145, 306.5], [131, 308], [120, 307],
];
/** Arm on the x > 120 side, closed loop (shoulder → outer edge → hand → inner edge). Thumb is lateral. */
const ARM: Pt[] = [
  [158, 103], [169, 104.5], [178.5, 110], [184.5, 118.5], [187, 131], [187.5, 147], [188.5, 166], [190, 186],
  [192, 203], [195.5, 223], [199, 245], [202.5, 266], [205.5, 284], [209, 291], [214.5, 299], [217.5, 307],
  [216, 312.5], [212.5, 312], [212.5, 324], [211, 336], [207.5, 345.5], [202.5, 349.5], [197.5, 348], [194, 340.5],
  [192, 329], [191.5, 315], [191.5, 301], [191, 290], [186.5, 271], [182, 251], [177.5, 232], [174, 214],
  [171.5, 197], [169, 180], [167, 163], [165.5, 147], [163.5, 130], [160.5, 115],
];
/** Leg on the x > 120 side, closed loop (hip → outer edge → foot → inner edge). */
const LEG: Pt[] = [
  [149, 262], [161.5, 266], [168, 281], [171, 300], [171, 322], [168, 346], [164.5, 370], [162, 390],
  [163, 408], [166, 426], [166.5, 446], [162.5, 466], [157.5, 486], [154.5, 500], [157, 508], [160.5, 518],
  [159.5, 527], [153.5, 532], [143, 533.5], [134, 532.5], [129.5, 527], [130, 518], [132, 508], [132.5, 490],
  [131, 470], [129, 448], [128, 426], [128.5, 408], [129, 392], [128, 372], [126, 350], [124, 328],
  [122, 312], [121, 302], [125, 282], [137, 266],
];
const EAR: Pt[] = [[141, 47], [145, 49], [146.5, 55], [144.5, 61], [140.5, 62.5]];

export const SHAPES = {
  head: smoothClosed(symmetric(HEAD_HALF)),
  neck: smoothClosed(symmetric(NECK_HALF)),
  torso: smoothClosed(symmetric(TORSO_HALF)),
  // SR = drawn on the viewer's right (x > 120), SL = viewer's left. Patient side depends on the view.
  earSR: smoothClosed(EAR), earSL: smoothClosed(mirrorPts(EAR)),
  armSR: smoothClosed(ARM), armSL: smoothClosed(mirrorPts(ARM)),
  legSR: smoothClosed(LEG), legSL: smoothClosed(mirrorPts(LEG)),
};
export type ShapeKey = keyof typeof SHAPES;
/** Draw order for the silhouette (legs and arms behind the torso, head on top). */
export const SILHOUETTE: ShapeKey[] = ['legSR', 'legSL', 'armSR', 'armSL', 'neck', 'torso', 'earSR', 'earSL', 'head'];

/* ------------------------------ Detail lines ------------------------------ */

const both = (pts: Pt[]) => [smoothOpen(pts), smoothOpen(mirrorPts(pts))];

export const FRONT_DETAIL: string[] = [
  ...both([[123, 104], [138, 99.5], [152, 101], [162, 107]]), // collar bones
  ...both([[122, 149], [134, 157], [150, 156], [162, 141]]), // chest (pectoral) lower edge
  ...both([[166, 113], [175, 126], [178, 142], [176.5, 158]]), // shoulder (deltoid)
  ...both([[181.5, 160], [181, 180], [182.5, 197]]), // upper arm
  ...both([[183, 226], [188, 250], [194, 277]]), // forearm
  ...both([[198.5, 334], [198.5, 347]]), ...both([[203, 333], [203.5, 348]]), ...both([[207.5, 331], [207.5, 344]]), // fingers
  ...both([[191.5, 304], [199, 310], [206, 307]]), // palm crease
  ...both([[134, 527], [139, 529.5]]), ...both([[146, 529.5], [152, 527]]), // toes
  ...both([[146, 174], [150.5, 200], [149.5, 230], [141, 262]]), // side of abdomen
  ...both([[122, 190], [139, 188.5]]), ...both([[122, 210], [141, 209]]), // abdominal lines
  ...both([[160, 262], [146, 281], [129, 299]]), // groin crease
  ...both([[150, 302], [157.5, 338], [155.5, 378]]), // thigh
  ...both([[146, 408], [149.5, 450], [146, 494]]), // shin
  smoothOpen([[120, 104], [120, 150]]), // breastbone
  smoothOpen([[120, 158], [120, 262]]), // midline of abdomen
];
export const FRONT_ELLIPSES: { cx: number; cy: number; rx: number; ry: number }[] = [
  { cx: 120, cy: 232, rx: 1.9, ry: 2.3 }, // navel
  { cx: 146, cy: 392, rx: 7.5, ry: 9.5 }, { cx: 94, cy: 392, rx: 7.5, ry: 9.5 }, // kneecaps
];

export const BACK_DETAIL: string[] = [
  smoothOpen([[120, 96], [120, 262]]), // spine
  ...both([[122, 96], [140, 101], [160, 107]]), // top of shoulders
  ...both([[131, 120], [143, 116.5], [155, 115.5]]), ...both([[155, 115.5], [152, 132], [145, 151]]), ...both([[145, 151], [137, 136], [131, 120]]), // shoulder blade
  ...both([[166, 113], [175, 126], [178, 142], [176.5, 158]]), // shoulder
  ...both([[183, 206], [188, 211.5], [193, 206]]), // elbow
  ...both([[195, 334], [195, 344]]), ...both([[200, 336], [200, 348]]), ...both([[205, 335], [205.5, 347]]), // back of fingers
  ...both([[122, 236], [134, 241], [148, 238]]), // lower back
  smoothOpen([[120, 270], [120, 314]]), // cleft of buttocks
  ...both([[122, 316], [138, 322], [151, 321], [164, 311]]), // fold under buttocks
  ...both([[132, 392], [146, 397], [160, 392]]), // back of knee
  ...both([[131, 424], [146, 414], [163, 430]]), // calf
  ...both([[145.5, 470], [145.5, 504]]), // heel cord
];
export const BACK_ELLIPSES: { cx: number; cy: number; rx: number; ry: number }[] = [
  { cx: 145, cy: 523, rx: 9, ry: 6.5 }, { cx: 95, cy: 523, rx: 9, ry: 6.5 }, // heels
];

/** Subtle dashed lines that show where one region ends and the next begins. */
export const FRONT_DIVIDERS: string[] = [
  'M 76,180 Q 120,188 164,180', // chest | abdomen
  'M 120,180 L 120,268', // abdomen left | right
  ...both([[171.5, 205], [184, 209], [195, 204]]), // elbow
  ...both([[191, 290], [199, 292.5], [206.5, 287.5]]), // wrist
  ...both([[128.5, 392], [146, 403], [162.5, 392]]), // knee
  ...both([[132, 505], [143, 508], [155, 503]]), // ankle
];
export const BACK_DIVIDERS: string[] = [
  'M 78,192 Q 120,198 162,192', // upper | lower back
  'M 79,258 Q 120,264 161,258', // lower back | buttocks
  ...both([[171.5, 205], [184, 209], [195, 204]]),
  ...both([[191, 290], [199, 292.5], [206.5, 287.5]]),
  ...both([[128.5, 392], [146, 400], [162.5, 392]]),
  ...both([[132, 507], [143, 510], [155, 505]]), // heel
];
