import { test } from "node:test";
import assert from "node:assert/strict";
import {
  downsample,
  floatTo16,
  int16ToFloat,
  concatFloat32,
  normalize,
  encodeVoice,
  isValidVoice,
  toInt16,
  resampleLinear,
  VOICE_RATE,
  VOICE_MAX_SEC,
  VOICE_MAX_BYTES,
} from "../shared/pcm.js";

const sine = (hz, sec, rate, amp = 0.5) =>
  Float32Array.from({ length: Math.round(sec * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

test("48kHz → 16kHz: 길이 1/3, 평균값", () => {
  const out = downsample(Float32Array.from([0.3, 0.3, 0.3, -0.6, -0.6, -0.6]), 48000, 16000);
  assert.equal(out.length, 2);
  assert.ok(Math.abs(out[0] - 0.3) < 1e-6 && Math.abs(out[1] + 0.6) < 1e-6);
  const s = sine(440, 1, 44100);
  assert.equal(downsample(s, 44100, 16000).length, 16000);
});

test("낮은 주파수면 그대로", () => {
  const s = sine(440, 0.1, 8000);
  assert.equal(downsample(s, 8000, 16000), s);
});

test("16bit 변환: 범위 밖은 자르고, 되돌리면 거의 같다", () => {
  const pcm = floatTo16(Float32Array.from([0, 1, -1, 2, -2, 0.5]));
  assert.deepEqual(Array.from(pcm), [0, 32767, -32768, 32767, -32768, 16383]);
  const back = int16ToFloat(pcm);
  assert.ok(Math.abs(back[5] - 0.5) < 1e-3);
});

test("조각 이어 붙이기", () => {
  const out = concatFloat32([Float32Array.from([1, 2]), Float32Array.from([3])]);
  assert.deepEqual(Array.from(out), [1, 2, 3]);
});

test("작은 목소리는 키우되 최대 4배, 큰 소리는 0.9로", () => {
  const quiet = normalize(Float32Array.from([0.05, -0.1]));
  assert.ok(Math.abs(quiet[1] + 0.4) < 1e-6, "4배까지만");
  const loud = normalize(Float32Array.from([0.5, -0.95]));
  assert.ok(Math.abs(Math.abs(loud[1]) - 0.9) < 1e-6);
  const silent = Float32Array.from([0, 0]);
  assert.equal(normalize(silent), silent);
});

test("녹음 → 보낼 PCM: 너무 짧으면 버리고, 5초 넘으면 자른다", () => {
  assert.equal(encodeVoice([sine(300, 0.1, 48000)], 48000), null);
  const ok = encodeVoice([sine(300, 1, 48000)], 48000);
  assert.ok(ok instanceof Int16Array && ok.length === VOICE_RATE);
  const long = encodeVoice([sine(300, 4, 48000), sine(300, 4, 48000)], 48000);
  assert.equal(long.length, VOICE_MAX_SEC * VOICE_RATE);
  assert.ok(long.byteLength <= VOICE_MAX_BYTES);
});

test("서버 쪽 목소리 확인", () => {
  const pcm = new Int16Array(16000).buffer;
  assert.equal(isValidVoice({ pcm, rate: 16000 }), true);
  assert.equal(isValidVoice({ pcm: Buffer.alloc(100), rate: 16000 }), true, "Node에서는 Buffer로 온다");
  assert.equal(isValidVoice({ pcm: Buffer.alloc(101), rate: 16000 }), false, "홀수 바이트");
  assert.equal(isValidVoice({ pcm: Buffer.alloc(VOICE_MAX_BYTES + 2), rate: 16000 }), false);
  assert.equal(isValidVoice({ pcm, rate: 200 }), false);
  assert.equal(isValidVoice({ pcm, rate: 16000.5 }), false);
  assert.equal(isValidVoice({ pcm: "abc", rate: 16000 }), false);
  assert.equal(isValidVoice({ pcm: new ArrayBuffer(0), rate: 16000 }), false);
  assert.equal(isValidVoice(null), false);
});

test("받은 PCM 형태가 달라도 Int16Array로", () => {
  const src = Int16Array.from([1, -2, 3]);
  assert.deepEqual(Array.from(toInt16(src.buffer)), [1, -2, 3]);
  assert.deepEqual(Array.from(toInt16(Buffer.from(src.buffer))), [1, -2, 3]);
  const odd = Buffer.concat([Buffer.from([9]), Buffer.from(src.buffer)]).subarray(1); // 홀수 위치 뷰
  assert.deepEqual(Array.from(toInt16(odd)), [1, -2, 3]);
  assert.equal(toInt16("x").length, 0);
});

test("선형 보간으로 16kHz → 48kHz: 길이 3배, 끝값 유지, 사이값 보간", () => {
  const out = resampleLinear(Float32Array.from([0, 1, 0]), 16000, 48000);
  assert.equal(out.length, 9);
  assert.equal(out[0], 0);
  assert.equal(out[8], 0);
  assert.ok(Math.abs(out[4] - 1) < 1e-6);
  assert.ok(out[2] > 0 && out[2] < 1);
  const same = Float32Array.from([1, 2]);
  assert.equal(resampleLinear(same, 16000, 16000), same);
});
