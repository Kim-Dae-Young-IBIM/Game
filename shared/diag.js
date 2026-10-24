// 진단 화면(?debug)용 순수 계산. 브라우저·Node 테스트 공용.

// 최근 windowMs 동안 들어온 횟수로 초당 빈도(Hz)를 센다. 센서 샘플 빈도, 화면 FPS 등에 쓴다.
export function createRateMeter(windowMs = 1000) {
  const times = [];
  return {
    tick(nowMs) {
      times.push(nowMs);
      while (times.length && nowMs - times[0] > windowMs) times.shift();
    },
    rate(nowMs) {
      while (times.length && nowMs - times[0] > windowMs) times.shift();
      return Math.round((times.length * 1000) / windowMs);
    },
  };
}

// 최근 값들의 최댓값(예: 지난 1초간 가속도 최대)
export function createPeakHold(windowMs = 1000) {
  const samples = [];
  return {
    add(value, nowMs) {
      samples.push([nowMs, value]);
      while (samples.length && nowMs - samples[0][0] > windowMs) samples.shift();
    },
    peak(nowMs) {
      while (samples.length && nowMs - samples[0][0] > windowMs) samples.shift();
      let m = 0;
      for (const s of samples) if (s[1] > m) m = s[1];
      return m;
    },
  };
}

// UA 문자열에서 브라우저 이름·버전을 짧게 뽑는다(webOS TV, 삼성 인터넷, iOS Safari 구분용)
export function shortBrowser(ua) {
  const s = String(ua || "");
  const pick = (re, name) => {
    const m = s.match(re);
    return m ? name + " " + m[1] : null;
  };
  const browser =
    pick(/SamsungBrowser\/([\d.]+)/, "삼성 인터넷") ||
    pick(/CriOS\/([\d.]+)/, "iOS Chrome") ||
    pick(/Chrome\/([\d.]+)/, "Chrome") ||
    pick(/Version\/([\d.]+).*Safari/, "Safari") ||
    "알 수 없음";
  const os = /Web0S|webOS/i.test(s)
    ? "webOS"
    : /iPhone|iPad|iPod/.test(s)
      ? "iOS " + ((s.match(/OS (\d+)[_\d]*/) || [])[1] || "")
      : /Android/.test(s)
        ? "Android " + ((s.match(/Android ([\d.]+)/) || [])[1] || "")
        : "";
  return os ? browser + " / " + os.trim() : browser;
}
