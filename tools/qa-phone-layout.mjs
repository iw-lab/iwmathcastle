// tools/qa-phone-layout.mjs — 폰 가로·PC 에서 «성이 길 끝에 서 있는가»를 잰다(2026-10-10 사용자 «성은 아래로 내려와 있고»).
//   성 그림 바닥이 길 끝점 아래로 «길 한 줄 간격(tileStep)» 이상 내려가면 FAIL — 옛 코드는 고정 110px 라 폰(한 줄 ≈60px)에서 두 줄 가까이 내려갔다.
//   node tools/qa-phone-layout.mjs [포트]   (스크린샷 = screenshots/phone-layout-*.png)
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8943;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split("?")[0]) === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(PORT);
const browser = await puppeteer.launch({ headless: "shell", executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`, args: ["--no-sandbox", "--mute-audio"] });   // qa-smoke 와 같은 브라우저
let bad = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) bad++; };
try {
  for (const [tag, w, h, touch] of [["phone-land", 915, 412, true], ["phone-land-short", 800, 360, true], ["pc", 1366, 768, false]]) {
    const page = await browser.newPage(); await page.setViewport({ width: w, height: h, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2.6 : 1 });
    await seedSkipHowTo(page);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click());
    await new Promise((r) => setTimeout(r, 2500));
    const L = await page.evaluate(() => window.__mathcastle?.qaCastleLayout?.());
    if (!L || !L.pathEnd || !L.castleRect) { ok(false, `${tag}: 배치 정보 없음 ${JSON.stringify(L)?.slice(0, 120)}`); continue; }
    const base = L.castleRect.y + L.castleRect.h, drop = base - L.pathEnd.y;
    ok(drop <= L.tile, `${tag} ${w}×${h}: 성 바닥이 길 끝점보다 ${Math.round(drop)}px 아래(허용 = 길 한 줄 ${Math.round(L.tile)}px · 축척 ${L.ws.toFixed(2)})`);
    if (L.hp) ok(L.hp.top >= base - 4 && L.hp.top - base <= 60, `${tag}: 체력 표시가 성 바로 밑(성 바닥 ${Math.round(base)} · 체력 위 ${Math.round(L.hp.top)})`);
    await page.screenshot({ path: join(ROOT, "screenshots", `phone-layout-${tag}.png`) }); await page.close();
  }
} finally { await browser.close(); server.close(); }
console.log(bad ? `❌ phone-layout ${bad}` : "✅ phone-layout"); process.exit(bad ? 1 : 0);
