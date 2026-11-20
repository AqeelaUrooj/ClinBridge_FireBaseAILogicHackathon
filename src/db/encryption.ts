import type { DBCore, DBCoreCursor, DBCoreTable, DBCoreTransaction, Middleware } from 'dexie';
import { isSealed, openJson, sealJson, type Sealed } from '../lib/vaultCrypto';
import { canonicalJson } from './audit';

/**
 * Transparent per-row encryption for the clinical databases (P-04).
 *
 * Sits at Dexie middleware level -2, i.e. closest to IndexedDB, so everything above it (live queries,
 * Dexie's cache) only sees plain values in memory, and only plain values exist while the vault is unlocked.
 *
 * Stored form of a row: its INDEX fields stay plain (needed for lookups) + `_enc` = AES-256-GCM of all other
 * fields. Format v2 binds EVERY plain index field into the GCM associated data:
 *     "cb2|<table>|" + canonical JSON of { <each index field>: value or null }
 * so changing any plain index value (MRN, patient_id, care_time, status, seq, ...) without the key, or copying a
 * ciphertext onto another row, makes decryption fail (IntegrityError). Legitimate changes go through the app,
 * which re-seals the row with the new values. Format v1 (associated data "<table>|<primary key>") is read only
 * while a database still has v1 rows; resealLegacyRows() upgrades them after unlock.
 * `key_store` is never encrypted (it holds only wrapped keys).
 *
 * WebCrypto is async; awaiting it inside an IndexedDB transaction would let the transaction auto-commit.
 * keepAlive() keeps the request's own IDBTransaction busy with tiny reads while the crypto runs, and hands the
 * result back from inside an IndexedDB success callback, where the transaction is active again. (Dexie.waitFor
 * does the same through Dexie's zone, but that zone is not reliable inside middleware in real Chrome: queries hung.)
 *
 * Modes per database (fail closed in the app):
 *   pending    database opened by the app, vault state not known yet -> any encrypted-table access throws
 *   locked     vault exists, no key in memory -> any encrypted-table access throws VaultLockedError
 *   unlocked   writes are encrypted; reads decrypt. Plain rows are accepted only while `allowPlain`
 *              (migration in progress); afterwards a plain row is treated as tampering.
 *   plain      Real records that existed before encryption and are not migrated (needs approval) -> pass-through
 * A database the app never registered (unit tests that build their own) behaves as `plain`.
 */

export type VaultMode =
  | { mode: 'pending' }
  | { mode: 'locked' }
  | { mode: 'unlocked'; key: CryptoKey; allowPlain: boolean; allowLegacy?: boolean }
  | { mode: 'plain' };

export class VaultLockedError extends Error {
  constructor(message = 'The records on this laptop are locked. Unlock with the unit passphrase.') {
    super(message);
    this.name = 'VaultLockedError';
  }
}

export class IntegrityError extends Error {
  constructor(table: string, message?: string) {
    super(message ?? `A record in "${table}" is not in the current protected format although this laptop's records are. It may have been changed outside ClinBridge. Tell IT.`);
    this.name = 'IntegrityError';
  }
}

const modes = new Map<string, VaultMode>();

export const setVaultMode = (dbName: string, m: VaultMode) => modes.set(dbName, m);
export const getVaultMode = (dbName: string): VaultMode | undefined => modes.get(dbName);
export const clearVaultMode = (dbName: string) => modes.delete(dbName);

/** The working key for a database, or a VaultLockedError. Used by stores outside the middleware (photos). */
export function requireKey(dbName: string): CryptoKey | null {
  const m = modes.get(dbName);
  if (!m || m.mode === 'plain') return null;
  if (m.mode !== 'unlocked') throw new VaultLockedError();
  return m.key;
}

export const PLAIN_TABLES = new Set(['key_store']);

/** Field names that an index needs, from a Dexie store spec like "id, patient_id, [device_id+counter]". */
export function indexFieldsFromSpec(spec: string): string[] {
  const out = new Set<string>();
  for (const raw of spec.split(',')) {
    const part = raw.trim().replace(/^[&*]|^\+\+/g, '');
    if (!part) continue;
    if (part.startsWith('[')) part.slice(1, -1).split('+').forEach((p) => out.add(p.trim()));
    else out.add(part);
  }
  return [...out];
}

const aadV1 = (table: string, pk: unknown) => `${table}|${JSON.stringify(pk)}`;
export function aadV2(table: string, indexFields: string[], row: Row): string {
  const idx: Row = {};
  for (const f of indexFields) idx[f] = row[f] ?? null;
  return `cb2|${table}|${canonicalJson(idx)}`;
}
/**
 * Run `p` while keeping `trans` alive; settle from inside an IDB success callback. If the transaction is
 * already inactive (nothing more will be done in it), settle normally.
 */
export function keepAlive<T>(trans: DBCoreTransaction | undefined, p: Promise<T>): Promise<T> {
  const idb = trans as unknown as IDBTransaction | undefined;
  if (!idb || typeof idb.objectStore !== 'function' || !idb.objectStoreNames?.length) return p;
  return new Promise<T>((resolve, reject) => {
    let done = false;
    let ok = false;
    let value: T;
    let error: unknown;
    p.then((v) => { done = true; ok = true; value = v; }, (e) => { done = true; error = e; });
    let store: IDBObjectStore;
    try {
      store = idb.objectStore(idb.objectStoreNames[0]!);
    } catch {
      p.then(resolve, reject);
      return;
    }
    const spin = () => {
      if (done) {
        if (ok) resolve(value);
        else reject(error);
        return;
      }
      try {
        const r = store.get(-Infinity);
        r.onsuccess = spin;
        r.onerror = spin;
      } catch {
        p.then(resolve, reject); // transaction finished: no further requests depend on it
      }
    };
    spin();
  });
}

type Row = Record<string, unknown>;

export function isEncryptedRow(v: unknown): boolean {
  return !!v && typeof v === 'object' && isSealed((v as Row)._enc);
}

export async function encryptRow(key: CryptoKey, table: string, indexFields: string[], row: Row): Promise<Row> {
  if (isEncryptedRow(row)) return row; // already sealed (e.g. a raw copy being restored)
  const plain: Row = {};
  const secret: Row = {};
  for (const [k, v] of Object.entries(row)) (indexFields.includes(k) ? plain : secret)[k] = v;
  plain._enc = await sealJson(key, secret, aadV2(table, indexFields, plain), 2);
  return plain;
}

export async function decryptRow(key: CryptoKey, table: string, indexFields: string[], row: Row): Promise<Row> {
  const { _enc, ...plain } = row;
  const sealed = _enc as Sealed;
  const aad = sealed.v === 2 ? aadV2(table, indexFields, plain) : aadV1(table, row[indexFields[0] ?? 'id']);
  let secret: Row;
  try {
    secret = await openJson<Row>(key, sealed, aad);
  } catch {
    throw new IntegrityError(table, `Record ${String(row[indexFields[0] ?? 'id'])} in "${table}" failed its integrity check: its stored values or lookup fields were changed outside ClinBridge, or it is damaged. Tell IT.`);
  }
  return { ...plain, ...secret };
}

export const isLegacyRow = (v: unknown): boolean => isEncryptedRow(v) && ((v as Row)._enc as Sealed).v === 1;

/**
 * Middleware for one database. `specs` = Dexie store spec per table (first field = primary key).
 * `dbName` keys the mode registry.
 */
export function encryptionMiddleware(dbName: string, specs: Record<string, string>): Middleware<DBCore> {
  const fields = Object.fromEntries(Object.entries(specs).map(([t, s]) => [t, indexFieldsFromSpec(s)]));
  return {
    stack: 'dbcore',
    name: 'ClinBridgeEncryption',
    level: -2,
    create: (down) => ({
      ...down,
      table: (name) => {
        const t = down.table(name);
        if (PLAIN_TABLES.has(name) || !fields[name]) return t;
        return wrapTable(t, name, fields[name], dbName);
      },
    }),
  };
}

function wrapTable(t: DBCoreTable, name: string, idx: string[], dbName: string): DBCoreTable {
  const mode = (): VaultMode => modes.get(dbName) ?? { mode: 'plain' };
  const keyOrThrow = (): CryptoKey | null => {
    const m = mode();
    if (m.mode === 'plain') return null;
    if (m.mode !== 'unlocked') throw new VaultLockedError();
    return m.key;
  };
  const dec = async (v: unknown): Promise<unknown> => {
    if (v === undefined || v === null) return v;
    if (!isEncryptedRow(v)) {
      const m = mode();
      if (m.mode === 'unlocked' && !m.allowPlain) throw new IntegrityError(name);
      if (m.mode === 'pending' || m.mode === 'locked') throw new VaultLockedError();
      return v;
    }
    const key = keyOrThrow();
    if (!key) throw new VaultLockedError();
    const m = mode();
    if (isLegacyRow(v) && !(m.mode === 'unlocked' && m.allowLegacy)) throw new IntegrityError(name);
    return decryptRow(key, name, idx, v as Row);
  };
  const decAll = (trans: DBCoreTransaction, vs: unknown[]) => keepAlive(trans, Promise.all(vs.map(dec)));

  return {
    ...t,
    mutate: async (req) => {
      if (req.type === 'add' || req.type === 'put') {
        const key = keyOrThrow();
        if (!key) return t.mutate(req);
        const values = await keepAlive(req.trans, Promise.all(req.values.map((v) => encryptRow(key, name, idx, v as Row))));
        return t.mutate({ ...req, values });
      }
      return t.mutate(req);
    },
    get: async (req) => {
      const v = await t.get(req);
      return v === undefined ? v : keepAlive(req.trans, dec(v));
    },
    getMany: async (req) => decAll(req.trans, await t.getMany(req)),
    query: async (req) => {
      const r = await t.query(req);
      if (!req.values) return r;
      return { ...r, result: await decAll(req.trans, r.result) };
    },
    openCursor: async (req) => {
      const c = await t.openCursor(req);
      if (!c || !req.values) return c;
      return wrapCursor(c, dec, req.trans);
    },
  };
}

function wrapCursor(c: DBCoreCursor, dec: (v: unknown) => Promise<unknown>, trans: DBCoreTransaction): DBCoreCursor {
  let current: unknown;
  // Native IDBCursor getters (key, primaryKey) throw "Illegal invocation" if called on another object, so every
  // property the wrapper exposes is read from the real cursor explicitly.
  return Object.create(c, {
    value: { get: () => current },
    key: { get: () => c.key },
    primaryKey: { get: () => c.primaryKey },
    done: { get: () => c.done },
    trans: { get: () => c.trans },
    continue: { value: (key?: unknown) => c.continue(key) },
    continuePrimaryKey: { value: (key: unknown, pk: unknown) => c.continuePrimaryKey(key, pk) },
    advance: { value: (n: number) => c.advance(n) },
    stop: { value: (v?: unknown) => c.stop(v) },
    fail: { value: (e: Error) => c.fail(e) },
    start: {
      value: (onNext: () => void) =>
        c.start(() => {
          keepAlive(trans, dec(c.value)).then(
            (v) => {
              current = v;
              onNext();
            },
            (e) => c.fail(e),
          );
        }),
    },
  }) as DBCoreCursor;
}
