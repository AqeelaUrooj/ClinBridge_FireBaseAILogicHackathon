import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auditGroup, auditLabel } from './auditLabels';

describe('change-log words', () => {
  it('every action in the practice log has plain words', () => {
    const seed = JSON.parse(readFileSync('src/data/downtimekit-seed.json', 'utf8')) as { audit_log: { action: string }[] };
    for (const a of new Set(seed.audit_log.map((r) => r.action))) expect(auditLabel(a), a).not.toBe(a);
  });
  it('every action the app can write has plain words', () => {
    const files = [...readdirSync('src/db').map((f) => `src/db/${f}`), ...readdirSync('src/db/repos').map((f) => `src/db/repos/${f}`)].filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    const actions = [...text.matchAll(/(?:action: |push\(|, )'((?:entry|entered|staff|snapshot|downtime|network|vault|backup|worklist|handoff|photo|fhir|schema|plain|credential|enrollment|first_time|practice_drill)_[a-z_]+)'/g)].map((m) => m[1]!).filter((a) => !['snapshot_result', 'downtime_event', 'worklist_item', 'entry_id'].includes(a)); // table and field names
    expect(new Set(actions).size).toBeGreaterThan(15);
    for (const a of new Set(actions)) expect(auditLabel(a), a).not.toBe(a);
  });
  it('an unknown action is shown as stored, never hidden', () => {
    expect(auditLabel('something_new')).toBe('something_new');
    expect(auditGroup('something_new')).toBe('system');
    expect(auditGroup('entry_future')).toBe('records');
    expect(auditGroup('second_look_future')).toBe('second_look');
  });
});
