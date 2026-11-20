import Dexie, { type DBCore, type DBCoreCursor, type DBCoreTable, type Middleware } from 'dexie';
import { isSealed, openJson, sealJson, type Sealed } from '../lib/vaultCrypto';

/**
 * Transparent per-row encryption for the clinical databases (P-04).
 *
 * Sits at Dexie middleware level -2, i.e. closest to IndexedDB, so everything above it (live queries,
 * Dexie's cache) only sees plain values in memory, and only plain values exist while the vault is unlocked.
 *
 * Stored form of a row: its INDEX fields stay plain (needed for lookups) + `_enc` = AES-256-GCM of all other
 * fields, with associated data "<table>|<primary key>" so a ciphertext copied onto another row fails.
 * `key_store` is never encrypted (it holds only wrapped keys).
 *
 * WebCrypto is async; awaiting it inside an IndexedDB transaction would let the transaction auto-commit,
 * so every crypto call here runs through Dexie.waitFor(), which keeps the transaction alive.
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
  | { mode: 'unlocked'; key: CryptoKey; allowPlain: boolean }
  | { mode: 'plain' };

export class VaultLockedError extends Error {
  constructor(message = 'The records on this laptop are locked. Unlock with the unit passphrase.') {
    super(message);
    this.name = 'VaultLockedError';
  }
}

export class IntegrityError extends Error {
  constructor(table: string) {
    super(`A record in "${table}" is not encrypted although this laptop's records are. It may have been changed outside ClinBridge. Tell IT.`);
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

const aadFor = (table: string, pk: unknown) => `${table}|${JSON.stringify(pk)}`;
const W = <T>(p: Promise<T>): Promise<T> => Dexie.waitFor(p, 60_000);

type Row = Record<string, unknown>;

export function isEncryptedRow(v: unknown): boolean {
  return !!v && typeof v === 'object' && isSealed((v as Row)._enc);
}

export async function encryptRow(key: CryptoKey, table: string, indexFields: string[], row: Row): Promise<Row> {
  if (isEncryptedRow(row)) return row; // already sealed (e.g. a raw copy being restored)
  const plain: Row = {};
  const secret: Row = {};
  for (const [k, v] of Object.entries(row)) (indexFields.includes(k) ? plain : secret)[k] = v;
  plain._enc = await sealJson(key, secret, aadFor(table, row[indexFields[0] ?? 'id']));
  return plain;
}

export async function decryptRow(key: CryptoKey, table: string, indexFields: string[], row: Row): Promise<Row> {
  const { _enc, ...plain } = row;
  const secret = await openJson<Row>(key, _enc as Sealed, aadFor(table, row[indexFields[0] ?? 'id']));
  return { ...plain, ...secret };
}

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
    return decryptRow(key, name, idx, v as Row);
  };
  const decAll = (vs: unknown[]) => W(Promise.all(vs.map(dec)));

  return {
    ...t,
    mutate: async (req) => {
      if (req.type === 'add' || req.type === 'put') {
        const key = keyOrThrow();
        if (!key) return t.mutate(req);
        const values = await W(Promise.all(req.values.map((v) => encryptRow(key, name, idx, v as Row))));
        return t.mutate({ ...req, values });
      }
      return t.mutate(req);
    },
    get: async (req) => {
      const v = await t.get(req);
      return v === undefined ? v : W(dec(v));
    },
    getMany: async (req) => decAll(await t.getMany(req)),
    query: async (req) => {
      const r = await t.query(req);
      if (!req.values) return r;
      return { ...r, result: await decAll(r.result) };
    },
    openCursor: async (req) => {
      const c = await t.openCursor(req);
      if (!c || !req.values) return c;
      return wrapCursor(c, dec);
    },
  };
}

function wrapCursor(c: DBCoreCursor, dec: (v: unknown) => Promise<unknown>): DBCoreCursor {
  let current: unknown;
  return Object.create(c, {
    value: { get: () => current },
    start: {
      value: (onNext: () => void) =>
        c.start(() => {
          W(dec(c.value)).then(
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
