#!/usr/bin/env bash
# 수학 성 수호자 배포 (2026-10-10) — 깃 자동배포 없음(Git Provider: No), 운영본은 naver 계정(4644562c…).
# 저장소 루트를 통째로 올리던 옛 방식은 tools/·game-assets-src/·screenshots/ 까지 공개했다(라이브 200 실측).
# → 화이트리스트로 스테이징 폴더를 만들어 그것만 올린다. index.html 에 data-build="<커밋>" 를 찍어 라이브와 대조한다.
#   bash tools/deploy.sh          (깨끗한 트리 + push 된 커밋만)
set -euo pipefail
R="$(cd "$(dirname "$0")/.." && pwd)"; cd "$R"
WR=/Users/sim-insu/Documents/dev/defence/node_modules/.bin/wrangler
CFH=/Users/sim-insu/Documents/dev/iwdraw/.cf-home          # naver 계정 OAuth 가 든 홈(설정 사본 금지 — 경로로만 쓴다)
git diff --quiet && git diff --cached --quiet || { echo "✖ 커밋 안 된 변경이 있다"; exit 2; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse @{u})" ] || { echo "✖ push 먼저"; exit 2; }
HOME=$CFH $WR whoami 2>&1 | grep -q 4644562c4caa65bcd406fbbe6f104e59 || { echo "✖ naver 계정(4644562c…)이 아니다 — 배포 중단"; exit 3; }
B=$(git rev-parse --short HEAD); S=$(mktemp -d "${TMPDIR:-/tmp}/mc-deploy.XXXXXX")
cp ./*.html ./*.js ./*.css _headers site.webmanifest wrangler.toml "$S"/
cp -R assets problems functions "$S"/
sed -i '' "s/<html lang=\"ko\"[^>]*>/<html lang=\"ko\" data-build=\"$B\">/" "$S/index.html"
grep -q "data-build=\"$B\"" "$S/index.html" || { echo "✖ 빌드 표식 실패"; exit 4; }
echo "▶ 스테이징 $(du -sh "$S" | cut -f1) · build $B"
[ "${DRY:-}" = 1 ] && { echo "STAGE=$S"; exit 0; }
(cd "$S" && HOME=$CFH $WR pages deploy . --project-name mathcastle --branch main --commit-dirty=true 2>&1 | tail -3)
for i in $(seq 1 20); do
  live=$(curl -sf -m 10 "https://mathcastle.pages.dev/?v=$RANDOM" | grep -o 'data-build="[^"]*"' | head -1 || true)
  [ "$live" = "data-build=\"$B\"" ] && { echo "✅ 라이브 = $B"; break; }; sleep 6
done
[ "$live" = "data-build=\"$B\"" ] || { echo "✖ 라이브($live) ≠ $B"; exit 5; }
for p in tools/qa-smoke.mjs game-assets-src/gen-batch.sh screenshots/smoke-1-menu.png; do
  c=$(curl -s -o /dev/null -w "%{http_code}" "https://mathcastle.pages.dev/$p"); [ "$c" = 404 ] || echo "⚠ 아직 열림: /$p ($c)"
done
