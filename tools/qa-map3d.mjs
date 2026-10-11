// tools/qa-map3d.mjs — 맵 3D 개편(2026-10-11 «맵도 더 3d스럽게 개편» → «진행해») 판정.
//   ① 테마 3종(풀밭·협곡·화산) 배경이 실제 화면에서 충분히 밝다 — 옛 배경은 밤하늘 수준(실효 밝기 ≈20)이라 3D 타워가 허공에 떴다
//   ② 빈 타워 자리 = 돌 받침대 그림(점선 네모 아님 · 타워보다 먼저 캔버스에 — DOM 이면 키 큰 타워를 덮는다) ③ 지은 타워 발밑에도 받침대가 그려진다
//   ④ 길이 입체 돌길(연석 회색이 길 가장자리에 있다) ⑤ 콘솔 에러 0
//   스크린샷 screenshots/map3d-<테마>-<w>x<h>.png      사용: node tools/qa-map3d.mjs [포트]
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8961;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg", ".svg": "image/svg+xml" };
const server = createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]); const p = join(ROOT, u === "/" ? "index.html" : u); if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p)); }).listen(PORT);
const browser = await puppeteer.launch({ headless: "shell", executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`, args: ["--no-sandbox", "--mute-audio"] });
let bad = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) bad++; };
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_LUM = 38; // 옛 배경 실효 밝기 ≈ 18~28 → 빨강. 새 배경은 이보다 확실히 밝아야 한다
const CASES = [["meadow", "4-1", 1280, 720, false], ["canyon", "5-1", 1280, 720, false], ["volcano", "6-1", 1280, 720, false], ["meadow", "4-1", 915, 412, true]];
try {
  for (const [theme, diff, W, H, touch] of CASES) {
    const tag = `${theme}-${W}x${H}`;
    const page = await browser.newPage(); await page.setViewport({ width: W, height: H, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 });
    await seedSkipHowTo(page);
    const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
    await page.evaluateOnNewDocument(() => {
      window.__drawnSrc = new Map();
      const di = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) { const s = img && (img.__key || img.src); if (s) window.__drawnSrc.set(s, (window.__drawnSrc.get(s) || 0) + 1); return di.call(this, img, ...a); };
    });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 }); await sl(600);
    await page.evaluate((d) => document.querySelector(`.difficulty-btn[data-difficulty="${d}"]`)?.click(), diff); await sl(3000);
    await page.evaluate(() => {
      const tiles = [...document.querySelectorAll(".placement-tile")].map((t) => ({ x: parseInt(t.style.left) + t.offsetWidth / 2, y: parseInt(t.style.top) + t.offsetHeight / 2 }));
      if (!tiles.length) return;
      ["plus", "ice", "cannon", "golden", "transcendent", "laser"].forEach((ty, i) => { const t = tiles[(i * 7) % tiles.length]; window.__mathcastle.qaPlaceTowerAt(ty, t.x, t.y); });
    });
    await sl(1200);
    // ① 배경 실효 밝기 = 배경 그림 평균 밝기 × (1 − 덮개 알파) + 덮개 색 × 알파
    const lum = await page.evaluate(async () => {
      const bg = getComputedStyle(document.getElementById("gameCanvas")).backgroundImage;
      const url = (bg.match(/url\("?([^")]+)"?\)/) || [])[1]; if (!url) return { url: null };
      const alpha = Number((bg.match(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/) || [0, 0])[1]);
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement("canvas"); c.width = 64; c.height = 40; const x = c.getContext("2d"); x.drawImage(img, 0, 0, 64, 40);
      const d = x.getImageData(0, 0, 64, 40).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const m = s / (d.length / 4); return { url: url.split("/").pop(), raw: m, alpha, eff: m * (1 - alpha) + 15 * alpha };
    });
    ok(lum.url && lum.url.includes(`bg-${theme}`), `${tag}: 배경 = ${lum.url}`);
    ok(lum.eff >= MIN_LUM, `${tag}: 배경 실효 밝기 ${lum.eff?.toFixed(1)} ≥ ${MIN_LUM} (그림 ${lum.raw?.toFixed(1)} · 덮개 ${lum.alpha})`);
    // ② 빈 자리 = 받침대 그림(캔버스) · 타일에 점선 네모 없음
    const tile = await page.evaluate(() => { const t = [...document.querySelectorAll(".placement-tile")].find((e) => e.style.display !== "none" && !e.classList.contains("tile-focus")); return t ? getComputedStyle(t).borderStyle : null; });
    const pd = await page.evaluate(() => window.__mathcastle.qaPedestals());
    ok(tile && tile !== "dashed" && pd.empty > 0 && pd.drawn === pd.empty, `${tag}: 빈 타워 자리 ${pd.empty}칸 전부 받침대(그린 ${pd.drawn} · 테두리 ${tile})`);
    // ②-b 받침대 그림이 길(연석)을 밟지 않는다 — 칸은 길에서 떨어져 깔려도 그림을 아래로 내리면 길 윗줄 받침대가 연석에 걸쳤다
    //      (2026-10-11 사용자 «타워 위치가 길위로 오는건 아니지?»). 모든 칸의 받침대 상자 ↔ 길 중심선 거리 ≥ 길 그림 폭의 절반.
    const over = await page.evaluate(() => {
      const P = window.__mathcastle.qaPedestals(), pts = window.__mathcastle.qaPathPoints(); let worst = Infinity, out = 0;
      for (const b of P.boxes) {
        if (b.b > b.tileB + 0.5) out++;
        for (const p of pts) { const dx = Math.max(b.l - p.x, 0, p.x - b.r), dy = Math.max(b.t - p.y, 0, p.y - b.b); worst = Math.min(worst, Math.hypot(dx, dy) - P.roadHalf); }
      }
      return { worst, out, n: P.boxes.length };
    });
    ok(over.worst >= 0 && over.out === 0, `${tag}: 받침대 ${over.n}개가 길을 안 밟는다(가장 가까운 여유 ${over.worst.toFixed(1)}px · 칸 밖으로 삐진 것 ${over.out})`);
    // ③ 지은 타워 발밑 받침대
    const ped = await page.evaluate(() => [...window.__drawnSrc.entries()].filter(([k]) => /tile-pedestal/.test(k)).reduce((a, [, n]) => a + n, 0));
    ok(ped > 0, `${tag}: 타워 발밑 받침대가 캔버스에 그려졌다(${ped}회)`);
    // ④ 연석 — 길 중심선에서 법선 방향으로 길 폭 절반 + 연석 중간 지점의 색이 회색 돌(채도 낮고 밝기 중간)
    const curb = await page.evaluate(() => {
      const pts = window.__mathcastle.qaPathPoints(); const cv = document.getElementById("pathCanvas"); const x = cv.getContext("2d");
      const k = cv.width / innerWidth; let hit = 0, n = 0;
      for (let i = 20; i < pts.length - 20; i += 37) {
        const a = pts[i], b = pts[i + 1]; const len = Math.hypot(b.x - a.x, b.y - a.y) || 1; const px = -(b.y - a.y) / len, py = (b.x - a.x) / len;
        if (Math.abs(py) < 0.9) continue; // 가로 구간만(세로 구간은 그림자 방향이 달라 판정 제외)
        const ws = window.__mathcastle.qaCastleLayout().ws; const off = 25 * ws + 6 * ws; // 길 폭 절반 + 연석 안쪽
        const sx = Math.round((a.x - px * off) * k), sy = Math.round((a.y - py * off) * k);
        const [r, g, bl, al] = x.getImageData(sx, sy, 1, 1).data; n++;
        const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
        if (al > 200 && mx - mn < 40 && mx > 90 && mx < 230) hit++;
      }
      return { hit, n };
    });
    ok(curb.n > 3 && curb.hit / curb.n >= 0.6, `${tag}: 길 가장자리에 회색 돌 연석(${curb.hit}/${curb.n})`);
    await page.screenshot({ path: join(ROOT, "screenshots", `map3d-${tag}.png`) });
    ok(!errs.length, `${tag}: 콘솔 에러 0 (${errs.slice(0, 2).join(" | ")})`);
    await page.close();
  }
} finally { await browser.close(); server.close(); }
console.log(bad ? `❌ map3d ${bad}` : "✅ map3d"); process.exit(bad ? 1 : 0);
