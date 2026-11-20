# P-01 — Body map regions: 21 vs 24

Status: **waiting for decision**. Nothing built yet.

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
