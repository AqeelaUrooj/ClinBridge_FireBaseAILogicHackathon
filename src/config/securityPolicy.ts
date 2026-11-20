/**
 * Security settings for encryption at rest (P-04). PROTOTYPE values: hospital IT/security must review and
 * set these before any real clinical use. Shown as "Not approved" on More -> Clinical settings.
 */
export const SECURITY_POLICY = {
  approved: false,
  /** Lock the encrypted records (needs the unit passphrase again) after this long without use. */
  vaultIdleLockMinutes: 60,
  /** PBKDF2 iterations for the unit passphrase and backup passphrase (OWASP 2023 guidance for PBKDF2-HMAC-SHA256). */
  pbkdf2Iterations: 600_000,
} as const;

/**
 * PUBLIC practice secrets (decision C1). These protect ONLY the synthetic Practice dataset and give it
 * NO confidentiality: they are printed on the unlock screen and in the docs on purpose, so the real
 * encryption code path runs every day on fake data. Real records refuse both values.
 */
export const PUBLIC_PRACTICE_PASSPHRASE = 'practice only fake patients';
export const PUBLIC_PRACTICE_RECOVERY_CODE = 'PRAC-TXCE-FAKE-DATA-NLYX-2222-3333-4444';
