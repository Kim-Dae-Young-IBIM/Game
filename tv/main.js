// TV 무대: 방 코드·QR 표시, 시작 버튼으로 소리 잠금 해제, 동물 밴드가 폰 흔들기에 맞춰 연주.
// 무대 자리(slot) 4곳에 폰이 고른 캐릭터(펭귄·곰·토끼·오리·고양이)가 선다. 폰 없는 자리는 기본 펭귄이 존다.
// 특별 버튼 → 캐릭터 소리(꽥·어흥·뿅·야옹), 누르고 말하기 → 캐릭터 목소리 높이로 재생.
// 대상 브라우저: LG webOS 6.5(Chromium 79). 문법은 vite가 낮추지만 Web API는 79에 있는 것만 쓴다.
import * as Phaser from "phaser";
import { Howl, Howler } from "howler";
import { io } from "socket.io-client";
import QRCode from "qrcode";
import { EVENTS } from "../shared/protocol.js";
import { DEFAULT_BPM, beatIndex, createBeatQueue, nearestBeat } from "../shared/beat.js";
import { CHARACTERS, SLOT_COUNT, MELODIC, NOTE_COUNT, isValidSlot, isValidCharacter, createMelody } from "../shared/band.js";
import { toInt16, int16ToFloat, resampleLinear } from "../shared/pcm.js";
import { installErrorReporter } from "../shared/error-report.js";
import { createTvDebug, isDebug } from "./debug.js";

const BPM = DEFAULT_BPM;
const BGM_VOLUME = 0.35; // 배경 반주는 악기보다 작게
const BGM_DUCK = 0.08; // 목소리가 나올 때 반주를 줄인다
const CODE_KEY = "band.roomCode";
const TOKEN_KEY = "band.tvToken"; // 재접속 시 같은 방을 넘겨받기 위한 비밀값

// 테스트·디버그용 상태(Playwright가 읽는다)
const state = (window.__band = {
  code: null,
  started: false,
  plays: 0,
  lastIntensity: 0,
  lastSlot: null,
  lastCharacter: null,
  players: 0,
  slots: [],
  stage: [0, 1, 2, 3], // 자리별로 서 있는 캐릭터
  effects: 0,
  voices: 0,
});
const DEBUG = isDebug(); // ?debug → 진단 화면

// 소켓을 먼저 열어 두고 오류 보고기를 단다(무대 초기화 중 오류도 서버 기록에서 보이게)
const socket = io();
let debug = { received() {}, error() {} };
installErrorReporter(socket, "tv", message => debug.error(message));

// ---------- 소리 ----------
const howl = (name, extra) => new Howl(Object.assign({ src: ["/sounds/" + name + ".wav"], preload: true }, extra));
const sounds = { bgm: howl("bgm", { loop: true, volume: BGM_VOLUME }) };
// 캐릭터마다 악기·특별 소리. 멜로디 악기(실로폰·나팔·핸드벨)는 음 6개
CHARACTERS.forEach(c => {
  if (!sounds[c.instrument]) {
    sounds[c.instrument] =
      MELODIC.indexOf(c.instrument) !== -1
        ? Array.from({ length: NOTE_COUNT }, (_, i) => howl(c.instrument + "-" + i))
        : howl(c.instrument);
  }
  if (!sounds[c.effect]) sounds[c.effect] = howl(c.effect);
});
const melodies = CHARACTERS.map(() => createMelody()); // 멜로디 악기는 흔들 때마다 다음 음

function playOnce(sound, volume) {
  const id = sound.play();
  sound.volume(volume, id);
}

function playInstrument(character, intensity) {
  const sound = sounds[CHARACTERS[character].instrument];
  playOnce(Array.isArray(sound) ? sound[melodies[character].next()] : sound, intensity);
}

// ---------- 무대 (Phaser) ----------
let stage = null; // create()에서 채워진다
let beatOrigin = performance.now();
const NOTE_COLORS = [0xff5d73, 0xffd166, 0x06d6a0, 0x4cc9f0];

class StageScene extends Phaser.Scene {
  constructor() {
    super("stage");
  }

  preload() {
    // 캐릭터 c → 텍스처 "c{id}"(깨어 있음), "c{id}s"(졸음)
    CHARACTERS.forEach(c => {
      this.load.svg("c" + c.id, "/animals/" + c.art + ".svg", { width: 512, height: 512 });
      this.load.svg("c" + c.id + "s", "/animals/" + c.art + "-sleep.svg", { width: 512, height: 512 });
    });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // 배경: 커튼 + 바닥 + 조명
    this.add.rectangle(W / 2, H / 2, W, H, 0x2a1a5e);
    this.add.rectangle(W / 2, H - 140, W, 280, 0x7a4a2a);
    this.add.rectangle(W / 2, H - 280, W, 12, 0x5c3820);
    this.add.rectangle(110, H / 2, 220, H, 0xb3122e);
    this.add.rectangle(W - 110, H / 2, 220, H, 0xb3122e);
    this.add.rectangle(W / 2, 50, W, 100, 0x8f0e25);

    // 박자 표시 불빛 4개(글자 없이 박자를 보여 준다)
    this.lights = [];
    for (let i = 0; i < 4; i++) this.lights.push(this.add.circle(W / 2 - 150 + i * 100, H - 50, 22, 0xffd166, 0.25));
    this.lastBeat = -1;

    this.makeTextures();

    // 무대 자리 4곳: 폰이 있는 자리만 깨어 있고, 폰이 고른 캐릭터가 선다
    const xs = [470, 810, 1150, 1490];
    this.penguins = xs.map((x, slot) => {
      const spot = this.add.ellipse(x, H - 170, 340, 90, 0xfff3b0, 0.12);
      const img = this.add.image(x, H - 360, "c" + slot + "s").setScale(0.72);
      const p = { slot, character: slot, img, spot, baseY: img.y, baseScale: 0.72, awake: false, breathe: null, hopTween: null };
      this.breathe(p);
      return p;
    });
    stage = this;
    this.setPlayers(state.slots, state.stage);
  }

  // 흔들 때 날아오르는 음표, 꽥 할 때 터지는 별, 말할 때 나오는 소리 물결
  makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(18, 52, 34, 26);
    g.fillRect(30, 6, 7, 48);
    g.fillTriangle(37, 6, 37, 26, 58, 22);
    g.generateTexture("note", 60, 66);
    g.clear();
    g.fillStyle(0xffffff, 1);
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? 22 : 60;
      const a = (Math.PI * 2 * i) / 16 - Math.PI / 2;
      pts.push(new Phaser.Geom.Point(64 + r * Math.cos(a), 64 + r * Math.sin(a)));
    }
    g.fillPoints(pts, true);
    g.generateTexture("burst", 128, 128);
    g.clear();
    g.lineStyle(10, 0xffffff, 1);
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(20, 60, 22 + i * 22, -0.7, 0.7);
      g.strokePath();
    }
    g.generateTexture("wave", 100, 120);
    g.destroy();
  }

  breathe(p) {
    if (p.breathe) p.breathe.stop();
    p.img.setScale(p.baseScale);
    p.breathe = this.tweens.add({
      targets: p.img,
      scaleX: p.baseScale * 1.02,
      scaleY: p.baseScale * 0.97,
      duration: p.awake ? 900 : 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  // slots: 폰이 있는 자리, characters: 자리별 캐릭터. 바뀐 자리만 깨우거나 "펑" 하고 바꾼다.
  // 돌려주는 값: 캐릭터가 바뀐 자리들(특별 소리를 내기 위해)
  setPlayers(slots, characters) {
    if (!this.penguins) return [];
    const swapped = [];
    this.penguins.forEach(p => {
      const awake = slots.indexOf(p.slot) !== -1;
      const character = characters[p.slot];
      if (awake === p.awake && character === p.character) return;
      const changed = awake && p.awake && character !== p.character;
      p.awake = awake;
      p.character = character;
      p.img.setTexture("c" + character + (awake ? "" : "s"));
      p.img.setAlpha(awake ? 1 : 0.7);
      p.spot.setAlpha(awake ? 0.3 : 0.12);
      this.breathe(p);
      if (changed) {
        this.poof(p);
        swapped.push(p.slot);
      }
      if (awake) this.hop(p, 60); // 깨어나거나 바뀌며 깡충
    });
    return swapped;
  }

  // 캐릭터가 바뀔 때 "펑": 흰 별이 크게 터진다
  poof(p) {
    const b = this.add.image(p.img.x, p.baseY, "burst").setScale(0.5).setAlpha(0.95);
    this.tweens.add({ targets: b, scale: 3, alpha: 0, angle: 30, duration: 450, ease: "Quad.easeOut", onComplete: () => b.destroy() });
  }

  // 깡충: 크기·높이 트윈만 멈추고 다시 시작한다(말하기·꽥의 고개 흔들기 트윈은 그대로 둔다)
  hop(p, height) {
    if (p.breathe) p.breathe.stop();
    if (p.hopTween) p.hopTween.stop();
    p.img.setScale(p.baseScale).setY(p.baseY);
    const s = p.baseScale;
    p.hopTween = this.tweens.chain({
      targets: p.img,
      tweens: [
        { scaleX: s * 1.12, scaleY: s * 0.86, duration: 70, ease: "Quad.easeOut" },
        { y: p.baseY - height, scaleX: s * 0.95, scaleY: s * 1.08, duration: 160, ease: "Quad.easeOut" },
        { y: p.baseY, scaleX: s, scaleY: s, duration: 220, ease: "Bounce.easeOut" },
      ],
      onComplete: () => this.breathe(p),
    });
  }

  update() {
    if (!state.started) return;
    const b = beatIndex(performance.now(), beatOrigin, BPM);
    if (b === this.lastBeat) return;
    this.lastBeat = b;
    this.lights.forEach((l, i) => l.setFillStyle(0xffd166, i === b % 4 ? 1 : 0.25));
  }

  // 연주: 그 펭귄이 깡충 + 음표
  perform(slot, intensity) {
    const p = this.penguins[slot];
    this.hop(p, 30 + 80 * intensity);
    this.tweens.add({ targets: p.spot, alpha: { from: 0.6, to: p.awake ? 0.3 : 0.12 }, duration: 400 });
    const count = 1 + Math.round(intensity * 2);
    for (let i = 0; i < count; i++) {
      const note = this.add
        .image(p.img.x + Phaser.Math.Between(-120, 120), p.baseY - 150, "note")
        .setTint(NOTE_COLORS[Phaser.Math.Between(0, NOTE_COLORS.length - 1)])
        .setScale(0.6 + intensity * 0.5);
      this.tweens.add({
        targets: note,
        y: note.y - Phaser.Math.Between(180, 320),
        x: note.x + Phaser.Math.Between(-60, 60),
        angle: Phaser.Math.Between(-30, 30),
        alpha: 0,
        duration: 1100,
        ease: "Sine.easeOut",
        onComplete: () => note.destroy(),
      });
    }
  }

  // 특별 버튼: 좌우로 흔들며 뛰고, 얼굴 앞에서 별이 터진다
  squawk(slot) {
    const p = this.penguins[slot];
    this.hop(p, 50);
    this.tweens.add({ targets: p.img, angle: { from: -12, to: 12 }, duration: 80, yoyo: true, repeat: 3, onComplete: () => p.img.setAngle(0) });
    const burst = this.add.image(p.img.x, p.baseY - 40, "burst").setTint(CHARACTERS[p.character].color).setScale(0.3);
    this.tweens.add({ targets: burst, scale: 1.6, alpha: 0, angle: 45, duration: 500, ease: "Quad.easeOut", onComplete: () => burst.destroy() });
  }

  // 말하기: 말하는 동안 고개를 까딱이고 소리 물결이 나온다
  talk(slot, seconds) {
    const p = this.penguins[slot];
    const repeats = Math.max(1, Math.round((seconds * 1000) / 260));
    this.tweens.add({ targets: p.img, angle: { from: -5, to: 5 }, duration: 130, yoyo: true, repeat: repeats, onComplete: () => p.img.setAngle(0) });
    for (let i = 0; i < Math.min(8, repeats); i++) {
      this.time.delayedCall(i * 300, () => {
        const w = this.add.image(p.img.x + 60, p.baseY - 60, "wave").setTint(CHARACTERS[p.character].color).setScale(0.5);
        this.tweens.add({ targets: w, x: w.x + 120, y: w.y - 80, scale: 1.1, alpha: 0, duration: 700, onComplete: () => w.destroy() });
      });
    }
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "stage",
  width: 1920,
  height: 1080,
  backgroundColor: "#1b1035",
  audio: { noAudio: true }, // 소리는 Howler가 맡는다
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [StageScene],
});

// ---------- 흔들림 수신 → 박자 보정 후 연주 ----------
function perform(slot, character, intensity) {
  state.plays++;
  state.lastIntensity = intensity;
  state.lastSlot = slot;
  state.lastCharacter = character;
  if (state.started) playInstrument(character, intensity);
  if (stage) stage.perform(slot, intensity);
}

// 자리(폰)마다 따로 박자 보정: 같은 박자에 온 흔들림은 자리별로 가장 센 것 하나 → 여러 악기가 겹쳐 합주가 된다
// 소리는 그 자리에 "서 있는" 캐릭터로 낸다: 5번째 폰부터 자리를 같이 쓸 때도 화면과 소리가 어긋나지 않게
const beatQueues = Array.from({ length: SLOT_COUNT }, (_, slot) =>
  createBeatQueue({ onBeat: v => perform(slot, state.stage[slot], v), schedule: (fn, ms) => setTimeout(fn, ms), bpm: BPM })
);

const slotOf = msg => (msg && isValidSlot(msg.slot) ? msg.slot : 0);
const characterOf = slot => state.stage[slot];

function onPlay(msg) {
  const intensity = msg && typeof msg.intensity === "number" ? msg.intensity : 0.5;
  const slot = slotOf(msg);
  if (!state.started) {
    debug.received(intensity, 0);
    return perform(slot, characterOf(slot), intensity); // 시작 전: 움직임만(소리 잠금 상태)
  }
  const now = performance.now();
  debug.received(intensity, Math.round(nearestBeat(now, beatOrigin, BPM).delay));
  beatQueues[slot](intensity, now, beatOrigin);
}

// ---------- 특별 버튼: 캐릭터 소리(꽥·어흥·뿅·야옹) ----------
function playEffect(character) {
  if (state.started) playOnce(sounds[CHARACTERS[character].effect], 1);
}

function onEffect(msg) {
  const slot = slotOf(msg);
  state.effects++;
  playEffect(characterOf(slot));
  if (stage) stage.squawk(slot);
}

// ---------- 누르고 말하기: 16bit PCM → 캐릭터 목소리 높이로 재생 ----------
function makeBuffer(ctx, samples, rate) {
  try {
    const buf = ctx.createBuffer(1, samples.length, rate);
    buf.getChannelData(0).set(samples);
    return buf;
  } catch (e) {
    // 낮은 샘플링 주파수를 못 만드는 브라우저면 출력 주파수로 바꿔서 만든다
    const up = resampleLinear(samples, rate, ctx.sampleRate);
    const buf = ctx.createBuffer(1, up.length, ctx.sampleRate);
    buf.getChannelData(0).set(up);
    return buf;
  }
}

// 목소리가 겹쳐도 반주는 처음 시작할 때 한 번 줄이고, 마지막 목소리가 끝날 때 한 번 되돌린다
let voicesPlaying = 0;

function onVoice(msg) {
  if (!msg || !state.started || !Howler.ctx) return; // 소리 잠금 전에는 재생할 수 없다
  const samples = int16ToFloat(toInt16(msg.pcm));
  if (!samples.length || !(msg.rate > 0)) return;
  const slot = slotOf(msg);
  const pitch = CHARACTERS[characterOf(slot)].voicePitch; // 곰은 낮게, 토끼는 높게
  const ctx = Howler.ctx;
  const source = ctx.createBufferSource();
  source.buffer = makeBuffer(ctx, samples, msg.rate);
  source.playbackRate.value = pitch;
  source.connect(Howler.masterGain || ctx.destination);
  const seconds = samples.length / msg.rate / pitch;
  state.voices++;
  if (voicesPlaying++ === 0) sounds.bgm.fade(sounds.bgm.volume(), BGM_DUCK, 150);
  source.onended = () => {
    if (--voicesPlaying === 0) sounds.bgm.fade(sounds.bgm.volume(), BGM_VOLUME, 400);
  };
  source.start();
  if (stage) stage.talk(slot, seconds);
}

// ---------- 방 코드·QR ----------
const codeEl = document.getElementById("code");
const qrEl = document.getElementById("qr");
const playersEl = document.getElementById("players");
const card = document.getElementById("join-card");

function showRoom(code, token) {
  state.code = code;
  try {
    sessionStorage.setItem(CODE_KEY, code);
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    // 저장소를 못 써도 동작에는 지장 없음
  }
  codeEl.textContent = code;
  // 진단 모드면 폰도 진단 모드로 열리게 한다
  const url = location.origin + "/phone/?room=" + code + (DEBUG ? "&debug=1" : "");
  QRCode.toDataURL(url, { width: 360, margin: 1, errorCorrectionLevel: "M" })
    .then(src => {
      qrEl.src = src;
    })
    .catch(() => {});
}

const hex = c => "#" + ("000000" + c.toString(16)).slice(-6);

const SWAP_SOUND_MIN_MS = 800;
const lastSwapSoundAt = [-Infinity, -Infinity, -Infinity, -Infinity];

function showPlayers(msg) {
  state.players = (msg && msg.count) || 0;
  state.slots = msg && Array.isArray(msg.slots) ? msg.slots.filter(isValidSlot) : [];
  // 자리별 캐릭터: 폰이 없으면 기본 펭귄, 같은 자리를 여럿이 쓰면 먼저 들어온 폰의 캐릭터
  const characters = [0, 1, 2, 3];
  const filled = {};
  const players = msg && Array.isArray(msg.players) ? msg.players : [];
  players.forEach(p => {
    if (p && isValidSlot(p.slot) && isValidCharacter(p.character) && !filled[p.slot]) {
      filled[p.slot] = true;
      characters[p.slot] = p.character;
    }
  });
  state.stage = characters;
  // 연결된 캐릭터 색깔 점(QR 아래)
  playersEl.innerHTML = "";
  state.slots.forEach(slot => {
    const d = document.createElement("div");
    d.className = "phone";
    d.style.background = hex(CHARACTERS[characters[slot]].color);
    playersEl.appendChild(d);
  });
  // 캐릭터가 바뀐 자리는 "펑" 하고 바뀌며 자기 소리를 한 번 낸다(◀ ▶ 연타해도 자리마다 0.8초에 1번)
  if (stage) {
    const now = performance.now();
    stage.setPlayers(state.slots, characters).forEach(slot => {
      if (now - lastSwapSoundAt[slot] < SWAP_SOUND_MIN_MS) return;
      lastSwapSoundAt[slot] = now;
      playEffect(characters[slot]);
    });
  }
}

let tvToken = null;
socket.on("connect", () => {
  let savedCode, savedToken;
  try {
    savedCode = sessionStorage.getItem(CODE_KEY) || undefined;
    savedToken = sessionStorage.getItem(TOKEN_KEY) || undefined;
  } catch (e) {
    savedCode = savedToken = undefined;
  }
  // 재접속·새로고침 시 같은 코드+토큰을 보내 방을 넘겨받는다 → 폰은 다시 입력하지 않아도 이어진다
  socket.emit(EVENTS.TV_CREATE, { code: state.code || savedCode, token: tvToken || savedToken }, res => {
    if (!res || !res.code) return;
    tvToken = res.token;
    showRoom(res.code, res.token);
  });
});
socket.on(EVENTS.PLAYERS, showPlayers);
socket.on(EVENTS.PLAY, onPlay);
socket.on(EVENTS.EFFECT, onEffect);
socket.on(EVENTS.VOICE, onVoice);

// ---------- 시작 (소리 잠금 해제) ----------
const overlay = document.getElementById("start-overlay");
const startBtn = document.getElementById("start");

function start() {
  if (state.started) return;
  if (Howler.ctx && Howler.ctx.state !== "running") Howler.ctx.resume();
  state.started = true;
  beatOrigin = performance.now();
  // 반주가 실제로 시작된 순간(로딩·오디오 깨우기 지연 뒤)을 0박으로 다시 맞춘다
  sounds.bgm.once("play", () => {
    beatOrigin = performance.now();
  });
  sounds.bgm.play();
  overlay.classList.add("hidden");
  card.classList.remove("big");
  card.classList.add("small");
  playOnce(sounds.drum, 0.6); // 시작 신호
}

startBtn.addEventListener("click", start);
// webOS 리모컨: OK(Enter) 키. 포커스가 다른 곳에 있어도 시작되게 한다.
document.addEventListener("keydown", e => {
  if (!state.started && (e.key === "Enter" || e.keyCode === 13)) start();
});
startBtn.focus();

debug = createTvDebug({
  enabled: DEBUG,
  socket,
  getInfo: () => ({
    renderer: game.renderer ? (game.renderer.type === Phaser.WEBGL ? "WebGL" : "Canvas") : "-",
    fps: game.loop ? Math.round(game.loop.actualFps) : 0,
    audio:
      Howler.usingWebAudio && Howler.ctx
        ? "WebAudio " + Howler.ctx.state + " " + Howler.ctx.sampleRate + "Hz"
        : "HTML5 Audio(WebAudio 없음)",
    started: state.started,
    code: state.code,
    players: state.players,
    slots: state.slots,
    characters: state.stage,
    plays: state.plays,
    effects: state.effects,
    voices: state.voices,
  }),
});
