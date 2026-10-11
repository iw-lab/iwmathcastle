#!/usr/bin/env python3
"""tools/check-tower-anim.py — 타워 3D 뼈대 모션(tools/rig-towers.py) 검사 (2026-10-11)
  ① 타워 21종 전부 원장 ok(성 castle 은 idle 만) ② manifest·파일에 idle 0..7 · atk 0..7 ③ 16장 크기 동일(모션 전환 때 안 튄다)
  ④ attack 은 실제로 움직인다(가장 큰 이웃 차 ≥ 0.01) · idle 은 정지 그림이 아니다 ⑤ attack 고리(7→0)가 튀지 않는다(idle 0 으로 돌아온다)"""
import json, os, sys
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); A = os.path.join(ROOT, 'assets')
st = json.load(open(os.path.join(ROOT, 'tools/rig-towers-status.json'))) if os.path.exists(os.path.join(ROOT, 'tools/rig-towers-status.json')) else {}
man = {f['key'] for f in json.load(open(os.path.join(A, 'manifest.json')))['files']}
TOWERS = ['plus', 'minus', 'multiply', 'divide', 'ice', 'poison', 'stun', 'meteor', 'cannon', 'skyDestroyer', 'net', 'laser', 'multi-shot',
          'goldMine', 'shredder', 'repairStation', 'copper', 'silver', 'golden', 'ultimate', 'transcendent']
bad = []
def arr(p): return np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255
for t in TOWERS + (['castle'] if 'castle' in st else []):
    if not st.get(t, {}).get('ok'): bad.append(f'{t}: 원장 ok 아님({st.get(t, {}).get("why", "없음")})'); continue
    pre = 'castle-keep' if t == 'castle' else f'tower-{t}'; kp = pre.replace('-', '_')
    tags = ['idle'] if t == 'castle' else ['idle', 'atk']
    miss = [f'{g}{i}' for g in tags for i in range(8) if f'{kp}_{g}_{i}' not in man or not os.path.exists(os.path.join(A, f'{pre}-{g}-{i}.webp'))]
    if miss: bad.append(f'{t}: 프레임 없음 {miss[:4]}'); continue
    F = {g: [arr(os.path.join(A, f'{pre}-{g}-{i}.webp')) for i in range(8)] for g in tags}
    if len({f.shape for v in F.values() for f in v}) != 1: bad.append(f'{t}: idle/atk 크기가 다르다 — 모션 바뀔 때 튄다'); continue
    d = lambda a, b: float(np.abs(a[..., 3] - b[..., 3]).mean() + np.abs(a[..., :3] - b[..., :3]).mean() / 3)
    di = [d(F['idle'][i], F['idle'][(i + 1) % 8]) for i in range(8)]
    if max(di) < 0.002: bad.append(f'{t}: idle 8장이 정지 그림(최대 차 {max(di):.4f})')
    if 'atk' in F:
        da = [d(F['atk'][i], F['atk'][i + 1]) for i in range(7)]
        if max(da) < 0.01: bad.append(f'{t}: attack 이 거의 안 움직인다(최대 차 {max(da):.4f})')
        if d(F['atk'][7], F['idle'][0]) > max(0.012, 0.6 * max(da)): bad.append(f'{t}: attack 끝이 대기 자세로 안 돌아온다({d(F["atk"][7], F["idle"][0]):.4f})')
print(f'타워 모션 검사 {len(TOWERS)}종')
for b in bad: print('  ✗', b)
print('❌ tower-anim' if bad else '✅ tower-anim'); sys.exit(1 if bad else 0)
