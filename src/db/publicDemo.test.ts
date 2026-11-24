import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The public judge build refuses Real records in the database layer, not only by a hidden button. */
describe.each([true, false])('public demo = %s', (demo) => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../config/publicDemo', () => ({ PUBLIC_DEMO: demo }));
  });

  it(demo ? 'cannot open a Real database, and none is created' : 'the normal build keeps Real records', async () => {
    const { DowntimeDB, getDb } = await import('./db');
    expect(getDb('practice').name).toBe('downtimekit-practice');
    if (!demo) { expect(getDb('live').name).toBe('downtimekit-live'); return; }
    for (const open of [() => getDb('live'), () => new DowntimeDB('live'), () => new DowntimeDB('live', 'any-other-name')]) expect(open).toThrow('fictional Practice records only');
    expect((await indexedDB.databases()).filter((d) => d.name !== 'downtimekit-practice')).toEqual([]);
  });
});
