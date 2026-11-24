import caveat from '@fontsource/caveat/files/caveat-latin-400-normal.woff2?url';
import kalam from '@fontsource/kalam/files/kalam-latin-300-normal.woff2?url';
import nothing from '@fontsource/nothing-you-could-do/files/nothing-you-could-do-latin-400-normal.woff2?url';
import architect from '@fontsource/architects-daughter/files/architects-daughter-latin-400-normal.woff2?url';
import indie from '@fontsource/indie-flower/files/indie-flower-latin-400-normal.woff2?url';
import grace from '@fontsource/covered-by-your-grace/files/covered-by-your-grace-latin-400-normal.woff2?url';
import justMe from '@fontsource/just-me-again-down-here/files/just-me-again-down-here-latin-400-normal.woff2?url';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';

/**
 * Handwriting for the synthetic Practice reports. All fonts are bundled (SIL OFL 1.1, see NOTICE) and kept by the
 * service worker, so nothing is fetched from outside. They load only when a report is opened.
 */
interface Face { family: string; url: string; weight?: string; range?: string }

// Some signs in these fonts are easy to misread ("/" like "1", "IV" like "N"). Only their safe letters are used; all other signs
// come from Caveat. Numbers are always written in Caveat (hand.ts): in other hands a 4 can look like a 9 or a 7 like a 1.
const LETTERS = 'U+0041-005A, U+0061-007A, U+002C, U+002E, U+0027';
const SMALL = 'U+0061-007A, U+002C, U+002E';

const HAND: Face[] = [
  { family: 'CB Caveat', url: caveat },
  { family: 'CB Kalam', url: kalam },
  { family: 'CB Nothing', url: nothing, range: SMALL },
  { family: 'CB Architect', url: architect, range: LETTERS },
  { family: 'CB Indie', url: indie, range: LETTERS },
  { family: 'CB Grace', url: grace },
  { family: 'CB JustMe', url: justMe, range: 'U+0020-0045, U+0047-007E' }, // its F looks like f (metFORMIN)
];
/** The printed part of the sheet (Inter is already in the app; the picture file needs its own copy). */
const PRINTED: Face[] = [
  { family: 'Inter', url: inter400, weight: '400' },
  { family: 'Inter', url: inter700, weight: '700' },
];

/** A sign that a hand does not have comes from the second font. */
export const stack = (family: string) => `'${family}', 'CB Caveat', cursive`;

let loading: Promise<void> | undefined;
/** Resolves when the handwriting can be measured and drawn. A font that fails to load is an error, not a silent change of look. */
export function loadReportFonts(): Promise<void> {
  if (typeof FontFace === 'undefined') return Promise.resolve(); // unit tests
  loading ??= (async () => {
    const faces = HAND.map((f) => new FontFace(f.family, `url(${f.url})`, f.range ? { unicodeRange: f.range } : {}));
    await Promise.all([
      ...faces.map(async (face) => { await face.load(); document.fonts.add(face); }),
      document.fonts.load('400 16px Inter'), document.fonts.load('700 16px Inter'),
    ]);
  })();
  loading.catch(() => { loading = undefined; });
  return loading;
}

let css: Promise<string> | undefined;
/** The same fonts as text, for a picture file: a picture cannot use the page's fonts. Same-origin files only. */
export function reportFontCss(): Promise<string> {
  css ??= (async () => (await Promise.all([...HAND, ...PRINTED].map(async (f) => {
    const bytes = new Uint8Array(await (await fetch(f.url)).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `@font-face{font-family:'${f.family}';${f.weight ? `font-weight:${f.weight};` : ''}${f.range ? `unicode-range:${f.range};` : ''}src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`;
  }))).join('\n'))();
  css.catch(() => { css = undefined; });
  return css;
}
