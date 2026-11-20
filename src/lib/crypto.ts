/**
 * PIN hashing with PBKDF2-SHA256 (WebCrypto). Format: pbkdf2$<iterations>$<saltHex>$<hashHex>
 * A 4-digit PIN has only 10,000 combinations, so this slows guessing but cannot make it strong.
 * Real protection comes from device control, auto-lock and the 5-try lockout. See KNOWN_LIMITATIONS.md.
 */
const ITERATIONS = 150_000;

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return hex(new Uint8Array(bits));
}

export async function hashPin(pin: string, iterations = ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${hex(salt)}$${await derive(pin, salt, iterations)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [alg, it, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2' || !it || !salt || !hash) return false;
  const got = await derive(pin, unhex(salt), Number(it));
  // constant-time-ish compare
  let diff = got.length ^ hash.length;
  for (let i = 0; i < Math.min(got.length, hash.length); i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
