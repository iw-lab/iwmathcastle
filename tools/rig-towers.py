#!/usr/bin/env python3
"""tools/rig-towers.py — 타워·성 «3D + 뼈대 + 공격 모션»(2026-10-11 사용자 «타워도 성도 완전 3d로 뼈대 입혀서 공격 모션도 · 초월 수호자가 제일 좋은 타워로 보이게»)
  새 원화(game-assets-src/tower3d/concept/<id>.png, 등급이 모양에 드러나게 다시 그림) → Firefly 3D(<id>.glb)
  → normalize → creature --shape tower(받침 고정·몸통·머리=무기) → idle 8장 + attack 8장 렌더(--flat)
  → 원화와 실루엣·색이 가장 닮은 방향 1줄 → assets/tower-<id>-idle-0..7 · -atk-0..7 · tower-<id>.webp(대표 = idle 0)
  성(castle)은 공격이 없어 idle 만 → castle-keep-idle-0..7 + castle-keep.webp(대표) 교체.
  사용: python3 tools/rig-towers.py [id…] [--jobs 3]   · 원장 tools/rig-towers-status.json
"""
import json, os, subprocess, sys, shutil
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'game-assets-src/tower3d'); A = os.path.join(ROOT, 'assets')
STATUS = os.path.join(ROOT, 'tools/rig-towers-status.json'); BAK = os.path.join(SRC, 'old')
BL = os.path.expanduser('~/.claude/skills/game-builder/tools/blender/bl.sh')
NF = 8; SZ = 192; OUTMAX = 256
# 원화의 «빛»(불길·용암 발광)은 3D 텍스처에 안 남아 평균 밝기가 낮게 나온다 — 눈으로 대조해 맞다고 본 것만 하한을 내린다(사유 필수)
LUM_MIN = {'meteor': 0.6}   # 2026-10-11 원화 대비 0.64 — 원화 배경의 불꽃 빛무리 때문, 렌더 탑 자체는 원화와 같은 색(눈 대조)
IDS = ['plus', 'minus', 'multiply', 'divide', 'ice', 'poison', 'stun', 'meteor', 'cannon', 'skyDestroyer', 'net', 'laser', 'multi-shot',
       'goldMine', 'shredder', 'repairStation', 'copper', 'silver', 'golden', 'ultimate', 'transcendent', 'castle']
def run(cmd, env=None):
    r = subprocess.run(cmd, capture_output=True, text=True, env={**os.environ, **(env or {})}); return r.returncode, r.stdout + r.stderr
def feat(im, n=48):
    a = np.asarray(im.convert('RGBA')); al = a[:, :, 3] > 40
    if not al.any():
        # 원화(흰·회색 배경 불투명)는 배경색과 먼 픽셀을 실루엣으로
        rgb = a[:, :, :3].astype(int); bg = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), 0)
        al = np.abs(rgb - bg).sum(2) > 60
    ys, xs = np.nonzero(al)
    if not len(xs): return None
    c = np.asarray(im.convert('RGBA').crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).resize((n, n), Image.BILINEAR)).astype(np.float32) / 255
    m = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).resize((n, n))) > 127
    c[..., 3] = m; return c
def score(ref, cand):
    ma, mb = ref[..., 3] > 0.5, cand[..., 3] > 0.3
    iou = (ma & mb).sum() / max(1, (ma | mb).sum()); both = ma & mb
    col = 1 - (np.abs(ref[both, :3] - cand[both, :3]).mean() if both.any() else 1)
    return 0.6 * iou + 0.4 * col
def lum(im):
    a = np.asarray(im.convert('RGBA')).astype(np.float32); m = a[:, :, 3] > 128
    return float((a[m, :3] @ [0.299, 0.587, 0.114]).mean()) if m.any() else 0.0
def one(tid):
    glb = os.path.join(SRC, 'glb', tid + '.glb'); con = os.path.join(SRC, 'concept', tid + '.png')
    if not os.path.exists(glb): return tid, {'ok': False, 'why': 'glb 없음'}
    w = os.path.join(SRC, 'work', tid); os.makedirs(w, exist_ok=True)
    n_, rig = f'{w}/n.glb', f'{w}/rig.glb'
    rc, out = run(['bash', BL, 'normalize', '--in', glb, '--out', n_, '--height', '1.8', '--max-tris', '12000'])
    if rc: return tid, {'ok': False, 'why': 'normalize', 'log': out[-300:]}
    rc, out = run(['bash', BL, 'creature', '--in', n_, '--out', rig, '--shape', 'tower', '--report', f'{w}/creature.json'], {'TOWER_IDLE_DEG': '3' if tid == 'castle' else '10'})
    if rc: return tid, {'ok': False, 'why': 'creature', 'log': '\n'.join(l for l in out.splitlines() if 'gate' in l)[-400:]}
    def render(gain=None):
        sh_ = {}
        for act in (['idle'] if tid == 'castle' else ['idle', 'attack']):
            sh = f'{w}/{act}.png'
            rc, out = run(['bash', BL, 'sprites', '--in', rig, '--out', sh, '--dirs', '8', '--frames', str(NF), '--size', str(SZ), '--elev', '25', '--action', act, '--smooth', '--flat', '--frame-actions', 'idle,attack' if tid != 'castle' else 'idle']
                          + (['--gain', f'{gain:.2f}'] if gain else []))
            if rc: return None, f'sprites {act}: {out[-300:]}'
            sh_[act] = Image.open(sh).convert('RGBA')
        return sh_, None
    sheets, err = render()
    if err: return tid, {'ok': False, 'why': err}
    ref = feat(Image.open(con)); best = (-1, 0)
    for r in range(8):
        c = feat(sheets['idle'].crop((0, r * SZ, SZ, (r + 1) * SZ)))
        if c is not None: best = max(best, (score(ref, c), r))
    sc, row = best
    fr = {act: [S.crop((f * SZ, row * SZ, (f + 1) * SZ, (row + 1) * SZ)) for f in range(NF)] for act, S in sheets.items()}
    allf = [x for v in fr.values() for x in v]; bb = [x.getbbox() for x in allf]
    box = (min(b[0] for b in bb), min(b[1] for b in bb), max(b[2] for b in bb), max(b[3] for b in bb))
    # 밝기 — 원화(불투명 배경)는 실루엣 픽셀만
    cimg = Image.open(con).convert('RGB'); m = feat(Image.open(con), 128)
    ref_l = float((np.asarray(cimg.resize((128, 128))).astype(np.float32).reshape(-1, 3) @ [0.299, 0.587, 0.114]).mean()) if m is None else \
        float((m[..., :3][m[..., 3] > 0.5] * 255 @ [0.299, 0.587, 0.114]).mean())
    lr = lum(fr['idle'][0]) / max(1e-6, ref_l)
    if lr < 0.8:
        # Firefly 텍스처가 원화보다 어두운 탑(곱하기 0.70) — 잰 비율만큼 밝혀(상한 1.5) 한 번 다시 굽는다
        sheets, err = render(min(1.5, 0.95 / lr))
        if err: return tid, {'ok': False, 'why': err}
        fr = {act: [S.crop((f * SZ, row * SZ, (f + 1) * SZ, (row + 1) * SZ)) for f in range(NF)] for act, S in sheets.items()}
        lr = lum(fr['idle'][0]) / max(1e-6, ref_l)
    return tid, {'ok': True, 'row': row, 'match': round(float(sc), 3), 'lum': round(lr, 2), 'box': list(box), 'frames': {k: [x.crop(box) for x in v] for k, v in fr.items()}}
def main():
    av = sys.argv[1:]; ids = [x for i, x in enumerate(av) if not x.startswith('--') and not (i and av[i - 1] == '--jobs')] or IDS
    jobs = int(av[av.index('--jobs') + 1]) if '--jobs' in av else 3
    st = json.load(open(STATUS)) if os.path.exists(STATUS) else {}; os.makedirs(BAK, exist_ok=True)
    man_p = os.path.join(A, 'manifest.json'); man = json.load(open(man_p)); keys = {f['key'] for f in man['files']}
    with ThreadPoolExecutor(jobs) as ex:
        for tid, r in ex.map(one, ids):
            if r.get('ok'):
                if not LUM_MIN.get(tid, 0.75) <= r['lum'] <= 1.3: r = {'ok': False, 'why': f"밝기 {r['lum']}배 — 원화와 다르다"}
            if r.get('ok'):
                frs = r.pop('frames'); w_, h_ = frs['idle'][0].size; s = OUTMAX / max(w_, h_)
                pre = 'castle-keep' if tid == 'castle' else f'tower-{tid}'; kp = pre.replace('-', '_')
                for p in [os.path.join(A, pre + '.webp')]:
                    if os.path.exists(p) and not os.path.exists(os.path.join(BAK, os.path.basename(p))): shutil.copy2(p, BAK)
                for act, lst in frs.items():
                    tag = 'atk' if act == 'attack' else 'idle'
                    for i, f in enumerate(lst):
                        fn = f'{pre}-{tag}-{i}.webp'; f.resize((max(1, round(w_ * s)), max(1, round(h_ * s))), Image.LANCZOS).save(os.path.join(A, fn), quality=88, method=6)
                        k = f'{kp}_{tag}_{i}'
                        if k not in keys: man['files'].append({'key': k, 'file': fn}); keys.add(k)
                frs['idle'][0].resize((max(1, round(w_ * s)), max(1, round(h_ * s))), Image.LANCZOS).save(os.path.join(A, pre + '.webp'), quality=88, method=6)
                prev = Image.new('RGBA', (w_ * NF, h_ * len(frs)), (40, 40, 60, 255))
                for j, lst in enumerate(frs.values()):
                    for i, f in enumerate(lst): prev.alpha_composite(f, (i * w_, j * h_))
                prev.save(os.path.join(SRC, 'work', tid, 'preview.png'))
            st[tid] = r; print(('✅ ' if r.get('ok') else '❌ ') + tid, {k: v for k, v in r.items() if k != 'log'}, (r.get('log') or '')[-200:], flush=True)
            json.dump(st, open(STATUS, 'w'), ensure_ascii=False, indent=1); json.dump(man, open(man_p, 'w'), ensure_ascii=False, indent=1)
    bad = [k for k in ids if not st.get(k, {}).get('ok')]
    print(f'완료 {len(ids) - len(bad)}/{len(ids)}' + (f' · 실패 {bad}' if bad else '')); sys.exit(1 if bad else 0)
main()
