// tools/qa-layout-heal.mjs — 화면 크기가 바뀌었는데 길이 옛 크기로 남는가(2026-10-11 «자동최대화였다가 나갔다 왔더니 경로가 달라짐»).
//   폰에서 전체화면이 풀리거나 앱을 오가면 resize 이벤트가 빠지거나 중간 크기로 와서, 길이 옛 높이로 깔린 채
//   아래 길 줄이 컨트롤 바 밑으로 숨었다. resize 를 일부러 삼켜서(놓친 이벤트 재현) 길이 스스로 새 화면을 따라오는지 본다.
//   node tools/qa-layout-heal.mjs [포트]
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8951;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  const p = join(ROOT, u === "/" ? "index.html" : u);
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(PORT);
const browser = await puppeteer.launch({ headless: "shell", executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`, args: ["--no-sandbox", "--mute-audio"] });
let bad = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const measure = (page) => page.evaluate(() => {
  const pts = window.__mathcastle.qaPathPoints();
  const ctrl = document.getElementById("control-bar").getBoundingClientRect().top;
  const info = document.getElementById("info-bar").getBoundingClientRect().bottom;
  return { maxY: Math.max(...pts.map((p) => p.y)), minY: Math.min(...pts.map((p) => p.y)), maxX: Math.max(...pts.map((p) => p.x)), ctrl, info, w: innerWidth };
});
try {
  // [태그, 시작 크기(전체화면), 바뀐 크기(주소창 복귀)]
  for (const [tag, from, to] of [["fs-exit", [915, 412], [915, 330]], ["fs-enter", [915, 330], [915, 412]], ["rotate-ish", [915, 412], [760, 360]]]) {
    const page = await browser.newPage();
    await page.setViewport({ width: from[0], height: from[1], isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
    await seedSkipHowTo(page);
    // 놓친 이벤트 재현용 스위치 — 게임이 거는 크기 변화 리스너를 감싸 __swallow 가 켜지면 안 부른다
    //   (window 캡처 리스너 + stopImmediatePropagation 은 게임 리스너보다 늦게 돌아서 못 막는다 — 실측)
    await page.evaluateOnNewDocument(() => {
      const orig = EventTarget.prototype.addEventListener;
      const SIZE = new Set(["resize", "orientationchange", "fullscreenchange", "webkitfullscreenchange"]);
      EventTarget.prototype.addEventListener = function (t, fn, o) {
        if (SIZE.has(t) && typeof fn === "function") { const inner = fn; fn = function (e) { if (!window.__swallow) return inner.call(this, e); }; }
        return orig.call(this, t, fn, o);
      };
    });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
    await sleep(800);
    await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click());
    await sleep(2500);
    // 놓친 이벤트 재현 — 크기 변화 신호를 게임보다 먼저 가로채 삼킨다
    await page.evaluate(() => { window.__swallow = true; });
    await page.setViewport({ width: to[0], height: to[1], isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
    await sleep(3000);
    const m = await measure(page);
    const half = 12; // 길 폭 절반의 최소치 — 길 중심선이 바 안쪽에 있어야 보인다
    ok(m.maxY + half <= m.ctrl && m.minY - half >= m.info, `${tag} ${from.join("×")}→${to.join("×")}: 길 y ${Math.round(m.minY)}~${Math.round(m.maxY)} · 플레이 영역 ${Math.round(m.info)}~${Math.round(m.ctrl)}`);
    ok(m.maxY >= m.info + 0.6 * (m.ctrl - m.info), `${tag}: 길이 커진 화면을 채운다(맨 아래 줄 ${Math.round(m.maxY)} ≥ 플레이 영역 60% 지점 ${Math.round(m.info + 0.6 * (m.ctrl - m.info))})`);
    ok(m.maxX <= m.w, `${tag}: 길 오른쪽 끝 ${Math.round(m.maxX)} ≤ 화면 폭 ${m.w}`);
    await page.screenshot({ path: join(ROOT, "screenshots", `layout-heal-${tag}.png`) });
    await page.close();
  }
  // ── 첫 판 사용법 창 위에 알림이 안 덮이는가 + 전체화면 버튼이 글자로 상태를 말하는가 (PC) ──
  {
    const ctx = await browser.createBrowserContext(); // 위 페이지들이 심은 «사용법 건너뛰기» 저장값과 분리
    const page = await ctx.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
    await sleep(800);
    await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click());
    await sleep(2500);
    await page.evaluate(() => window.__mathcastle.qaAddGold(5000)); // 사용법 창이 떠 있을 때 «올릴 수 있다» 조건을 만든다
    await sleep(300);
    const pops = () => [...document.querySelectorAll(".message-popup")].map((e) => e.textContent);
    const r1 = await page.evaluate((f) => ({ howto: document.getElementById("howToPlayModal")?.classList.contains("show"), fs: document.getElementById("fullscreenBtn").textContent, toasts: eval(f)() }), `(${pops})`);
    ok(r1.howto, "pc: 첫 판에 사용법 창이 뜬다");
    ok(/크게|작게/.test(r1.fs), `pc: 전체화면 버튼이 글자로 보인다(「${r1.fs}」)`);
    const over = r1.toasts.filter((t) => t.includes("올릴 수 있어요"));
    ok(over.length === 0, `pc: 사용법 창 위에 마법사 알림이 안 덮인다(${over.join(" / ").slice(0, 60)})`);
    await page.click("#closeHowToPlayBtn");
    await sleep(600);
    const r2 = await page.evaluate((f) => eval(f)(), `(${pops})`);
    ok(r2.some((t) => t.includes("올릴 수 있어요")), `pc: 창을 닫으면 미뤄 둔 마법사 알림이 뜬다(${r2.length}개)`);
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
console.log(bad ? `❌ layout-heal ${bad}` : "✅ layout-heal"); process.exit(bad ? 1 : 0);
