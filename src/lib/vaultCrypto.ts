/**
 * Encryption-at-rest primitives (P-04, decision A1 modified). WebCrypto only; nothing hand-rolled.
 *
 *  - Data key (DEK): AES-256-GCM, random. Created extractable only so it can be wrapped, then discarded;
 *    the key the app works with comes from unwrapKey(..., extractable = false).
 *  - Passphrase key: PBKDF2-HMAC-SHA-256 (default 600,000 iterations, random 16-byte salt) -> AES-KW-256.
 *  - Recovery secret: 160 random bits, shown once as 8 groups of 4 base-32 characters. High-entropy, so its
 *    wrapping key comes from HKDF-SHA-256 (random salt), not a slow KDF.
 *  - Records: AES-256-GCM, fresh random 96-bit nonce per encryption, associated data binds the ciphertext
 *    to where it belongs (e.g. table + primary key).
 *
 * Wrapped keys are stored as self-describing strings in the existing key_store fields (no schema change):
 *   wrapped_key_pin      = cb1$pbkdf2-sha256$<iterations>$<salt>$<wrapped DEK>   (holds the PASSPHRASE wrap)
 *   wrapped_key_recovery = cb1$hkdf-sha256$<salt>$<wrapped DEK>
 *
 * Limit: JavaScript cannot force the browser to wipe key material from memory; dropping references only
 * lets the garbage collector reclaim it later.
 */

export const PBKDF2_ITERATIONS = 600_000;
const FORMAT = 'cb1';
const HKDF_INFO = new TextEncoder().encode('clinbridge-recovery-v1');
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I/O/0/1 to avoid misreading
const RECOVERY_BYTES = 20; // 160 bits -> 32 base-32 characters

export class WrongSecretError extends Error {
  constructor(message = 'That passphrase or recovery key is not right.') {
    super(message);
    this.name = 'WrongSecretError';
  }
}

export class DecryptError extends Error {
  constructor(message = 'Stored data could not be decrypted. It may have been changed or damaged.') {
    super(message);
    this.name = 'DecryptError';
  }
}

/* ---------- encoding helpers ---------- */

export function toB64u(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** Copy into a fresh ArrayBuffer-backed view (satisfies WebCrypto's BufferSource typing). */
const buf = (u: Uint8Array): Uint8Array => new Uint8Array(u);

/* ---------- recovery secret ---------- */

export function encodeRecovery(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += RECOVERY_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += RECOVERY_ALPHABET[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join('-');
}

/** Parse what a person typed: case, spaces and dashes are ignored. Throws on characters not in the alphabet. */
export function decodeRecovery(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s-]/g, '');
  if (clean.length !== Math.ceil((RECOVERY_BYTES * 8) / 5)) throw new WrongSecretError('A recovery key has 32 characters (8 groups of 4).');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = RECOVERY_ALPHABET.indexOf(ch);
    if (v < 0) throw new WrongSecretError(`"${ch}" is not used in recovery keys. Check the written copy.`);
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out.slice(0, RECOVERY_BYTES));
}

export const newRecoveryCode = () => encodeRecovery(randomBytes(RECOVERY_BYTES));

/* ---------- passphrase rules (guidance, not a guarantee) ---------- */

const COMMON = ['password', 'passphrase', 'letmein', 'welcome', 'hospital', 'nurse', 'downtime', 'clinbridge', 'qwerty', 'admin', 'changeme', 'iloveyou', 'abc123'];

export interface StrengthResult {
  ok: boolean;
  problems: string[];
}

export function checkPassphrase(p: string): StrengthResult {
  const problems: string[] = [];
  const s = p.normalize('NFC');
  if (s.length < 12) problems.push('Use at least 12 characters. Four or more random words work well.');
  if (/^(.)\1+$/.test(s)) problems.push('Do not repeat one character.');
  const lower = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (COMMON.some((w) => lower === w || lower === w + '123' || lower.replace(/\d+$/, '') === w)) problems.push('This is a common password. Pick random words.');
  if (/0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf/.test(lower) && lower.length <= 16) problems.push('Avoid simple sequences like 1234 or abcd.');
  const words = s.split(/[\s-]+/).filter((w) => w.length >= 2);
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(s)).length;
  if (words.length < 3 && classes < 3) problems.push('Use 3 or more words with spaces or dashes, or mix 3 of: lower case, upper case, numbers, symbols.');
  return { ok: problems.length === 0, problems };
}

/* ---------- key derivation ---------- */

async function kekFromPassphrase(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations }, base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

async function kekFromRecovery(secret: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', buf(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: HKDF_INFO }, base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

const DEK_ALG = { name: 'AES-GCM', length: 256 } as const;

async function unwrapWith(kek: CryptoKey, wrapped: Uint8Array, extractable: boolean): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey('raw', buf(wrapped), kek, 'AES-KW', DEK_ALG, extractable, ['encrypt', 'decrypt']);
  } catch {
    // AES-KW's integrity check fails for a wrong key-encryption key.
    throw new WrongSecretError();
  }
}

/* ---------- wrapped-key strings ---------- */

interface PassWrap { iterations: number; salt: Uint8Array; wrapped: Uint8Array }
interface RecWrap { salt: Uint8Array; wrapped: Uint8Array }

export function isVaultString(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.startsWith(`${FORMAT}$`);
}

function parsePassWrap(s: string): PassWrap {
  const [fmt, alg, it, salt, wrapped] = s.split('$');
  if (fmt !== FORMAT || alg !== 'pbkdf2-sha256' || !it || !salt || !wrapped) throw new Error('Unknown key format in key_store.');
  return { iterations: Number(it), salt: fromB64u(salt), wrapped: fromB64u(wrapped) };
}

function parseRecWrap(s: string): RecWrap {
  const [fmt, alg, salt, wrapped] = s.split('$');
  if (fmt !== FORMAT || alg !== 'hkdf-sha256' || !salt || !wrapped) throw new Error('Unknown recovery key format in key_store.');
  return { salt: fromB64u(salt), wrapped: fromB64u(wrapped) };
}

export interface WrappedKeys {
  wrapped_key_pin: string;
  wrapped_key_recovery: string;
}

async function wrapBoth(dek: CryptoKey, passphrase: string, recovery: Uint8Array, iterations: number): Promise<WrappedKeys> {
  const ps = randomBytes(16);
  const rs = randomBytes(16);
  const pw = await crypto.subtle.wrapKey('raw', dek, await kekFromPassphrase(passphrase, ps, iterations), 'AES-KW');
  const rw = await crypto.subtle.wrapKey('raw', dek, await kekFromRecovery(recovery, rs), 'AES-KW');
  return {
    wrapped_key_pin: `${FORMAT}$pbkdf2-sha256$${iterations}$${toB64u(ps)}$${toB64u(pw)}`,
    wrapped_key_recovery: `${FORMAT}$hkdf-sha256$${toB64u(rs)}$${toB64u(rw)}`,
  };
}

export interface NewVault {
  keys: WrappedKeys;
  /** Shown to people once; never stored. */
  recoveryCode: string;
  /** Non-extractable working key. */
  key: CryptoKey;
}

/**
 * Make a new data key and wrap it by the passphrase and by a recovery secret.
 * `recoveryCode` may be given only for the published Practice vault; real vaults always get a random one.
 */
export async function createVaultKeys(passphrase: string, opts: { recoveryCode?: string; iterations?: number } = {}): Promise<NewVault> {
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS;
  const recoveryCode = opts.recoveryCode ?? newRecoveryCode();
  const dek = await crypto.subtle.generateKey(DEK_ALG, true, ['encrypt', 'decrypt']);
  const keys = await wrapBoth(dek, passphrase, decodeRecovery(recoveryCode), iterations);
  // Re-obtain the working key as non-extractable; the extractable original goes out of scope here.
  const key = await unlockWithPassphrase(keys, passphrase);
  return { keys, recoveryCode, key };
}

export async function unlockWithPassphrase(keys: Pick<WrappedKeys, 'wrapped_key_pin'>, passphrase: string, extractable = false): Promise<CryptoKey> {
  const w = parsePassWrap(keys.wrapped_key_pin);
  return unwrapWith(await kekFromPassphrase(passphrase, w.salt, w.iterations), w.wrapped, extractable);
}

export async function unlockWithRecovery(keys: Pick<WrappedKeys, 'wrapped_key_recovery'>, recoveryCode: string, extractable = false): Promise<CryptoKey> {
  const w = parseRecWrap(keys.wrapped_key_recovery);
  return unwrapWith(await kekFromRecovery(decodeRecovery(recoveryCode), w.salt), w.wrapped, extractable);
}

/**
 * After a recovery: set a new passphrase AND issue a new recovery secret (the old one has been typed and
 * may have been seen). Same data key, so no record needs re-encrypting.
 */
export async function rewrapAfterRecovery(keys: WrappedKeys, recoveryCode: string, newPassphrase: string, opts: { iterations?: number; newRecoveryCode?: string } = {}): Promise<NewVault> {
  const dek = await unlockWithRecovery(keys, recoveryCode, true);
  const code = opts.newRecoveryCode ?? newRecoveryCode();
  const next = await wrapBoth(dek, newPassphrase, decodeRecovery(code), opts.iterations ?? parsePassWrap(keys.wrapped_key_pin).iterations);
  return { keys: next, recoveryCode: code, key: await unlockWithPassphrase(next, newPassphrase) };
}

/** Change the passphrase while knowing the current one. Recovery wrap is kept. */
export async function rewrapPassphrase(keys: WrappedKeys, current: string, next: string, iterations?: number): Promise<WrappedKeys> {
  const dek = await unlockWithPassphrase(keys, current, true);
  const ps = randomBytes(16);
  const it = iterations ?? parsePassWrap(keys.wrapped_key_pin).iterations;
  const pw = await crypto.subtle.wrapKey('raw', dek, await kekFromPassphrase(next, ps, it), 'AES-KW');
  return { wrapped_key_pin: `${FORMAT}$pbkdf2-sha256$${it}$${toB64u(ps)}$${toB64u(pw)}`, wrapped_key_recovery: keys.wrapped_key_recovery };
}

/* ---------- authenticated encryption ---------- */

export interface Sealed {
  v: 1;
  iv: Uint8Array;
  ct: ArrayBuffer;
}

export async function sealBytes(key: CryptoKey, data: Uint8Array, aad: string): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) }, key, buf(data));
  return { v: 1, iv, ct };
}

export async function openBytes(key: CryptoKey, s: Sealed, aad: string): Promise<Uint8Array> {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(s.iv), additionalData: new TextEncoder().encode(aad) }, key, s.ct);
    return new Uint8Array(pt);
  } catch {
    throw new DecryptError();
  }
}

export async function sealJson(key: CryptoKey, value: unknown, aad: string): Promise<Sealed> {
  return sealBytes(key, new TextEncoder().encode(JSON.stringify(value)), aad);
}

export async function openJson<T = unknown>(key: CryptoKey, s: Sealed, aad: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await openBytes(key, s, aad))) as T;
}

export function isSealed(v: unknown): v is Sealed {
  const s = v as Sealed | null;
  return !!s && typeof s === 'object' && s.v === 1 && ArrayBuffer.isView(s.iv) && !!s.ct && typeof (s.ct as ArrayBuffer).byteLength === 'number';
}

/* ---------- passphrase-only encryption (backup files) ---------- */

export async function keyFromPassphrase(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations }, base, DEK_ALG, false, ['encrypt', 'decrypt']);
}

export async function sha256(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return toB64u(await crypto.subtle.digest('SHA-256', buf(bytes)));
}
