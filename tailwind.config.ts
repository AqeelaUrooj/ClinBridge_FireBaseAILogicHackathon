import type { Config } from 'tailwindcss';
import stitch from './tailwind.stitch.json';

// Design tokens are copied verbatim from the Google Stitch v3 export
// (ward_board_my_patients_minimal_with_expandable_cards/code.html) plus the
// semantic clinical colours named in clinical_high_reliability_downtime_interface/DESIGN.md.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: stitch as Config['theme'] },
  plugins: [],
} satisfies Config;
