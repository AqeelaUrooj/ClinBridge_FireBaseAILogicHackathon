// Prints the HL7 validator result (OperationOutcome JSON) in a readable form for the CI log.
// Usage: node scripts/fhir-summary.mjs fhir-validation.json
import { readFileSync } from 'node:fs';

const r = JSON.parse(readFileSync(process.argv[2] || 'fhir-validation.json', 'utf8'));
const issues = (r.issue || []).concat(...(r.entry || []).map((e) => e.resource?.issue || []));

const where = (i) => (i.expression || i.location || [''])[0];
const text = (i) => i.details?.text || i.diagnostics || '';
// Collapse entry indexes and quoted values so repeated warnings group together.
const norm = (s) => s.replace(/\[\d+\]/g, '[n]').replace(/'[^']*'/g, "'…'");

const counts = {};
for (const i of issues) counts[i.severity] = (counts[i.severity] || 0) + 1;
console.log('ISSUE COUNTS', JSON.stringify(counts));

for (const sev of ['fatal', 'error']) {
  const list = issues.filter((i) => i.severity === sev);
  if (!list.length) continue;
  console.log(`\n=== ${sev.toUpperCase()} (${list.length}) ===`);
  for (const i of list) console.log(`- ${where(i)} :: ${text(i)}`);
}

for (const sev of ['warning', 'information']) {
  const groups = new Map();
  for (const i of issues.filter((x) => x.severity === sev)) {
    const k = `${norm(where(i))} :: ${norm(text(i))}`;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  if (!groups.size) continue;
  console.log(`\n=== ${sev.toUpperCase()} (grouped, top 40) ===`);
  [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, n]) => console.log(`${String(n).padStart(4)}  ${k}`));
}
