import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DowntimeDB } from '../db/db';
import { importPracticeSeed } from '../db/seed';
import { practiceClock } from './time';
import { prepareExport } from '../db/repos/export';

/** Writes the synthetic export to $FHIR_OUT so CI can run the official HL7 validator on it. */
describe.skipIf(!process.env.FHIR_OUT)('write synthetic FHIR export for the HL7 validator', () => {
  it('writes the bundle', async () => {
    const db = new DowntimeDB('practice', `fhir-out-${crypto.randomUUID()}`);
    await importPracticeSeed(db);
    const { json, errors } = await prepareExport(db, practiceClock(Date.parse('2026-11-14T13:20:00-05:00')));
    expect(errors).toEqual([]);
    writeFileSync(process.env.FHIR_OUT!, json);
  });
});
