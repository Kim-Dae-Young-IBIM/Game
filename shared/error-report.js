// 브라우저 전용: 페이지 오류를 서버로 보내 서버 기록(Render Logs)에 찍히게 한다.
// webOS TV처럼 개발자 도구를 열기 어려운 기기에서 원인을 찾기 위한 것. 항상 켜져 있다.
import { EVENTS } from "./protocol.js";

const MAX_REPORTS = 20; // 한 페이지에서 보내는 오류 수 상한

export function installErrorReporter(socket, role, onError) {
  let sent = 0;
  const send = message => {
    if (onError) onError(message);
    if (sent >= MAX_REPORTS) return;
    sent++;
    socket.emit(EVENTS.CLIENT_LOG, { role, kind: "error", message });
  };
  window.addEventListener("error", e => {
    const where = e.filename ? " @" + String(e.filename).split("/").pop() + ":" + e.lineno : "";
    send(String(e.message || "오류") + where);
  });
  window.addEventListener("unhandledrejection", e => {
    const r = e.reason;
    send("처리되지 않은 Promise 거부: " + (r && r.message ? r.message : String(r)));
  });
  return send;
}
