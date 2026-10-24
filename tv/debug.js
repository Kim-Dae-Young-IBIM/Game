// TV 진단 화면: 주소에 ?debug 를 붙이면 왼쪽 아래에 표시된다(아이용 화면이 아니라 부모·개발용).
// 5초마다 같은 내용을 서버로 보내 PC 터미널에도 찍는다. debug가 아니면 아무것도 하지 않는다.
import { EVENTS } from "../shared/protocol.js";
import { shortBrowser } from "../shared/diag.js";

const REFRESH_MS = 500;
const PING_MS = 2000;
const REPORT_MS = 5000;

const noop = () => {};
const yes = v => (v ? "예" : "아니오");
const DISABLED = { received: noop, error: noop };

export function isDebug() {
  return new URLSearchParams(location.search).has("debug");
}

// getInfo(): { renderer, fps, audio, started, code, players, plays }
export function createTvDebug({ enabled, socket, getInfo }) {
  if (!enabled) return DISABLED;

  const panel = document.createElement("pre");
  panel.id = "debug-panel";
  panel.setAttribute(
    "style",
    "position:absolute;left:16px;bottom:16px;z-index:5;margin:0;padding:12px 16px;max-width:900px;" +
      "background:rgba(0,0,0,.75);color:#7CFC9A;font:20px/1.35 monospace;border-radius:12px;white-space:pre-wrap;pointer-events:none"
  );
  document.body.appendChild(panel);

  const d = {
    rtt: null,
    received: 0,
    lastIntensity: null,
    lastBeatWait: null,
    errors: 0,
    lastError: "",
  };

  function ping() {
    if (!socket.connected) return;
    const t0 = performance.now();
    socket.emit(EVENTS.PING, () => {
      d.rtt = Math.round(performance.now() - t0);
    });
  }

  function lines() {
    const info = getInfo();
    const transport = socket.connected && socket.io.engine ? socket.io.engine.transport.name : "끊김";
    return [
      "브라우저   " + shortBrowser(navigator.userAgent) + "  보안연결 " + yes(window.isSecureContext),
      "화면       " + innerWidth + "x" + innerHeight + " @" + (window.devicePixelRatio || 1) + "  " + info.renderer + "  FPS " + info.fps,
      "오디오     " + info.audio,
      "소켓       " + transport + "  왕복 " + (d.rtt === null ? "-" : d.rtt + "ms"),
      "방         " + (info.code || "-") + "  폰 " + info.players + "대  시작 " + yes(info.started),
      "흔들기     받음 " + d.received + "  연주 " + info.plays +
        "  세기 " + (d.lastIntensity === null ? "-" : d.lastIntensity.toFixed(2)) +
        "  박자대기 " + (d.lastBeatWait === null ? "-" : d.lastBeatWait + "ms"),
      "오류       " + d.errors + (d.lastError ? "  " + d.lastError : ""),
    ];
  }

  setInterval(() => {
    panel.textContent = lines().join("\n");
  }, REFRESH_MS);
  setInterval(ping, PING_MS);
  setInterval(() => {
    socket.emit(EVENTS.CLIENT_LOG, { role: "tv", kind: "report", message: lines().join(" | ").replace(/\s+/g, " ") });
  }, REPORT_MS);
  ping();

  return {
    received(intensity, beatWaitMs) {
      d.received++;
      d.lastIntensity = intensity;
      d.lastBeatWait = beatWaitMs;
    },
    error(message) {
      d.errors++;
      d.lastError = String(message).slice(0, 80);
    },
  };
}
