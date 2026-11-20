import { describe, expect, it } from 'vitest';
import {
  PBKDF2_ITERATIONS, WrongSecretError, DecryptError, checkPassphrase, createVaultKeys, decodeRecovery, encodeRecovery,
  newRecoveryCode, openBytes, openJson, rewrapAfterRecovery, rewrapPassphrase, sealBytes, sealJson, unlockWithPassphrase,
  unlockWithRecovery, fromB64u,
} from './vaultCrypto';

const FAST = 1000; // test-only iteration count; the default is checked separately
const PASS = 'violet harbour lantern seventeen';

describe('vault keys', () => {
  it('uses 600,000 PBKDF2 iterations by default and stores them in the wrapped string', async () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    const v = await createVaultKeys(PASS);
    expect(v.keys.wrapped_key_pin).toMatch(/^cb1\$pbkdf2-sha256\$600000\$[\w-]+\$[\w-]+$/);
    expect(v.keys.wrapped_key_recovery).toMatch(/^cb1\$hkdf-sha256\$[\w-]+\$[\w-]+$/);
  }, 20_000);

  it('working key is non-extractable; exportKey is refused', async () => {
    const v = await createVaultKeys(PASS, { iterations: FAST });
    expect(v.key.extractable).toBe(false);
    expect(v.key.usages.sort()).toEqual(['decrypt', 'encrypt']);
    await expect(crypto.subtle.exportKey('raw', v.key)).rejects.toThrow();
    const again = await unlockWithPassphrase(v.keys, PASS);
    expect(again.extractable).toBe(false);
  });

  it('wrapped strings hold no secret: no passphrase, no recovery code, no raw key', async () => {
    const v = await createVaultKeys(PASS, { iterations: FAST });
    const stored = JSON.stringify(v.keys);
    expect(stored).not.toContain(PASS);
    expect(stored).not.toContain(v.recoveryCode.replace(/-/g, ''));
    // AES-KW output for a 32-byte key is 40 bytes (key + 8-byte integrity block).
    expect(fromB64u(v.keys.wrapped_key_pin.split('$')[4]!).length).toBe(40);
  });

  it('two vaults from the same passphrase get different salts and different data keys', async () => {
    const a = await createVaultKeys(PASS, { iterations: FAST });
    const b = await createVaultKeys(PASS, { iterations: FAST });
    expect(a.keys.wrapped_key_pin).not.toBe(b.keys.wrapped_key_pin);
    const sealed = await sealJson(a.key, { x: 1 }, 't|1');
    await expect(openJson(b.key, sealed, 't|1')).rejects.toBeInstanceOf(DecryptError);
  });

  it('passphrase and recovery code both unlock the same data key', async () => {
    const v = await createVaultKeys(PASS, { iterations: FAST });
    const sealed = await sealJson(v.key, { pulse: 83 }, 'vital_sign|v-1');
    const viaPass = await unlockWithPassphrase(v.keys, PASS);
    const viaRec = await unlockWithRecovery(v.keys, v.recoveryCode);
    expect(await openJson(viaPass, sealed, 'vital_sign|v-1')).toEqual({ pulse: 83 });
    expect(await openJson(viaRec, sealed, 'vital_sign|v-1')).toEqual({ pulse: 83 });
  });

  it('wrong passphrase and wrong recovery code are refused with WrongSecretError', async () => {
    const v = await createVaultKeys(PASS, { iterations: FAST });
    await expect(unlockWithPassphrase(v.keys, PASS + 'x')).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlockWithPassphrase(v.keys, '')).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlockWithRecovery(v.keys, newRecoveryCode())).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlockWithRecovery(v.keys, 'not a code')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('a tampered wrapped key is refused', async () => {
    const v = await createVaultKeys(PASS, { iterations: FAST });
    const parts = v.keys.wrapped_key_pin.split('$');
    const w = fromB64u(parts[4]!);
    w[5] = w[5]! ^ 1;
    parts[4] = btoa(String.fromCharCode(...w)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await expect(unlockWithPassphrase({ wrapped_key_pin: parts.join('$') }, PASS)).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('recovery: new passphrase + new recovery code; old passphrase and old code stop working; data still readable', async () => {
    const v = await createVaultKeys(PASS, { iterations: FAST });
    const sealed = await sealJson(v.key, { a: 'b' }, 'x|1');
    const next = await rewrapAfterRecovery(v.keys, v.recoveryCode, 'copper meadow window ninety');
    expect(next.recoveryCode).not.toBe(v.recoveryCode);
    await expect(unlockWithPassphrase(next.keys, PASS)).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlockWithRecovery(next.keys, v.recoveryCode)).rejects.toBeInstanceOf(WrongSecretError);
    expect(await openJson(next.key, sealed, 'x|1')).toEqual({ a: 'b' });
    expect(await openJson(await unlockWithRecovery(next.keys, next.recoveryCode), sealed, 'x|1')).toEqual({ a: 'b' });
  });

  it('changing the passphrase keeps the recovery wrap and the data key', async () => {
    const v = await createVaultKeys(PASS, { iterations: FAST });
    const sealed = await sealJson(v.key, 1, 'x|1');
    const k2 = await rewrapPassphrase(v.keys, PASS, 'amber tunnel falcon forty');
    expect(k2.wrapped_key_recovery).toBe(v.keys.wrapped_key_recovery);
    await expect(unlockWithPassphrase(k2, PASS)).rejects.toBeInstanceOf(WrongSecretError);
    expect(await openJson(await unlockWithPassphrase(k2, 'amber tunnel falcon forty'), sealed, 'x|1')).toBe(1);
    await expect(rewrapPassphrase(v.keys, 'wrong one here', 'x')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('passphrase is compared after Unicode NFC normalisation', async () => {
    const v = await createVaultKeys('café crème brûlée morning', { iterations: FAST });
    const decomposed = 'café crème brûlée morning'.normalize('NFD');
    await expect(unlockWithPassphrase(v.keys, decomposed)).resolves.toBeTruthy();
  });
});

describe('authenticated encryption', () => {
  it('uses a fresh 96-bit nonce every time (1,000 encryptions, no repeat)', async () => {
    const { key } = await createVaultKeys(PASS, { iterations: FAST });
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const s = await sealBytes(key, new Uint8Array([1, 2, 3]), 'a');
      expect(s.iv.length).toBe(12);
      seen.add(Array.from(s.iv).join(','));
    }
    expect(seen.size).toBe(1000);
  });

  it('same plaintext twice gives different ciphertext', async () => {
    const { key } = await createVaultKeys(PASS, { iterations: FAST });
    const a = await sealJson(key, { pulse: 83 }, 'a');
    const b = await sealJson(key, { pulse: 83 }, 'a');
    expect(new Uint8Array(a.ct)).not.toEqual(new Uint8Array(b.ct));
  });

  it('detects a changed byte, a changed nonce, and data moved to another row (associated data)', async () => {
    const { key } = await createVaultKeys(PASS, { iterations: FAST });
    const s = await sealJson(key, { dose: 5 }, 'med_admin|m-1');
    const ct = new Uint8Array(s.ct.slice(0));
    ct[0] = ct[0]! ^ 1;
    await expect(openBytes(key, { ...s, ct: ct.buffer }, 'med_admin|m-1')).rejects.toBeInstanceOf(DecryptError);
    const iv = new Uint8Array(s.iv);
    iv[0] = iv[0]! ^ 1;
    await expect(openBytes(key, { ...s, iv }, 'med_admin|m-1')).rejects.toBeInstanceOf(DecryptError);
    await expect(openBytes(key, s, 'med_admin|m-2')).rejects.toBeInstanceOf(DecryptError);
    expect(await openJson(key, s, 'med_admin|m-1')).toEqual({ dose: 5 });
  });
});

describe('recovery code format', () => {
  it('is 32 characters in 8 groups of 4, from an alphabet without I, O, 0, 1', () => {
    const c = newRecoveryCode();
    expect(c).toMatch(/^([A-HJ-NP-Z2-9]{4}-){7}[A-HJ-NP-Z2-9]{4}$/);
  });

  it('round-trips and ignores case, spaces and dashes', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const c = encodeRecovery(bytes);
    expect(decodeRecovery(c)).toEqual(bytes);
    expect(decodeRecovery(c.toLowerCase().replace(/-/g, ' '))).toEqual(bytes);
  });

  it('rejects the wrong length and characters not in the alphabet', () => {
    expect(() => decodeRecovery('ABCD')).toThrow(WrongSecretError);
    expect(() => decodeRecovery('O'.repeat(32))).toThrow(/not used/);
  });
});

describe('passphrase guidance', () => {
  it.each([
    ['short', 'abc'],
    ['common', 'password1234'],
    ['repeated', 'aaaaaaaaaaaaaa'],
    ['sequence', 'abcd12345678'],
    ['one long word, one character type', 'lanternharbour'],
  ])('refuses %s', (_label, p) => {
    expect(checkPassphrase(p).ok).toBe(false);
  });

  it.each([['four words', 'violet harbour lantern seventeen'], ['mixed types', 'Tr4in-Station!9x']])('accepts %s', (_l, p) => {
    expect(checkPassphrase(p)).toEqual({ ok: true, problems: [] });
  });
});
