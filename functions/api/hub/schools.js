// GET /api/hub/schools — 선행쌤 포털(sunhaengssam.web.app)이 10분마다 모으는 공용 허브 꼴.
// 이 게임의 기존 자체 "학교 대항전"(functions/api/school-board.js, 자체 D1)은 지우거나 바꾸지 않는다 —
// 같은 D1·같은 집계 쿼리를 재사용해 school-hub 키트 모양({today,weekly,stats})으로 "변환만" 해서 추가로 내보낸다.
// 필드명은 kit/school-hub/hub/src/hub.js top()의 실제 응답을 그대로 맞춤: { day, week, today, weekly, stats },
// 각 줄 = { code, name, sido, s }.
//
// 🔴 한계(README 기준 — 허그 안 깨지는 쪽 선택): 이 게임의 D1은 학교별 "오늘 점수"를 따로 쌓지 않는다.
//   school_points 는 week_key 로만 집계하고, school_daily/dact 는 "학교"가 아니라 "출처(일자별 솔트 IP 해시)"
//   단위 하루 합계라 학교별 오늘 순위로 못 바꾼다. 이번 주 값을 today 에 끼워 넣으면 포털이 "오늘"이라고
//   잘못 보여주므로, 거짓 데이터보다 빈 배열이 낫다고 판단해 today 는 항상 [] 로 낸다.
import { kstDayKey, weekKeyOf } from "../_util.js";
import { SCHOOL, SIDO, ensureSchool, schoolStats } from "../_school.js";

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const day = kstDayKey();
  const week = weekKeyOf(day);
  try {
    const cache = caches.default;
    const key = new Request(`${u.origin}/api/hub/schools/v1/${week}`);
    const hit = await cache.match(key);
    if (hit) return hit;

    await ensureSchool(env.DB);
    const r = await env.DB
      .prepare(
        "SELECT p.code, s.short AS name, s.sido, p.points FROM school_points p JOIN schools s ON s.code = p.code WHERE p.week_key = ? ORDER BY p.points DESC, p.code ASC LIMIT ?",
      )
      .bind(week, SCHOOL.ALL)
      .all();
    const weekly = (r.results || []).map((row) => ({
      code: row.code,
      name: row.name,
      sido: SIDO[row.sido] || "",
      s: row.points | 0,
    }));

    let stats = null;
    try {
      stats = await schoolStats(env.DB, day);
    } catch {
      stats = null; // 통계가 깨져도 순위는 나간다(school-board.js 와 같은 원칙)
    }

    const body = { day, week, today: [], weekly, stats };
    const res = Response.json(body, { headers: { "cache-control": "public, max-age=30" } });
    await cache.put(key, res.clone());
    return res;
  } catch (e) {
    return Response.json({ error: "학교 순위를 불러오지 못했어요" }, { status: 500 });
  }
}
