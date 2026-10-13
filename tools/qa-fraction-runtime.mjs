#!/usr/bin/env node
// tools/qa-fraction-runtime.mjs — 분수 «빗금» 표기가 화면에 안 나가는지 실게임에서 잰다(2026-10-13).
// 정적 게이트는 «렌더러를 부른다» 만 본다 → 여기서는 문제·오답 해설·시간초과·오답노트·결과창까지 «보이는 글자» 를 탐침한다.
// 0곳이어도 «분수 화면을 안 봤으면» 무효 → 쌓은 분수(.frac) 수가 1 이상이어야 통과.
// 사용: node tools/qa-fraction-runtime.mjs [포트=8941] [학기=5-1] [URL(배포본)]
import puppeteer from "puppeteer";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { installFracHooks, probeFractions } from "./check-fraction-runtime.mjs";

const PORT = Number(process.argv[2]) || 8941;
const SEM = process.argv[3] || "5-1";
const REMOTE = process.argv[4];
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };
let server;
if (!REMOTE) {
  server = createServer((req, res) => {
    let p = req.url.split("?")[0];
    if (p === "/") p = "/index.html";
    const fp = join(ROOT, p);
    if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[extname(fp)] || "application/octet-stream" });
    res.end(readFileSync(fp));
  });
  await new Promise((r, j) => { server.on("error", j); server.listen(PORT, r); });
}
const BASE = REMOTE || `http://127.0.0.1:${PORT}`;
const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args: ["--disable-gpu", "--no-sandbox", "--mute-audio"],
});
const hits = new Map();
let stacked = 0;
let code = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem("mathcastle:howto", JSON.stringify({ never: true })); } catch {} });
  await installFracHooks(page);
  const take = async (tag) => {
    for (const h of await probeFractions(page).catch(() => [])) hits.set(`${tag}|${h.where}|${h.text}`, h);
    stacked = Math.max(stacked, await page.evaluate(() => document.querySelectorAll(".frac").length).catch(() => 0));
  };
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 40000 });
  await take("menu");
  await page.evaluate((s) => document.querySelector(`.difficulty-btn[data-difficulty="${s}"]`).click(), SEM);
  await page.waitForFunction(() => window.__mathcastle?.getState().gameRunning === true, { timeout: 60000 });
  const probs = await page.evaluate(async (sem) => {
    const list = (await import(`/problems/grade${sem}.js`)).default;
    return list.filter((p) => /\d\/\d/.test(p.q + p.a + (p.d || []).join(" "))).filter((_, i) => i % 7 === 0).slice(0, 30);
  }, SEM);
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i];
    await page.evaluate((pp) => window.__mathcastle.qaShowProblem(pp), p);
    await take("problem");
    // 오답 → 해설, 정답 → 피드백
    const wrong = (p.d || [])[0];
    await page.evaluate((v, ok) => window.__mathcastle.qaClickAnswer(ok ? v : v), i % 2 ? wrong : p.a, true);
    await new Promise((r) => setTimeout(r, 40));
    await take("answer");
  }
  await page.evaluate(() => window.__mathcastle.qaForceGameOver());
  await new Promise((r) => setTimeout(r, 800));
  await take("result");
  // 메뉴 복귀 후 오답노트 패널
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 40000 });
  await take("menu2");
} finally { await browser.close(); server?.close(); }
const list = [...hits.values()];
console.log(`분수 탐침 — 빗금 ${list.length}곳 / 쌓은 분수 최대 ${stacked}개 (${BASE}, 학기 ${SEM})`);
for (const h of list.slice(0, 15)) console.log(`  [${h.where}] ${h.text}`);
if (list.length) code = 1;
if (stacked < 1) { console.log("FAIL 쌓은 분수 0 — 분수 화면을 보지 못했다(무효)"); code = 1; }
if (!code) console.log("PASS");
process.exit(code);
