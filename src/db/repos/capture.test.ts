import { beforeEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from '../db';
import { importPracticeSeed } from '../seed';
import { verifyChain } from '../audit';
import { confirmDraft, createEntry } from './entries';
import { getPhoto, savePhoto, verifyPhoto } from '../photos';
import { practiceClock } from '../../lib/time';

let db: DowntimeDB;
const clock = practiceClock();
const actor = { userId: 'pr-okafor', deviceId: 'dev-01' };
const vit = { temp_c: 36.8, heart_rate: 86, resp_rate: 20, bp_systolic: 146, bp_diastolic: 88, spo2: 93, o2_device: null, o2_flow_lpm: null, pain_0_10: 0, glucose_mgdl: null, consciousness: 'Alert', weight_kg: null, raw_text: null };

beforeEach(async () => { db = new DowntimeDB('practice', `cap-${crypto.randomUUID()}`); await importPracticeSeed(db); });

describe('paper capture', () => {
  it('saves the photo first with a hash and an audit row, then links it from the entry', async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' });
    const p = await savePhoto(db, clock, actor, 'pt-08', blob);
    expect(p.ref).toMatch(/^vault\/raw\/.+\.png$/);
    const stored = await getPhoto('practice', p.ref);
    expect(stored?.sha256).toBe(p.sha256);
    // Blob contents do not survive the IndexedDB emulator in jsdom; the real-browser test checks the hash.
    expect(await verifyPhoto({ ...stored!, blob })).toBe(true);
    const audits = await db.audit_log.orderBy('seq').toArray();
    expect(audits.at(-1)!.action).toBe('photo_saved');
    const e = await createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-08', careTime: clock.nowIso(), values: vit, rawInputKind: 'photo', rawInputRef: p.ref, photoCheck: { form_type: 'vitals', readable: false, problem: 'blurry', overridden: true }, status: 'draft' });
    expect(e.raw_input_ref).toBe(p.ref);
    expect(e.status).toBe('draft');
    expect(e.photo_check?.overridden).toBe(true);
  });
  it('rejects a file that is not a picture', async () => {
    await expect(savePhoto(db, clock, actor, 'pt-08', new Blob(['x'], { type: 'text/plain' }))).rejects.toThrow(/picture/);
  });
  it('confirms a draft with the nurse-checked values; proposal kept; only drafts; chain valid', async () => {
    const before = (await db.entry.get('e-048'))!;
    const done = await confirmDraft(db, clock, actor, 'e-048', 'vital_sign', { ...vit, heart_rate: 86 });
    expect(done.status).toBe('confirmed');
    expect(done.confirmed_by).toBe('pr-okafor');
    expect(done.ai_proposal).toEqual(before.ai_proposal);
    expect((await db.vital_sign.where('entry_id').equals('e-048').first())!.heart_rate).toBe(86);
    await expect(confirmDraft(db, clock, actor, 'e-048', 'vital_sign', vit)).rejects.toThrow(/draft/);
    expect((await verifyChain(await db.audit_log.orderBy('seq').toArray())).ok).toBe(true);
  });
  it('a high-alert draft still needs the second nurse to confirm', async () => {
    const m = (await db.med_admin.where('entry_id').equals('e-049').first())!;
    const values = { ...m } as Partial<typeof m>;
    delete values.id; delete values.entry_id;
    await expect(confirmDraft(db, clock, actor, 'e-049', 'med_admin', values as never)).rejects.toThrow(/second nurse/);
    const ok = await confirmDraft(db, clock, actor, 'e-049', 'med_admin', { ...values, double_checked: true, double_checked_by: 'pr-park' } as never);
    expect(ok.status).toBe('confirmed');
  });
});
