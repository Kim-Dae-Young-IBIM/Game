// 동물 밴드 구성. 서버·TV·폰 공용 순수 로직.
// 무대 자리(slot 0~3): 폰이 들어온 순서대로 받는 TV 무대 위치.
// 캐릭터(character 0~7): 그 자리에 서는 동물. 폰에서 ◀ ▶로 고른다(다른 폰과 겹치지 않게).
// 모든 캐릭터·소리는 직접 그리고 합성한 오리지널이다.

export const SLOT_COUNT = 4;

// instrument: 흔들 때 악기(멜로디 악기는 흔들 때마다 다음 음)
// effect: 특별 버튼 소리, voicePitch: 누르고 말하기 목소리 높이(1보다 크면 높게)
export const CHARACTERS = [
  { id: 0, art: "penguin-1", instrument: "drum", effect: "squawk", voicePitch: 1.3, color: 0xe63946 }, // 펭귄 · 빨간 목도리
  { id: 1, art: "penguin-2", instrument: "tambourine", effect: "squawk", voicePitch: 1.3, color: 0x3a86ff }, // 펭귄 · 파란 털모자
  { id: 2, art: "penguin-3", instrument: "xylophone", effect: "squawk", voicePitch: 1.3, color: 0xffbe0b }, // 펭귄 · 노란 리본
  { id: 3, art: "penguin-4", instrument: "maracas", effect: "squawk", voicePitch: 1.3, color: 0x2a9d8f }, // 펭귄 · 초록 헤드폰
  { id: 4, art: "bear", instrument: "bassdrum", effect: "roar", voicePitch: 0.8, color: 0x9c6644 }, // 곰 · 빨간 멜빵
  { id: 5, art: "rabbit", instrument: "triangle", effect: "boing", voicePitch: 1.45, color: 0xff8fab }, // 토끼 · 분홍 리본
  { id: 6, art: "duck", instrument: "horn", effect: "quack", voicePitch: 1.35, color: 0xffd23f }, // 오리 · 노란 비옷
  { id: 7, art: "cat", instrument: "bell", effect: "meow", voicePitch: 1.2, color: 0xf4a261 }, // 고양이 · 방울 목걸이
];
export const CHARACTER_COUNT = CHARACTERS.length;

// 흔들 때마다 다음 음으로 넘어가는 악기(5음 멜로디)
export const MELODIC = ["xylophone", "horn", "bell"];

export function isValidSlot(slot) {
  return Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT;
}

export function isValidCharacter(c) {
  return Number.isInteger(c) && c >= 0 && c < CHARACTER_COUNT;
}

// 빈 자리 고르기. taken: 이미 쓰는 자리들.
// preferred가 비어 있으면 그 자리(새로고침해도 같은 자리), 아니면 가장 앞의 빈 자리,
// 다 찼으면 원래 자리 또는 인원수로 돌려 가며 같이 쓴다(5번째 폰부터).
export function pickSlot(taken, preferred, phoneCount = 0) {
  const used = new Set(taken);
  if (isValidSlot(preferred) && !used.has(preferred)) return preferred;
  for (let s = 0; s < SLOT_COUNT; s++) if (!used.has(s)) return s;
  return isValidSlot(preferred) ? preferred : phoneCount % SLOT_COUNT;
}

// 처음 들어올 때 캐릭터: 원래 고른 것(새로고침) → 자리 기본 펭귄 → 아무도 안 쓰는 첫 캐릭터.
// taken: 다른 폰들이 쓰는 캐릭터. 8마리가 다 쓰이면(폰 9대 이상) 겹쳐도 원래 것/기본을 준다.
export function pickCharacter(taken, preferred, fallback = 0) {
  const used = new Set(taken);
  if (isValidCharacter(preferred) && !used.has(preferred)) return preferred;
  if (isValidCharacter(fallback) && !used.has(fallback)) return fallback;
  for (let c = 0; c < CHARACTER_COUNT; c++) if (!used.has(c)) return c;
  return isValidCharacter(preferred) ? preferred : isValidCharacter(fallback) ? fallback : 0;
}

// ◀ ▶: current에서 dir(+1/-1) 방향으로 다른 폰이 안 쓰는 다음 캐릭터. 없으면 그대로.
export function nextCharacter(current, dir, taken) {
  const used = new Set(taken);
  const step = dir < 0 ? -1 : 1;
  for (let i = 1; i < CHARACTER_COUNT; i++) {
    const c = (((current + step * i) % CHARACTER_COUNT) + CHARACTER_COUNT) % CHARACTER_COUNT;
    if (!used.has(c)) return c;
  }
  return current;
}

// 멜로디: 도·레·미·솔·라(5음 + 높은 도)만 써서 아무렇게나 흔들어도 음악처럼 들린다.
// 숫자는 음 번호(0~5). 소리 파일은 `${악기}-${번호}.wav`. 직접 만든 짧은 노래.
export const NOTE_COUNT = 6;
export const MELODY = [0, 2, 3, 2, 4, 3, 2, 0, 1, 2, 3, 5, 4, 3, 1, 0];

export function createMelody(melody = MELODY) {
  let i = 0;
  return {
    next() {
      const note = melody[i];
      i = (i + 1) % melody.length;
      return note;
    },
    reset() {
      i = 0;
    },
  };
}
