"""Builds evidence/index.html: reference, native capture, side by side, overlay and difference for the 27 reference folders,
plus every extra state. Run after `flutter test test/visual`.
    python -I tool/evidence.py <folder with the 27 references> <output folder>
The pictures are drawn by the app's own code in Flutter's test renderer (390 dp wide, 2 px per dp, text scale 1, no system
bars), with the fictional design fixture. They are not photographs of a phone."""
import glob, html, os, shutil, sys
from PIL import Image, ImageChops

refs, out = sys.argv[1], sys.argv[2]
shots = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'build', 'shots')
W = 390
shutil.rmtree(out, ignore_errors=True)
os.makedirs(out)


def fit(im):
    return im.convert('RGB').resize((W, round(im.height * W / im.width)), Image.LANCZOS)


rows = []
for d in sorted(glob.glob(os.path.join(refs, 'clinbridge_*'))):
    f = os.path.basename(d)
    o = os.path.join(out, f)
    os.makedirs(o)
    src = Image.open(os.path.join(d, 'screen.png'))
    shutil.copy(os.path.join(d, 'screen.png'), os.path.join(o, 'reference.png'))
    states = {os.path.relpath(p, os.path.join(shots, f)).replace('\\', '/')[:-4]: p for p in sorted(glob.glob(os.path.join(shots, f, '**', '*.png'), recursive=True))}
    for k, p in states.items():
        t = os.path.join(o, k.replace('/', '__') + '.png')
        shutil.copy(p, t)
    r, a = fit(src), fit(Image.open(states['full']))
    H, h = max(r.height, a.height), min(r.height, a.height)
    diff = ImageChops.difference(r.crop((0, 0, W, h)), a.crop((0, 0, W, h)))
    g = diff.convert('L')
    mean = sum(i * n for i, n in enumerate(g.histogram())) / (W * h)
    side = Image.new('RGB', (W * 2 + 16, H), 'white')
    side.paste(r, (0, 0))
    side.paste(a, (W + 16, 0))
    side.save(os.path.join(o, 'side_by_side.png'))
    Image.blend(r.crop((0, 0, W, h)), a.crop((0, 0, W, h)), 0.5).save(os.path.join(o, 'overlay.png'))
    diff.point(lambda v: 255 - min(255, v * 2)).save(os.path.join(o, 'difference.png'))
    rows.append((f, src.size, r.height, a.height, mean, list(states)))

e = html.escape
body = []
for f, size, rh, ah, mean, states in rows:
    extra = [s for s in states if s not in ('first', 'full')]
    body.append(f'<section id="{f}"><h2>{e(f)}</h2><p>Source picture {size[0]}×{size[1]} px = {W}×{rh} dp. Native capture {W}×{ah} dp. Mean difference {mean:.1f} of 255.</p>'
                f'<p><a href="{f}/reference.png">reference</a> · <a href="{f}/first.png">first viewport</a> · <a href="{f}/full.png">full</a> · <a href="{f}/side_by_side.png">side by side</a> · <a href="{f}/overlay.png">overlay</a> · <a href="{f}/difference.png">difference</a></p>'
                f'<div class="r"><img loading="lazy" src="{f}/side_by_side.png" alt="reference and native capture"><img loading="lazy" src="{f}/difference.png" alt="difference"></div>'
                + '<details><summary>' + str(len(extra)) + ' further states and sizes</summary><div class="r">' + ''.join(f'<figure><img loading="lazy" src="{f}/{e(s.replace("/", "__"))}.png" alt=""><figcaption>{e(s)}</figcaption></figure>' for s in extra) + '</div></details></section>')
page = ('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ClinBridge Practice for Android: pictures</title>'
        '<style>body{font:15px/1.5 Inter,Segoe UI,sans-serif;margin:24px;background:#f8f9fc;color:#191c1e}section{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0}h2{font-size:17px;margin:0}.r{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}img{max-width:100%;border:1px solid #e2e8f0}figure{margin:0;width:200px}figure img{width:200px}figcaption{font-size:12px;overflow-wrap:anywhere}</style>'
        '<h1>ClinBridge Practice for Android: 27 reference screens</h1><p>Left: Stitch reference. Right: the native app code, drawn by Flutter’s test renderer (390 dp wide, 2 px per dp, text scale 1, no system bars) with the fictional design fixture; the installed app does not contain these people. '
        'Reasons for every difference: <code>docs/VISUAL_DIFFERENCES.md</code>. Not photographs of a phone.</p>' + ''.join(body))
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)
open(os.path.join(out, 'summary.csv'), 'w', encoding='utf-8').write('folder,png_w,png_h,ref_dp_h,app_dp_h,mean_difference,states\n' + '\n'.join(f'{f},{s[0]},{s[1]},{rh},{ah},{m:.2f},{len(st)}' for f, s, rh, ah, m, st in rows))
print(len(rows), 'folders,', sum(len(r[5]) for r in rows), 'captures')
