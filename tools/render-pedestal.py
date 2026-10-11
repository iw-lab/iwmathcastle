#!/usr/bin/env python3
"""tools/render-pedestal.py — 타워 받침대(2026-10-11 «맵도 더 3d스럽게»)
  원화 game-assets-src/map3d/pedestal.png → Firefly 3D(pedestal.glb) → normalize → sprites(타워와 같은 --flat · elev 25)
  → 원화와 가장 닮은 방향 1장 → assets/tile-pedestal.webp(+manifest tile_pedestal). 빈 타워 자리(CSS)와 지은 타워 발밑(캔버스)이 같은 그림을 쓴다.
  사용: python3 tools/render-pedestal.py
"""
import importlib.util, json, os, subprocess, sys
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'game-assets-src/map3d'); W = os.path.join(D, 'work'); A = os.path.join(ROOT, 'assets')
BL = os.path.expanduser('~/.claude/skills/game-builder/tools/blender/bl.sh'); SZ = 192; OUTW = 128
# 실루엣·색 비교 함수는 타워 파이프라인과 같은 것을 쓴다(두 벌로 갈라지지 않게) — main() 은 import 시 돌지 않게 소스를 잘라 읽는다
src = open(os.path.join(ROOT, 'tools/rig-towers.py')).read(); src = src[:src.index('\ndef one(')]
ns = {'__file__': os.path.join(ROOT, 'tools/rig-towers.py')}; exec(compile(src, 'rig-towers.py', 'exec'), ns); feat, score, lum = ns['feat'], ns['score'], ns['lum']
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True); return r.returncode, r.stdout + r.stderr
os.makedirs(W, exist_ok=True)
glb, con = os.path.join(D, 'pedestal.glb'), os.path.join(D, 'pedestal.png')
if not os.path.exists(glb): sys.exit('pedestal.glb 없음 — img3d.py 먼저')
rc, out = run(['bash', BL, 'normalize', '--in', glb, '--out', f'{W}/n.glb', '--height', '0.6', '--max-tris', '8000'])
if rc: sys.exit('normalize 실패\n' + out[-400:])
def render(gain=None):
    rc, out = run(['bash', BL, 'sprites', '--in', f'{W}/n.glb', '--out', f'{W}/sheet.png', '--dirs', '8', '--frames', '1', '--size', str(SZ),
                   '--elev', '25', '--smooth', '--flat'] + (['--gain', f'{gain:.2f}'] if gain else []))
    if rc: sys.exit('sprites 실패\n' + out[-400:])
    return Image.open(f'{W}/sheet.png').convert('RGBA')
sh = render(); ref = feat(Image.open(con)); best = (-1, 0)
cell = lambda S, r: S.crop((0, r * SZ, SZ, (r + 1) * SZ))
for r in range(8):
    c = feat(cell(sh, r))
    if c is not None: best = max(best, (score(ref, c), r))
sc, row = best
m = feat(Image.open(con), 128); ref_l = float((m[..., :3][m[..., 3] > 0.5] * 255 @ [0.299, 0.587, 0.114]).mean())
lr = lum(cell(sh, row)) / ref_l
if lr < 0.8: sh = render(min(1.5, 0.95 / lr)); lr = lum(cell(sh, row)) / ref_l
img = cell(sh, row); img = img.crop(img.getbbox()); w, h = img.size
ok = sc >= 0.55 and 0.75 <= lr <= 1.3 and 1.2 <= w / h <= 2.6   # 납작한 원판이어야 한다(세로로 길면 엉뚱한 모델)
print(f"row {row} · 원화 닮음 {sc:.3f} · 밝기 {lr:.2f}배 · 가로/세로 {w / h:.2f}")
if not ok: sys.exit('❌ 게이트 실패 — 위 수치 참조')
img.resize((OUTW, round(h * OUTW / w)), Image.LANCZOS).save(os.path.join(A, 'tile-pedestal.webp'), quality=88, method=6)
man_p = os.path.join(A, 'manifest.json'); man = json.load(open(man_p))
if not any(f['key'] == 'tile_pedestal' for f in man['files']): man['files'].append({'key': 'tile_pedestal', 'file': 'tile-pedestal.webp'})
json.dump(man, open(man_p, 'w'), ensure_ascii=False, indent=1)
print('✅ assets/tile-pedestal.webp', (OUTW, round(h * OUTW / w)))
