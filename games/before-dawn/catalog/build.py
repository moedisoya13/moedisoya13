"""Inline catalog data and sprite data URIs into the catalog page.
usage: python3 build.py ASSETS_DIR OUT_HTML
"""
import base64, json, os, sys

here = os.path.dirname(os.path.abspath(__file__))
assets, out = sys.argv[1], sys.argv[2]
meta = json.load(open(os.path.join(assets, 'sprites.json')))
sprites = {}
for name, m in meta.items():
    with open(os.path.join(assets, m['file']), 'rb') as f:
        sprites[name] = 'data:image/webp;base64,' + base64.b64encode(f.read()).decode()
icons = {}
idir = os.path.join(here, 'icons')
for fn in sorted(os.listdir(idir)) if os.path.isdir(idir) else []:
    if fn.endswith('.png'):
        with open(os.path.join(idir, fn), 'rb') as f:
            icons[fn[:-4]] = 'data:image/png;base64,' + base64.b64encode(f.read()).decode()
data = json.load(open(os.path.join(here, 'data.json')))
tpl = open(os.path.join(here, 'template.html'), encoding='utf-8').read()
page = tpl.replace('/*__DATA__*/null', json.dumps(data, ensure_ascii=False)).replace('/*__SPRITES__*/{}', json.dumps(sprites)).replace('/*__ICONS__*/{}', json.dumps(icons))
assert '/*__' not in page
open(out, 'w', encoding='utf-8').write(page)
print(out, len(page) // 1024, 'KB', len(sprites), 'sprites')
