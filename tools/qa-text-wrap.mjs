// tools/qa-text-wrap.mjs — 폰 가로에서 짧은 라벨이 한두 글자씩 세로로 쌓이지 않는가(2026-10-10 «모바일 시작 UI 가로모드 글씨 세로나열 심함»)
//   단추·칩·라벨(글자 ≤12)이 두 줄 이상으로 접히면 실패. 메뉴(첫 화면)와 게임 화면 둘 다, 실제 폰 가로 크기 여러 개
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8946;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]); const p = join(ROOT, u === "/" ? "index.html" : u); if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p)); }).listen(PORT);
const browser = await puppeteer.launch({ headless: "shell", executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`, args: ["--no-sandbox", "--mute-audio"] });
let bad = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) bad++; };
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = [[762, 352, "실기(갤럭시 2000×923)"], [740, 360, "작은 폰"], [844, 390, "아이폰"], [915, 412, "큰 폰"], [667, 375, "SE"]];
const scan = () => {
  const out = [];
  const els = document.querySelectorAll("button, a, label, .chip, .badge, [class*='btn'], [class*='tab'], h1, h2, h3, h4, span, div");
  for (const el of els) {
    if (el.closest("#touchPad")) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    // 자기 글자만 가진 잎(leaf) 또는 단추
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    if (!own || own.length > 12) continue;
    const range = document.createRange(); let lines = new Set();
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { range.selectNodeContents(n); for (const rc of range.getClientRects()) if (rc.width > 0) lines.add(Math.round(rc.top)); }
    // 접는 대신 nowrap 으로 칸 밖으로 삐져나가도 실패(단추 경계 밖 글자)
    if (lines.size === 1) { range.selectNodeContents(el); const tr = range.getBoundingClientRect(); const box = (el.closest("button") || el).getBoundingClientRect(); if (tr.width > 0 && (tr.right > box.right + 2 || tr.left < box.left - 2) && cs.textOverflow !== "ellipsis") out.push(`${own}(넘침 ${Math.round(tr.width)}>${Math.round(box.width)}px)`); }
    if (lines.size >= 2 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) out.push(`${own}(${lines.size}줄·${Math.round(r.width)}px)`);
  }
  return [...new Set(out)];
};
try {
  for (const [w, h, name] of SIZES) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await seedSkipHowTo(page);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 }); await sl(900);
    const m = await page.evaluate(scan);
    ok(!m.length, `${name} ${w}×${h} 첫 화면: 접힌 라벨 ${m.length}개 ${m.slice(0, 6).join(" ")}`);
    await page.screenshot({ path: join(ROOT, "screenshots", `textwrap-menu-${w}x${h}.png`) });
    await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click()); await sl(2200);
    const g = await page.evaluate(scan);
    ok(!g.length, `${name} ${w}×${h} 게임 화면: 접힌 라벨 ${g.length}개 ${g.slice(0, 6).join(" ")}`);
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
console.log(bad ? `❌ text-wrap ${bad}` : "✅ text-wrap"); process.exit(bad ? 1 : 0);
