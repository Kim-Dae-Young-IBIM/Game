// TV·폰이 보낸 오류·진단 기록을 서버 터미널에 한 줄로 찍기 위한 정리.
// 실기기(특히 webOS TV)는 개발자 도구를 열기 어려워서, 화면 대신 서버 기록(Render Logs, 로컬은 터미널)에서 본다.
// 외부 입력이므로 역할·종류는 정해진 값만, 메시지는 길이를 자르고 제어 문자를 지운다.

export const LOG_MAX_LEN = 600;
const ROLES = ["tv", "phone"];
const KINDS = ["error", "report", "info"];

export function formatClientLog(payload) {
  if (!payload || typeof payload !== "object") return null;
  const role = ROLES.includes(payload.role) ? payload.role : "?";
  const kind = KINDS.includes(payload.kind) ? payload.kind : "info";
  let message = payload.message;
  if (typeof message !== "string") {
    try {
      message = JSON.stringify(message);
    } catch {
      return null;
    }
  }
  if (typeof message !== "string") return null;
  message = message.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (!message) return null;
  if (message.length > LOG_MAX_LEN) message = message.slice(0, LOG_MAX_LEN) + "…";
  return { role, kind, message };
}
