// 폰 진단 화면: 주소에 ?debug(=1)가 있으면 위쪽에 표시된다(부모·개발용, 아이용 화면 아님).
// TV를 ?debug로 열면 QR에도 debug가 붙어 폰이 자동으로 진단 모드로 열린다.
// - 센서 값 그래프(빨간 선 = 임계값), 초당 샘플 수, 지난 1초 최대 가속도
// - 임계값 −/+ 로 민감도를 바로 바꿔 볼 수 있다(이 화면에서만, 새로고침하면 기본값)
// - 5초마다 요약을 서버로 보내 서버 기록(Render Logs)에도 찍는다
import { EVENTS } from "../shared/protocol.js";
import { createRateMeter, createPeakHold, shortBrowser } from "../shared/diag.js";

const REFRESH_MS = 250;
const PING_MS = 2000;
const REPORT_MS = 5000;
const GRAPH_MS = 3000; // 그래프에 보이는 시간
const GRAPH_MAX = 40; // m/s², 그래프 위쪽 끝
const STEP = 0.5; // 임계값 조절 단위

const noop = () => {};
const DISABLED = { sample: noop, shake: noop, error: noop };

export function isDebug() {
  return new URLSearchParams(location.search).has("debug");
}

const yes = v => (v ? "예" : "아니오");

// getThreshold/setThreshold: 흔들림 판정 임계값 읽기·바꾸기
export function createPhoneDebug({ enabled, socket, state, getThreshold, setThreshold }) {
  if (!enabled) return DISABLED;

  const box = document.createElement("div");
  box.id = "debug-panel";
  box.setAttribute(
    "style",
    "position:fixed;top:0;left:0;right:0;z-index:10;padding:6px 8px;background:rgba(0,0,0,.72);color:#7CFC9A;" +
      "font:12px/1.35 monospace;pointer-events:none;-webkit-user-select:none;user-select:none"
  );
  const text = document.createElement("pre");
  text.setAttribute("style", "margin:0;white-space:pre-wrap");
  const canvas = document.createElement("canvas");
  canvas.height = 90;
  canvas.setAttribute("style", "display:block;width:100%;height:90px;margin-top:4px;background:rgba(255,255,255,.06)");
  const row = document.createElement("div");
  row.setAttribute("style", "display:flex;align-items:center;margin-top:6px;pointer-events:auto");
  const btn = label => {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute(
      "style",
      "width:56px;height:44px;font:bold 22px monospace;border-radius:10px;border:0;background:#fff;color:#000;margin-right:8px"
    );
    return b;
  };
  const minus = btn("−");
  const plus = btn("+");
  const thLabel = document.createElement("span");
  thLabel.setAttribute("style", "font:bold 16px monospace;margin-right:8px");
  row.appendChild(minus);
  row.appendChild(thLabel);
  row.appendChild(plus);
  box.appendChild(text);
  box.appendChild(canvas);
  box.appendChild(row);
  document.body.appendChild(box);

  const rate = createRateMeter();
  const peak = createPeakHold();
  const samples = []; // [time, magnitude]
  const shakes = []; // time
  const d = { last: 0, rtt: null, lastIntensity: null, errors: 0, lastError: "" };

  let logTimer = null;
  const changeThreshold = delta => {
    const next = Math.max(10, Math.min(30, getThreshold() + delta));
    setThreshold(next);
    // 연달아 누르면 마지막 값만 터미널에 남긴다
    clearTimeout(logTimer);
    logTimer = setTimeout(() => {
      socket.emit(EVENTS.CLIENT_LOG, { role: "phone", kind: "info", message: "임계값 변경 → " + getThreshold().toFixed(1) });
    }, 800);
  };
  // 버튼 탭이 흔들기·확대로 처리되지 않게 막는다
  minus.addEventListener("pointerdown", e => {
    e.stopPropagation();
    changeThreshold(-STEP);
  });
  plus.addEventListener("pointerdown", e => {
    e.stopPropagation();
    changeThreshold(STEP);
  });

  function ping() {
    if (!socket.connected) return;
    const t0 = performance.now();
    socket.emit(EVENTS.PING, () => {
      d.rtt = Math.round(performance.now() - t0);
    });
  }

  function lines(now) {
    const transport = socket.connected && socket.io.engine ? socket.io.engine.transport.name : "끊김";
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    const hasFs = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
    return [
      shortBrowser(navigator.userAgent) + "  보안연결 " + yes(window.isSecureContext),
      "센서 " + yes(typeof DeviceMotionEvent !== "undefined") +
        "  권한함수 " + yes(typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") +
        "  권한 " + state.permission + "  탭대체 " + yes(state.tapFallback),
      "샘플 " + rate.rate(now) + "Hz  |a| " + d.last.toFixed(1) + "  1초최대 " + peak.peak(now).toFixed(1) + " m/s²",
      "자리 " + (state.slot === null ? "-" : state.slot + 1) + "  캐릭터 " + (state.character === null ? "-" : state.character) + "  흔들기 " + state.shakes + "회  세기 " +
        (d.lastIntensity === null ? "-" : d.lastIntensity.toFixed(2)),
      "특별 " + state.effects + "회  목소리 " + state.voices + "회  마이크 " + state.mic,
      "화면유지 " + state.wakeLock + "  진동 " + yes(typeof navigator.vibrate === "function") +
        "  전체화면 " + (fs ? "켜짐" : hasFs ? "지원" : "미지원"),
      "소켓 " + transport + "  왕복 " + (d.rtt === null ? "-" : d.rtt + "ms") + "  방 " + (state.code || "-"),
      "오류 " + d.errors + (d.lastError ? " " + d.lastError : ""),
    ];
  }

  function draw(now) {
    const w = (canvas.width = canvas.clientWidth || 300);
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    const x = t => w - ((now - t) / GRAPH_MS) * w;
    const y = m => h - (Math.min(m, GRAPH_MAX) / GRAPH_MAX) * h;
    ctx.clearRect(0, 0, w, h);
    // 중력(9.8)과 임계값
    ctx.strokeStyle = "rgba(255,255,255,.3)";
    ctx.beginPath();
    ctx.moveTo(0, y(9.81));
    ctx.lineTo(w, y(9.81));
    ctx.stroke();
    ctx.strokeStyle = "#ff4d6d";
    ctx.beginPath();
    ctx.moveTo(0, y(getThreshold()));
    ctx.lineTo(w, y(getThreshold()));
    ctx.stroke();
    // 흔들기로 판정된 순간
    ctx.fillStyle = "rgba(255,209,102,.5)";
    for (const t of shakes) ctx.fillRect(x(t) - 1, 0, 3, h);
    // 가속도
    ctx.strokeStyle = "#7CFC9A";
    ctx.beginPath();
    samples.forEach((s, i) => (i ? ctx.lineTo(x(s[0]), y(s[1])) : ctx.moveTo(x(s[0]), y(s[1]))));
    ctx.stroke();
  }

  setInterval(() => {
    const now = performance.now();
    while (samples.length && now - samples[0][0] > GRAPH_MS) samples.shift();
    while (shakes.length && now - shakes[0] > GRAPH_MS) shakes.shift();
    text.textContent = lines(now).join("\n");
    thLabel.textContent = "임계값 " + getThreshold().toFixed(1);
    draw(now);
  }, REFRESH_MS);
  setInterval(ping, PING_MS);
  setInterval(() => {
    const now = performance.now();
    const msg = lines(now).join(" | ") + " | 임계값 " + getThreshold().toFixed(1);
    socket.emit(EVENTS.CLIENT_LOG, { role: "phone", kind: "report", message: msg.replace(/\s+/g, " ") });
  }, REPORT_MS);
  ping();

  return {
    sample(m, now) {
      d.last = m;
      rate.tick(now);
      peak.add(m, now);
      samples.push([now, m]);
    },
    shake(intensity, now) {
      d.lastIntensity = intensity;
      shakes.push(now);
    },
    error(message) {
      d.errors++;
      d.lastError = String(message).slice(0, 60);
    },
  };
}
