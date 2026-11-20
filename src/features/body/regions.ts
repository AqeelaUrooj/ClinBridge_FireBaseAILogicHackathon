import type { Pt, ShapeKey } from './anatomy';

/**
 * Body map regions: FIRST FUNCTIONAL MODEL, not final.
 * The 21 regions listed in the UI/UX document (owner decision, 20 Nov 2026). Ids are UNCHANGED from the
 * previous version and are drafts: not stored in the database yet (note.body_site waits, P-03).
 *
 * Left/right are the PATIENT'S anatomical left/right:
 *   front view → the patient's left is on the viewer's RIGHT (x > 120)
 *   back view  → the patient's left is on the viewer's LEFT  (x < 120)
 *
 * A region is a band (polygon) clipped to a body part of the artwork, so highlights never spill outside
 * the figure and stay aligned at any size. Head and limb regions can be picked from either view (same id:
 * "Left forearm" includes the back of the forearm). Heels are picked from the back view, feet from the front.
 */
export type View = 'front' | 'back';
type Side = 'left' | 'right' | null;

export interface Zone {
  /** Body parts the band is clipped to. */
  clip: ShapeKey[];
  /** Band polygon in artwork coordinates. */
  band: Pt[];
  /** Where a marker / label sits. */
  anchor: Pt;
}

export interface Region {
  id: string;
  label: string;
  side: Side;
  /** View used for markers when the region exists in both views. */
  primary: View;
  zones: Partial<Record<View, Zone>>;
}

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const flipX = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [240 - x, y] as Pt);

// Bands for the viewer's-RIGHT copy of a limb; mirrored for the other side.
const LIMB = {
  UPPER_ARM: { band: [[150, 95], [215, 95], [215, 200], [195, 204], [184, 209], [171.5, 205], [150, 205]] as Pt[], anchor: [180, 160] as Pt, part: 'arm' },
  FOREARM: { band: [[150, 205], [171.5, 205], [184, 209], [195, 204], [230, 200], [230, 285], [206.5, 287.5], [199, 292.5], [191, 290], [150, 290]] as Pt[], anchor: [190, 250] as Pt, part: 'arm' },
  HAND: { band: [[184, 290], [191, 290], [199, 292.5], [206.5, 287.5], [226, 285], [226, 360], [184, 360]] as Pt[], anchor: [202, 322] as Pt, part: 'arm' },
  THIGH_FRONT: { band: [[120, 296], [180, 290], [180, 392], [162.5, 392], [146, 403], [128.5, 392], [120, 392]] as Pt[], anchor: [148, 345] as Pt, part: 'leg' },
  THIGH_BACK: { band: [[120, 318], [180, 312], [180, 392], [162.5, 392], [146, 400], [128.5, 392], [120, 392]] as Pt[], anchor: [149, 356] as Pt, part: 'leg' },
  LOWER_LEG_FRONT: { band: [[120, 392], [128.5, 392], [146, 403], [162.5, 392], [180, 392], [180, 503], [155, 503], [143, 508], [132, 505], [120, 505]] as Pt[], anchor: [147, 450] as Pt, part: 'leg' },
  LOWER_LEG_BACK: { band: [[120, 392], [128.5, 392], [146, 400], [162.5, 392], [180, 392], [180, 505], [155, 505], [143, 510], [132, 507], [120, 507]] as Pt[], anchor: [147, 450] as Pt, part: 'leg' },
  FOOT: { band: [[120, 505], [132, 505], [143, 508], [155, 503], [180, 503], [180, 545], [120, 545]] as Pt[], anchor: [145, 521] as Pt, part: 'leg' },
  HEEL: { band: [[120, 507], [132, 507], [143, 510], [155, 505], [180, 505], [180, 545], [120, 545]] as Pt[], anchor: [145, 523] as Pt, part: 'leg' },
} as const;

type LimbKey = keyof typeof LIMB;

/** Zone for a limb part on the given patient side and view. */
function limbZone(key: LimbKey, side: 'left' | 'right', view: View): Zone {
  const l = LIMB[key];
  // Front: patient's left = viewer's right (SR). Back: patient's left = viewer's left (SL).
  const screenRight = (view === 'front') === (side === 'left');
  const shape = `${l.part}${screenRight ? 'SR' : 'SL'}` as ShapeKey;
  return screenRight
    ? { clip: [shape], band: [...l.band], anchor: l.anchor }
    : { clip: [shape], band: flipX([...l.band]), anchor: [240 - l.anchor[0], l.anchor[1]] };
}

function limb(part: string, label: string, front: LimbKey | null, back: LimbKey | null, primary: View): Region[] {
  return (['right', 'left'] as const).map((side) => ({
    id: `${side.toUpperCase()}_${part}`,
    label: `${side === 'left' ? 'Left' : 'Right'} ${label}`,
    side,
    primary,
    zones: {
      ...(front ? { front: limbZone(front, side, 'front') } : {}),
      ...(back ? { back: limbZone(back, side, 'back') } : {}),
    },
  }));
}

const CHEST_ABDOMEN_LINE: Pt[] = [[164, 180], [142, 185.5], [120, 188], [98, 185.5], [76, 180]];

export const REGIONS: Region[] = [
  { id: 'HEAD', label: 'Head', side: null, primary: 'front', zones: { front: { clip: ['head', 'earSR', 'earSL'], band: box(80, 10, 160, 84), anchor: [120, 50] }, back: { clip: ['head', 'earSR', 'earSL'], band: box(80, 10, 160, 84), anchor: [120, 50] } } },
  { id: 'CHEST', label: 'Chest', side: null, primary: 'front', zones: { front: { clip: ['torso'], band: [[60, 90], [180, 90], ...CHEST_ABDOMEN_LINE], anchor: [120, 135] } } },
  // Front view: the patient's right half of the abdomen is on the viewer's left.
  { id: 'ABDOMEN_RIGHT', label: 'Abdomen, right side', side: 'right', primary: 'front', zones: { front: { clip: ['torso'], band: [[120, 188], [98, 185.5], [60, 178], [60, 268], [120, 268]], anchor: [100, 226] } } },
  { id: 'ABDOMEN_LEFT', label: 'Abdomen, left side', side: 'left', primary: 'front', zones: { front: { clip: ['torso'], band: [[120, 188], [142, 185.5], [180, 178], [180, 268], [120, 268]], anchor: [140, 226] } } },
  ...limb('UPPER_ARM', 'upper arm', 'UPPER_ARM', 'UPPER_ARM', 'front'),
  ...limb('FOREARM', 'forearm', 'FOREARM', 'FOREARM', 'front'),
  ...limb('HAND', 'hand', 'HAND', 'HAND', 'front'),
  ...limb('THIGH', 'thigh', 'THIGH_FRONT', 'THIGH_BACK', 'front'),
  ...limb('LOWER_LEG', 'lower leg', 'LOWER_LEG_FRONT', 'LOWER_LEG_BACK', 'front'),
  ...limb('FOOT', 'foot', 'FOOT', null, 'front'),
  { id: 'UPPER_BACK', label: 'Upper back', side: null, primary: 'back', zones: { back: { clip: ['torso'], band: [[60, 90], [180, 90], [180, 192], [162, 192], [120, 198], [78, 192], [60, 192]], anchor: [120, 150] } } },
  { id: 'LOWER_BACK', label: 'Lower back', side: null, primary: 'back', zones: { back: { clip: ['torso'], band: [[60, 192], [78, 192], [120, 198], [162, 192], [180, 192], [180, 258], [161, 258], [120, 264], [79, 258], [60, 258]], anchor: [120, 228] } } },
  { id: 'BUTTOCKS', label: 'Buttocks', side: null, primary: 'back', zones: { back: { clip: ['torso', 'legSR', 'legSL'], band: [[60, 258], [79, 258], [120, 264], [161, 258], [180, 258], [180, 312], [120, 318], [60, 312]], anchor: [120, 290] } } },
  ...limb('HEEL', 'heel', null, 'HEEL', 'back'),
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

export const regionsInView = (view: View) => REGIONS.filter((r) => r.zones[view]);
