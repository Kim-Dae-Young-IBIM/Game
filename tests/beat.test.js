import { test } from "node:test";
import assert from "node:assert/strict";
import { beatInterval, nearestBeatDelay, beatIndex } from "../shared/beat.js";

test("BPM 100 → 600ms 간격", () => {
  assert.equal(beatInterval(100), 600);
  assert.equal(beatInterval(120), 500);
});

test("박자 바로 뒤(반 박자 이내)면 바로 재생", () => {
  assert.equal(nearestBeatDelay(1000 + 600 + 50, 1000, 100), 0);
  assert.equal(nearestBeatDelay(1000 + 600 + 299, 1000, 100), 0);
});

test("다음 박자가 더 가까우면 그때까지 기다린다", () => {
  assert.equal(nearestBeatDelay(1000 + 600 + 301, 1000, 100), 299);
  assert.equal(nearestBeatDelay(1000 + 1150, 1000, 100), 50);
});

test("정확히 박자 위면 0", () => {
  assert.equal(nearestBeatDelay(1000 + 1800, 1000, 100), 0);
});

test("기다리는 시간은 반 박자를 넘지 않는다", () => {
  for (let t = 0; t < 5000; t += 7) {
    const d = nearestBeatDelay(t, 0, 100);
    assert.ok(d >= 0 && d <= 300, `t=${t} d=${d}`);
  }
});

test("시계 시작 전이면 0박까지 기다린다", () => {
  assert.equal(nearestBeatDelay(900, 1000, 100), 100);
});

test("박자 번호", () => {
  assert.equal(beatIndex(1000, 1000, 100), 0);
  assert.equal(beatIndex(1599, 1000, 100), 0);
  assert.equal(beatIndex(1600, 1000, 100), 1);
});
