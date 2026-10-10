// tools/qa-touchpad.mjs — 폰 조작(왼쪽 조이스틱 · 오른쪽 건설/공격)이 «진짜 터치»로 먹는가(2026-10-10 사용자 «조이스틱·스킬 넣어줘»)
//   ① 조작부가 터치 기기에서 보이고 하단 바를 안 가린다 ② 조이스틱 오른쪽 끌기 → 마법사 x 증가 ③ 공격 → 쿨다운 시작 ④ 건설 → 건설 단계
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8944;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".svg": "image/svg+xml" };
const server = createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]); const p = join(ROOT, u === "/" ? "index.html" : u); if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p)); }).listen(PORT);
const browser = await puppeteer.launch({ headless: "shell", executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`, args: ["--no-sandbox", "--mute-audio"] });
let bad = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) bad++; };
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage(); await page.setViewport({ width: 915, height: 412, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await seedSkipHowTo(page);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 }); await sl(800);
  await page.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click()); await sl(2500);
  const box = await page.evaluate(() => { const r = (id) => document.getElementById(id)?.getBoundingClientRect()?.toJSON?.(); return { stick: r("tpStick"), atk: r("tpAtk"), build: r("tpBuild"), bar: r("control-bar") }; });
  ok(box.stick?.width > 60 && box.atk?.width > 50, `조작부가 보인다(조이스틱 ${Math.round(box.stick?.width)}px · 공격 ${Math.round(box.atk?.width)}px)`);
  ok(box.stick && box.bar && box.stick.bottom <= box.bar.top && box.atk.bottom <= box.bar.top, `하단 바를 안 가린다(조이스틱 아래 ${Math.round(box.stick?.bottom)} · 바 위 ${Math.round(box.bar?.top)})`);
  const st = () => page.evaluate(() => window.__mathcastle.getState());
  const x0 = (await st()).wizard.x;
  const cx = box.stick.x + box.stick.width / 2, cy = box.stick.y + box.stick.height / 2;
  const cdp = await page.target().createCDPSession();
  const tp = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  await tp("touchStart", cx, cy); for (let i = 1; i <= 6; i++) { await tp("touchMove", cx + i * 8, cy); await sl(30); } await sl(700); await tp("touchEnd");
  const x1 = (await st()).wizard.x;
  ok(x1 > x0 + 30, `조이스틱 오른쪽 → 마법사 x ${x0} → ${x1}`);
  await sl(300); const x2 = (await st()).wizard.x; await sl(300);
  ok((await st()).wizard.x === x2, "손을 떼면 멈춘다");
  const cd0 = JSON.stringify((await st()).spellCooldowns), auto0 = (await st()).autoCooldownUntil;
  await page.evaluate(() => { window.__msgs = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains("message-popup")) window.__msgs.push(n.textContent); }).observe(document.body, { childList: true }); }); await page.tap("#tpAtk"); await sl(600);
  const s1 = await st();
  ok(JSON.stringify(s1.spellCooldowns) !== cd0 || s1.autoCooldownUntil !== auto0, `공격 단추 → 마법이 나간다(쿨다운 ${cd0} → ${JSON.stringify(s1.spellCooldowns)})`);
  const msgs = await page.evaluate(() => window.__msgs); ok(!msgs.some((t) => t.includes("쿨타임")), `한 번 눌렀는데 «쿨타임» 안내가 안 뜬다(${JSON.stringify(msgs)})`);
  await page.tap("#tpBuild"); await sl(500);
  const s2 = await st(); const sel = await page.evaluate(() => getComputedStyle(document.getElementById("towerSelector")).display !== "none");
  const msgs2 = await page.evaluate(() => window.__msgs); ok(!msgs2.some((t) => t.includes("쿨타임")), `건설을 눌러도 «쿨타임» 안내가 안 뜬다(${JSON.stringify(msgs2)})`);
  ok(JSON.stringify(s2.spellCooldowns) === JSON.stringify(s1.spellCooldowns) && s2.projectiles <= s1.projectiles, "건설 단추가 마법을 같이 쏘지 않는다");
  ok(s2.buildStep !== "idle" || sel, `건설 단추 → 건설 단계(${s2.buildStep} · 선택창 ${sel})`);
  await page.screenshot({ path: join(ROOT, "screenshots", "touchpad.png") });
  // 데스크톱(마우스)에서는 안 보인다
  const pc = await browser.newPage(); await pc.setViewport({ width: 1366, height: 768 }); await seedSkipHowTo(pc);
  await pc.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 }); await sl(600);
  await pc.evaluate(() => document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click()); await sl(1500);
  ok(await pc.evaluate(() => getComputedStyle(document.getElementById("touchPad")).display === "none"), "PC(마우스)에서는 조작부를 안 띄운다");
} finally { await browser.close(); server.close(); }
console.log(bad ? `❌ touchpad ${bad}` : "✅ touchpad"); process.exit(bad ? 1 : 0);
