// 효과음·배경음 합성기. 외부 샘플 없이 코드로 만들어 라이선스 걱정이 없다.
// 실행: npm run sounds → assets/sounds/*.wav (16bit mono 22050Hz)
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RATE = 22050;
const outDir = fileURLToPath(new URL("../assets/sounds/", import.meta.url));
const TAU = 2 * Math.PI;

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

const len = sec => Math.floor(RATE * sec);

// 정점을 peak로 맞춘다
function normalize(out, peak = 0.9) {
  let m = 0;
  for (const v of out) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < out.length; i++) out[i] *= peak / m;
  return out;
}

// 큰북: 180→55Hz 사인 하강 + 짧은 잡음 타격음
function drum() {
  const out = new Float32Array(len(0.45));
  const rnd = noise(7);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    phase += (TAU * (55 + 125 * Math.exp(-t * 18))) / RATE;
    out[i] = Math.sin(phase) * Math.exp(-t * 7) + rnd() * Math.exp(-t * 120) * 0.5;
  }
  return normalize(out);
}

// 탬버린: 금속 방울(여러 높은 배음) 짤랑 + 가죽 타격음, 방울이 두 번 더 흔들린다
function tambourine() {
  const out = new Float32Array(len(0.5));
  const rnd = noise(11);
  const partials = [3150, 4420, 5310, 6870, 7720];
  for (const [delay, amp] of [
    [0, 1],
    [0.07, 0.55],
    [0.15, 0.3],
  ]) {
    const start = len(delay);
    for (let i = start; i < out.length; i++) {
      const t = (i - start) / RATE;
      let ring = 0;
      for (const f of partials) ring += Math.sin(TAU * f * t + f);
      const env = Math.exp(-t * 16) * amp;
      out[i] += (ring / partials.length) * env * 0.8 + rnd() * env * 0.35;
    }
  }
  for (let i = 0; i < len(0.06); i++) out[i] += Math.sin((TAU * 180 * i) / RATE) * Math.exp((-i / RATE) * 60) * 0.5;
  return normalize(out, 0.8);
}

// 실로폰 한 음: 기본음 + 실로폰 특유의 배음(약 3.9배, 9.5배), 빠른 감쇠
function xylophone(freq) {
  const out = new Float32Array(len(0.7));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const tone =
      Math.sin(TAU * freq * t) * Math.exp(-t * 6) +
      0.35 * Math.sin(TAU * freq * 3.93 * t) * Math.exp(-t * 18) +
      0.12 * Math.sin(TAU * freq * 9.5 * t) * Math.exp(-t * 40);
    out[i] = tone * Math.min(1, t / 0.002);
  }
  return normalize(out, 0.85);
}

// 마라카스: 높은 잡음 "샥-샥"
function maracas() {
  const out = new Float32Array(len(0.32));
  const rnd = noise(23);
  let prev = 0;
  for (const [delay, amp] of [
    [0, 1],
    [0.13, 0.7],
  ]) {
    const start = len(delay);
    for (let i = start; i < out.length; i++) {
      const t = (i - start) / RATE;
      const n = rnd();
      const hp = n - prev; // 간단한 고역 통과
      prev = n;
      const env = Math.min(1, t / 0.008) * Math.exp(-t * 28) * amp;
      out[i] += hp * env;
    }
  }
  return normalize(out, 0.7);
}

// 펭귄 "꽥꽥": 콧소리 같은 배음(1.2kHz 근처 강조) + 내려가는 음높이, 두 번
function squawk() {
  const out = new Float32Array(len(0.55));
  const rnd = noise(31);
  for (const [delay, pitch] of [
    [0, 1],
    [0.24, 0.92],
  ]) {
    const start = len(delay);
    const dur = 0.19;
    let phase = 0;
    for (let i = start; i < Math.min(out.length, start + len(dur)); i++) {
      const t = (i - start) / RATE;
      const p = t / dur;
      const f = (560 - 170 * p) * pitch * (1 + 0.04 * Math.sin(TAU * 30 * t));
      phase += (TAU * f) / RATE;
      let v = 0;
      for (let k = 1; k <= 12; k++) {
        const fk = k * f;
        const formant = Math.exp(-((fk - 1250) ** 2) / (2 * 450 ** 2)) + 0.35 / k;
        v += Math.sin(k * phase) * formant;
      }
      const env = Math.min(1, t / 0.012) * Math.min(1, (dur - t) / 0.05);
      out[i] += (v / 3 + rnd() * 0.06) * env;
    }
  }
  return normalize(out, 0.85);
}

// 배경 반주: BPM 100, 16박(4마디) = 9.6초, 끊김 없이 반복되도록 넘친 꼬리는 앞으로 감는다.
// 화음 C - Am - F - G(흔한 진행), 베이스는 1·3박, 우쿨렐레 같은 화음은 엇박.
function bgm() {
  const beat = 60 / 100;
  const total = len(beat * 16);
  const out = new Float32Array(total);
  const add = (startSec, render) => {
    const start = len(startSec);
    render((i, v) => {
      out[(start + i) % total] += v;
    });
  };
  const bars = [
    { bass: 130.81, chord: [261.63, 329.63, 392.0] }, // C
    { bass: 110.0, chord: [220.0, 261.63, 329.63] }, // Am
    { bass: 87.31, chord: [174.61, 220.0, 261.63] }, // F
    { bass: 98.0, chord: [196.0, 246.94, 293.66] }, // G
  ];
  const rnd = noise(5);
  bars.forEach((bar, b) => {
    for (let q = 0; q < 4; q++) {
      const t0 = (b * 4 + q) * beat;
      // 베이스(1·3박 길게, 2·4박 짧게)
      add(t0, put => {
        const d = len(q % 2 === 0 ? 0.5 : 0.22);
        for (let i = 0; i < d; i++) {
          const t = i / RATE;
          const v = (Math.sin(TAU * bar.bass * t) + 0.3 * Math.sin(TAU * bar.bass * 2 * t)) * Math.exp(-t * 4);
          put(i, v * 0.55 * Math.min(1, t / 0.005));
        }
      });
      // 엇박 화음(통통 튀는 느낌)
      add(t0 + beat / 2, put => {
        const d = len(0.25);
        for (let i = 0; i < d; i++) {
          const t = i / RATE;
          let v = 0;
          for (const f of bar.chord) v += Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * f * 2 * t);
          put(i, (v / 3) * Math.exp(-t * 12) * 0.35 * Math.min(1, t / 0.004));
        }
      });
      // 아주 작은 찰랑(박자감)
      add(t0 + beat / 2, put => {
        let prev = 0;
        for (let i = 0; i < len(0.05); i++) {
          const n = rnd();
          put(i, (n - prev) * Math.exp((-i / RATE) * 70) * 0.08);
          prev = n;
        }
      });
    }
  });
  return normalize(out, 0.8);
}

// 곰 큰북: 드럼보다 낮고 길게 울리는 "둥"
function bassdrum() {
  const out = new Float32Array(len(0.8));
  const rnd = noise(41);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    phase += (TAU * (42 + 70 * Math.exp(-t * 12))) / RATE;
    out[i] = Math.sin(phase) * Math.exp(-t * 4) + 0.25 * Math.sin(phase * 2) * Math.exp(-t * 9) + rnd() * Math.exp(-t * 90) * 0.35;
  }
  return normalize(out);
}

// 토끼 트라이앵글: 높은 금속 배음이 길게 "띵"
function triangle() {
  const out = new Float32Array(len(1.4));
  const partials = [
    [1250, 1],
    [3440, 0.6],
    [5170, 0.45],
    [7820, 0.3],
  ];
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    let v = 0;
    for (const [f, a] of partials) v += a * Math.sin(TAU * f * t) * Math.exp(-t * (2.2 + f / 4000));
    out[i] = v * Math.min(1, t / 0.002);
  }
  return normalize(out, 0.75);
}

// 오리 장난감 나팔 한 음: 톱니파 비슷한 배음 + 약간 올라가며 시작, "빠-"
function horn(freq) {
  const out = new Float32Array(len(0.42));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const f = freq * (1 - 0.06 * Math.exp(-t * 30)) * (1 + 0.006 * Math.sin(TAU * 6 * t));
    phase += (TAU * f) / RATE;
    let v = 0;
    for (let k = 1; k <= 8; k++) v += (Math.sin(k * phase) / k) * Math.exp(-((k * f - 1400) ** 2) / (2 * 900 ** 2) + 0.2);
    const env = Math.min(1, t / 0.02) * Math.min(1, (0.42 - t) / 0.08);
    out[i] = v * env;
  }
  return normalize(out, 0.8);
}

// 고양이 핸드벨 한 음: 종처럼 어긋난 배음, 길게 울림
function bell(freq) {
  const out = new Float32Array(len(1.1));
  const ratios = [
    [1, 1, 3],
    [2.0, 0.5, 4],
    [2.76, 0.35, 6],
    [5.4, 0.2, 9],
  ];
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    let v = 0;
    for (const [r, a, d] of ratios) v += a * Math.sin(TAU * freq * r * t) * Math.exp(-t * d);
    out[i] = v * Math.min(1, t / 0.002);
  }
  return normalize(out, 0.8);
}

// 곰 "어흥": 낮은 으르렁(거친 잡음 섞인 톱니파), 올라갔다 내려옴
function roar() {
  const dur = 0.85;
  const out = new Float32Array(len(dur));
  const rnd = noise(53);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const p = t / dur;
    const f = 95 + 70 * Math.sin(Math.PI * Math.min(1, p * 1.3));
    phase += (TAU * f * (1 + 0.08 * rnd())) / RATE;
    let v = 0;
    for (let k = 1; k <= 14; k++) v += (Math.sin(k * phase) / k) * Math.exp(-((k * f - 700) ** 2) / (2 * 500 ** 2));
    const env = Math.min(1, t / 0.06) * Math.min(1, (dur - t) / 0.2) * (0.8 + 0.2 * Math.sin(TAU * 18 * t));
    out[i] = (v + rnd() * 0.15) * env;
  }
  return normalize(out, 0.85);
}

// 토끼 "뿅": 빠르게 올라가는 통통 튀는 소리
function boing() {
  const dur = 0.4;
  const out = new Float32Array(len(dur));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const f = 260 + 900 * (1 - Math.exp(-t * 14)) + 40 * Math.sin(TAU * 22 * t);
    phase += (TAU * f) / RATE;
    out[i] = (Math.sin(phase) + 0.3 * Math.sin(2 * phase)) * Math.min(1, t / 0.005) * Math.exp(-t * 6);
  }
  return normalize(out, 0.85);
}

// 오리 "꽥꽥": 펭귄보다 납작하고 콧소리가 센 소리, 두 번
function quack() {
  const out = new Float32Array(len(0.5));
  for (const [delay, pitch] of [
    [0, 1],
    [0.22, 1.08],
  ]) {
    const start = len(delay);
    const dur = 0.17;
    let phase = 0;
    for (let i = start; i < Math.min(out.length, start + len(dur)); i++) {
      const t = i / RATE;
      const f = (330 - 60 * (t / dur)) * pitch;
      phase += (TAU * f) / RATE;
      let v = 0;
      for (let k = 1; k <= 16; k++) v += Math.sin(k * phase) * (Math.exp(-((k * f - 1700) ** 2) / (2 * 350 ** 2)) + 0.2 / k);
      out[i] += v * Math.min(1, t / 0.008) * Math.min(1, (dur - t) / 0.04);
    }
  }
  return normalize(out, 0.85);
}

// 고양이 "야옹": 올라갔다 내려오는 음높이 + 비브라토, "이-야-옹"
function meow() {
  const dur = 0.55;
  const out = new Float32Array(len(dur));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const p = t / dur;
    const contour = p < 0.35 ? 520 + 380 * (p / 0.35) : 900 - 420 * ((p - 0.35) / 0.65);
    const f = contour * (1 + 0.025 * Math.sin(TAU * 6 * t));
    phase += (TAU * f) / RATE;
    const bright = p < 0.4 ? 0.6 : 0.6 - 0.45 * ((p - 0.4) / 0.6);
    const tone = Math.sin(phase) + bright * Math.sin(2 * phase) + bright * 0.5 * Math.sin(3 * phase) + 0.15 * Math.sin(4 * phase);
    out[i] = tone * Math.min(1, t / 0.04) * Math.min(1, (dur - t) / 0.12);
  }
  return normalize(out, 0.85);
}

// 멜로디 악기 음(도·레·미·솔·라·높은 도). 파일 이름은 `${악기}-${번호}.wav`
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith(".wav")) unlinkSync(outDir + f); // 예전 파일 정리
const files = {
  "drum.wav": drum(),
  "tambourine.wav": tambourine(),
  "maracas.wav": maracas(),
  "bassdrum.wav": bassdrum(),
  "triangle.wav": triangle(),
  "squawk.wav": squawk(),
  "roar.wav": roar(),
  "boing.wav": boing(),
  "quack.wav": quack(),
  "meow.wav": meow(),
  "bgm.wav": bgm(),
};
SCALE.forEach((f, i) => {
  files[`xylophone-${i}.wav`] = xylophone(f);
  files[`horn-${i}.wav`] = horn(f / 2); // 나팔은 한 옥타브 낮게
  files[`bell-${i}.wav`] = bell(f);
});
for (const [name, samples] of Object.entries(files)) {
  writeFileSync(outDir + name, wav(samples));
  console.log("wrote", name);
}
