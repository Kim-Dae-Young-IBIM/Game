// 폰 컨트롤러: 방 코드 → 시작(iOS 센서 권한) → 동물 그림. 흔들면 TV로 전송.
// 순수 HTML/JS. 센서·Wake Lock·진동·전체화면은 있는 기기에서만 쓴다.
import { io } from "socket.io-client";
import { EVENTS, isValidRoomCode } from "../shared/protocol.js";
import { createShakeDetector, magnitude, SHAKE_THRESHOLD } from "../shared/shake.js";
import { installErrorReporter } from "../shared/error-report.js";
import { createPhoneDebug, isDebug } from "./debug.js";
import { isValidSlot } from "../shared/band.js";
import { createVoiceRecorder, isVoiceSupported } from "./voice.js";

const TAP_INTENSITY = 0.7; // 센서가 없을 때 탭 한 번의 세기
const EFFECT_MIN_MS = 1000; // 꽥 버튼: 1초에 1번(서버도 같은 제한)
const VOICE_MIN_MS = 2000; // 말하기: 2초에 1번(서버도 같은 제한)
const SLOT_KEY = "band.slot"; // 새로고침해도 같은 펭귄
const NO_SENSOR_MS = 2500; // 이 시간 동안 센서 값이 없으면 탭으로 대신한다

// 테스트·디버그용 상태(Playwright가 읽는다)
const state = (window.__phone = {
  code: null,
  joined: false,
  slot: null, // 내 펭귄 자리(0~3)
  effects: 0,
  voices: 0,
  mic: "-", // 마이크 상태(진단 화면 표시용)
  shakes: 0,
  tapFallback: false,
  permission: "-", // 센서 권한 결과(진단 화면 표시용)
  wakeLock: "-", // 화면 꺼짐 방지 상태(진단 화면 표시용)
});

const $ = id => document.getElementById(id);
const joinScreen = $("join");
const playScreen = $("play");
const codeInput = $("code");
const goBtn = $("go");
const animal = $("animal");

// QR로 들어오면 코드가 채워져 있으므로 입력칸을 숨기고 시작 버튼만 보인다.
const fromQr = new URLSearchParams(location.search).get("room");
if (isValidRoomCode(fromQr)) {
  codeInput.value = fromQr;
  $("code-row").classList.add("hidden");
}
codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 4);
  codeInput.classList.remove("wrong");
});
codeInput.addEventListener("keydown", e => {
  if (e.key === "Enter") goBtn.click();
});

// ---------- 소켓 ----------
const socket = io();
let debug = { sample() {}, shake() {}, error() {} };
installErrorReporter(socket, "phone", message => debug.error(message));

function savedSlot() {
  try {
    const n = parseInt(sessionStorage.getItem(SLOT_KEY), 10);
    return isValidSlot(n) ? n : undefined;
  } catch (e) {
    return undefined;
  }
}

// 입장. 성공하면 { ok, slot, instrument }, 실패하면 null
function join(code) {
  const slot = isValidSlot(state.slot) ? state.slot : savedSlot();
  return new Promise(resolve => {
    socket.timeout(5000).emit(EVENTS.PHONE_JOIN, { code, slot }, (err, res) => resolve(!err && res && res.ok ? res : null));
  });
}

// 배정된 펭귄 그림으로 바꾼다
function applySlot(slot) {
  if (!isValidSlot(slot)) return;
  state.slot = slot;
  animal.src = "/animals/penguin-" + (slot + 1) + ".svg";
  try {
    sessionStorage.setItem(SLOT_KEY, String(slot));
  } catch (e) {
    // 저장소를 못 써도 동작에는 지장 없음
  }
}

socket.on("connect", () => {
  playScreen.classList.remove("offline");
  $("offline").classList.add("hidden");
  // 와이파이가 끊겼다 돌아오면 자동으로 다시 입장
  if (state.joined && state.code) {
    join(state.code).then(res => {
      if (!res) return backToJoin();
      applySlot(res.slot);
    });
  }
});
socket.on("disconnect", () => {
  playScreen.classList.add("offline");
  $("offline").classList.remove("hidden");
});
socket.on(EVENTS.ROOM_CLOSED, () => backToJoin());

// ---------- 화면 보호: 전체화면, Wake Lock, 확대·뒤로가기 방지 ----------
function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  // iPhone Safari는 요소 전체화면을 지원하지 않는다 → 조용히 건너뜀
  if (!req) return;
  try {
    const p = req.call(el, { navigationUI: "hide" });
    if (p && p.catch) p.catch(() => {});
  } catch (e) {
    // 무시
  }
}

let wakeLock = null;
function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    state.wakeLock = "미지원";
    return;
  }
  navigator.wakeLock
    .request("screen")
    .then(lock => {
      wakeLock = lock;
      state.wakeLock = "켜짐";
      lock.addEventListener("release", () => {
        state.wakeLock = "꺼짐";
      });
    })
    .catch(() => {
      state.wakeLock = "실패";
    });
}
document.addEventListener("visibilitychange", () => {
  // 화면이 다시 보이면 Wake Lock은 풀려 있으므로 다시 요청
  if (document.visibilityState === "visible" && state.joined && (!wakeLock || wakeLock.released)) requestWakeLock();
});

document.addEventListener("gesturestart", e => e.preventDefault()); // iOS 핀치 확대
document.addEventListener("dblclick", e => e.preventDefault());
document.addEventListener(
  "touchmove",
  e => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);
document.addEventListener("contextmenu", e => e.preventDefault());

let backGuard = false;
function guardBack() {
  if (backGuard) return;
  backGuard = true;
  history.pushState({ band: true }, "");
  window.addEventListener("popstate", () => {
    if (state.joined) history.pushState({ band: true }, "");
  });
}

// ---------- 센서 ----------
// iOS 13+(및 최신 Chromium)는 사용자 탭 안에서 requestPermission()을 "먼저" 호출해야 한다(await 전에).
function requestMotionPermission() {
  if (typeof DeviceMotionEvent === "undefined") {
    state.permission = "센서 없음";
    return Promise.resolve(false);
  }
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    return DeviceMotionEvent.requestPermission()
      .then(s => {
        state.permission = s;
        return s === "granted";
      })
      .catch(e => {
        state.permission = "오류: " + (e && e.name ? e.name : e);
        return false;
      });
  }
  state.permission = "필요 없음";
  return Promise.resolve(true);
}

let threshold = SHAKE_THRESHOLD; // 진단 화면에서만 바꿀 수 있다
let detect = createShakeDetector({ threshold });
let motionSeen = false;

function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x === null) return;
  motionSeen = true;
  const now = performance.now();
  debug.sample(magnitude(a), now);
  const hit = detect(a, now);
  if (hit) {
    debug.shake(hit.intensity, now);
    shake(hit.intensity);
  }
}

function shake(intensity) {
  if (!state.joined) return; // 방이 닫혀 입장 화면으로 돌아간 뒤에는 무시
  state.shakes++;
  socket.emit(EVENTS.SHAKE, { intensity });
  // 화면 속 동물도 같이 통통
  animal.classList.remove("bounce");
  void animal.offsetWidth; // 애니메이션 재시작
  animal.classList.add("bounce");
  if (typeof navigator.vibrate === "function") navigator.vibrate(30); // 지원 기기만(iPhone은 없음)
}

function enableTapFallback() {
  if (state.tapFallback) return;
  state.tapFallback = true;
  animal.addEventListener("pointerdown", () => shake(TAP_INTENSITY));
}

// 데스크톱 시뮬레이션용: 스페이스바 = 흔들기
document.addEventListener("keydown", e => {
  if (state.joined && (e.code === "Space" || e.key === " ")) {
    e.preventDefault();
    shake(TAP_INTENSITY);
  }
});

// ---------- 시작 ----------
function backToJoin() {
  state.joined = false;
  micPressed = false;
  micBtn.classList.remove("recording");
  if (recorder) recorder.release(); // 방이 닫히면 마이크도 끈다
  state.code = null;
  playScreen.classList.add("hidden");
  joinScreen.classList.remove("hidden");
  $("code-row").classList.remove("hidden");
  codeInput.value = "";
}

function wrongCode() {
  $("code-row").classList.remove("hidden");
  codeInput.classList.remove("wrong");
  void codeInput.offsetWidth;
  codeInput.classList.add("wrong");
  codeInput.focus();
}

goBtn.addEventListener("click", () => {
  const code = codeInput.value;
  if (!isValidRoomCode(code)) return wrongCode();

  // 사용자 탭 안에서 동기적으로 먼저 호출해야 하는 것들
  const permission = requestMotionPermission();
  enterFullscreen();
  requestWakeLock();

  goBtn.classList.add("waiting");
  Promise.all([permission, join(code)]).then(([granted, res]) => {
    goBtn.classList.remove("waiting");
    if (!res) return wrongCode();
    applySlot(res.slot);
    state.code = code;
    state.joined = true;
    // iOS "흔들어서 실행 취소" 창 방지: 입력칸 포커스·입력 기록을 없앤다
    codeInput.blur();
    codeInput.value = "";
    joinScreen.classList.add("hidden");
    playScreen.classList.remove("hidden");
    guardBack();
    // 최신 Chromium도 requestPermission()이 있어 "granted"가 아닐 수 있다. 그래도 센서 값이 오면 쓰도록 항상 듣는다.
    window.addEventListener("devicemotion", onMotion);
    if (!granted) enableTapFallback(); // 권한 거부·센서 없음: 탭으로라도 연주할 수 있게
    setTimeout(() => {
      if (!motionSeen) enableTapFallback();
    }, NO_SENSOR_MS);
  });
});

// ---------- 꽥 버튼: TV에서 펭귄 효과음 ----------
const squawkBtn = $("squawk");
let lastEffectAt = 0;
squawkBtn.addEventListener("pointerdown", e => {
  e.preventDefault();
  const now = performance.now();
  if (!state.joined || now - lastEffectAt < EFFECT_MIN_MS) return;
  lastEffectAt = now;
  state.effects++;
  socket.emit(EVENTS.EFFECT, {});
  squawkBtn.classList.remove("pop");
  void squawkBtn.offsetWidth;
  squawkBtn.classList.add("pop");
  setTimeout(() => squawkBtn.classList.remove("pop"), 200);
  if (typeof navigator.vibrate === "function") navigator.vibrate([20, 40, 20]);
});

// ---------- 누르고 말하기: 누른 채 말하고 떼면 TV에서 펭귄 목소리로 ----------
const micBtn = $("mic");
let micPressed = false;
let lastVoiceAt = 0;

function sendVoice(result) {
  micBtn.classList.remove("recording");
  if (!result) return; // 너무 짧음(실수로 누름)
  lastVoiceAt = performance.now();
  state.voices++;
  socket.emit(EVENTS.VOICE, result);
  micBtn.classList.add("sent");
  setTimeout(() => micBtn.classList.remove("sent"), 600);
}

const recorder = isVoiceSupported() ? createVoiceRecorder({ onAutoStop: sendVoice }) : null;
if (!recorder) {
  micBtn.classList.add("disabled");
  state.mic = "미지원";
}

micBtn.addEventListener("pointerdown", e => {
  e.preventDefault();
  if (!recorder || !state.joined || micBtn.classList.contains("disabled")) return;
  if (performance.now() - lastVoiceAt < VOICE_MIN_MS) return;
  micPressed = true;
  try {
    micBtn.setPointerCapture(e.pointerId); // 손가락이 조금 움직여도 계속 누른 것으로
  } catch (err) {
    // 지원하지 않으면 무시
  }
  recorder.wake(); // iOS: 탭 안에서 오디오를 깨워야 한다
  recorder
    .prepare()
    .then(() => {
      state.mic = "켜짐(" + recorder.audioState + ")";
      // 처음엔 권한 창 때문에 손을 뗐을 수 있다 → 아직 누르고 있을 때만 녹음
      if (!micPressed) return;
      recorder.start();
      micBtn.classList.add("recording");
      if (typeof navigator.vibrate === "function") navigator.vibrate(15);
    })
    .catch(err => {
      const name = err && err.name ? err.name : String(err);
      state.mic = "오류: " + name;
      // 권한 거부만 회색으로 막는다(아이 화면엔 실패 표시 없음). 통화 중 같은 일시 오류는 다음에 다시 시도.
      if (name === "NotAllowedError" || name === "SecurityError") micBtn.classList.add("disabled");
    });
});

function micRelease() {
  if (recorder) recorder.wake(); // iOS: 손을 뗄 때(탭 완료)도 오디오를 깨운다 — 다음 녹음을 위해
  if (!micPressed) return;
  micPressed = false;
  if (recorder && recorder.recording) sendVoice(recorder.stop());
}
micBtn.addEventListener("pointerup", micRelease);
micBtn.addEventListener("pointercancel", micRelease);
micBtn.addEventListener("lostpointercapture", micRelease);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && recorder) {
    micPressed = false;
    micBtn.classList.remove("recording");
    recorder.release(); // 화면을 떠나면 마이크를 끈다
    state.mic = "꺼짐";
  }
});

// ---------- 진단 화면(?debug) ----------
debug = createPhoneDebug({
  enabled: isDebug(),
  socket,
  state,
  getThreshold: () => threshold,
  setThreshold: t => {
    threshold = t;
    detect = createShakeDetector({ threshold });
  },
});
