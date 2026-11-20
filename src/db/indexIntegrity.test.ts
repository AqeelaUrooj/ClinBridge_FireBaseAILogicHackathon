import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DowntimeDB, V1_STORES } from './db';
import { verifyChain } from './audit';
import { clearVaultMode, decryptRow, getVaultMode, indexFieldsFromSpec, IntegrityError, isLegacyRow, setVaultMode } from './encryption';
import { createVault, detectVault, rawFormatCounts, resealLegacyRows, unlockVault } from './vault';
import { importPracticeSeed } from './seed';
import { createEntry, markEnteredInError } from './repos/entries';
import { clearPhotos, getPhoto, rawPhotos, savePhoto, verifyPhoto, openPhoto } from './photos';
import { practiceClock } from '../lib/time';
import { sealBytes, sealJson } from '../lib/vaultCrypto';
import { PUBLIC_PRACTICE_PASSPHRASE } from '../config/securityPolicy';

const FAST = 1000;
const clock = practiceClock();
const actor = { userId: 'pr-okafor', deviceId: 'dev-01' };
const dbs: DowntimeDB[] = [];
type Row = Record<string, unknown>;

afterEach(async () => {
  for (const db of dbs.splice(0)) {
    await clearPhotos(db);
    clearVaultMode(db.name);
    db.close();
  }
});

async function seeded(): Promise<DowntimeDB> {
  const db = new DowntimeDB('practice', `idx-${crypto.randomUUID()}`);
  dbs.push(db);
  setVaultMode(db.name, { mode: 'pending' });
  await db.open();
  await createVault(db, PUBLIC_PRACTICE_PASSPHRASE, { iterations: FAST });
  await importPracticeSeed(db);
  return db;
}

async function raw<T>(db: DowntimeDB, fn: (r: Dexie) => Promise<T>): Promise<T> {
  db.close();
  const r = new Dexie(db.name);
  await r.open();
  try {
    return await fn(r);
  } finally {
    r.close();
    await db.open();
  }
}

const tamper = (v: unknown): unknown => (typeof v === 'number' ? v + 1_000_000 : typeof v === 'string' ? `${v}-X` : 'X');

describe('index fields are authenticated (format v2)', () => {
  it('changing ANY plain index field of any table without the key is detected', async () => {
    const db = await seeded();
    const tested: string[] = [];
    for (const [table, spec] of Object.entries(V1_STORES)) {
      if (table === 'key_store') continue;
      for (const field of indexFieldsFromSpec(spec)) {
        const rows = await raw(db, (r) => r.table(table).toArray() as Promise<Row[]>);
        if (!rows.length) continue;
        const target = rows.find((x) => x[field] !== undefined && x[field] !== null) ?? rows[0]!;
        const pkField = indexFieldsFromSpec(spec)[0]!;
        const changed = { ...target, [field]: tamper(target[field]) };
        await raw(db, async (r) => {
          if (field === pkField) {
            await r.table(table).delete(target[pkField] as string); // move the row to a new primary key
            await r.table(table).add(changed);
          } else await r.table(table).put(changed);
        });
        await expect(db.table(table).toArray(), `${table}.${field}`).rejects.toBeInstanceOf(IntegrityError);
        // put the original back (and remove the copy) so the next field starts clean
        await raw(db, async (r) => {
          if (field === pkField) await r.table(table).delete(changed[pkField] as string);
          await r.table(table).put(target);
        });
        await expect(db.table(table).toArray()).resolves.toBeTruthy();
        tested.push(`${table}.${field}`);
      }
    }
    for (const must of ['patient.mrn', 'entry.patient_id', 'entry.encounter_id', 'entry.care_time', 'entry.status', 'entry.supersedes_id', 'entry.device_id', 'entry.counter', 'audit_log.seq', 'med_admin.order_id', 'vital_sign.entry_id', 'worklist_item.priority', 'snapshot_result.time', 'downtime_event.declared_at']) {
      expect(tested, must).toContain(must);
    }
    expect(tested.length).toBeGreaterThanOrEqual(30);
    console.info(`index fields tamper-tested: ${tested.length}`);
  });

  it('removing an index field, or editing the format version, is detected too', async () => {
    const db = await seeded();
    const e = (await raw(db, (r) => r.table('entry').toArray() as Promise<Row[]>))[0]!;
    const { care_time: _c, ...noCare } = e;
    void _c;
    await raw(db, (r) => r.table('entry').put(noCare));
    await expect(db.entry.toArray()).rejects.toBeInstanceOf(IntegrityError);
    await raw(db, (r) => r.table('entry').put({ ...e, _enc: { ...(e._enc as Row), v: 1 } }));
    await expect(db.entry.toArray()).rejects.toBeInstanceOf(IntegrityError);
    const m = getVaultMode(db.name) as { mode: 'unlocked'; key: CryptoKey; allowPlain: boolean };
    setVaultMode(db.name, { ...m, allowLegacy: true }); // even while v1 is accepted, a downgraded v2 row fails
    await expect(db.entry.toArray()).rejects.toBeInstanceOf(IntegrityError);
  });

  it('legitimate changes through the app (status change, correction) re-seal the row and stay readable', async () => {
    const db = await seeded();
    const vitals = { temp_c: 36.9, heart_rate: 80, resp_rate: 16, bp_systolic: 128, bp_diastolic: 78, spo2: 97, o2_device: null, o2_flow_lpm: null, pain_0_10: 1, glucose_mgdl: null, consciousness: 'Alert', weight_kg: null, raw_text: null };
    const first = await createEntry(db, clock, actor, { patientId: 'pt-01', type: 'vital_sign', careTime: clock.nowIso(), values: vitals } as never);
    const fix = await createEntry(db, clock, actor, { patientId: 'pt-01', type: 'vital_sign', careTime: clock.nowIso(), values: { ...vitals, heart_rate: 81 }, supersedesId: first.id, correctionReason: 'typed wrong' } as never);
    expect((await db.entry.get(first.id))?.status).toBe('corrected');
    expect((await db.entry.get(fix.id))?.supersedes_id).toBe(first.id);
    await markEnteredInError(db, clock, actor, fix.id, 'wrong patient');
    expect((await db.entry.get(fix.id))?.status).toBe('entered-in-error');
    expect((await db.entry.where('status').equals('entered-in-error').toArray()).some((x) => x.id === fix.id)).toBe(true);
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
    expect((await rawFormatCounts(db)).legacy).toBe(0);
  });

  it('photo index fields (patient_id, saved_at) are bound too', async () => {
    const db = await seeded();
    const p = await savePhoto(db, clock, actor, 'pt-08', new Blob([new Uint8Array([137, 80, 78, 71, 1, 2])], { type: 'image/png' }));
    const row = (await rawPhotos(db))[0] as unknown as Row;
    const pdb = new Dexie(`${db.name}-photos`);
    await pdb.open();
    await pdb.table('photos').put({ ...row, patient_id: 'pt-01' });
    pdb.close();
    await expect(getPhoto(db, p.ref)).rejects.toBeInstanceOf(IntegrityError);
  });
});

describe('compatibility with data sealed in format v1', () => {
  /** Rewrite every row (and photo) of a database into the first format, as an earlier build stored it. */
  async function downgradeToV1(db: DowntimeDB): Promise<void> {
    const m = getVaultMode(db.name) as { mode: 'unlocked'; key: CryptoKey };
    const key = m.key;
    await raw(db, async (r) => {
      for (const [table, spec] of Object.entries(V1_STORES)) {
        if (table === 'key_store') continue;
        const idx = indexFieldsFromSpec(spec);
        const rows = (await r.table(table).toArray()) as Row[];
        const out: Row[] = [];
        for (const row of rows) {
          const plain = await decryptRow(key, table, idx, row);
          const keep: Row = {};
          const secret: Row = {};
          for (const [k, v] of Object.entries(plain)) (idx.includes(k) ? keep : secret)[k] = v;
          keep._enc = await sealJson(key, secret, `${table}|${JSON.stringify(plain[idx[0]!])}`, 1);
          out.push(keep);
        }
        if (out.length) await r.table(table).bulkPut(out);
      }
    });
    const pdb = new Dexie(`${db.name}-photos`);
    await pdb.open();
    for (const ph of (await pdb.table('photos').toArray()) as Row[]) {
      const open = await openPhoto(key, ph as never);
      const bytes = new Uint8Array(await new Response(open.blob).arrayBuffer());
      await pdb.table('photos').put({
        ref: ph.ref, patient_id: ph.patient_id, saved_at: ph.saved_at,
        _enc: await sealJson(key, { type: open.type, size: open.size, sha256: open.sha256 }, `photos|${String(ph.ref)}|meta`, 1),
        _bytes: await sealBytes(key, bytes, `photos|${String(ph.ref)}|bytes`, 1),
      });
    }
    pdb.close();
  }

  it('v1 data stays readable after unlock, is re-sealed as v2 with identical content, then v1 is refused', async () => {
    const db = await seeded();
    const p = await savePhoto(db, clock, actor, 'pt-02', new Blob([new Uint8Array([137, 80, 78, 71, 7, 7])], { type: 'image/png' }));
    const before = JSON.stringify(await db.patient.orderBy('id').toArray());
    await downgradeToV1(db);
    const c1 = await rawFormatCounts(db);
    expect(c1.legacy).toBeGreaterThan(400);

    // restart -> locked -> unlock: v1 accepted while it exists
    db.close();
    clearVaultMode(db.name);
    const again = new DowntimeDB('practice', db.name);
    dbs.push(again);
    setVaultMode(again.name, { mode: 'pending' });
    await again.open();
    expect(await detectVault(again)).toBe('locked');
    await unlockVault(again, { passphrase: PUBLIC_PRACTICE_PASSPHRASE });
    expect(JSON.stringify(await again.patient.orderBy('id').toArray())).toBe(before);
    const oldRow = (await raw(again, (r) => r.table('patient').get('pt-01'))) as Row;
    expect(isLegacyRow(oldRow)).toBe(true);

    const r = await resealLegacyRows(again, { clock, deviceId: 'dev-01' });
    expect(r.rows).toBe(c1.legacy);
    expect(r.photos).toBe(1);
    expect((await rawFormatCounts(again)).legacy).toBe(0);
    expect(JSON.stringify(await again.patient.orderBy('id').toArray())).toBe(before);
    expect(await verifyPhoto((await getPhoto(again, p.ref))!)).toBe(true);
    expect((await again.audit_log.orderBy('seq').last())?.action).toBe('vault_format_upgraded');
    expect((await verifyChain(await again.audit_log.toArray())).ok).toBe(true);

    // an old v1 copy put back afterwards (rollback attempt) is refused
    await raw(again, (rr) => rr.table('patient').put(oldRow));
    await expect(again.patient.toArray()).rejects.toBeInstanceOf(IntegrityError);
  });

  it('nothing to upgrade: the pass changes nothing and writes no audit row', async () => {
    const db = await seeded();
    const n = await db.audit_log.count();
    expect(await resealLegacyRows(db, { clock, deviceId: 'dev-01' })).toEqual({ rows: 0, photos: 0 });
    expect(await db.audit_log.count()).toBe(n);
  });
});
