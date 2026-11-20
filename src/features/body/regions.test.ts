import { describe, expect, it } from 'vitest';
import { REGIONS, SITE_TO_REGION, centre, regionById } from './regions';
import { SITE_WORDS } from '../../config/medicationPolicy';

describe('body map regions (UI/UX 21-region first model)', () => {
  it('has exactly the 21 listed regions with unique ids', () => {
    expect(REGIONS).toHaveLength(21);
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(21);
  });
  it("uses the patient's anatomical left and right", () => {
    for (const r of REGIONS) {
      const [x] = centre(r.shape);
      if (r.view === 'front' && r.id.startsWith('LEFT_')) expect(x).toBeGreaterThan(100);
      if (r.view === 'front' && r.id.startsWith('RIGHT_')) expect(x).toBeLessThan(100);
      if (r.view === 'back' && r.id.startsWith('LEFT_')) expect(x).toBeLessThan(100);
      if (r.view === 'back' && r.id.startsWith('RIGHT_')) expect(x).toBeGreaterThan(100);
    }
    expect(centre(regionById('ABDOMEN_LEFT')!.shape)[0]).toBeGreaterThan(100);
  });
  it('maps every standard site word to a real region', () => {
    for (const w of SITE_WORDS) expect(regionById(SITE_TO_REGION[w]!)).toBeDefined();
  });
});
