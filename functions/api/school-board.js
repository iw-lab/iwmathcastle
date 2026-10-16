// GET /api/school-board?code=1234567 — 이번 주 학교 순위(학교 합계만 · 사람 정보 0) + 우리 학교 자리·위 학교까지 남은 점수
import { kstDayKey, weekKeyOf } from "./_util.js";
import { isCode, SCHOOL, ensureSchool, schoolStats } from "./_school.js";
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url), code = u.searchParams.get("code"), week = weekKeyOf(kstDayKey());
  try {
    const cache = caches.default, key = new Request(`${u.origin}/api/school-board/v2/${week}`);
    let top = null, stats = null; const hit = await cache.match(key);
    if (hit) ({ top, stats } = await hit.json());
    else {
      await ensureSchool(env.DB);
      const r = await env.DB.prepare("SELECT p.code, s.short AS name, s.sido, p.points, p.runs FROM school_points p JOIN schools s ON s.code = p.code WHERE p.week_key = ? ORDER BY p.points DESC, p.code ASC LIMIT ?").bind(week, SCHOOL.ALL).all();
      top = r.results || [];
      try { stats = await schoolStats(env.DB, kstDayKey()); } catch { stats = null; }   // 통계가 깨져도 순위는 나간다
      await cache.put(key, new Response(JSON.stringify({ top, stats }), { headers: { "cache-control": "public, max-age=30" } }));
    }
    let mine = null;
    if (isCode(code)) {
      const m = await env.DB.prepare("SELECT points FROM school_points WHERE code = ? AND week_key = ?").bind(code, week).first();
      const pts = m?.points || 0;
      const above = await env.DB.prepare("SELECT COUNT(*) AS c, MIN(points) AS next FROM school_points WHERE week_key = ? AND points > ?").bind(week, pts).first();
      mine = { points: pts, rank: pts > 0 ? (above?.c || 0) + 1 : null, gap: above?.c ? (above.next - pts + 1) : 0 };
    }
    return Response.json({ week, top, mine, stats });
  } catch (e) {
    return Response.json({ error: "학교 순위를 불러오지 못했어요" }, { status: 500 });
  }
}
