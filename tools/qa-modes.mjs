#!/usr/bin/env node
// tools/qa-modes.mjs — v11 게임 모드 게이트(2026-10-10 「더 다양한 모드」). 규칙(simCore) + 배선(main.js) + 서버(submit-score) 를 같이 본다.
//   node tools/qa-modes.mjs   (종료 코드 1 = 실패)
import { readFileSync } from "fs";
import * as S from "../simCore.js";
let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); c ? pass++ : fail++; };
console.log("[① 규칙 — simCore]");
ok(S.startWaveForMode("bossrush") === 4 && S.nextWaveForMode("bossrush", 4) === 8 && S.nextWaveForMode("normal", 4) === 5, "보스 러시는 4에서 시작해 4씩(보스 웨이브만) · 일반은 1씩");
for (let w = 4; w <= 40; w += 4) { const c = S.buildWaveComposition(w, () => 0.5); if (!c.some((k) => /boss|Boss|King|Dragon|archfiend|voidLord|titanGolem|wormQueen/.test(k))) { ok(false, `보스 러시 웨이브 ${w} 에 보스 없음`); break; } }
const g1 = S.bossrushSkipGold(4, 8), g5 = S.bossrushSkipGold(20, 24);
ok(g1 > 300 && g5 > g1, `보스 러시 건너뛴 웨이브 골드 > 0 · 뒤로 갈수록 커짐 (${g1} → ${g5})`);
let chaosNull = 0; for (let w = 2; w < 20; w++) if (!S.chaosModifier(w, Math.random)) chaosNull++;
ok(chaosNull === 0, "혼돈은 웨이브 2~19 매번 변이가 있다");
const bm = S.modeWaveModifier("blitz", 3, () => 0.5);
ok(bm && bm.speedFactor === S.GAME_MODES.blitz.speedFactor && bm.goldFactor === S.GAME_MODES.blitz.goldFactor, "번개전 = 속도·골드 배율이 변이로 얹힌다");
ok(Math.abs(S.spawnIntervalForMode("blitz", 5) - S.spawnIntervalMs(5, 1) * S.GAME_MODES.blitz.spawnFactor) < 1e-9 && S.spawnIntervalForMode("normal", 5) === S.spawnIntervalMs(5, 1), "번개전 스폰 간격만 짧다(일반은 그대로)");
ok(S.modeWaveModifier("normal", 10, () => 0.5) === S.waveModifier(10, () => 0.5), "일반 모드 변이는 옛 규칙 그대로");
ok(S.medalTier("blitz", 9) === -1 && S.medalTier("blitz", 10) === 0 && S.medalTier("blitz", 30) === 2, "메달 동·은·금 문턱");
console.log("[② 배선 — main.js]");
const M = readFileSync(new URL("../main.js", import.meta.url), "utf8");
ok(!/currentWave\+\+/.test(M) && (M.match(/advanceWave\(\);/g) || []).length >= 3, "웨이브 진행 3곳 모두 advanceWave(보스 러시 건너뛰기)를 거친다");
ok(/modeWaveModifier\(gameMode/.test(M) && /spawnIntervalForMode\(gameMode/.test(M), "변이·스폰 간격이 모드를 읽는다");
ok(/gameMode === "normal" && currentWave % stageProgress\.WAVES_PER_STAGE/.test(M), "스테이지 체크포인트는 일반 모드만(보스 러시가 진행표를 덮지 않게)");
ok(/if \(gameMode === "normal"\) checkAchievements\("wave_clear"/.test(M), "웨이브 업적은 일반 모드만(보스 러시로 공짜 업적 금지)");
ok(/gameMode,\s*\n\s*gold,/.test(M) && /savedState\.gameMode/.test(M), "이어하기 세이브에 모드가 들어가고 되살아난다");
console.log("[③ 서버 — submit-score]");
const SS = readFileSync(new URL("../functions/api/submit-score.js", import.meta.url), "utf8");
ok(/if \(gameMode !== "normal"\) return Response\.json/.test(SS) && SS.indexOf('gameMode !== "normal"') < SS.indexOf("INSERT INTO rankings"), "모드 판은 개인 랭킹에 안 들어간다(학교 점수만)");
console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
