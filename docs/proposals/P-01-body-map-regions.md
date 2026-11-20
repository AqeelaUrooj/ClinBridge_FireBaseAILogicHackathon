# P-01 — Body map regions: 21 vs 24

Status: **first functional model chosen: UI/UX 21 regions** (owner decision, 20 Nov 2026). Built at `/patients/:id/body`. **Not final**: region ids are drafts until the final model is approved.

## Where each list comes from

| Source | Count | Where |
|---|---|---|
| **A. Stitch v3** | 24 (12 front, 12 back), codes `REG_*` | `downtimekit_v2_frontend_handoff_architecture_spec.md` |
| **B. UI/UX doc, section 19 master prompt** | Says "24" but lists **21** | UI/UX Design Proposal, BODY MAP line |
| (B2. UI/UX doc, section 18.2) | Says "24", lists 19–21 depending on whether buttocks/heels count once or per side | Same doc |

So there is no single list of 24 that both sources agree on. The only concrete 24-item list is Stitch's (A).

## List A — Stitch (24)

Front: `REG_HEAD_ANT`, `REG_NECK_ANT`, `REG_CHEST_R`, `REG_CHEST_L`, `REG_ABDOMEN_UR`, `REG_ABDOMEN_UL`, `REG_ABDOMEN_LL`, `REG_ABDOMEN_LR`, `REG_ARM_R_ANT`, `REG_ARM_L_ANT`, `REG_LEG_R_ANT`, `REG_LEG_L_ANT`.
Back: `REG_OCCIPUT`, `REG_CERVICAL_SPINE`, `REG_THORACIC_POST_R`, `REG_THORACIC_POST_L`, `REG_LUMBAR_SPINE`, `REG_SACRUM_GLUTE_R`, `REG_SACRUM_GLUTE_L`, `REG_ARM_R_POST`, `REG_ARM_L_POST`, `REG_LEG_R_POST`, `REG_LEG_L_POST`, `REG_PERINEUM`.

## List B — UI/UX (21)

Head, Chest, Abdomen left, Abdomen right, Upper back, Lower back, Buttocks, and Left/Right: upper arm, forearm, hand, thigh, lower leg, foot, heel (7 × 2 = 14).

## Exact differences

| Body part | A — Stitch (24) | B — UI/UX (21) | Difference |
|---|---|---|---|
| Head | Front head + back of head (occiput) | Head | A splits front/back |
| Neck | Front neck + cervical spine (back of neck) | — | **Only in A** |
| Chest | Right chest + left chest | Chest | A splits by side |
| Belly | 4 quadrants: right upper, left upper, left lower, right lower | Abdomen left, Abdomen right | A has quadrants, B has halves |
| Upper back | Right + left (shoulder blade area) | Upper back | A splits by side |
| Lower back | Lumbar spine and flanks | Lower back | Same |
| Buttocks | Right + left (sacrum/gluteal) | Buttocks | A splits by side |
| Perineum | Perineum and coccyx (tailbone) | — | **Only in A** |
| Arms | Whole arm front + whole arm back, each side (4) | Upper arm, forearm, hand, each side (6) | **B has forearm and hand; A does not** |
| Legs | Whole leg front + whole leg back (calf/heel), each side (4) | Thigh, lower leg, foot, heel, each side (8) | **B has foot and heel as their own areas; A puts heel inside "leg back" and has no foot** |

## How the synthetic seed sites fit

| Seed text (`med_admin.site` / note) | A — Stitch | B — UI/UX |
|---|---|---|
| Abdomen, left side | `REG_ABDOMEN_UL` **or** `REG_ABDOMEN_LL` — cannot tell which | Abdomen left ✔ |
| Abdomen, right side | `REG_ABDOMEN_UR` **or** `REG_ABDOMEN_LR` — cannot tell | Abdomen right ✔ |
| Left / Right forearm IV line | `REG_ARM_L_ANT` / `REG_ARM_R_ANT` (less exact) | Left / Right forearm ✔ |
| Left / Right hand IV line | `REG_ARM_L_ANT` / `REG_ARM_R_ANT` (less exact) | Left / Right hand ✔ |
| "Heels red" (Tom Hale note) | `REG_LEG_L_POST` + `REG_LEG_R_POST` (less exact) | Left + Right heel ✔ |

## Left and right

All labels use the **patient's** left and right. On the front view the patient's left side is on the viewer's right; on the back view it is on the viewer's left. Each view will show small "Patient's R / Patient's L" markers so nobody has to work it out.

## Artwork

Stitch supplied two hand-drawn SVG figures (front and back, `viewBox 0 0 200 420`) in `interactive_patient_body_map_lena_ortiz/code.html`. They will be used **unchanged**. They contain no tap areas, so tap areas will be a separate transparent layer on top. The Stitch photos (remote images of skin and IV dressings) will not be used (decision D-12).

## Decision needed

Pick one:
1. **List A (Stitch 24)** as-is. Seed sites map less exactly (belly halves and forearm/hand/heel lose detail). Belly halves would need a rule, which is a clinical decision.
2. **List B (UI/UX 21)** as-is. All seed sites map exactly. No neck, perineum, or left/right split for chest, back and buttocks.
3. A list you or a clinical reviewer write. I will not combine the two lists myself, because that would create new regions.

---

## Decision log (20 Nov 2026)

- First functional implementation uses the **21 regions listed in the UI/UX document** (`src/features/body/regions.ts`).
- The two lists were **not merged**.
- Region ids are drafts and are **not stored** anywhere yet (`note.body_site` waits, see P-03).

## The three-region discrepancy

The UI/UX document says "24 tappable regions" but its own list has **21**. Three regions are missing and the document does not name them. We did not guess which three. Possible sources (for the reviewer, not implemented):

- The Stitch list has neck, perineum, and front/back splits that the UI/UX list lacks.
- Section 18.2 lists "buttocks" and "heels" as single words. If each were split left/right, that alone would not make 24.

## Mapping table: limitations of both approaches

| Needed for | UI/UX 21 (built) | Stitch 24 | Limitation |
|---|---|---|---|
| Insulin sites "Abdomen, left/right side" | Exact (ABDOMEN_LEFT/RIGHT) | Ambiguous: upper or lower quarter | Stitch would need a rule (clinical decision) |
| Forearm / hand IV lines | Exact (LEFT/RIGHT_FOREARM, _HAND) | Whole arm only | Stitch loses detail |
| Heels (pressure sores) | Exact (LEFT/RIGHT_HEEL) | Inside "leg, back" | Stitch loses detail |
| Feet | Exact (LEFT/RIGHT_FOOT) | None | Stitch missing |
| Neck (e.g. central line, neck skin) | **None** | NECK_ANT, CERVICAL_SPINE | UI/UX missing |
| Groin / perineum / tailbone (pressure, catheters) | **None** | PERINEUM | UI/UX missing |
| Hips / front of pelvis | **None** (front view between belly and thigh) | None | Missing in both |
| Back of arms and legs | Not separate (limbs are front-view only) | ARM/LEG _POST | UI/UX cannot mark back of limb |
| Chest, upper back, buttocks by side | One region each | Left/right split | UI/UX cannot say which side |
| Back of head | Same region as head | OCCIPUT | UI/UX cannot separate |
| Belly quarters (e.g. stoma lower left) | Halves only | 4 quarters | UI/UX coarser |

Built behaviour for anything not on the map: the site text is listed as "Site not on the map" and is never forced into a region.

## Artwork: what was kept and what was changed

Kept: both Stitch figures (front, back) with all shapes, gradients, muscle lines, landmark guides and the ground shadow. The files are `src/features/body/art/front.svg` and `back.svg`, bundled so they work offline.

Changed (minimal, for correctness):
1. **Removed the 4 quadrant text labels** (LUQ/RUQ/LLQ/RLQ). The artwork put "LUQ" and "LLQ" on the viewer's left. In a front view that is the **patient's right**, so the labels were mirrored. The same file's own leg comments say viewer's left = patient's right. The dashed quarter boxes are kept.
2. **Neutralised two baked-in highlights** (one belly box and one thigh box were filled green as "selected" for the Lena Ortiz mock). They now use the same colour as their neighbours, so the picture doesn't show a fake selection on every patient.
3. The back view had no gradient definitions of its own (it borrowed the front view's). A copy was added with renamed ids, so it looks the same when shown alone.

Tap areas are a separate transparent layer drawn on top; each is keyboard reachable. "Patient's R / Patient's L" labels sit above each view.
