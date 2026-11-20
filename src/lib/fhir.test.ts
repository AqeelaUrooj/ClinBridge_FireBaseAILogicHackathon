import { describe, expect, it } from 'vitest';
import { DowntimeDB } from '../db/db';
import { importPracticeSeed } from '../db/seed';
import { practiceClock } from './time';
import { prepareExport } from '../db/repos/export';
import { validateBundle } from './fhir';

describe('FHIR R4 export', () => {
  it('builds a valid collection bundle from the synthetic data', async () => {
    const db = new DowntimeDB('practice', `fhir-${crypto.randomUUID()}`);
    await importPracticeSeed(db);
    const { bundle, errors, resourceCount } = await prepareExport(db, practiceClock());
    expect(errors).toEqual([]);
    expect(resourceCount).toBeGreaterThan(100);
    const res = (bundle.entry as { resource: Record<string, unknown> }[]).map((e) => e.resource);
    const byId = (t: string, id: string) => res.find((r) => r.resourceType === t && r.id === id)!;
    // drafts never exported
    expect(res.some((r) => String(r.id).startsWith('e-048'))).toBe(false);
    // corrected version kept, marked entered-in-error; new version linked by Provenance revision
    expect(byId('Observation', 'e-040-heartrate').status).toBe('entered-in-error');
    expect(byId('Observation', 'e-041-heartrate').status).toBe('final');
    expect(JSON.stringify(byId('Provenance', 'prov-e-041-heartrate'))).toContain('revision');
    // LOINC + UCUM for vitals; BP as a panel with components
    const bp = byId('Observation', 'e-041-bp') as { code: { coding: { code: string }[] }; component: unknown[] };
    expect(bp.code.coding[0]!.code).toBe('85354-9');
    expect(bp.component).toHaveLength(2);
    // held dose is not-done with reason; every resource tagged
    expect(byId('MedicationAdministration', 'e-031').status).toBe('not-done');
    expect(res.every((r) => (r.meta as { tag: unknown[] }).tag.length === 1)).toBe(true);
  });
  it('validator catches broken references, bad statuses and dates', () => {
    const bad = { resourceType: 'Bundle', type: 'collection', timestamp: '2026-11-14T13:20:00-05:00', entry: [
      { fullUrl: 'https://clinbridge.example/fhir/Observation/o1', resource: { resourceType: 'Observation', id: 'o1', status: 'done', code: { text: 'x' }, subject: { reference: 'Patient/missing' }, effectiveDateTime: '14/11/2026', meta: { tag: [{}] } } },
    ] };
    const errs = validateBundle(bad).join('\n');
    expect(errs).toMatch(/invalid status/);
    expect(errs).toMatch(/reference Patient\/missing not in bundle/);
    expect(errs).toMatch(/not a dateTime/);
  });
});

describe('narrative (dom-6)', () => {
  it('is "generated" XHTML restating only the resource fields, with HTML escaped', async () => {
    const { narrative } = await import('./fhir');
    const n = narrative({ resourceType: 'Observation', id: 'o-1', status: 'final', code: { text: 'Pulse <check> & "go"' }, valueQuantity: { value: 83, unit: '/min' }, meta: { tag: [] } });
    expect(n.status).toBe('generated');
    expect(n.div.startsWith('<div xmlns="http://www.w3.org/1999/xhtml">')).toBe(true);
    expect(n.div).toContain('Pulse &lt;check&gt; &amp; &quot;go&quot;');
    expect(n.div).toContain('83 /min');
    expect(n.div).not.toContain('meta');
    expect(n.div).not.toMatch(/<check>/);
  });
});
