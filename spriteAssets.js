// spriteAssets.js — AI 생성 스프라이트 로더 (v5 WS-3)
// assets/manifest.json 기반 preload. 이미지가 없거나 로드 실패 시
// 각 렌더러는 기존 절차적 드로잉으로 자동 폴백한다 (안전망 — iwtaping 검증 패턴).

const sprites = new Map();
let loaded = false;

// v8: 학년을 고르기도 전에 207장(2.5MB)을 전부 받고 있었다.
// 3학년만 할 아이도 6학년 전용 보스 스프라이트까지 받았고, 그 요청들이
// 정작 필요한 문제 파일(grade*.js)과 커넥션을 다퉜다. 느린 학교 와이파이에서
// 첫 화면까지 6초가 걸린 이유다(3G 에뮬레이션 실측).
//
// 그래서 두 단계로 나눈다.
//  ① 필수  — 마법사·성·길·타워 + 웨이브 12 이전에 나오는 몬스터. 게임 시작을 막는다.
//  ② 나머지 — 후반 전용 몬스터·다른 학년 배경. 백그라운드로 받는다.
// 렌더러는 스프라이트가 없으면 절차적 드로잉으로 폴백하므로, ②가 늦게 와도 안전하다.
const EARLY_MONSTERS = new Set([
  // simCore.NORMAL_POOL 에서 웨이브 12 이전 등장분 + 그 구간의 보스
  "normal", "speed", "bat", "collector", "tank", "shielder", "leech", "healer",
  "dragon", "teleporter", "mirage", "ghost", "splitter", "chronomancer", "swarmling",
  "mini-splitter", "boss", "archfiend", "general", "ancientDragon",
]);

function isEssential(key, gradeBg) {
  if (key.startsWith("wizard") || key.startsWith("castle") || key.startsWith("road")) return true;
  if (key.startsWith("tower")) return true;
  if (key.startsWith("bg")) return gradeBg ? key === gradeBg : true;
  if (key.startsWith("monster")) return EARLY_MONSTERS.has(key.split("_")[1]);
  return true;
}

function loadOne(basePath, f) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { sprites.set(f.key, img); resolve(); };
    img.onerror = () => resolve(); // 개별 실패는 폴백으로 흡수
    img.src = `${basePath}/${f.file}`;
  });
}

/**
 * 필수 스프라이트만 받고 끝난다. 나머지는 백그라운드로 이어서 받는다.
 * @param {string} gradeBg  그 학년에 쓰는 배경 키(예: "bg_meadow"). 없으면 배경 전부.
 */
export async function preloadSprites(basePath = "assets", gradeBg = null) {
  try {
    const res = await fetch(`${basePath}/manifest.json`);
    if (!res.ok) return false;
    const manifest = await res.json();

    const essential = manifest.files.filter((f) => isEssential(f.key, gradeBg));
    const rest = manifest.files.filter((f) => !isEssential(f.key, gradeBg));

    await Promise.all(essential.map((f) => loadOne(basePath, f)));
    loaded = sprites.size > 0;
    console.info(`[spriteAssets] 필수 ${sprites.size}장 로드 (나머지 ${rest.length}장은 백그라운드)`);

    // 나머지는 기다리지 않는다 — 게임은 이미 시작할 수 있다
    Promise.all(rest.map((f) => loadOne(basePath, f))).then(() => {
      console.info(`[spriteAssets] 전체 ${sprites.size}장 로드 완료`);
    });
    return loaded;
  } catch {
    return false; // 매니페스트 없음 → 전면 절차적 폴백
  }
}

/** 지금까지 받은 스프라이트 수 (QA·디버그용) */
export function spriteCount() {
  return sprites.size;
}

export function getSprite(key) {
  return sprites.get(key) || null;
}

export function hasSprites() {
  return loaded;
}

// 스프라이트를 (cx, cy) 중심 · box 크기에 비율 유지로 그린다. 성공 시 true.
// v11(2026-10-10 «최적화»): 256px 원본을 매 프레임 40px 안팎으로 줄여 그리던 것을 «크기별로 미리 줄인 비트맵»으로 바꿨다.
//   매 프레임 리샘플링이 사라진다(1:1 복사 — 실플레이 60초 긴 작업 81건 → 7~9건 실측).
//   굽기는 createImageBitmap(resizeQuality high) — 메인 스레드 밖 비동기라 굽는 동안 프레임이 안 막힌다
//   (동기 캔버스 굽기는 웨일북 에뮬에서 프레임당 JS 7.3ms 로 파국 게이트를 넘었다). 다 구워질 때까지는 예전처럼 바로 그린다.
//   크기는 2px 단위로 묶고, 동시에 굽는 건 SCALED_INFLIGHT 장까지, 캐시는 SCALED_MAX 장을 넘으면 통째로 비운다.
const scaled = new Map();   // k → ImageBitmap | "pending" | "fail"
const SCALED_MAX = 600, SCALED_INFLIGHT = 8;
let inflight = 0;
const canResize = typeof createImageBitmap === "function";
function scaledSprite(key, img, w, h) {
  const k = `${key}@${w}x${h}`;
  const hit = scaled.get(k);
  if (hit && typeof hit !== "string") return hit;
  if (hit || !canResize || inflight >= SCALED_INFLIGHT) return null;
  if (scaled.size >= SCALED_MAX) scaled.clear();
  scaled.set(k, "pending"); inflight++;
  createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" })
    .then((bm) => { if (scaled.get(k) === "pending") scaled.set(k, bm); else bm.close?.(); })
    .catch(() => { scaled.set(k, "fail"); })   // 옵션 미지원 브라우저 — 이 크기는 늘 바로 그린다
    .finally(() => { inflight--; });
  return null;
}

export function drawSpriteCentered(ctx, key, cx, cy, box) {
  const img = sprites.get(key);
  if (!img) return false;
  const scale = box / Math.max(img.width, img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  // 미리 줄인 비트맵은 «기기 픽셀» 크기로 굽는다(변환 행렬의 배율 s) — CSS 픽셀 크기로 구우면 고해상도 캔버스에서 다시 늘어나 흐렸다(2026-10-10)
  const s = Math.abs(ctx.getTransform?.().a || 1);
  const qw = Math.max(2, Math.round((w * s) / 2) * 2), qh = Math.max(2, Math.round((h * s) / 2) * 2);
  const pre = qw < img.width && qh < img.height ? scaledSprite(key, img, qw, qh) : null;
  if (pre) ctx.drawImage(pre, cx - w / 2, cy - h / 2, w, h);
  else ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  return true;
}

/** QA·디버그: 미리 줄인 비트맵 캐시 크기 */
export function scaledSpriteCount() {
  return scaled.size;
}
