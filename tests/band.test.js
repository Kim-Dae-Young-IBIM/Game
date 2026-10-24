import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CHARACTERS,
  CHARACTER_COUNT,
  SLOT_COUNT,
  MELODIC,
  pickSlot,
  isValidSlot,
  isValidCharacter,
  pickCharacter,
  nextCharacter,
  createMelody,
  MELODY,
  NOTE_COUNT,
} from "../shared/band.js";

test("무대 자리 4곳, 캐릭터 8마리, 캐릭터마다 다른 악기", () => {
  assert.equal(SLOT_COUNT, 4);
  assert.equal(CHARACTER_COUNT, 8);
  CHARACTERS.forEach((c, i) => assert.equal(c.id, i));
  const instruments = CHARACTERS.map(c => c.instrument);
  assert.equal(new Set(instruments).size, 8);
  assert.deepEqual(instruments.slice(0, 4), ["drum", "tambourine", "xylophone", "maracas"], "자리 기본 펭귄은 그대로");
  for (const c of CHARACTERS) {
    assert.ok(c.art && c.effect && c.voicePitch > 0.5 && c.voicePitch < 2, c.art);
  }
  assert.equal(CHARACTERS[4].voicePitch < 1, true, "곰은 낮은 목소리");
});

test("들어온 순서대로 빈 자리, 새로고침하면 원래 자리", () => {
  assert.equal(pickSlot([], undefined), 0);
  assert.equal(pickSlot([0, 1, 3], undefined), 2);
  assert.equal(pickSlot([0], 2), 2);
  assert.equal(pickSlot([0, 2], 2), 1, "남이 쓰면 다른 빈 자리");
  assert.equal(pickSlot([], 9), 0, "이상한 값은 무시");
});

test("4자리가 다 차면 원래 자리 또는 돌아가며 같이 쓴다", () => {
  assert.equal(pickSlot([0, 1, 2, 3], 1, 4), 1);
  assert.equal(pickSlot([0, 1, 2, 3], undefined, 5), 1);
  assert.ok(isValidSlot(pickSlot([0, 1, 2, 3], undefined, 99)));
});

test("처음 캐릭터: 원래 것 → 자리 기본 → 첫 빈 캐릭터", () => {
  assert.equal(pickCharacter([], 5, 0), 5, "새로고침 전 고른 곰·토끼 등");
  assert.equal(pickCharacter([5], 5, 1), 1, "남이 가져갔으면 자리 기본");
  assert.equal(pickCharacter([5, 1], 5, 1), 0, "기본도 쓰이면 첫 빈 것");
  assert.equal(pickCharacter([], undefined, 2), 2);
  assert.equal(pickCharacter([], "7", 2), 2, "이상한 값은 무시");
  const all = [0, 1, 2, 3, 4, 5, 6, 7];
  assert.equal(pickCharacter(all, 6, 1), 6, "8마리 다 쓰이면 겹쳐도 원래 것");
  assert.ok(isValidCharacter(pickCharacter(all, undefined, undefined)));
});

test("◀ ▶: 남이 쓰는 캐릭터는 건너뛰고, 끝에서 처음으로 돈다", () => {
  assert.equal(nextCharacter(0, 1, []), 1);
  assert.equal(nextCharacter(0, -1, []), 7, "왼쪽 끝 → 마지막");
  assert.equal(nextCharacter(7, 1, []), 0, "오른쪽 끝 → 처음");
  assert.equal(nextCharacter(0, 1, [1, 2]), 3, "남이 쓰는 1·2 건너뜀");
  assert.equal(nextCharacter(3, -1, [2, 1]), 0);
  assert.equal(nextCharacter(0, 1, [1, 2, 3, 4, 5, 6, 7]), 0, "고를 게 없으면 그대로");
});

test("▶만 눌러도 8마리를 모두 한 번씩 돌아본다", () => {
  const seen = [];
  let c = 0;
  for (let i = 0; i < CHARACTER_COUNT; i++) {
    seen.push(c);
    c = nextCharacter(c, 1, []);
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(c, 0);
});

test("멜로디는 6음 안에서 순서대로 돌고 처음으로 돌아온다", () => {
  const m = createMelody();
  assert.deepEqual(MELODY.map(() => m.next()), MELODY);
  assert.equal(m.next(), MELODY[0]);
  for (const n of MELODY) assert.ok(n >= 0 && n < NOTE_COUNT);
  for (const ins of MELODIC) assert.ok(CHARACTERS.some(c => c.instrument === ins), ins);
});

test("캐릭터마다 그림(깨어 있음·졸음·얼굴)과 소리 파일이 있다", () => {
  const assets = fileURLToPath(new URL("../assets/", import.meta.url));
  for (const c of CHARACTERS) {
    for (const f of [`${c.art}.svg`, `${c.art}-sleep.svg`, `face-${c.art}.svg`]) {
      assert.ok(existsSync(assets + "animals/" + f), f);
    }
    const sounds = MELODIC.includes(c.instrument)
      ? Array.from({ length: NOTE_COUNT }, (_, i) => `${c.instrument}-${i}.wav`)
      : [`${c.instrument}.wav`];
    for (const f of [...sounds, `${c.effect}.wav`]) assert.ok(existsSync(assets + "sounds/" + f), f);
  }
});
