// POST /api/school-select { code, sido } — NEIS 에 코드로 다시 물어 «진짜 초등학교»인 것만 학교표에 넣는다(이름은 NEIS 값만)
import { codeUrl, isCode, isSido, neis, ensureSchool } from "./_school.js";
export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }
  if (!isCode(b?.code)) return Response.json({ error: "학교 코드가 올바르지 않아요" }, { status: 400 });
  const list = await neis(codeUrl(String(b.code), isSido(b.sido) ? b.sido : undefined));
  if (!list) return Response.json({ error: "학교 목록 서버에 연결하지 못했어요" }, { status: 502 });
  const s = list.find((x) => x.code === String(b.code));
  if (!s) return Response.json({ error: "공식 목록에 없는 학교예요" }, { status: 404 });
  await ensureSchool(env.DB);
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO schools (code, name, short, sido) VALUES (?, ?, ?, ?)").bind(s.code, s.name, s.short, s.sido)]);
  return Response.json({ school: { code: s.code, name: s.name, short: s.short, sido: s.sido, region: s.region } });
}
