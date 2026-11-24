/**
 * True only in the public judge build (`npm run build:judge`): Practice and its fictional patients, nothing else.
 * Vite fixes the value at build time, so the first-time setup of Real records is not even in that build.
 * It is not a security boundary: the source is public and anyone can build the full app. It keeps visitors of the
 * public website away from entering real patients. See docs/JUDGE_DEMO_GUIDE.md.
 */
export const PUBLIC_DEMO = import.meta.env.MODE === 'judge';
