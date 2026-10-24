// 임시 효과음 합성기. 외부 샘플 없이 코드로 만들어 라이선스 걱정이 없다.
// 실행: npm run sounds → assets/sounds/*.wav (16bit mono 22050Hz)
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RATE = 22050;
const outDir = fileURLToPath(new URL("../assets/sounds/", import.meta.url));

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return buf;
}

// 결정적 잡음(매번 같은 파일이 나오도록)
function noise(seed = 1) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;
}

// 큰북: 180→55Hz 사인 하강 + 짧은 잡음 타격음
function drum() {
  const len = Math.floor(RATE * 0.45);
  const rnd = noise(7);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const f = 55 + 125 * Math.exp(-t * 18);
    phase += (2 * Math.PI * f) / RATE;
    const body = Math.sin(phase) * Math.exp(-t * 7);
    const click = rnd() * Math.exp(-t * 120) * 0.5;
    out[i] = (body + click) * 0.9;
  }
  return out;
}

// 야옹: 올라갔다 내려오는 음높이 + 비브라토 + 배음, "이-야-옹" 모양의 음량 곡선
function meow(pitch) {
  const dur = 0.55;
  const len = Math.floor(RATE * dur);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const p = t / dur;
    const contour = p < 0.35 ? 520 + 380 * (p / 0.35) : 900 - 420 * ((p - 0.35) / 0.65);
    const f = contour * pitch * (1 + 0.025 * Math.sin(2 * Math.PI * 6 * t));
    phase += (2 * Math.PI * f) / RATE;
    // 모음이 "이→아→오"로 바뀌는 느낌: 배음 비율을 시간에 따라 바꾼다
    const bright = p < 0.4 ? 0.6 : 0.6 - 0.45 * ((p - 0.4) / 0.6);
    const tone =
      Math.sin(phase) + bright * Math.sin(2 * phase) + bright * 0.5 * Math.sin(3 * phase) + 0.15 * Math.sin(4 * phase);
    const env = Math.min(1, t / 0.04) * Math.min(1, (dur - t) / 0.12);
    out[i] = (tone / 2.2) * env * 0.85;
  }
  return out;
}

mkdirSync(outDir, { recursive: true });
const files = {
  "drum.wav": drum(),
  "meow-1.wav": meow(1.0),
  "meow-2.wav": meow(1.2),
  "meow-3.wav": meow(1.45),
};
for (const [name, samples] of Object.entries(files)) {
  writeFileSync(outDir + name, wav(samples));
  console.log("wrote", name);
}
