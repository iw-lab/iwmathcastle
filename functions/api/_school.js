// 🏫 학교 대항전(2026-10-10 사용자 「학교대항전도 추가」) — 순수 함수(서버 전용). 꿀꺽행성·스쿨스타즈와 같은 규약.
// 🔴 개인정보: 학교는 «공식 목록(NEIS)에서 고른 코드»만(자유 입력 0) — 서버가 NEIS 에 다시 물어 확인한 이름만 저장한다.
//    저장하는 것 = 학교 코드·이름 + 학교별 주간 합계. **닉네임과 학교를 잇지 않는다**(누가 어느 학교인지 서버에 없다).
//    하루 상한의 열쇠도 닉네임이 아니라 일자별 솔트 IP 해시(_util.hashIp — 원문 IP 저장 0)다.
export const SCHOOL = {
  RUN_MAX: 10,   // 한 판 최대(=이번 세션에 푼 웨이브 수, 상한) — 모든 점수의 뿌리는 «푼 문제»(웨이브마다 1문제)
  DAY_CAP: 40,   // 같은 출처(IP 해시)의 하루 상한 — 학교망 NAT(반 전체가 한 IP)도 한 반이 하루 40점까지
  TOP: 10,
  ALL: 500,   // 첫 화면 «더보기» 전체 순위 상한(응답 ≈ 60B × N) — 5곳만 먼저 보이고 나머지는 더보기
};
export const SIDO = { B10: "서울", C10: "부산", D10: "대구", E10: "인천", F10: "광주", G10: "대전", H10: "울산", I10: "세종", J10: "경기",
  K10: "강원", M10: "충북", N10: "충남", P10: "전북", Q10: "전남", R10: "경북", S10: "경남", T10: "제주" };
const NEIS = "https://open.neis.go.kr/hub/schoolInfo", KIND = "초등학교";
export const isCode = (c) => /^\d{7}$/.test(String(c ?? ""));
export const isSido = (s) => typeof s === "string" && Object.prototype.hasOwnProperty.call(SIDO, s);
export function cleanQuery(q) {
  const s = String(q ?? "").normalize("NFC").replace(/[^0-9A-Za-z가-힣]/g, "").replace(/(초등학교|초교|초)$/, "");
  return s.length >= 1 && s.length <= 12 ? s : "";
}
export const shortName = (name) => String(name || "").replace(/초등학교$/, "초").slice(0, 10);
const ymdKst = (ms = Date.now()) => Number(new Date(ms + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ""));
function fromRow(r) {
  const code = String(r.SD_SCHUL_CODE ?? "").trim(), name = String(r.SCHUL_NM ?? "").trim();
  if (!isCode(code) || !name || name.startsWith("(가칭)") || String(r.SCHUL_KND_SC_NM) !== KIND) return null;
  if (Number(r.FOND_YMD) > ymdKst()) return null;
  const sido = String(r.ATPT_OFCDC_SC_CODE ?? "");
  return { code, name, short: shortName(name), sido, region: SIDO[sido] ?? "" };
}
export const searchUrl = (q, sido) => { const p = new URLSearchParams({ Type: "json", pIndex: "1", pSize: "8", SCHUL_KND_SC_NM: KIND, SCHUL_NM: q }); if (sido) p.set("ATPT_OFCDC_SC_CODE", sido); return `${NEIS}?${p}`; };
export const codeUrl = (code, sido) => { const p = new URLSearchParams({ Type: "json", pIndex: "1", pSize: "5", SD_SCHUL_CODE: code }); if (sido) p.set("ATPT_OFCDC_SC_CODE", sido); return `${NEIS}?${p}`; };
/** NEIS 응답 → 학교 배열(없으면 []). 형식이 이상하면 null(= 장애 — 캐시하지 않는다) */
export function parseNeis(j) {
  if (j?.RESULT?.CODE === "INFO-200") return [];
  const rows = j?.schoolInfo?.[1]?.row;
  return Array.isArray(rows) ? rows.map(fromRow).filter(Boolean) : null;
}
/** NEIS 조회 — 엣지 캐시 7일(학교 목록은 거의 안 바뀐다). 장애면 null */
export async function neis(url) {
  const cache = caches.default, key = new Request(url);
  try {
    const hit = await cache.match(key); if (hit) return await hit.json();
    const r = await fetch(url, { cf: { cacheTtl: 0 } }); if (!r.ok) return null;
    const list = parseNeis(await r.json()); if (!list) return null;
    await cache.put(key, new Response(JSON.stringify(list), { headers: { "content-type": "application/json", "cache-control": "public, max-age=604800" } }));
    return list;
  } catch { return null; }
}
/** 한 판의 학교 점수 = 이번 세션에 실제로 푼 웨이브 수(서버가 토큰 나이로 이미 검증한 sw), 1..RUN_MAX */
export const runPoints = (sw) => Math.max(0, Math.min(SCHOOL.RUN_MAX, Math.trunc(Number(sw) || 0)));
export const SCHOOL_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS schools (code TEXT PRIMARY KEY, name TEXT NOT NULL, short TEXT NOT NULL, sido TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS school_points (code TEXT NOT NULL, week_key TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, runs INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (code, week_key))",
  "CREATE INDEX IF NOT EXISTS idx_school_points_week ON school_points(week_key, points DESC)",
  // who = 일자별 솔트 IP 해시(닉네임 아님) — 학교와 사람을 잇지 않는다
  "CREATE TABLE IF NOT EXISTS school_daily (who TEXT NOT NULL, day_key TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (who, day_key))",
  // 🔴 첫 화면 통계(2026-10-16) — 세는 쿼리가 표를 통째로 훑으면 D1 무료 한도(하루 읽은 행 500만)를 갉아먹는다.
  //    그래서 «점수가 올라갈 때 트리거가 센다»: cnt(합계) · sch(점수를 낸 학교) · dact(그날 점수를 올린 출처) · dplay(그날 판 수). 읽을 땐 몇 줄만.
  //    이 게임엔 기기 번호가 없다 — 닉네임·학교·사람을 잇지 않는 설계라 «참여 기기/학생»은 못 센다. 센 것 = 학교 점수가 올라간 판뿐(학교를 안 정한 판은 없다).
  "CREATE TABLE IF NOT EXISTS cnt (k TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS sch (code TEXT PRIMARY KEY)",
  "CREATE TABLE IF NOT EXISTS dact (day_key TEXT NOT NULL, who TEXT NOT NULL, PRIMARY KEY (day_key, who))",
  "CREATE TABLE IF NOT EXISTS dplay (day_key TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)",
  "CREATE TRIGGER IF NOT EXISTS st_sch AFTER INSERT ON sch BEGIN INSERT OR IGNORE INTO cnt (k, n) VALUES ('schools', 0); UPDATE cnt SET n = n + 1 WHERE k = 'schools'; END",
  "CREATE TRIGGER IF NOT EXISTS st_points AFTER INSERT ON school_points BEGIN INSERT OR IGNORE INTO sch (code) VALUES (NEW.code); END",
  // 점수가 «실제로 올라간» 순간 = school_daily.points 가 늘 때(적립 batch 의 첫 문장) — 판 1회·그날 출처 1곳
  "CREATE TRIGGER IF NOT EXISTS st_daily AFTER UPDATE OF points ON school_daily WHEN NEW.points > OLD.points BEGIN INSERT OR IGNORE INTO dact (day_key, who) VALUES (NEW.day_key, NEW.who); INSERT OR IGNORE INTO dplay (day_key, n) VALUES (NEW.day_key, 0); UPDATE dplay SET n = n + 1 WHERE day_key = NEW.day_key; INSERT OR IGNORE INTO cnt (k, n) VALUES ('plays', 0); UPDATE cnt SET n = n + 1 WHERE k = 'plays'; END",
];
/** 통계 도입 전 기록을 한 번만 옮긴다(cnt 'v' 표지가 있으면 안 돈다). 그 한 번만 표를 훑는다. 옛 날짜별 판 수는 기록이 없어 오늘부터 센다. */
export const SCHOOL_BACKFILL = [
  // gb-scan-ok: 통계 도입 때 한 번만(cnt 'v' 가 있으면 안 돈다)
  "INSERT OR IGNORE INTO sch (code) SELECT DISTINCT code FROM school_points",
  // gb-scan-ok: 한 번만
  "INSERT OR IGNORE INTO dact (day_key, who) SELECT day_key, who FROM school_daily WHERE points > 0",
  // gb-scan-ok: 한 번만(트리거가 올린 값을 정확한 값으로 덮는다)
  "INSERT OR REPLACE INTO cnt (k, n) SELECT 'schools', COUNT(*) FROM sch UNION ALL SELECT 'plays', COALESCE(SUM(runs), 0) FROM school_points",
  "INSERT OR REPLACE INTO cnt (k, n) VALUES ('v', 1)",
];
/** 스키마 + 옛 기록 이관(한 번) */
export async function ensureSchool(db) {
  await db.batch(SCHOOL_SCHEMA.map((q) => db.prepare(q)));
  if (!(await db.prepare("SELECT n FROM cnt WHERE k = 'v'").first())) await db.batch(SCHOOL_BACKFILL.map((q) => db.prepare(q)));
}
/** 첫 화면 통계 — 합계 숫자뿐. schools = 점수를 낸 적 있는 학교 · today = 오늘 점수를 올린 출처(IP 해시) 수 · playsToday / plays = 학교 점수가 오른 판 수 */
export async function schoolStats(db, dayKey) {
  const c = Object.fromEntries(((await db.prepare("SELECT k, n FROM cnt WHERE k IN ('schools', 'plays')").all()).results || []).map((r) => [r.k, r.n | 0]));
  const one = async (q) => ((await db.prepare(q).bind(dayKey).first())?.n) | 0;
  return { schools: c.schools | 0, plays: c.plays | 0,
    today: await one("SELECT COUNT(*) AS n FROM dact WHERE day_key = ?"), playsToday: await one("SELECT n FROM dplay WHERE day_key = ?") };
}
/** 학교 점수 적립 한 번 = 두 문장(하루 한도 갱신 → 주간 합계) — 적립은 바로 앞 조건부 UPDATE 가 행을 바꿨을 때만(changes() > 0). 시험이 같은 문장을 쓴다 */
export const grantStatements = (db, { ip, dayKey, cur, grant, school, week }) => [
  db.prepare("UPDATE school_daily SET points = points + ? WHERE who = ? AND day_key = ? AND points = ?").bind(grant, ip, dayKey, cur),
  db.prepare("INSERT INTO school_points (code, week_key, points, runs) SELECT ?, ?, ?, 1 WHERE changes() > 0 ON CONFLICT(code, week_key) DO UPDATE SET points = points + excluded.points, runs = runs + 1").bind(school, week, grant),
];
