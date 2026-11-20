"""Cut the Theme 2 (warm ivory & soft slate-blue) icons out of the supplied reference sheet.

Usage: python3 scripts/extract_icons.py <reference-sheet.jpg>
Writes transparent WebP files to src/assets/medical/{medication,vitals,workflows}/.
Left out on purpose: the sheet's "Tablet" (drawn as a tablet computer) and the body figures
(sample highlights and callout lines are painted into them). "Inhaler" is drawn as a tube and is
used only as medication/tube (cream or ointment).
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

M, F = (860, 780), (860, 1180)  # top-left of the Theme 2 medication/vitals and workflow sections
BOXES = {
    'medication/capsule': (M, 176, 26, 282, 136), 'medication/syringe': (M, 278, 8, 416, 148),
    'medication/iv-bag': (M, 428, 4, 512, 146), 'medication/vial': (M, 544, 14, 622, 146),
    'medication/tube': (M, 644, 10, 712, 146), 'medication/oral-liquid': (M, 729, 8, 812, 146),
    'vitals/heart': (M, 48, 184, 156, 330), 'vitals/lungs': (M, 166, 186, 310, 332),
    'vitals/thermometer': (M, 324, 192, 440, 305), 'vitals/bp-monitor': (M, 444, 188, 588, 306),
    'vitals/pulse-oximeter': (M, 592, 196, 698, 298), 'vitals/glucose-meter': (M, 724, 194, 810, 306),
    'workflows/checklist': (F, 38, 2, 192, 216), 'workflows/paper-photo': (F, 194, 18, 332, 190),
    'workflows/handover': (F, 344, 4, 438, 80), 'workflows/bell': (F, 476, 2, 550, 80),
    'workflows/bell-alert': (F, 592, 2, 674, 80), 'workflows/bell-ok': (F, 716, 2, 798, 80),
    'workflows/warning': (F, 344, 110, 426, 186), 'workflows/offline-alert': (F, 472, 110, 554, 186),
    'workflows/device': (F, 734, 118, 782, 184),
}
BG = np.array([253, 250, 241])  # Theme 2 ivory

def main(src: str, out: str = 'src/assets/medical') -> None:
    A = np.asarray(Image.open(src).convert('RGB')).astype(int)
    for name, (o, x0, y0, x1, y1) in BOXES.items():
        sub = A[o[1] + y0:o[1] + y1, o[0] + x0:o[0] + x1]
        d = np.sqrt(((sub - BG) ** 2).sum(axis=2))
        mask = d > 28
        lab, n = ndimage.label(mask)  # drop specks (e.g. fragments of neighbouring labels)
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 40])
        d = np.where(ndimage.binary_dilation(keep, iterations=2), d, 0)
        ys, xs = np.where(keep)
        p = 4
        cy0, cy1, cx0, cx1 = max(ys.min() - p, 0), ys.max() + p + 1, max(xs.min() - p, 0), xs.max() + p + 1
        rgba = np.dstack([sub[cy0:cy1, cx0:cx1], np.clip((d[cy0:cy1, cx0:cx1] - 10) / 30, 0, 1) * 255]).astype(np.uint8)
        img = Image.fromarray(rgba, 'RGBA')
        s = max(img.size)
        sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        sq.paste(img, ((s - img.width) // 2, (s - img.height) // 2))
        path = os.path.join(out, name + '.webp')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        sq.save(path, quality=92, method=6)
        print(path, sq.size)

if __name__ == '__main__':
    main(sys.argv[1])
