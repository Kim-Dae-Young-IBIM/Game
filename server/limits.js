// 공개 인터넷(Render)에 올라가 있으므로, 같은 IP에서 틀린 방 코드를 계속 넣으면 잠시 막는다.
// 소켓당 제한(index.js)은 다시 접속하면 풀리므로 IP 단위로 한 번 더 막는다.

export function createFailLimiter({ max = 30, windowMs = 10 * 60 * 1000, now = Date.now } = {}) {
  const fails = new Map(); // key -> { count, resetAt }
  const entry = key => {
    const t = now();
    let e = fails.get(key);
    if (!e || t >= e.resetAt) {
      e = { count: 0, resetAt: t + windowMs };
      fails.set(key, e);
    }
    return e;
  };
  return {
    blocked: key => entry(key).count >= max,
    fail: key => {
      entry(key).count++;
      if (fails.size > 10000) {
        // 오래된 기록 정리(메모리 보호)
        const t = now();
        for (const [k, e] of fails) if (t >= e.resetAt) fails.delete(k);
      }
    },
  };
}

// 프록시(Render) 뒤에서는 x-forwarded-for의 첫 주소가 실제 접속자다.
export function clientIp(handshake) {
  const xff = handshake && handshake.headers && handshake.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  return (handshake && handshake.address) || "?";
}
