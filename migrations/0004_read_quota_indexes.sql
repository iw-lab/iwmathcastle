-- 무료 읽기 한도(계정 전체 D1 하루 500만 행) 초과 방지 — 색인 없는 ORDER BY/DELETE가 표 전체를 훑던 문제
-- 적용: npx wrangler d1 execute mathcastle-db --remote --file=migrations/0004_read_quota_indexes.sql
-- ✅ 전 구문 재실행 안전 (CREATE INDEX IF NOT EXISTS 뿐 — 0002처럼 ALTER TABLE 없음)

-- ① rankings 주간/월간 랭킹: "WHERE week_key=? GROUP BY name ORDER BY score DESC LIMIT 50" 가
--    기존 idx_rankings_week(week_key, score DESC)로는 GROUP BY name 단계에서 색인을 못 타고
--    표 전체를 훑었다(functions/api/rankings.js:51,57). name 을 색인에 끼워 GROUP BY 까지 받친다.
--    남는 ORDER BY 정렬은 그 주/달 제출분에만 묶이고(표 전체 아님) — 해당 줄에 gb-scan-ok 주석.
CREATE INDEX IF NOT EXISTS idx_rankings_week_name_score ON rankings(week_key, name, score DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_month_name_score ON rankings(month_key, name, score DESC);

-- ② submit_log 청소: "DELETE FROM submit_log WHERE ts < ?" 가 기존 idx_submit_log_ip_ts(ip, ts)는
--    선두 열이 ip 라서 못 타고 표 전체를 훑었다(functions/api/submit-score.js:88). ts 단독 색인 추가.
CREATE INDEX IF NOT EXISTS idx_submit_log_ts ON submit_log(ts);
