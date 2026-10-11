// tools/qa-tower-shot.mjs — 새 3D 타워(2026-10-11) 실제 판 화면 + 공격 모션 확인
//   전 등급 타워를 배치 타일에 깔고 웨이브를 돌린다 → ① 쏜 타워가 있다(firedAt) ② 렌더러가 atk 프레임 키를 실제로 그렸다
//   ③ 콘솔 에러 0 · 스크린샷 screenshots/towers-<w>x<h>.png   사용: node tools/qa-tower-shot.mjs [w h]
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [W, H] = [Number(process.argv[2]) || 1280, Number(process.argv[3]) || 720]; const PORT = 8952;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg", ".svg": "image/svg+xml" };
const server = createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]); const p = join(ROOT, u === "/" ? "index.html" : u); if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p)); }).listen(PORT);
const browser = await puppeteer.launch({ headless: "shell", executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`, args: ["--no-sandbox", "--mute-audio"] });
let bad = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) bad++; };
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = ["plus", "minus", "multiply", "divide", "ice", "poison", "stun", "meteor", "cannon", "skyDestroyer", "net", "laser", "multi-shot", "goldMine", "shredder", "repairStation", "copper", "silver", "golden", "ultimate", "transcendent"];
try {
  const page = await browser.newPage(); await page.setViewport({ width: W, height: H }); await seedSkipHowTo(page);
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    // 렌더러가 실제로 그린 스프라이트 키를 센다(drawImage 직전 getSprite 를 감쌀 수 없어 Image.src 로 역추적)
    window.__drawnSrc = new Map();
    const di = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) { const s = img && (img.__key || img.src); if (s) window.__drawnSrc.set(s, (window.__drawnSrc.get(s) || 0) + 1); return di.call(this, img, ...a); };
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 }); await sl(600);
  await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="6-1"]')?.click()); await sl(3000);
  const placed = await page.evaluate((types) => {
    const tiles = [...document.querySelectorAll(".placement-tile")].map((t) => ({ x: parseInt(t.style.left) + 20, y: parseInt(t.style.top) + 20 }));
    const step = Math.max(1, Math.floor(tiles.length / types.length));
    types.forEach((ty, i) => { const t = tiles[(i * step) % tiles.length]; window.__mathcastle.qaPlaceTowerAt(ty, t.x, t.y); });
    return window.__mathcastle.qaTowers().map((t) => t.type);
  }, TYPES);
  ok(new Set(placed).size >= TYPES.length - 1, `타워 ${new Set(placed).size}/${TYPES.length}종 배치`);
  await page.evaluate(() => document.getElementById("startWaveBtn")?.click()); await sl(9000);
  const fired = await page.evaluate(() => window.__mathcastle.qaTowers().length && window.__mathcastle.qaFiredTowers());
  ok(fired && fired.length > 0, `쏜 타워 ${fired ? fired.length : 0}개 (${(fired || []).slice(0, 6).join(",")})`);
  const drawn = await page.evaluate(() => [...window.__drawnSrc.keys()].filter((k) => /tower-.*-(atk|idle)-\d/.test(k)));
  ok(drawn.some((k) => /-atk-\d/.test(k)), `공격 프레임이 실제로 그려졌다(${drawn.filter((k) => /-atk-/.test(k)).length}장)`);
  ok(drawn.some((k) => /-idle-\d/.test(k)), `대기 프레임이 그려졌다(${drawn.filter((k) => /-idle-/.test(k)).length}장)`);
  ok(drawn.some((k) => /castle-keep-idle-\d/.test(k)) || (await page.evaluate(() => [...window.__drawnSrc.keys()].some((k) => /castle-keep-idle/.test(k)))), "성 대기 프레임이 그려졌다");
  await page.screenshot({ path: join(ROOT, "screenshots", `towers-${W}x${H}.png`) });
  ok(!errs.length, `콘솔 에러 0 (${errs.slice(0, 2).join(" | ")})`);
} finally { await browser.close(); server.close(); }
console.log(bad ? `❌ tower-shot ${bad}` : "✅ tower-shot"); process.exit(bad ? 1 : 0);
