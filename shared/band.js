// 펭귄 밴드 구성. 서버·TV·폰 공용 순수 로직.
// 폰 1대 = 펭귄 1마리(자리 slot 0~3). 자리마다 악기가 정해져 있다.

export const PENGUINS = [
  { slot: 0, instrument: "drum", color: 0xe63946 }, // 빨간 목도리 · 드럼
  { slot: 1, instrument: "tambourine", color: 0x3a86ff }, // 파란 털모자 · 탬버린
  { slot: 2, instrument: "xylophone", color: 0xffbe0b }, // 노란 리본 · 실로폰
  { slot: 3, instrument: "maracas", color: 0x2a9d8f }, // 초록 헤드폰 · 마라카스
];
export const SLOT_COUNT = PENGUINS.length;

export function isValidSlot(slot) {
  return Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT;
}

// 빈 자리 고르기. taken: 이미 쓰는 자리들(Set/배열).
// preferred가 비어 있으면 그 자리(새로고침해도 같은 펭귄), 아니면 가장 앞의 빈 자리,
// 다 찼으면 인원수로 돌려 가며 같이 쓴다(5번째 폰부터).
export function pickSlot(taken, preferred, phoneCount = 0) {
  const used = new Set(taken);
  if (isValidSlot(preferred) && !used.has(preferred)) return preferred;
  for (let s = 0; s < SLOT_COUNT; s++) if (!used.has(s)) return s;
  return phoneCount % SLOT_COUNT;
}

// 실로폰 멜로디: 도·레·미·솔·라(5음)만 써서 아무렇게나 흔들어도 음악처럼 들린다.
// 숫자는 XYLO_NOTES의 번호. 직접 만든 짧은 노래.
export const XYLO_NOTES = ["c5", "d5", "e5", "g5", "a5", "c6"];
export const XYLO_MELODY = [0, 2, 3, 2, 4, 3, 2, 0, 1, 2, 3, 5, 4, 3, 1, 0];

export function createMelody(melody = XYLO_MELODY) {
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
