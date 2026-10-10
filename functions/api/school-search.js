// GET /api/school-search?q=한빛&sido=B10 — NEIS 공식 목록 검색(자유 입력 학교명 저장 0 — 고른 코드는 school-select 가 다시 확인)
import { cleanQuery, isSido, neis, searchUrl } from "./_school.js";
export async function onRequestGet({ request }) {
  const u = new URL(request.url), q = cleanQuery(u.searchParams.get("q")), sido = u.searchParams.get("sido");
  if (!q) return Response.json({ list: [] });
  const list = await neis(searchUrl(q, isSido(sido) ? sido : undefined));
  if (!list) return Response.json({ error: "학교 목록 서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요." }, { status: 502 });
  return Response.json({ list }, { headers: { "cache-control": "public, max-age=300" } });
}
