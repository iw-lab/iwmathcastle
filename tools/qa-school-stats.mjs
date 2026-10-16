// 학교 순위 전체·첫 화면 통계 시험(2026-10-16) — 실제 스키마(트리거 포함)를 node:sqlite 에 얹어 D1 과 같은 배치 의미로 돌린다.
//   node tools/qa-school-stats.mjs   → 실패하면 rc 1
import { ensureSchool, schoolStats, grantStatements, SCHOOL, SCHOOL_SCHEMA } from "../functions/api/_school.js";
const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
function d1() {
  const raw = new DatabaseSync(":memory:");
  const stmt = (sql) => { let a = []; const o = { bind: (...x) => { a = x; return o; }, first: async () => raw.prepare(sql).get(...a) ?? null, all: async () => ({ results: raw.prepare(sql).all(...a) }),
    run: async () => { raw.prepare(sql).run(...a); return { meta: {} }; }, _x: () => (/^\s*SELECT/i.test(sql) ? raw.prepare(sql).all(...a) : raw.prepare(sql).run(...a)) }; return o; };
  return { raw, prepare: stmt, batch: async (l) => { raw.exec("BEGIN"); try { const r = l.map((s) => s._x()); raw.exec("COMMIT"); return r; } catch (e) { raw.exec("ROLLBACK"); throw e; } } };
}
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log("✖", m); } else console.log("✔", m); };
const DAY = "2026-10-16", NEXT = "2026-10-17", WEEK = "2026-W42";
const db = d1();
// 옛 허브 흉내 — 통계 트리거 없이 쌓인 기록: 학교 3곳, 주간 판 5회, 출처 2곳(어제)
await db.batch(SCHOOL_SCHEMA.slice(0, 4).map((q) => db.prepare(q)));
await db.raw.exec("INSERT INTO school_points (code, week_key, points, runs) VALUES ('1000001','2026-W41',10,3), ('1000002','2026-W41',4,2), ('1000003','2026-W42',1,0)");
await db.raw.exec("INSERT INTO school_daily (who, day_key, points) VALUES ('w1','2026-10-15',10), ('w2','2026-10-15',4), ('w3','2026-10-15',0)");
await ensureSchool(db);
let st = await schoolStats(db, DAY);
ok(st.schools === 3 && st.plays === 5 && st.today === 0 && st.playsToday === 0, `옛 기록 한 번 옮김 ${JSON.stringify(st)}`);
await ensureSchool(db);   // 두 번째는 다시 훑지 않는다 — 표지 'v'
await db.raw.exec("UPDATE cnt SET n = 99 WHERE k = 'plays'");
await ensureSchool(db);
ok((await schoolStats(db, DAY)).plays === 99, "두 번째 ensure 가 다시 이관(훑기)했다");
await db.raw.exec("UPDATE cnt SET n = 5 WHERE k = 'plays'");
// 학교 30곳이 각자 판 1번 — 새 학교 27곳 + 옛 3곳
const grant = async (ip, school, day = DAY, g = 3) => {
  await db.prepare("INSERT OR IGNORE INTO school_daily (who, day_key, points) VALUES (?, ?, 0)").bind(ip, day).run();
  const cur = (await db.prepare("SELECT points FROM school_daily WHERE who = ? AND day_key = ?").bind(ip, day).first()).points;
  await db.batch(grantStatements(db, { ip, dayKey: day, cur, grant: g, school, week: WEEK }));
};
for (let i = 0; i < 30; i++) { await db.prepare("INSERT OR IGNORE INTO schools (code, name, short, sido) VALUES (?, ?, ?, 'B10')").bind(String(1000001 + i), `학교${i}초등학교`, `학교${i}초`).run(); await grant(`ip${i % 4}`, String(1000001 + i)); }
const board = (await db.prepare("SELECT p.code FROM school_points p JOIN schools s ON s.code = p.code WHERE p.week_key = ? ORDER BY p.points DESC, p.code ASC LIMIT ?").bind(WEEK, SCHOOL.ALL).all()).results;
ok(board.length === 30, `20곳 넘는 학교가 다 온다: ${board.length}`);
st = await schoolStats(db, DAY);
ok(st.schools === 30 && st.plays === 35 && st.today === 4 && st.playsToday === 30, `통계 ${JSON.stringify(st)} (학교 30·누적 5+30·오늘 출처 4·오늘 판 30)`);
st = await schoolStats(db, NEXT);
ok(st.today === 0 && st.playsToday === 0 && st.plays === 35 && st.schools === 30, `다음 날 오늘 0 · 누적 그대로 ${JSON.stringify(st)}`);
await grant("ipX", "1000001", NEXT); st = await schoolStats(db, NEXT);
ok(st.today === 1 && st.playsToday === 1, `다음 날 첫 판 ${JSON.stringify(st)}`);
// 한도에 막혀 한 점도 안 오른 판(UPDATE 가 행을 안 바꿈)은 세지 않는다
const before = (await schoolStats(db, NEXT)).plays;
await db.batch(grantStatements(db, { ip: "ipX", dayKey: NEXT, cur: 12345, grant: 3, school: "1000001", week: WEEK }));
ok((await schoolStats(db, NEXT)).plays === before, "빗나간 적립이 판 수에 들어갔다");
ok(JSON.stringify(Object.keys(await schoolStats(db, DAY)).sort()) === '["plays","playsToday","schools","today"]', "통계에 합계 숫자 말고 다른 키가 있다");
console.log(bad ? `❌ school-stats ${bad}건` : "✅ school-stats 통과"); process.exit(bad ? 1 : 0);
