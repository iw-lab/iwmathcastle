// 🏫 학교 대항전 — 클라이언트(2026-10-10 사용자 「학교대항전도 추가」).
// 학교는 NEIS 공식 목록에서 «고르기만»(자유 입력 저장 0). 이 기기에는 고른 학교(코드·이름)만, 서버에는 학교별 합계만.
// 판이 끝나 점수를 등록하면 서버가 «이번 판에 푼 웨이브 수»(최대 10)를 우리 학교 이번 주 점수에 더한다.
const KEY = "mathcastle:school";
const API = "/api";
export const SIDO = { B10: "서울", C10: "부산", D10: "대구", E10: "인천", F10: "광주", G10: "대전", H10: "울산", I10: "세종", J10: "경기",
  K10: "강원", M10: "충북", N10: "충남", P10: "전북", Q10: "전남", R10: "경북", S10: "경남", T10: "제주" };

export function mySchool() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); return s && /^\d{7}$/.test(s.code) ? s : null; } catch { return null; }
}
function saveSchool(s) { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* 저장 실패는 무시 */ } }

async function getJson(url, opts) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 10e3);
  try { const r = await fetch(url, { ...opts, signal: ac.signal }); const j = await r.json().catch(() => ({})); return r.ok ? j : { error: j.error || `HTTP ${r.status}` }; }
  catch { return { error: "인터넷 연결을 확인해 주세요" }; } finally { clearTimeout(t); }
}
export const searchSchools = (q, sido) => getJson(`${API}/school-search?q=${encodeURIComponent(q)}${sido ? `&sido=${sido}` : ""}`);
export async function selectSchool(code, sido) {
  const j = await getJson(`${API}/school-select`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, sido }) });
  if (j.school) saveSchool({ code: j.school.code, name: j.school.short, sido: j.school.sido, region: j.school.region });
  return j;
}
export const clearSchool = () => saveSchool(null);
export const fetchBoard = () => { const s = mySchool(); return getJson(`${API}/school-board${s ? `?code=${s.code}` : ""}`); };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** 첫 화면 «학교 대항전» 카드 */
export async function renderSchoolPanel() {
  const body = document.getElementById("schoolBody"), btn = document.getElementById("schoolPickBtn");
  if (!body) return;
  const s = mySchool();
  if (btn) btn.textContent = s ? "학교 바꾸기" : "우리 학교 고르기";
  body.textContent = "";
  if (!s) body.appendChild(el("p", "school-note", "우리 학교를 고르면 판마다 푼 문제만큼 학교 점수가 올라가요! 이번 주 1등 학교에 도전!"));
  const j = await fetchBoard();
  if (j.error) { body.appendChild(el("p", "school-note", "학교 순위를 불러오지 못했어요.")); return; }
  if (s) {
    const me = el("div", "school-me");
    me.append(el("span", "school-me-name", `🏫 ${s.name}`), el("span", "school-me-rank", j.mine?.rank ? `이번 주 ${j.mine.rank}위 · ${j.mine.points}점` : "이번 주 첫 점수를 올려 주세요!"));
    body.appendChild(me);
    if (j.mine?.rank > 1 && j.mine.gap > 0) body.appendChild(el("p", "school-gap", `⬆ 위 학교까지 ${j.mine.gap}점!`));
  }
  const panel = document.getElementById("schoolPanel"), all = j.top || [];
  if (panel) { panel.dataset.gb = "school-rank"; panel.dataset.gbV = "1.4"; panel.dataset.gbN = String(all.length); }
  // 첫 화면 통계 줄 — 합계 숫자뿐. 이 게임엔 기기 번호가 없어(닉네임·학교·사람을 잇지 않는 설계) «참여 기기»는 못 센다 → 학교 점수가 오른 판 기준
  const st = j.stats, fmt = (v) => (typeof v === "number" ? v.toLocaleString("ko-KR") : "–");
  const stats = el("div", "gb-stats"); stats.dataset.gb = "hub-stats";
  for (const [k, v] of [["참여 학교", st?.schools], ["오늘 이용", st?.today], ["오늘 판", st?.playsToday], ["누적 판", st?.plays]]) {
    const c = el("span"); c.append(el("b", null, fmt(v)), el("small", null, k)); stats.appendChild(c);
  }
  body.appendChild(stats);
  const ol = el("ol", "school-list");
  all.slice(0, 5).forEach((r, i) => {
    const li = el("li", "school-row" + (s && r.code === s.code ? " mine" : ""));
    li.append(el("span", "school-medal", ["🥇", "🥈", "🥉"][i] || `${i + 1}`), el("span", "school-name", r.name), el("span", "school-pts", `${r.points}점`));
    ol.appendChild(li);
  });
  if (!(j.top || []).length) ol.appendChild(el("li", "school-row empty", "이번 주 아직 점수가 없어요 — 첫 학교가 되어 보세요!"));
  body.appendChild(ol);
  if (all.length > 5) {
    const more = el("button", "rank-more gb-more", `전체 순위 보기 · ${all.length.toLocaleString("ko-KR")}개 학교`);
    more.type = "button"; more.dataset.gbAct = "more"; more.addEventListener("click", () => openRankAll(all));
    body.appendChild(more);
  }
}

/** 전체 순위 창 — 서버가 준 학교를 끝까지(최대 500). 우리 학교 강조·스크롤 · 닫기 */
function openRankAll(all) {
  const modal = document.getElementById("rankAllModal"), list = document.getElementById("rankAllList"), s = mySchool();
  if (!modal || !list) return;
  list.textContent = "";
  let me = null;
  all.forEach((r, i) => {
    const li = el("li", "school-row" + (s && r.code === s.code ? " mine" : ""));
    li.append(el("span", "school-medal", String(i + 1)), el("span", "school-name", r.name), el("span", "school-pts", `${r.points}점`));
    if (s && r.code === s.code) me = li;
    list.appendChild(li);
  });
  modal.classList.add("show");
  document.getElementById("rankAllCloseBtn").onclick = () => modal.classList.remove("show");
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove("show"); };
  if (me) me.scrollIntoView({ block: "center" });
}

/** 학교 고르기 창(검색 → 목록에서 탭) */
export function initSchoolPicker() {
  const modal = document.getElementById("schoolModal");
  if (!modal) return;
  const sidoSel = document.getElementById("schoolSido"), input = document.getElementById("schoolQuery"), list = document.getElementById("schoolResults"), msg = document.getElementById("schoolMsg");
  if (sidoSel && !sidoSel.options.length) {
    sidoSel.appendChild(new Option("전국", ""));
    for (const [k, v] of Object.entries(SIDO)) sidoSel.appendChild(new Option(v, k));
  }
  const open = () => { modal.classList.add("show"); list.textContent = ""; msg.textContent = "학교 이름의 일부를 입력하고 찾기를 누르세요 (예: 한빛)"; setTimeout(() => input.focus(), 50); };
  const close = () => modal.classList.remove("show");
  document.getElementById("schoolPickBtn")?.addEventListener("click", open);
  document.getElementById("schoolCloseBtn")?.addEventListener("click", close);
  const run = async () => {
    const q = input.value.trim(); if (!q) return;
    msg.textContent = "찾는 중…"; list.textContent = "";
    const j = await searchSchools(q, sidoSel.value);
    if (j.error) { msg.textContent = j.error; return; }
    msg.textContent = j.list.length ? "우리 학교를 누르세요" : "찾는 학교가 없어요. 이름을 조금 다르게 써 보세요.";
    for (const s of j.list) {
      const b = el("button", "school-pick");
      b.type = "button";
      b.append(el("b", null, s.name), el("span", null, ` ${s.region}`));
      b.addEventListener("click", async () => {
        msg.textContent = "확인 중…";
        const r = await selectSchool(s.code, s.sido);
        if (r.error) { msg.textContent = r.error; return; }
        close(); renderSchoolPanel();
      });
      list.appendChild(b);
    }
  };
  document.getElementById("schoolSearchBtn")?.addEventListener("click", run);
  input?.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); e.stopPropagation(); });
}
