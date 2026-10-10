#!/usr/bin/env python3
"""tools/check-walk-frames.py — 뼈대 리그 걷기 8장(tools/rig-monsters.py) 검사 (2026-10-10)
  ① manifest 에 walk_0..7 이 다 있다 ② 8장 크기가 같다(합집합 자르기 — 다르면 피벗이 떨린다)
  ③ 이웃 프레임이 실제로 다르다(정지 그림 8장 아님) ④ 고리 이음매(7→0)가 다른 이음매의 2.2배 이하(걸음이 툭 끊기지 않는다)
  ⑤ 대상 수 하한(원장 ok 수 ≥ 30) — «검사 0개 = 통과» 방지"""
import json, os, sys
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); A = os.path.join(ROOT, 'assets')
st = json.load(open(os.path.join(ROOT, 'tools/rig-status.json')))
man = {f['key'] for f in json.load(open(os.path.join(A, 'manifest.json')))['files']}
ids = [k for k, v in st.items() if v.get('ok')]; bad = []
def arr(p): return np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255
for mid in ids:
    pre = 'wizard' if mid == 'wizard' else f'monster-{mid}'; kp = pre.replace('-', '_')
    miss = [i for i in range(8) if f'{kp}_walk_{i}' not in man or not os.path.exists(os.path.join(A, f'{pre}-walk-{i}.webp'))]
    if miss: bad.append(f'{mid}: 프레임 {miss} 없음'); continue
    F = [arr(os.path.join(A, f'{pre}-walk-{i}.webp')) for i in range(8)]
    if len({f.shape for f in F}) != 1: bad.append(f'{mid}: 프레임 크기가 제각각 {sorted({f.shape[:2] for f in F})}'); continue
    d = [float(np.abs(F[i][..., 3] - F[(i + 1) % 8][..., 3]).mean()) for i in range(8)]
    med = float(np.median(d[:7]))
    if min(d[:7]) < 0.002: bad.append(f'{mid}: 이웃 프레임이 거의 같다(차 {min(d[:7]):.4f})')
    if d[7] > 2.2 * med + 0.002: bad.append(f'{mid}: 고리 이음매 7→0 이 튄다({d[7]:.4f} vs 중앙 {med:.4f})')
print(f'걷기 8장 검사 {len(ids)}종')
if len(ids) < 30: bad.append(f'대상 {len(ids)}종 < 30 — 원장이 비었다')
for b in bad: print('  ✗', b)
print('❌ walk-frames' if bad else '✅ walk-frames'); sys.exit(1 if bad else 0)
