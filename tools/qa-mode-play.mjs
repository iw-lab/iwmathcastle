#!/usr/bin/env node
// tools/qa-mode-play.mjs — 모드 4종을 «진짜로» 플레이한다(2026-10-10 사용자 «모든 모드 직접 테스트·디버깅·최적화»).
// qa-modes 는 규칙·배선을 글자로 본다 — 이건 브라우저에서 첫 화면 카드 클릭 → 타워 → 웨이브 → 웨이브 끝 문제(정답) →
// 축복 → 다음 웨이브 … → 게임오버까지 실제 루프를 돌리고, 모드별 불변식과 프레임 시간을 잰다.
//   node tools/qa-mode-play.mjs [포트=8961] [모드…]     (종료 코드 1 = 실패)
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8961;
const ONLY = process.argv.slice(3);
const GRADE = "4-1";
const PLAY_MS = Number(process.env.MODE_PLAY_MS) || 90e3;   // 모드당 실제 시간(2배속)
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  if (p.startsWith("/api/")) { res.writeHead(503, { "content-type": "application/json" }); return res.end("{}"); }   // 서버 없이 — 랭킹·학교는 조용히 실패해야 한다
  const fp = join(ROOT, p);
  if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[extname(fp)] || "application/octet-stream" }); res.end(readFileSync(fp));
});
await new Promise((r, j) => { server.on("error", j); server.listen(PORT, r); });

// 정답표 — 보기 묶음(정답+오답 3)으로 문제를 찾는다(문제 문장은 formatMath 로 HTML 이 된다)
const bank = (await import(join(ROOT, `problems/grade${GRADE}.js`))).default;
const keyOf = (vals) => vals.map(String).sort().join("|");
const answerBy = new Map();
for (const p of bank) answerBy.set(keyOf([p.a, ...(p.d || [])]), String(p.a));

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
});
let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); c ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODES = ["normal", "bossrush", "blitz", "chaos"].filter((m) => !ONLY.length || ONLY.includes(m));

for (const mode of MODES) {
  console.log(`\n[${mode}]`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/503|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  await seedSkipHowTo(page);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.evaluate(() => { for (const k of ["mathcastle:save", "mathcastle:modeBest", "mathcastle:mode"]) localStorage.removeItem(k); });
  await page.reload({ waitUntil: "networkidle0" });

  // ① 첫 화면 모드 카드
  const cards = await page.$$eval(".mode-btn", (bs) => bs.map((b) => b.querySelector(".mode-name")?.textContent));
  ok(cards.length === 4, `모드 카드 4장 (${cards.join("·")})`);
  const idx = ["normal", "bossrush", "blitz", "chaos"].indexOf(mode);
  await page.evaluate((i) => document.querySelectorAll(".mode-btn")[i].click(), idx);
  ok(await page.evaluate((i) => document.querySelectorAll(".mode-btn")[i].getAttribute("aria-checked") === "true", idx), "고른 카드가 선택 표시된다");
  await page.click(`.difficulty-btn[data-difficulty="${GRADE}"]`);
  await page.waitForFunction(() => window.__mathcastle?.getState().gameRunning !== undefined && document.getElementById("gameCanvas")?.style.display === "block", { timeout: 20000 });
  await sleep(1500);
  const s0 = await page.evaluate(() => window.__mathcastle.getState());
  ok(s0.gameMode === mode, `게임 상태의 모드 = ${s0.gameMode}`);
  if (mode === "bossrush") ok(s0.currentWave === 4 && s0.gold >= 500, `보스 러시 시작 = 웨이브 ${s0.currentWave} · 골드 ${s0.gold}`);
  else ok(s0.currentWave === 1, `시작 웨이브 ${s0.currentWave}`);

  // ② 타워(사람처럼 길 옆에 몇 대) · 2배속
  await page.evaluate(() => { window.__mathcastle.qaPlaceTowersNearPath("plus", 4); window.__mathcastle.qaPlaceTowersNearPath("multiply", 3); });
  await page.evaluate(() => { const b = document.getElementById("speedBtn"); if (b && b.textContent.trim().startsWith("1")) b.click(); });

  // 프레임 시간 기록(rAF 간격)
  await page.evaluate(() => { window.__ft = []; let last = performance.now(); const f = (t) => { window.__ft.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });

  // PROFILE=1 — 플레이 중 CPU 프로파일(자체 시간 상위 함수)과 50ms+ 긴 작업 수를 찍는다(최적화 진단용)
  const cdp = process.env.PROFILE ? await page.createCDPSession() : null;
  if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start");
    await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true }); }); }
  const waves = [s0.currentWave]; let answered = 0, wrong = 0, unknown = 0, blessings = 0, over = false, shot = false;
  const t0 = Date.now();
  while (Date.now() - t0 < PLAY_MS) {
    const st = await page.evaluate(() => {
      const M = window.__mathcastle, s = M.getState();
      const math = document.getElementById("mathModal")?.classList.contains("show");
      const opts = math ? [...document.querySelectorAll(".math-option")].filter((b) => !b.disabled).map((b) => b.dataset.value) : [];
      const bless = !document.getElementById("blessingOverlay")?.hidden;
      const go = document.getElementById("gameOverModal")?.classList.contains("show");
      const sb = document.getElementById("startWaveBtn");
      return { s, math, opts, bless, go, canStart: !!sb && !sb.disabled && sb.offsetParent !== null && !s.waveInProgress };
    });
    if (st.go) { over = true; break; }
    if (process.env.SHOT && !shot && st.s.monsters >= 6) { await page.screenshot({ path: join(ROOT, `screenshots/mode-${mode}.png`) }); shot = true; }   // SHOT=1 — 전투 장면 1장
    if (!waves.includes(st.s.currentWave)) waves.push(st.s.currentWave);
    if (st.math && st.opts.length) {
      const a = answerBy.get(keyOf(st.opts));
      if (!a) unknown++;
      const r = await page.evaluate((v) => window.__mathcastle.qaClickAnswer(v), a ?? st.opts[0]);
      if (r && r.wasCorrect) answered++; else wrong++;
      await sleep(400); continue;
    }
    if (st.bless) { await page.evaluate(() => window.__mathcastle.qaPickBlessing()); blessings++; await sleep(300); continue; }
    if (st.canStart) { await page.evaluate(() => document.getElementById("startWaveBtn").click()); await sleep(300); continue; }
    await sleep(250);
  }
  const s1 = await page.evaluate(() => window.__mathcastle.getState());
  const ft = await page.evaluate(() => { const a = window.__ft.slice(30).sort((x, y) => x - y); const q = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] || 0; return { n: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: a[a.length - 1] || 0 }; });
  console.log(`  · 웨이브 ${waves.join("→")} · 정답 ${answered} 오답 ${wrong} (정답표 밖 ${unknown}) · 축복 ${blessings} · 성 HP ${s1.castleHealth} · 골드 ${s1.gold} · 프레임 p50 ${ft.p50.toFixed(1)} p95 ${ft.p95.toFixed(1)} p99 ${ft.p99.toFixed(1)}ms`);
  if (cdp) {
    const { profile } = await cdp.send("Profiler.stop");
    const self = new Map(), dt = profile.timeDeltas, byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, i) => { const n = byId.get(id), f = n.callFrame; const k = `${f.functionName || "(anon)"} ${(f.url || "").split("/").pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
    const tot = [...self.values()].reduce((a, b) => a + b, 0);
    console.log("  · CPU 자체 시간 상위:"); [...self].sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([k, v]) => console.log(`      ${(100 * v / tot).toFixed(1).padStart(5)}%  ${k}`));
    const lt = await page.evaluate(() => window.__lt); console.log(`  · 긴 작업(50ms+) ${lt.length}건 · 최대 ${Math.max(0, ...lt)}ms · 합 ${lt.reduce((a, b) => a + b, 0)}ms`);
  }
  ok(waves.length >= (mode === "bossrush" ? 2 : 3) || over, `웨이브가 실제로 넘어간다 (${waves.length}개)`);
  ok(answered >= (mode === "bossrush" ? 1 : 2) && unknown === 0, `웨이브 끝 문제가 뜨고 풀린다 (정답 ${answered}, 못 찾음 ${unknown})`);
  if (mode === "bossrush") ok(waves.every((w) => w % 4 === 0), `보스 러시는 4의 배수 웨이브만 (${waves.join(",")})`);
  else ok(waves.every((w, i) => i === 0 || w === waves[i - 1] + 1), `웨이브 1씩 증가 (${waves.join(",")})`);
  ok(Number.isFinite(s1.gold) && s1.gold >= 0, `골드 정상 (${s1.gold})`);

  // ③ 게임오버 → 모드 최고 기록·메달 문구
  if (!over) { await page.evaluate(() => window.__mathcastle.qaForceGameOver()); await sleep(1500); }
  const go = await page.evaluate(() => ({ show: document.getElementById("gameOverModal")?.classList.contains("show"), text: document.getElementById("gameOverModal")?.textContent.replace(/\s+/g, " ") || "", best: localStorage.getItem("mathcastle:modeBest") }));
  ok(go.show, "게임오버 창이 뜬다");
  if (mode !== "normal") {
    const label = { bossrush: "보스", blitz: "번개", chaos: "혼돈" }[mode];
    ok(go.text.includes(label), `게임오버에 모드 이름(${label})`);
    ok(go.best && JSON.parse(go.best)[mode] >= 1, `모드 최고 기록 저장 (${go.best})`);
  }
  ok(errors.length === 0, `콘솔 에러 0 ${errors.slice(0, 3).join(" | ")}`);
  await page.close();
}
await browser.close(); server.close();
console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
