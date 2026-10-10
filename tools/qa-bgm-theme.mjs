// tools/qa-bgm-theme.mjs — 배경 테마별 전투 BGM(2026-10-10 «bgm 몇 개 넣자»)
//   ① 3·5·6학년 판에서 각각 풀밭·협곡·화산 곡 «파일»이 실제로 흐른다(재생 위치 증가) ② 세 곡이 서로 다른 파일
//   ③ 곡 파일이 없을 때(404) 무음이 아니라 절차 합성으로 대체된다
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { createHash } from "crypto";
import { seedSkipHowTo } from "./qa-common.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8947;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg", ".svg": "image/svg+xml" };
let block = null;
const server = createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]); const p = join(ROOT, u === "/" ? "index.html" : u); if (!p.startsWith(ROOT) || !existsSync(p) || (block && u.endsWith(block))) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p)); }).listen(PORT);
const browser = await puppeteer.launch({ headless: "shell", executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
let bad = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) bad++; };
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
async function start(grade) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720 }); await seedSkipHowTo(page);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 }); await sl(600);
  await page.mouse.click(5, 5);   // 사용자 제스처(오디오 언락)
  await page.evaluate((g) => document.querySelector(`.difficulty-btn[data-difficulty="${g}"]`)?.click(), grade); await sl(2500);
  const st = () => page.evaluate(() => window.__mathcastle.getState().bgm);
  return { ctx, page, st };
}
try {
  const seen = {};
  for (const [g, want] of [["3-1", "gameplay-meadow"], ["5-1", "gameplay-canyon"], ["6-1", "gameplay-volcano"]]) {
    const { ctx, st } = await start(g);
    const a = await st(); await sl(800); const b = await st();
    ok(a.track === want && b.src === `${want}.mp3` && b.t > a.t && !b.paused, `${g} → ${want} 파일이 흐른다(곡 ${b.track} · ${b.src} · ${a.t.toFixed(2)}→${b.t.toFixed(2)}초)`);
    const f = join(ROOT, "assets/audio/bgm", `${want}.mp3`); seen[want] = existsSync(f) && readFileSync(f).length > 50000 ? createHash("md5").update(readFileSync(f)).digest("hex").slice(0, 8) : "없음";
    await ctx.close();
  }
  ok(new Set(Object.values(seen)).size === 3 && !Object.values(seen).includes("없음"), `세 곡이 서로 다른 파일(${JSON.stringify(seen)})`);
  block = "gameplay-canyon.mp3";
  { const { ctx, st } = await start("5-1"); await sl(1500); const c = await st(); ok(c.synth, `곡 파일 404 → 절차 합성으로 대체(무음 아님 · synth=${c.synth})`); await ctx.close(); }
  block = null;
} finally { await browser.close(); server.close(); }
console.log(bad ? `❌ bgm-theme ${bad}` : "✅ bgm-theme"); process.exit(bad ? 1 : 0);
