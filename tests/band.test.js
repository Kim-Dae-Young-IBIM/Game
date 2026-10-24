import { test } from "node:test";
import assert from "node:assert/strict";
import { PENGUINS, SLOT_COUNT, pickSlot, isValidSlot, createMelody, XYLO_MELODY, XYLO_NOTES } from "../shared/band.js";

test("펭귄 4마리, 자리마다 다른 악기", () => {
  assert.equal(SLOT_COUNT, 4);
  assert.deepEqual(
    PENGUINS.map(p => p.instrument),
    ["drum", "tambourine", "xylophone", "maracas"]
  );
  PENGUINS.forEach((p, i) => assert.equal(p.slot, i));
});

test("들어온 순서대로 빈 자리", () => {
  assert.equal(pickSlot([], undefined), 0);
  assert.equal(pickSlot([0], undefined), 1);
  assert.equal(pickSlot([0, 1, 3], undefined), 2);
});

test("새로고침하면 원래 자리(비어 있을 때만)", () => {
  assert.equal(pickSlot([0], 2), 2);
  assert.equal(pickSlot([0, 2], 2), 1, "남이 쓰면 다른 빈 자리");
  assert.equal(pickSlot([], 9), 0, "이상한 값은 무시");
  assert.equal(pickSlot([], "1"), 0);
});

test("4자리가 다 차면 돌아가며 같이 쓴다", () => {
  assert.equal(pickSlot([0, 1, 2, 3], 1, 4), 1, "다 찼어도 원래 펭귄이 있으면 그것");
  assert.equal(pickSlot([0, 1, 2, 3], undefined, 5), 1);
  assert.ok(isValidSlot(pickSlot([0, 1, 2, 3], undefined, 99)));
});

test("실로폰 멜로디는 5음 안에서 순서대로 돌고 처음으로 돌아온다", () => {
  const m = createMelody();
  const played = XYLO_MELODY.map(() => m.next());
  assert.deepEqual(played, XYLO_MELODY);
  assert.equal(m.next(), XYLO_MELODY[0]);
  for (const n of XYLO_MELODY) assert.ok(n >= 0 && n < XYLO_NOTES.length);
});
