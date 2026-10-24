// 폰 컨트롤러: 방 코드 → 시작(iOS 센서 권한) → 동물 그림. 흔들면 TV로 전송.
// 순수 HTML/JS. 센서·Wake Lock·진동·전체화면은 있는 기기에서만 쓴다.
import { io } from "socket.io-client";
import { EVENTS, isValidRoomCode } from "../shared/protocol.js";
import { createShakeDetector } from "../shared/shake.js";

const TAP_INTENSITY = 0.7; // 센서가 없을 때 탭 한 번의 세기
const NO_SENSOR_MS = 2500; // 이 시간 동안 센서 값이 없으면 탭으로 대신한다

// 테스트·디버그용 상태(Playwright가 읽는다)
const state = (window.__phone = { code: null, joined: false, shakes: 0, tapFallback: false });

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

function join(code) {
  return new Promise(resolve => {
    socket.timeout(5000).emit(EVENTS.PHONE_JOIN, { code }, (err, res) => resolve(!err && res && res.ok));
  });
}

socket.on("connect", () => {
  playScreen.classList.remove("offline");
  $("offline").classList.add("hidden");
  // 와이파이가 끊겼다 돌아오면 자동으로 다시 입장
  if (state.joined && state.code) {
    join(state.code).then(ok => {
      if (!ok) backToJoin();
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
  if (!("wakeLock" in navigator)) return;
  navigator.wakeLock
    .request("screen")
    .then(lock => {
      wakeLock = lock;
    })
    .catch(() => {});
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
  if (typeof DeviceMotionEvent === "undefined") return Promise.resolve(false);
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    return DeviceMotionEvent.requestPermission()
      .then(s => s === "granted")
      .catch(() => false);
  }
  return Promise.resolve(true);
}

const detect = createShakeDetector();
let motionSeen = false;

function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x === null) return;
  motionSeen = true;
  const hit = detect(a, performance.now());
  if (hit) shake(hit.intensity);
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
  Promise.all([permission, join(code)]).then(([granted, ok]) => {
    goBtn.classList.remove("waiting");
    if (!ok) return wrongCode();
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
