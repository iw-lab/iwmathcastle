#!/bin/bash
# 2026-10-10 리마스터 목표 판정 — 썸네일 · 문제 8way · Firefly 3D · 배포. 전부 실측.
cd "$(dirname "$0")/.." || exit 1
fail=0; say(){ echo "$1"; }
curl -s "https://kingsmath.com/add/games-data-creator-simssijjang.js?t=$(date +%s)" | grep -o '"수학 성 수호자"[^}]*}[^}]*"thumb":"[^"]*"' | grep -q "1785154332" && { say "✖ 킹수학 썸네일 옛것"; fail=1; }
[ -f docs/XVAL-PROBLEMS.md ] && grep -q "FULL" docs/XVAL-PROBLEMS.md || { say "✖ 문제 8way 보고서 없음"; fail=1; }
r=$(node -e "try{console.log(Object.keys(require('./game-assets-src/render-ledger.json')).length)}catch{console.log(0)}"); [ "$r" -ge 55 ] || { say "✖ 3D 렌더 원장 $r < 55"; fail=1; }
live=$(curl -sf -m 10 "https://mathcastle.pages.dev/?v=$RANDOM" | grep -o 'data-build="[^"]*"' | head -1); loc="data-build=\"$(git rev-parse --short HEAD)\""   # tools/deploy.sh 가 커밋 해시를 찍는다
[ "$live" = "$loc" ] || { say "✖ 배포본($live) ≠ 로컬($loc)"; fail=1; }
git diff --quiet && git diff --cached --quiet || { say "✖ 커밋 안 된 변경"; fail=1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse @{u} 2>/dev/null)" ] || { say "✖ push 안 됨"; fail=1; }
[ $fail = 0 ] && say "✅ 수학성 수호자 리마스터 달성"; exit $fail
