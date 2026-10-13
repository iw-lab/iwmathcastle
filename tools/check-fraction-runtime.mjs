#!/usr/bin/env node
// 🔒 분수 표기 «실행 중» 게이트 — 화면에 실제로 보이는 글자(DOM 글자·SVG <text>·캔버스 fillText)에서 빗금 분수를 찾는다.
// 왜: 정적 게이트(check-fraction-display.mjs)는 «렌더러를 한 곳이라도 부르면» 통과라, 짝 맞추기 카드·수직선 눈금·그림 글자·
//     해설처럼 렌더러를 안 거친 경로의 «3/4» 가 그대로 배포됐다(2026-10-13 사용자 제보: 「아직도 분수를 / 로 하는 애들이 있다」).
//     «부른다» 가 아니라 «보이는 글자에 빗금 분수가 없다» 를 잰다.
// 사용(puppeteer 페이지에서):
//   import { installFracHooks, probeFractions } from '~/.claude/skills/game-builder/tools/check-fraction-runtime.mjs'
//   await installFracHooks(page)              // goto 전에 — 캔버스 fillText/strokeText 기록
//   const hits = await probeFractions(page)   // 화면마다 — [{ where, text }] · 0 이어야 통과
//   CLI: node check-fraction-runtime.mjs <url> [--clicks 40] [--json]   (아무 단추나 눌러 화면을 돌며 잰다 · 전수 조사용)
//        node check-fraction-runtime.mjs --selftest
// 예외: 분수가 아닌 «3/10»(진행 칸·점수)는 그 요소(또는 조상)에 data-frac-ok 속성을 단다. 쌓은 분수 안(.frac)은 건너뛴다.

// 빗금 분수: 「3/4」「-3/4」「x/2」「(t-7)/3」「2/(x+1)」. 「km/h」「m/s」 같은 단위(글자/글자 2자 이상)·URL·날짜 «10/13(월)» 은 아니다.
// 글자/글자(«m/s»·«x/y»)는 단위와 못 가르니 보지 않는다 — 글자 분자는 수·괄호 분모일 때만.
export const SLASH_FRAC_SRC = String.raw`(?:(?<![\w.\/:])\d{1,6}|\))\s*\/\s*(?:\d{1,6}(?![\w\/])|\(|[a-z](?![A-Za-z]))|(?<![\w.\/:])[a-z]\s*\/\s*(?:\d{1,6}(?![\w\/])|\()`;

// 페이지 안에서 도는 탐침(함수 그대로 evaluate 한다 — 바깥 변수 참조 금지)
export function pageProbe(src) {
  const RE = new RegExp(src);
  const out = [];
  const hidden = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { if (e.hasAttribute('data-frac-ok') || e.classList.contains('frac') || e.classList.contains('frac-n') || e.classList.contains('frac-d')) return 'ok'; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return true; } return false; };
  const roots = [document.body, ...[...document.querySelectorAll('*')].map((e) => e.shadowRoot).filter(Boolean)];
  for (const root of roots) {
    if (!root) continue;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = n.nodeValue; if (!t || !/\//.test(t)) continue;
      const p = n.parentElement; if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) continue;
      if (hidden(p)) continue;
      const r = p.getBoundingClientRect(); if (r.width === 0 && r.height === 0 && p.tagName.toLowerCase() !== 'text') continue;
      if (RE.test(t)) out.push({ where: (p.closest('[class]')?.className?.baseVal ?? p.closest('[class]')?.className ?? p.tagName).toString().slice(0, 40), text: t.trim().slice(0, 80) });
    }
  }
  // 입력칸 값(키패드 표시)
  for (const el of document.querySelectorAll('input:not([type=hidden]),output')) { const v = el.value ?? el.textContent; if (v && RE.test(v) && hidden(el) === false) out.push({ where: 'input', text: String(v).slice(0, 80) }); }
  for (const t of (window.__gbFracCanvas || [])) if (RE.test(t)) out.push({ where: 'canvas', text: String(t).slice(0, 80) });
  window.__gbFracCanvas = [];
  return out;
}

export async function installFracHooks(page) {
  await page.evaluateOnNewDocument(() => {
    window.__gbFracCanvas = [];
    const P = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (!P) return;
    for (const k of ['fillText', 'strokeText']) { const f = P[k]; P[k] = function (t, ...a) { try { if (typeof t === 'string' && t.includes('/') && window.__gbFracCanvas.length < 500) window.__gbFracCanvas.push(t); } catch {} return f.call(this, t, ...a); }; }
  });
}
export async function probeFractions(page) { return page.evaluate(pageProbe, SLASH_FRAC_SRC); }

// ── 자체 시험: 빨강·초록 둘 다 나와야 게이트다
function selftest() {
  const RE = new RegExp(SLASH_FRAC_SRC);
  const red = ['3/4', '-3/4 + 1/2', '정답: 2/3', '(t-7)/3', 'x/2', '2/(x+1)', '1과 1/6', 'y = x/3 + 1', '7/7 = 1'];
  const green = ['km/h', 'm/s', 'https://a.b/c', '10/13(월)'.replace('10/13', '10월 13일'), '½', '3 ÷ 4', 'and/or', 'cm²', 'A/B 시험'];
  const bad = [...red.filter((s) => !RE.test(s)).map((s) => `놓침 ${s}`), ...green.filter((s) => RE.test(s)).map((s) => `오탐 ${s}`)];
  if (bad.length) { console.log('FAIL selftest\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log(`PASS selftest — 빨강 ${red.length} · 초록 ${green.length}`);
}

// ── CLI: 주소 하나를 열고 보이는 단추를 눌러 가며 화면마다 잰다(전수 조사용 · 게임 고유 e2e 가 있으면 그쪽에 probeFractions 를 심는 게 정본)
async function cli(url, clicks, json) {
  const { default: puppeteer } = await import(new URL('../node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js', import.meta.url).href).catch(() => import('puppeteer'));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const all = new Map();
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1024, height: 768 });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await installFracHooks(page);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    const take = async () => { for (const h of await probeFractions(page).catch(() => [])) all.set(h.where + '|' + h.text, h); };
    await take();
    let seed = 7;
    for (let i = 0; i < clicks; i++) {
      const n = await page.evaluate((s) => {
        const bs = [...document.querySelectorAll('button,[role=button],a[href^="#"],a[href^="?"],.btn,.choice,.card')].filter((b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && !b.disabled && !/삭제|지우기|초기화|reset|delete|로그아웃|나가기|quit/i.test(b.textContent || ''); });
        if (!bs.length) return 0; bs[s % bs.length].click(); return bs.length;
      }, seed).catch(() => 0);
      seed = (seed * 1103515245 + 12345) % 2147483647;
      if (!n) { await page.mouse.click(512, 400).catch(() => {}); await page.keyboard.press('Space').catch(() => {}); }
      await new Promise((r) => setTimeout(r, 350));
      await take();
    }
  } finally { await browser.close(); }
  const hits = [...all.values()];
  if (json) console.log(JSON.stringify({ url, hits: hits.length, sample: hits.slice(0, 30) }));
  else if (!hits.length) console.log(`PASS 실행 중 분수 표기 — 보이는 글자에 빗금 분수 0 (${url}, 클릭 ${clicks})`);
  else { console.log(`FAIL 실행 중 분수 표기 — 빗금 분수 ${hits.length}곳 (${url})`); for (const h of hits.slice(0, 15)) console.log(`  [${h.where}] ${h.text}`); console.log('  처방: kit/frac/frac.js 의 setMath/fracHTML/mathCanvas 로 그린다 · 분수 아닌 진행 칸은 data-frac-ok'); }
  process.exit(hits.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') selftest();
  else if (a[0]) { const i = a.indexOf('--clicks'); await cli(a[0], i >= 0 ? Number(a[i + 1]) : 40, a.includes('--json')); }
  else { console.log('사용: check-fraction-runtime.mjs <url> [--clicks N] [--json] | --selftest'); process.exit(2); }
}
