import { describe, expect, it } from 'vitest';
import { REGIONS, SITE_TO_REGION, regionById, regionsInView } from './regions';
import { SITE_WORDS } from '../../config/medicationPolicy';

const cx = (pts: [number, number][]) => pts.reduce((a, p) => a + p[0], 0) / pts.length;

describe('body map regions (UI/UX 21-region first model)', () => {
  it('keeps exactly the 21 region ids from the previous version', () => {
    expect(REGIONS.map((r) => r.id).sort()).toEqual([
      'ABDOMEN_LEFT', 'ABDOMEN_RIGHT', 'BUTTOCKS', 'CHEST', 'HEAD',
      'LEFT_FOOT', 'LEFT_FOREARM', 'LEFT_HAND', 'LEFT_HEEL', 'LEFT_LOWER_LEG', 'LEFT_THIGH', 'LEFT_UPPER_ARM',
      'LOWER_BACK',
      'RIGHT_FOOT', 'RIGHT_FOREARM', 'RIGHT_HAND', 'RIGHT_HEEL', 'RIGHT_LOWER_LEG', 'RIGHT_THIGH', 'RIGHT_UPPER_ARM',
      'UPPER_BACK',
    ]);
  });
  it("uses the patient's anatomical left and right in both views", () => {
    for (const r of REGIONS) {
      for (const [view, z] of Object.entries(r.zones)) {
        const x = cx(z!.band);
        const clipSide = z!.clip.find((c) => /S[RL]$/.test(c));
        if (r.side === 'left') {
          expect(view === 'front' ? x > 120 : x < 120).toBe(true);
          if (clipSide) expect(clipSide.endsWith(view === 'front' ? 'SR' : 'SL')).toBe(true);
        }
        if (r.side === 'right') {
          expect(view === 'front' ? x < 120 : x > 120).toBe(true);
          if (clipSide) expect(clipSide.endsWith(view === 'front' ? 'SL' : 'SR')).toBe(true);
        }
      }
    }
  });
  it('every region is reachable from at least one view; heels only from the back, feet only from the front', () => {
    for (const r of REGIONS) expect(Object.keys(r.zones).length).toBeGreaterThan(0);
    expect(regionById('LEFT_HEEL')!.zones.front).toBeUndefined();
    expect(regionById('LEFT_FOOT')!.zones.back).toBeUndefined();
    expect(regionsInView('front').length + regionsInView('back').length).toBeGreaterThanOrEqual(21);
  });
  it('maps every standard site word to a real region', () => {
    for (const w of SITE_WORDS) expect(regionById(SITE_TO_REGION[w]!)).toBeDefined();
  });
});
