-- 랭킹 테이블 (v6: 주간·월간 키 추가, 보존기간 400일)
CREATE TABLE IF NOT EXISTS rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  difficulty TEXT,
  ranking_date TEXT NOT NULL,
  week_key TEXT,   -- 예: 2026-W30 (ISO 주차, 월요일 시작)
  month_key TEXT,  -- 예: 2026-07
  created_at TEXT DEFAULT (datetime('now'))
);

-- 명예의 전당 테이블
CREATE TABLE IF NOT EXISTS hall_of_fame (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  difficulty TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- v6: 게임 세션 토큰 (치트 방어 — 최소 플레이 시간 검증, 1회용)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL, -- epoch ms
  used INTEGER DEFAULT 0
);

-- v6: 제출 로그 (IP 레이트 리밋 — 분당 3회)
CREATE TABLE IF NOT EXISTS submit_log (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL -- epoch ms
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_rankings_date_score ON rankings(ranking_date, score DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_week ON rankings(week_key, score DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_month ON rankings(month_key, score DESC);
CREATE INDEX IF NOT EXISTS idx_hof_score ON hall_of_fame(score DESC);
CREATE INDEX IF NOT EXISTS idx_submit_log_ip_ts ON submit_log(ip, ts);
-- 세션 청소(DELETE ... WHERE created_at < ?)가 풀스캔이 되지 않게 (발급 엔드포인트 DoS 방어)
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);

-- v11 (2026-10-10): 학교 대항전 — 학교 합계만(닉네임과 학교를 잇지 않는다). 함수가 첫 요청 때 CREATE IF NOT EXISTS 로도 만든다(functions/api/_school.js SCHOOL_SCHEMA).
CREATE TABLE IF NOT EXISTS schools (code TEXT PRIMARY KEY, name TEXT NOT NULL, short TEXT NOT NULL, sido TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS school_points (code TEXT NOT NULL, week_key TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, runs INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (code, week_key));
CREATE INDEX IF NOT EXISTS idx_school_points_week ON school_points(week_key, points DESC);
CREATE TABLE IF NOT EXISTS school_daily (who TEXT NOT NULL, day_key TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (who, day_key));
