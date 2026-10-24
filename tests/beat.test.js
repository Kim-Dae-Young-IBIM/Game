import { test } from "node:test";
import assert from "node:assert/strict";
import { beatInterval, nearestBeatDelay, beatIndex, nearestBeat, createBeatQueue } from "../shared/beat.js";

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

test("nearestBeat: 번호와 대기 시간", () => {
  assert.deepEqual(nearestBeat(1000 + 650, 1000, 100), { index: 1, delay: 0 });
  assert.deepEqual(nearestBeat(1000 + 1150, 1000, 100), { index: 2, delay: 50 });
  assert.deepEqual(nearestBeat(900, 1000, 100), { index: 0, delay: 100 });
});

// 가짜 타이머: schedule로 들어온 함수를 직접 실행한다
function fakeQueue() {
  const played = [];
  const timers = [];
  const add = createBeatQueue({ onBeat: (v, i) => played.push([i, v]), schedule: (fn, ms) => timers.push({ fn, ms }), bpm: 100 });
  const flush = () => timers.splice(0).forEach(t => t.fn());
  return { add, flush, played, timers };
}

test("같은 박자에 들어온 흔들림 여러 번 → 가장 센 것 1번만", () => {
  const q = fakeQueue();
  q.add(0.4, 1000 + 1100, 1000); // 2번 박자(1200) 50ms 전... 대기 100
  q.add(0.9, 1000 + 1150, 1000);
  q.add(0.5, 1000 + 1190, 1000);
  assert.equal(q.timers.length, 1);
  q.flush();
  assert.deepEqual(q.played, [[2, 0.9]]);
});

test("이미 친 박자에 늦게 온 흔들림은 버리고, 다음 박자는 친다", () => {
  const q = fakeQueue();
  q.add(0.5, 1000 + 1200, 1000);
  q.flush(); // 2번 박자 연주
  assert.equal(q.add(1, 1000 + 1250, 1000), false, "2번 박자 직후 → 버림");
  assert.equal(q.add(0.6, 1000 + 1700, 1000), true, "3번 박자(1800) → 예약");
  q.flush();
  assert.deepEqual(q.played, [[2, 0.5], [3, 0.6]]);
});

test("아주 빠르게 흔들어도(150ms마다 3초) 박자 수만큼만 연주", () => {
  const q = fakeQueue();
  for (let t = 0; t < 3000; t += 150) {
    q.add(0.7, 1000 + t, 1000);
    q.timers.filter(x => x.ms === 0).length && q.flush(); // 바로 재생할 것은 즉시 처리
  }
  q.flush();
  const beats = q.played.map(p => p[0]);
  assert.deepEqual(beats, [...new Set(beats)], "같은 박자 두 번 없음");
  assert.ok(q.played.length <= 6, `3초 = 5박(+1), got ${q.played.length}`);
});
