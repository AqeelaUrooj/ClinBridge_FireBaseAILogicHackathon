# Medical illustrations and body map artwork

## Body map (`src/features/body/`)

- `anatomy.ts`: **original vector anatomy drawn for ClinBridge** in the Theme 2 style (warm ivory skin, soft slate-blue outline and detail lines). Front and back figures in anatomical position (palms forward, thumbs out), 240 × 560 coordinate box. Pure SVG, sharp at any size, bundled in the app (works offline).
- `regions.ts`: the 21 UI/UX regions (ids unchanged). Each region is a band clipped to a body part of the same SVG, so the tap areas can never drift away from the drawing.
- `BodyFigure.tsx`: four layers in one SVG. 1) artwork, 2) interactive regions, 3) markers from records, 4) labels.
- `art/front.svg`, `art/back.svg`: the earlier Stitch figures, **kept for reference, no longer used**.

Why not cut the figures out of the reference sheet: in the Theme 2 figures the chest and head are painted dark as a sample selection, callout lines run into the body, and each figure is only about 330 × 600 px. Removing those would mean repainting the image.

## Icons (`src/assets/medical/`)

Cut from the supplied reference sheet (Theme 2 column) with `scripts/extract_icons.py`, with a transparent background, square and 57–200 px. WebP, 1.3–8 KB each, about 80 KB in total. Registry and component: `src/components/MedIllustration.tsx`.

| Folder | Files |
|---|---|
| medication | capsule, syringe, iv-bag, vial, tube, oral-liquid |
| vitals | heart, lungs, thermometer, bp-monitor, pulse-oximeter, glucose-meter |
| workflows | checklist, paper-photo, handover, bell, bell-alert, bell-ok, warning, offline-alert, device |

Not used, on purpose:
- The sheet's **"Tablet"**: it is drawn as a tablet computer, not a pill.
- The sheet's **"Inhaler"**: it is drawn as a cream tube, so it is used only as `medication/tube` (cream or ointment). There is no inhaler picture.

Rules in the app:
- Next to a text label a picture is decorative (empty `alt`, hidden from screen readers). It never replaces the label.
- Medicine pictures follow the **route** (by mouth → capsule, into a vein → vial, drip → IV bag, under the skin / into muscle → syringe, on the skin → tube). The order does not say tablet or liquid, so the picture is not a statement about the drug's form.
- A vital-sign picture never stands for a measurement; the number and label do.
- All files are bundled and precached by the service worker; a browser test checks they load with the network off.

Licence note: the reference sheet was supplied by the project owner as an AI-generated image for this project. On 22 Nov 2026 the owner confirmed that she generated it herself with an AI tool whose terms allow use and redistribution of the output, with no copyrighted images as input, and that the Stitch design export (colour tokens, `art/*.svg`) is her own work made in her own Google account. Both are distributed under the project's Apache-2.0 licence (`NOTICE`).

## Landing-page photography

The bedside workstation, tablet, and shift-handover photographs in `src/features/landing/assets` are original OpenAI ImageGen illustrations of fictional people and settings. The work used the project-owned Stitch layout as a composition reference, and the bundled JPEGs have no third-party photo dependency. The dashboard is static React markup with illustrative Practice values and the project's existing anatomy artwork. The gallery uses cropped screenshots from fictional Practice workflows.

## Synthetic handwritten reports

Drawn by the program when they are opened (`src/features/reports`, `src/lib/handwriting`). There are no report picture files per patient. The four designs follow the layout of reference sheets the project owner supplied; the reference pictures themselves are not in the repository and no name, value or logo was taken from them. Handwriting fonts: see `NOTICE`. `src/features/landing/assets/report.jpg` is a crop of such a report without name or MRN, with the synthetic label; it replaces `paper.png` (a strip of three buttons). Device vs Cloud draws the same sheets as its picture input; no picture file is stored for it.
