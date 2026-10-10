#!/usr/bin/env python3
"""tools/rig-monsters.py — 몬스터·마법사 «뼈대 입혀 걷기»(2026-10-10 사용자 «몬스터들도 뼈대 입혀서 제대로 움직이게. 마법사도»)
  Firefly 3D(game-assets-src/ff/*.glb) → normalize → creature 리그(biped|quad|fly|worm) → 8방향×8프레임 렌더
  → 지금 게임 그림(assets/<id>.webp)과 실루엣·색이 가장 닮은 방향 1줄을 골라(모델마다 정면이 제각각) → walk-0..7.webp
  전엔 이미지 생성기로 만든 4장 «포즈 그림»이라 프레임 사이가 이어지지 않았다.
  사용: python3 tools/rig-monsters.py [id…] [--jobs 3] [--dry]   (id 생략 = 전부) · 결과 원장 tools/rig-status.json(커밋 — check-walk-frames.py 가 배포 때 읽는다)
"""
import json, os, subprocess, sys, shutil
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = os.path.join(ROOT, 'game-assets-src/ff'); WORK = os.path.join(ROOT, 'game-assets-src/rig/work'); A = os.path.join(ROOT, 'assets')
BAK = os.path.join(ROOT, 'game-assets-src/rig/walk2d-backup'); STATUS = os.path.join(ROOT, 'tools/rig-status.json')
BL = os.path.expanduser('~/.claude/skills/game-builder/tools/blender/bl.sh')
NF = 8; SZ = 192; OUTMAX = 256
SHAPE = {**{k: 'biped' for k in 'archfiend assassin berserker boss chronomancer collector demonKing disruptor finalBoss general golem healer mimic mirage necromancer normal plaguebearer shielder speed splitter summoner titanGolem'.split()},
         **{k: 'quad' for k in 'tank voidLord swarmling'.split()},
         **{k: 'fly' for k in 'bat dragon ancientDragon phoenix shadowDragon ghost teleporter'.split()},
         **{k: 'worm' for k in 'leech wormQueen'.split()}}
SHAPE_ALT = {'voidLord': ['biped', 'fly']}
ELEV = {'fly': '28'}   # 날개는 옆에서 보면 칼날처럼 얇아 사라진다(박쥐 실측) → 비행체는 조금 위에서
def run(cmd, env=None):
    r = subprocess.run(cmd, capture_output=True, text=True, env={**os.environ, **(env or {})}); return r.returncode, r.stdout + r.stderr
def mask_feat(im, n=48):
    """알파 경계상자를 n×n 으로 — 실루엣(알파)·색(RGB 평균) 비교용"""
    a = np.asarray(im.convert('RGBA')); al = a[:, :, 3] > 40
    ys, xs = np.nonzero(al)
    if not len(xs): return None
    c = im.convert('RGBA').crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).resize((n, n), Image.BILINEAR)
    c = np.asarray(c).astype(np.float32) / 255; return c
def score(ref, cand):
    """1 = 똑같다. 실루엣 IoU 0.7 + 색 0.3(겹친 곳 RGB 차)"""
    ma, mb = ref[:, :, 3] > 0.3, cand[:, :, 3] > 0.3
    iou = (ma & mb).sum() / max(1, (ma | mb).sum()); both = ma & mb
    col = 1 - (np.abs(ref[both, :3] - cand[both, :3]).mean() if both.any() else 1)
    return 0.7 * iou + 0.3 * col
def one(mid):
    key = f'monster-{mid}' if mid != 'wizard' else 'wizard-idle'
    glb = os.path.join(FF, key + '.glb'); shape = SHAPE.get(mid, 'biped')
    if not os.path.exists(glb): return mid, {'ok': False, 'why': 'glb 없음'}
    w = os.path.join(WORK, mid); os.makedirs(w, exist_ok=True)
    n_, rig, sheet = f'{w}/n.glb', f'{w}/rig.glb', f'{w}/walk.png'
    rc, out = run(['bash', BL, 'normalize', '--in', glb, '--out', n_, '--height', '1.8', '--max-tris', '8000'])
    if rc: return mid, {'ok': False, 'why': 'normalize', 'log': out[-400:]}
    # 찢어짐 FAIL → 걸음 폭을 줄여(로브·치마) · 발 엇갈림 부족 → 폭을 늘려(짧은 다리·망토) · 그래도 안 되면 다른 몸 모양(SHAPE_ALT)
    rc, out = 1, ''
    for shp in [shape] + SHAPE_ALT.get(mid, []):
        amps = ['1']
        while amps:
            amp = amps.pop(0)
            rc, out = run(['bash', BL, 'creature', '--in', n_, '--out', rig, '--shape', shp, '--report', f'{w}/creature.json'], {'CREATURE_AMP': amp})
            if rc == 0: break
            if '찢어진다' in out and amp in ('1', '1.35'): amps = ['0.6', '0.5', '0.4'] if amp == '1' else []
            elif '엇갈리지' in out and amp == '1': amps = ['1.35', '1.7']
        if rc == 0: shape = shp; break
    if rc: return mid, {'ok': False, 'why': 'creature', 'shape': shape, 'log': '\n'.join(l for l in out.splitlines() if 'gate' in l)[-500:]}
    rc, out = run(['bash', BL, 'sprites', '--in', rig, '--out', sheet, '--dirs', '8', '--frames', str(NF), '--size', str(SZ), '--elev', ELEV.get(shape, '12'),
                   '--action', 'walk', '--smooth'] + ([] if os.environ.get('RIG_INJECT') == 'studio' else ['--flat']))   # flat = Firefly 텍스처에 칠해진 원화 명암 그대로(STUDIO 빛을 얹으면 얼굴이 시커멨다)
    if rc: return mid, {'ok': False, 'why': 'sprites', 'log': out[-400:]}
    ref = mask_feat(Image.open(os.path.join(A, key + '.webp')))
    S = Image.open(sheet).convert('RGBA'); best = None
    for r in range(8):
        f0 = S.crop((0, r * SZ, SZ, (r + 1) * SZ)); c = mask_feat(f0)
        if c is None: continue
        sc = score(ref, c); best = max(best or (-1, 0), (sc, r))
    sc, row = best
    # 밝기 게이트 — 지금 게임 그림과 평균 밝기가 80~125% 안(STUDIO 빛 렌더는 마법사 얼굴이 시커메 0.7대였다)
    def lum(im):
        a_ = np.asarray(im.convert('RGBA')).astype(np.float32); m_ = a_[:, :, 3] > 128
        return float((a_[m_, :3] @ [0.299, 0.587, 0.114]).mean()) if m_.any() else 0.0
    lr = lum(S.crop((0, row * SZ, SZ, (row + 1) * SZ))) / max(1e-6, lum(Image.open(os.path.join(A, key + '.webp'))))
    if lr < 0.8 and '--gain' not in sys.argv:
        # 텍스처 자체가 원화보다 어두운 모델(여왕벌레 0.67) — 잰 비율만큼 밝혀(상한 1.5) 한 번 다시
        g = min(1.5, 0.95 / lr)
        rc, out = run(['bash', BL, 'sprites', '--in', rig, '--out', sheet, '--dirs', '8', '--frames', str(NF), '--size', str(SZ), '--elev', ELEV.get(shape, '12'),
                       '--action', 'walk', '--smooth', '--flat', '--gain', f'{g:.2f}'])
        S = Image.open(sheet).convert('RGBA'); lr = lum(S.crop((0, row * SZ, SZ, (row + 1) * SZ))) / max(1e-6, lum(Image.open(os.path.join(A, key + '.webp'))))
    if not 0.8 <= lr <= 1.25: return mid, {'ok': False, 'why': f'밝기 {lr:.2f}배 — 원화와 다르다', 'shape': shape}
    frames = [S.crop((f * SZ, row * SZ, (f + 1) * SZ, (row + 1) * SZ)) for f in range(NF)]
    # 8장 «합집합» 경계상자로 한 번에 자른다 — 프레임마다 자르면 피벗이 떨린다
    bb = [fr.getbbox() for fr in frames]; x0 = min(b[0] for b in bb); y0 = min(b[1] for b in bb); x1 = max(b[2] for b in bb); y1 = max(b[3] for b in bb)
    return mid, {'ok': True, 'shape': shape, 'row': row, 'match': round(float(sc), 3), 'lum': round(lr, 2), 'box': [x0, y0, x1, y1], 'frames': [fr.crop((x0, y0, x1, y1)) for fr in frames]}
def main():
    av = sys.argv[1:]; ids = [x for i, x in enumerate(av) if not x.startswith('--') and not (i and av[i - 1] == '--jobs')] or sorted(SHAPE)
    jobs = int(sys.argv[sys.argv.index('--jobs') + 1]) if '--jobs' in sys.argv else 3; dry = '--dry' in sys.argv
    st = json.load(open(STATUS)) if os.path.exists(STATUS) else {}
    os.makedirs(BAK, exist_ok=True)
    with ThreadPoolExecutor(jobs) as ex:
        for mid, r in ex.map(one, ids):
            key = f'monster-{mid}' if mid != 'wizard' else 'wizard'
            if r.get('ok'):
                fr = r.pop('frames'); w_, h_ = fr[0].size; s = OUTMAX / max(w_, h_)
                if not dry:
                    for i in range(4):
                        p = os.path.join(A, f'{key}-walk-{i}.webp')
                        if os.path.exists(p) and not os.path.exists(os.path.join(BAK, os.path.basename(p))): shutil.copy2(p, BAK)
                    for i, f in enumerate(fr): f.resize((max(1, round(w_ * s)), max(1, round(h_ * s))), Image.LANCZOS).save(os.path.join(A, f'{key}-walk-{i}.webp'), quality=88, method=6)
                prev = Image.new('RGBA', (w_ * NF, h_), (40, 40, 60, 255))
                for i, f in enumerate(fr): prev.alpha_composite(f, (i * w_, 0))
                prev.save(os.path.join(WORK, mid, 'preview.png'))
            st[mid] = r; print(('✅ ' if r.get('ok') else '❌ ') + mid, {k: v for k, v in r.items() if k != 'log'}, (r.get('log') or '')[-200:], flush=True)
            json.dump(st, open(STATUS, 'w'), ensure_ascii=False, indent=1)
    bad = [k for k in ids if not st.get(k, {}).get('ok')]
    print(f'완료 {len(ids) - len(bad)}/{len(ids)}' + (f' · 실패 {bad}' if bad else '')); sys.exit(1 if bad else 0)
main()
