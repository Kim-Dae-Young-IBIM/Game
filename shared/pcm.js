// 목소리 녹음 변환(폰 → TV). 기기마다 녹음 형식(AAC/Opus)이 달라서 압축 없이 16bit PCM으로 보낸다.
// 순수 함수라 Node 테스트와 브라우저가 함께 쓴다.

export const VOICE_RATE = 16000; // 보낼 때 샘플링 주파수(말소리에 충분)
export const VOICE_MAX_SEC = 5; // 한 번에 최대 길이
export const VOICE_MIN_SEC = 0.3; // 이보다 짧으면(실수로 누름) 보내지 않는다
export const VOICE_MAX_BYTES = 400000; // 서버가 받는 최대 크기(5초 16kHz 16bit = 160KB, 여유 포함)

// 여러 조각의 Float32Array를 하나로 이어 붙인다
export function concatFloat32(chunks) {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// 샘플링 주파수 낮추기(구간 평균). fromRate가 더 낮거나 같으면 그대로 돌려준다.
export function downsample(input, fromRate, toRate = VOICE_RATE) {
  if (!(fromRate > toRate)) return input;
  const ratio = fromRate / toRate;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

// 샘플링 주파수 바꾸기(선형 보간). TV가 16kHz 버퍼를 못 만들 때 출력 주파수로 올리는 데 쓴다.
export function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate || input.length === 0) return input;
  const n = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(n);
  const step = (input.length - 1) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const j = Math.floor(x);
    const k = Math.min(input.length - 1, j + 1);
    out[i] = input[j] + (input[k] - input[j]) * (x - j);
  }
  return out;
}

export function floatTo16(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function int16ToFloat(input) {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] / 0x8000;
  return out;
}

// 소리 크기를 키워 작은 목소리도 TV에서 잘 들리게(최대 4배, 찢어지지 않게 정점 0.9 기준)
export function normalize(input, target = 0.9, maxGain = 4) {
  let peak = 0;
  for (let i = 0; i < input.length; i++) {
    const a = Math.abs(input[i]);
    if (a > peak) peak = a;
  }
  if (peak === 0) return input;
  const gain = Math.min(maxGain, target / peak);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] * gain;
  return out;
}

// 녹음 조각들 → 보낼 16bit PCM. 너무 짧으면 null, 너무 길면 최대 길이로 자른다.
export function encodeVoice(chunks, fromRate, toRate = VOICE_RATE) {
  let samples = downsample(concatFloat32(chunks), fromRate, toRate);
  if (samples.length < VOICE_MIN_SEC * toRate) return null;
  const max = VOICE_MAX_SEC * toRate;
  if (samples.length > max) samples = samples.subarray(0, max);
  return floatTo16(normalize(samples));
}

// 받은 PCM(ArrayBuffer 또는 Buffer/TypedArray 같은 뷰) → Int16Array. 뷰 위치가 홀수면 복사한다.
export function toInt16(pcm) {
  if (pcm instanceof ArrayBuffer) return new Int16Array(pcm);
  if (ArrayBuffer.isView(pcm)) {
    const n = Math.floor(pcm.byteLength / 2);
    if (pcm.byteOffset % 2 === 0) return new Int16Array(pcm.buffer, pcm.byteOffset, n);
    return new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + n * 2));
  }
  return new Int16Array(0);
}

// 서버가 받은 목소리 확인: 바이트 배열, 짝수 길이, 크기·주파수 범위
export function isValidVoice(payload) {
  if (!payload || typeof payload !== "object") return false;
  const { pcm, rate } = payload;
  // 속성(byteLength) 유무가 아니라 실제 바이너리 타입인지 본다(Node에서는 Buffer = ArrayBuffer 뷰)
  const binary = pcm instanceof ArrayBuffer || ArrayBuffer.isView(pcm);
  const len = binary ? pcm.byteLength : -1;
  if (len <= 0 || len > VOICE_MAX_BYTES || len % 2 !== 0) return false;
  return Number.isInteger(rate) && rate >= 8000 && rate <= 48000;
}
