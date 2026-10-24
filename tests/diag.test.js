import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateMeter, createPeakHold, shortBrowser } from "../shared/diag.js";
import { formatClientLog, LOG_MAX_LEN } from "../server/client-log.js";

test("초당 빈도: 60Hz로 1초 넣으면 약 60", () => {
  const r = createRateMeter();
  for (let i = 0; i <= 60; i++) r.tick(i * (1000 / 60));
  assert.ok(Math.abs(r.rate(1000) - 60) <= 1, String(r.rate(1000)));
  assert.equal(r.rate(3000), 0, "1초 넘게 없으면 0");
});

test("1초 최대값은 오래된 값을 버린다", () => {
  const p = createPeakHold();
  p.add(30, 0);
  p.add(12, 900);
  assert.equal(p.peak(950), 30);
  assert.equal(p.peak(1500), 12);
  assert.equal(p.peak(5000), 0);
});

test("UA에서 브라우저·OS 구분", () => {
  const webos =
    "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager";
  const samsung =
    "Mozilla/5.0 (Linux; Android 16; SM-S941N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/29.0 Chrome/136.0.0.0 Mobile Safari/537.36";
  const chrome = "Mozilla/5.0 (Linux; Android 16; SM-S941N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
  assert.equal(shortBrowser(webos), "Chrome 79.0.3945.79 / webOS");
  assert.equal(shortBrowser(samsung), "삼성 인터넷 29.0 / Android 16");
  assert.equal(shortBrowser(chrome), "Chrome 141.0.0.0 / Android 16");
  assert.equal(shortBrowser(iphone), "Safari 26.0 / iOS 26");
  assert.equal(shortBrowser(""), "알 수 없음");
});

test("기기 기록 정리: 역할·종류는 정해진 값만, 제어문자 제거, 길이 제한", () => {
  assert.deepEqual(formatClientLog({ role: "tv", kind: "error", message: "boom\nline2" }), {
    role: "tv",
    kind: "error",
    message: "boom line2",
  });
  assert.deepEqual(formatClientLog({ role: "hacker", kind: "rm -rf", message: "x" }), { role: "?", kind: "info", message: "x" });
  const long = formatClientLog({ role: "phone", kind: "report", message: "a".repeat(5000) });
  assert.equal(long.message.length, LOG_MAX_LEN + 1);
  assert.equal(formatClientLog({ role: "tv", kind: "info", message: { a: 1 } }).message, '{"a":1}');
  assert.equal(formatClientLog(null), null);
  assert.equal(formatClientLog("str"), null);
  assert.equal(formatClientLog({ role: "tv", message: "   " }), null);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(formatClientLog({ role: "tv", message: cyclic }), null);
});
