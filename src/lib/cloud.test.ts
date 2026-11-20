import { describe, expect, it } from 'vitest';
import { assertCloudAllowed, CloudBlockedError, cloudDecision } from './cloud';

describe('cloud guard', () => {
  it('blocks every cloud purpose during System down, in both datasets', () => {
    for (const dataset of ['practice', 'live'] as const)
      for (const purpose of ['second_look', 'worklist', 'compare'] as const)
        expect(() => assertCloudAllowed({ dataset, phase: 'down', purpose })).toThrow(CloudBlockedError);
  });
  it('allows recovery help only after the network is cleared', () => {
    expect(cloudDecision({ dataset: 'live', phase: 'ready', purpose: 'second_look' }).allowed).toBe(false);
    expect(cloudDecision({ dataset: 'live', phase: 'online', purpose: 'second_look' }).allowed).toBe(true);
  });
  it('allows compare only on Practice data', () => {
    expect(cloudDecision({ dataset: 'live', phase: 'ready', purpose: 'compare' }).allowed).toBe(false);
    expect(cloudDecision({ dataset: 'practice', phase: 'ready', purpose: 'compare' }).allowed).toBe(true);
  });
});
