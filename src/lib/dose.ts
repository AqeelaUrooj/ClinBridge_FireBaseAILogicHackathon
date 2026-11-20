/**
 * Dose display per the Joint Commission "Do Not Use" list:
 * no trailing zero (5 mg, never 5.0 mg) and always a leading zero (0.5 mg, never .5 mg).
 * Lab results are NOT formatted with this: they keep their reported precision.
 */
export function formatDose(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  // Number → string drops trailing zeros and keeps the leading zero; round away float noise.
  return String(Number(n.toPrecision(12)));
}
