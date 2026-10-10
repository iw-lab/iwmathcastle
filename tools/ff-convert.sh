#!/usr/bin/env bash
# 2D 원화(assets/concept-3d/*.png) → Firefly Boards 이미지→3D → assets/models/ff/*.glb. 없는 것만, 2개씩 — 다 될 때까지 돈다.
set -u
R="$(cd "$(dirname "$0")/.." && pwd)"; C="$R/game-assets-src/concept-3d"; O="$R/game-assets-src/ff"; LOG="$O/convert.log"
fails=0
while :; do
  todo=(); for f in "$C"/*.png; do k=$(basename "$f" .png); [ -f "$O/$k.glb" ] || todo+=(--in "$f" --out "$O/$k.glb"); [ ${#todo[@]} -ge 8 ] && break; done
  [ ${#todo[@]} -eq 0 ] && { echo "ALL_DONE $(ls "$O"/*.glb | wc -l)" >> "$LOG"; exit 0; }
  pgrep -f "firefly-3d.mjs --in" >/dev/null && { sleep 20; continue; }   # 다른 변환이 돌면 기다린다(공유 크롬 한 창씩)
  echo "== $(date +%T) $(( ${#todo[@]} / 4 )) 개 변환: ${todo[1]##*/}" >> "$LOG"
  node ~/.claude/bin/firefly-3d.mjs "${todo[@]}" --timeout 600 >> "$LOG" 2>&1; rc=$?
  [ $rc -ne 0 ] && { echo "rc=$rc" >> "$LOG"; fails=$((fails+1)); [ $rc -eq 3 ] || [ $rc -eq 4 ] && { echo "STOP rc=$rc" >> "$LOG"; exit $rc; }; [ $fails -ge 8 ] && { echo "STOP 실패 8회" >> "$LOG"; exit 5; }; sleep 30; }
done
