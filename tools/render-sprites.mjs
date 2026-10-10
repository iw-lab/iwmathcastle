// 🧊 3D 렌더 스프라이트 굽기 (2026-10-10 사용자 «마법사·그래픽 3D 렌더링 파이어플라이로, 하늘수비대와 같은 기준»)
// 하늘수비대(defence/tools/render-sprites.mjs) 판을 옮겼다. Firefly Boards 이미지→3D GLB(game-assets-src/ff/*.glb)를
// «한 카메라·한 조명»으로 렌더해 assets/<같은 이름>.webp 를 바꾼다 — 게임 코드·판정·밸런스는 그대로.
// 크기·자리: 옛 2D 그림(game-assets-src/ref-2d-v1)의 «불투명 영역 상자»에 바닥 맞춤으로 넣는다.
// 몬스터 걷기 4장(-walk-0..3): 같은 모델을 yaw ±9°·기울기로 흔들어 굽는다(축척은 0번 한 번만 — 크기가 안 떨린다).
//   node tools/render-sprites.mjs [이름…]            지정(없으면 GLB 전부)
//   node tools/render-sprites.mjs --preview 이름      방향 4개(0·90·180·270°) 비교 그림만 → /tmp
// 방향 = 270°(Firefly 정면 = +X, 실측) · 모델별 보정 = tools/render-yaw.json { 이름: 도 } — 미리보기로 정한다
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GLB = path.join(ROOT, 'game-assets-src/ff'), REF = path.join(ROOT, 'game-assets-src/ref-2d-v1'), OUT = path.join(ROOT, 'assets');
const LEDGER = path.join(ROOT, 'game-assets-src/render-ledger.json'), YAW = path.join(ROOT, 'tools/render-yaw.json');
const PY = path.join(process.env.HOME, '.claude/venvs/vibes/bin/python');
const args = process.argv.slice(2), preview = args.includes('--preview');
const names = args.filter((a) => !a.startsWith('--'));
const REFMAP = { 'tower-minus': 'tower-plus' };   // 옛 tower-minus.webp 는 0바이트였다 — 짝인 더하기 탑 상자를 쓴다
const yawOf = (n) => yaws[n] ?? (n.startsWith('monster-') ? 288 : 270);   // 옛 몬스터 그림은 오른쪽을 보는 3/4(왼쪽으로 갈 땐 게임이 뒤집는다)
const WALKBASE = { 'wizard-idle': 'wizard' };   // 마법사 걷기 4장은 wizard-walk-N(대기 모델로 굽는다)
const walkBase = (n) => WALKBASE[n] || n;
const WALK = (n) => fs.existsSync(path.join(REF, `${walkBase(n)}-walk-0.webp`));
// 옛 그림 상자 맞춤(첫 작업의 축척·기준점을 나머지 작업이 공유) — 흰 배경 RGB 원화는 흰색이 아닌 영역을 상자로
const FIT = `import sys,json;from PIL import Image, ImageChops
def refbox(ref):
  W,H=ref.size
  if ref.mode=='RGBA' and ref.getchannel('A').getextrema()[0]<250: bb=ref.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox()
  else:
    rgb=ref.convert('RGB'); bb=ImageChops.difference(rgb,Image.new('RGB',rgb.size,(255,255,255))).convert('L').point(lambda a:255 if a>28 else 0).getbbox()
  return bb or (0,0,W,H)
base=None
for png,refp,out in json.loads(sys.argv[1]):
  src=Image.open(png).convert('RGBA'); ref=Image.open(refp); W,H=ref.size; bb=refbox(ref)
  a=src.getchannel('A'); full=a.point(lambda v:255 if v>8 else 0).getbbox(); body=a.point(lambda v:255 if v>200 else 0).getbbox() or full; src=src.crop(full)
  ox,oy=body[0]-full[0],body[1]-full[1]; bw0,bh0=body[2]-body[0],body[3]-body[1]
  if base is None:
    bw,bh=bb[2]-bb[0],bb[3]-bb[1]; k=min(bw/bw0,bh/bh0)*1.02; base=k
  k=base; nw,nh=max(1,round(src.width*k)),max(1,round(src.height*k))
  src=src.resize((nw,nh),Image.LANCZOS)
  x=round((bb[0]+bb[2])/2-(ox+bw0/2)*k); y=round(bb[3]-(oy+bh0)*k)
  lay=Image.new('RGBA',(W+2*nw,H+2*nh),(0,0,0,0)); lay.alpha_composite(src,(x+nw,y+nh)); lay.crop((nw,nh,nw+W,nh+H)).save(out,'WEBP',quality=88,method=6)`;
const yaws = fs.existsSync(YAW) ? JSON.parse(fs.readFileSync(YAW, 'utf8')) : {};
const todo = (names.length ? names : fs.readdirSync(GLB).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4))).filter((n) => fs.existsSync(path.join(GLB, n + '.glb')));
if (!todo.length) { console.log('렌더할 GLB 없음'); process.exit(0); }

const PAGE = `<!doctype html><meta charset=utf-8><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const S = 640, r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setSize(S, S); r.setClearColor(0, 0); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;   // ACES 는 원화 색을 바랬다(실측) — Neutral 은 채도를 지킨다
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; document.body.appendChild(r.domElement);
const sc = new THREE.Scene(); sc.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = 0.55;
sc.add(new THREE.HemisphereLight(0xdfe9ff, 0x2a2440, 0.9));
const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.set(-2.2, 4, 3); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.1, far: 12 }); key.shadow.radius = 6; key.shadow.bias = -0.0008; sc.add(key);
const rim = new THREE.DirectionalLight(0x9fd0ff, 1.6); rim.position.set(2.5, 2.2, -3); sc.add(rim);
// 🔴 바닥 그림자는 굽지 않는다 — 게임(GameScene)이 탑·적 밑에 그림자 얼룩을 따로 그리고, 적은 위아래로 흔들린다(구우면 그림자가 같이 뜬다)
const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
window.shot = async (url, yawDeg, tiltDeg = 0) => {
  const g = await new GLTFLoader().loadAsync(url), m = g.scene;
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const ms = [].concat(o.material); for (const mt of ms) { mt.side = THREE.DoubleSide; if (mt.map) mt.map.anisotropy = 8; } } });
  const piv = new THREE.Group(); piv.add(m); sc.add(piv);
  let b = new THREE.Box3().setFromObject(m), sz = b.getSize(new THREE.Vector3()), k = 1 / Math.max(sz.x, sz.y, sz.z);
  m.scale.setScalar(k); b = new THREE.Box3().setFromObject(m); const c = b.getCenter(new THREE.Vector3());
  m.position.sub(new THREE.Vector3(c.x, b.min.y, c.z)); piv.rotation.y = yawDeg * Math.PI / 180; piv.rotation.z = tiltDeg * Math.PI / 180;
  b = new THREE.Box3().setFromObject(piv); const sp = b.getBoundingSphere(new THREE.Sphere());
  const el = 24 * Math.PI / 180, d = sp.radius / Math.sin(cam.fov * Math.PI / 360) * 1.06;
  cam.position.set(0, sp.center.y + Math.sin(el) * d, Math.cos(el) * d); cam.lookAt(sp.center);
  r.render(sc, cam); const png = r.domElement.toDataURL('image/png');
  sc.remove(piv); m.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); for (const mt of [].concat(o.material)) { for (const v of Object.values(mt)) if (v && v.isTexture) v.dispose(); mt.dispose(); } } });
  return png;
};
window.ready = true;
</script>`;

const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  let f = null, type = 'application/octet-stream';
  if (u === '/') { s.writeHead(200, { 'content-type': 'text/html' }); return s.end(PAGE); }
  if (u.startsWith('/three/')) { f = path.join(ROOT, 'node_modules/three', u.slice(7)); type = 'text/javascript'; }
  if (u.startsWith('/glb/')) { f = path.join(GLB, path.basename(u)); type = 'model/gltf-binary'; }
  if (!f || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': type }); fs.createReadStream(f).pipe(s);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const br = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const pg = await br.newPage(); await pg.setViewport({ width: 640, height: 640 });
pg.on('console', (m) => { if (m.type() === 'error') console.log('  [page]', m.text()); });
await pg.goto(base + '/'); await pg.waitForFunction('window.ready === true', { timeout: 30000 });
const tmp = fs.mkdtempSync('/tmp/skyr-'), ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : {};
const sha = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
for (const n of todo) {
  const shots = preview ? [0, 90, 180, 270] : [yawOf(n)];
  const pngs = [], walkPngs = [];
  for (const y of shots) {
    const data = await pg.evaluate((u, y) => window.shot(u, y), `/glb/${n}.glb`, y);
    const p = path.join(tmp, `${n}_${y}.png`); fs.writeFileSync(p, Buffer.from(data.split(',')[1], 'base64')); pngs.push(p);
  }
  if (!preview && WALK(n)) for (let i = 0; i < 4; i++) {
    const [dy, dt] = [[-9, -3], [0, 0], [9, 3], [0, 0]][i];   // 좌우로 몸을 돌리며 걷는다(1·3번은 정면, 기울기는 반대로)
    const data = await pg.evaluate((u, y, t) => window.shot(u, y, t), `/glb/${n}.glb`, (yawOf(n)) + dy, i === 1 ? 2 : i === 3 ? -2 : dt);
    const p = path.join(tmp, `${n}_w${i}.png`); fs.writeFileSync(p, Buffer.from(data.split(',')[1], 'base64')); walkPngs.push(p);
  }
  if (preview) {
    const o = `/tmp/skyr-preview-${n}.png`;
    execFileSync(PY, ['-c', `import sys;from PIL import Image
ims=[Image.open(p).convert('RGBA') for p in sys.argv[2:]];W=sum(i.width for i in ims);g=Image.new('RGBA',(W,ims[0].height),(70,80,110,255));x=0
for i in ims: g.alpha_composite(i,(x,0)); x+=i.width
g.convert('RGB').resize((W//2,ims[0].height//2)).save(sys.argv[1])`, o, ...pngs]); console.log('미리보기', o); continue;
  }
  // 옛 그림의 불투명 상자에 바닥 맞춤으로 넣는다 — 걷기 프레임은 0번의 축척·기준점을 그대로 쓴다
  const ref = path.join(REF, (REFMAP[n] || n) + '.webp'), out = path.join(OUT, n + '.webp');
  const jobs = [[pngs[0], ref, out]];
  for (let i = 0; i < walkPngs.length; i++) jobs.push([walkPngs[i], path.join(REF, `${walkBase(n)}-walk-${i}.webp`), path.join(OUT, `${walkBase(n)}-walk-${i}.webp`)]);
  execFileSync(PY, ['-c', FIT, JSON.stringify(jobs)]);
  ledger[n] = { glb: sha(path.join(GLB, n + '.glb')), yaw: yawOf(n), out: sha(out), walk: walkPngs.length, engine: 'Adobe Firefly Boards image→3D', render: 'tools/render-sprites.mjs' };
  console.log('✓', n, `yaw ${yawOf(n)}`);
}
if (!preview) fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n');
await br.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
