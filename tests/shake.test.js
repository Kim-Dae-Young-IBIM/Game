// 흔들림 판정 단위 테스트: 가짜 가속도 데이터(60Hz 샘플)로 검증한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHAKE_THRESHOLD,
  DEBOUNCE_MS,
  MIN_VOLUME,
  PEAK_WINDOW_MS,
  magnitude,
  forceToVolume,
  createShakeDetector,
} from "../shared/shake.js";

const G = 9.81;
const STEP = 1000 / 60; // 60Hz

// 샘플 배열을 넣고 판정된 흔들림 목록을 돌려준다
function run(samples, detector = createShakeDetector()) {
  const hits = [];
  samples.forEach((a, i) => {
    const t = i * STEP;
    const hit = detector(a, t);
    if (hit) hits.push({ t, ...hit });
  });
  return hits;
}

const still = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: G }));
// 한 번 흔들기: 크기 peak까지 올라갔다 내려오는 약 100ms짜리 파형
function swing(peak) {
  return [0.3, 0.7, 1, 0.8, 0.4, 0.1].map(k => ({ x: peak * k, y: 0, z: G }));
}

test("크기 계산: 중력만 있으면 약 9.8", () => {
  assert.ok(Math.abs(magnitude({ x: 0, y: 0, z: G }) - G) < 1e-9);
  assert.equal(magnitude({ x: 3, y: 4, z: 0 }), 5);
});

test("null·누락 값은 0으로 취급(일부 기기는 null을 보낸다)", () => {
  assert.equal(magnitude(null), 0);
  assert.equal(magnitude({ x: null, y: null, z: null }), 0);
  assert.equal(magnitude({ x: 3, y: undefined, z: 4 }), 5);
});

test("가만히 있거나 살살 움직이면 흔들림이 아니다", () => {
  const gentle = Array.from({ length: 120 }, (_, i) => ({ x: Math.sin(i / 5) * 3, y: 0, z: G }));
  assert.equal(run(still(120)).length, 0);
  assert.equal(run(gentle).length, 0);
});

test("임계값(12m/s²)을 넘으면 1회(값이 내려가는 다음 샘플에서 판정)", () => {
  const det = createShakeDetector();
  assert.equal(det({ x: 0, y: 0, z: SHAKE_THRESHOLD }, 0), null, "정확히 12는 넘지 않은 것");
  assert.equal(det({ x: 0, y: 0, z: SHAKE_THRESHOLD + 0.5 }, 1000), null, "정점인지 아직 모름");
  const hit = det({ x: 0, y: 0, z: G }, 1016);
  assert.ok(hit);
  assert.ok(hit.intensity >= MIN_VOLUME);
  assert.equal(hit.magnitude, SHAKE_THRESHOLD + 0.5);
});

test("세기는 첫 샘플이 아니라 정점 기준(세게 흔들면 최대 볼륨)", () => {
  const hit = run(swing(35))[0]; // 정점 크기 약 36 → 볼륨 1.0
  assert.ok(hit);
  assert.equal(hit.intensity, 1);
});

test("판정 지연: 계속 올라가도 80ms 안에는 판정한다", () => {
  const det = createShakeDetector();
  let hitAt = null;
  for (let i = 0; i < 20 && hitAt === null; i++) {
    const t = i * STEP;
    if (det({ x: 13 + i * 3, y: 0, z: 0 }, t)) hitAt = t; // 끝없이 커지는 값
  }
  assert.ok(hitAt !== null && hitAt <= PEAK_WINDOW_MS + STEP, `hitAt=${hitAt}`);
});

test("한 번 흔들 때 여러 샘플이 넘어도 1회로 센다(150ms 디바운스)", () => {
  const hits = run([...still(10), ...swing(25), ...still(10)]);
  assert.equal(hits.length, 1);
});

test("디바운스 경계: 150ms 미만은 무시, 150ms 이상은 새 흔들림", () => {
  const det = createShakeDetector();
  const big = { x: 20, y: 0, z: G };
  const rest = { x: 0, y: 0, z: G };
  assert.equal(det(big, 0), null); // 시작
  assert.ok(det(rest, 16)); // 판정(시작 시각 0 기준으로 디바운스)
  assert.equal(det(big, DEBOUNCE_MS - 1), null);
  assert.equal(det(rest, DEBOUNCE_MS + 10), null, "디바운스 중 시작된 흔들림은 없음");
  assert.equal(det(big, DEBOUNCE_MS + 20), null); // 새 흔들림 시작
  assert.ok(det(rest, DEBOUNCE_MS + 36));
});

test("연속 흔들기 5번 → 5회", () => {
  const samples = [];
  for (let i = 0; i < 5; i++) samples.push(...swing(22), ...still(12)); // 한 주기 약 300ms
  assert.equal(run(samples).length, 5);
});

test("아주 빠르게 흔들어도 초당 최대 약 7회(150ms 간격)", () => {
  const frantic = Array.from({ length: 60 }, (_, i) => ({ x: i % 2 ? 25 : -25, y: 0, z: G })); // 1초
  const hits = run(frantic);
  assert.ok(hits.length >= 6 && hits.length <= 7, `got ${hits.length}`);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i].t - hits[i - 1].t >= DEBOUNCE_MS);
});

test("세게 흔들수록 볼륨이 크다(0.3~1.0)", () => {
  const soft = run(swing(13))[0];
  const hard = run(swing(40))[0];
  assert.ok(soft && hard);
  assert.ok(hard.intensity > soft.intensity);
  assert.ok(soft.intensity >= 0.3 && hard.intensity <= 1.0);
});

test("forceToVolume 경계값", () => {
  assert.equal(forceToVolume(5), 0);
  assert.equal(forceToVolume(12), 0);
  assert.ok(Math.abs(forceToVolume(12.0001) - 0.3) < 1e-3);
  assert.equal(forceToVolume(30), 1);
  assert.equal(forceToVolume(100), 1);
  assert.ok(Math.abs(forceToVolume(21) - 0.65) < 1e-9);
});

test("iOS처럼 축 부호가 반대여도 크기는 같다", () => {
  const android = run(swing(25));
  const ios = run(swing(25).map(a => ({ x: -a.x, y: -a.y, z: -a.z })));
  assert.equal(android.length, ios.length);
  assert.equal(android[0].intensity, ios[0].intensity);
});
