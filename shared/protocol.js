// 서버·TV·폰이 함께 쓰는 소켓 이벤트 이름과 상수. 이벤트 문자열은 여기서만 정의한다.

export const EVENTS = {
  TV_CREATE: "tv:create", // TV → 서버 (ack: {code})
  PHONE_JOIN: "phone:join", // 폰 → 서버 {code} (ack: {ok, animal})
  SHAKE: "phone:shake", // 폰 → 서버 {intensity}
  PLAY: "tv:play", // 서버 → TV {intensity, phoneId}
  PLAYERS: "tv:players", // 서버 → TV {count}
  ROOM_CLOSED: "room:closed", // 서버 → 폰 (TV가 돌아오지 않음)
  PING: "debug:ping", // TV·폰 → 서버 (ack: 서버 시각) — 왕복 지연 측정
  CLIENT_LOG: "client:log", // TV·폰 → 서버 {role, kind, message} — 오류·진단 기록을 서버 기록(Render Logs)에 출력
};

export const ROOM_CODE_PATTERN = /^[1-9][0-9]{3}$/; // 4자리 숫자, 0으로 시작하지 않음

export const ANIMALS = ["cat"]; // 1단계는 고양이(드럼) 1마리

export function isValidRoomCode(code) {
  return typeof code === "string" && ROOM_CODE_PATTERN.test(code);
}

export function clampIntensity(v) {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
