// TV 무대: 방 코드·QR 표시, 시작 버튼으로 소리 잠금 해제, 흔들림이 오면 박자에 맞춰 동물 연주.
// 대상 브라우저: LG webOS 6.5(Chromium 79). 문법은 vite가 낮추지만 Web API는 79에 있는 것만 쓴다.
import * as Phaser from "phaser";
import { Howl, Howler } from "howler";
import { io } from "socket.io-client";
import QRCode from "qrcode";
import { EVENTS } from "../shared/protocol.js";
import { DEFAULT_BPM, nearestBeatDelay, beatIndex } from "../shared/beat.js";

const BPM = DEFAULT_BPM;
const STRONG_SHAKE = 0.7; // 이 세기 이상이면 드럼과 함께 야옹
const CODE_KEY = "band.roomCode";

// 테스트·디버그용 상태(Playwright가 읽는다)
const state = (window.__band = { code: null, started: false, plays: 0, lastIntensity: 0, players: 0 });

// ---------- 소리 ----------
const sounds = {
  drum: new Howl({ src: ["/sounds/drum.wav"], preload: true }),
  meows: [1, 2, 3].map(n => new Howl({ src: ["/sounds/meow-" + n + ".wav"], preload: true })),
};
let meowTurn = 0;

function playSound(intensity) {
  const id = sounds.drum.play();
  sounds.drum.volume(intensity, id);
  if (intensity >= STRONG_SHAKE) {
    const meow = sounds.meows[meowTurn++ % sounds.meows.length];
    const mid = meow.play();
    meow.volume(intensity * 0.8, mid);
  }
}

// ---------- 무대 (Phaser) ----------
let stage = null; // create()에서 채워진다
let beatOrigin = performance.now();

class StageScene extends Phaser.Scene {
  constructor() {
    super("stage");
  }

  preload() {
    this.load.svg("cat", "/animals/cat.svg", { width: 512, height: 512 });
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
    this.spot = this.add.ellipse(W / 2 + 200, H - 200, 760, 180, 0xfff3b0, 0.25);

    // 박자 표시 불빛 4개(글자 없이 박자를 보여 준다)
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      this.lights.push(this.add.circle(W / 2 + 200 - 150 + i * 100, H - 60, 26, 0xffd166, 0.25));
    }
    this.lastBeat = -1;

    // 음표 텍스처(흔들 때 날아오르는 그림)
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(18, 52, 34, 26);
    g.fillRect(30, 6, 7, 48);
    g.fillTriangle(37, 6, 37, 26, 58, 22);
    g.generateTexture("note", 60, 66);
    g.destroy();

    this.cat = this.add.image(W / 2 + 200, H - 330, "cat").setScale(1.2);
    this.catBaseY = this.cat.y;
    // 가만히 있을 때도 살짝 숨쉬기
    this.tweens.add({ targets: this.cat, scaleX: 1.22, scaleY: 1.18, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    stage = this;
  }

  update() {
    if (!state.started) return;
    const b = beatIndex(performance.now(), beatOrigin, BPM);
    if (b === this.lastBeat) return;
    this.lastBeat = b;
    this.lights.forEach((l, i) => l.setFillStyle(0xffd166, i === b % 4 ? 1 : 0.25));
  }

  // 연주 동작: 찌그러졌다 튀어 오르기 + 음표
  perform(intensity) {
    const cat = this.cat;
    this.tweens.killTweensOf(cat);
    cat.setScale(1.2).setY(this.catBaseY);
    const jump = 40 + 100 * intensity;
    this.tweens.chain({
      targets: cat,
      tweens: [
        { scaleX: 1.34, scaleY: 1.02, duration: 70, ease: "Quad.easeOut" },
        { y: this.catBaseY - jump, scaleX: 1.14, scaleY: 1.3, duration: 160, ease: "Quad.easeOut" },
        { y: this.catBaseY, scaleX: 1.2, scaleY: 1.2, duration: 220, ease: "Bounce.easeOut" },
      ],
    });
    this.tweens.add({ targets: this.spot, alpha: { from: 0.6, to: 0.25 }, duration: 400 });

    const colors = [0xff5d73, 0xffd166, 0x06d6a0, 0x4cc9f0];
    const count = 1 + Math.round(intensity * 3);
    for (let i = 0; i < count; i++) {
      const note = this.add
        .image(cat.x + Phaser.Math.Between(-180, 180), cat.y - 200, "note")
        .setTint(colors[Phaser.Math.Between(0, colors.length - 1)])
        .setScale(0.8 + intensity * 0.6);
      this.tweens.add({
        targets: note,
        y: note.y - Phaser.Math.Between(200, 380),
        x: note.x + Phaser.Math.Between(-80, 80),
        angle: Phaser.Math.Between(-30, 30),
        alpha: 0,
        duration: 1100,
        ease: "Sine.easeOut",
        onComplete: () => note.destroy(),
      });
    }
  }
}

new Phaser.Game({
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
function onPlay(msg) {
  const intensity = msg && typeof msg.intensity === "number" ? msg.intensity : 0.5;
  const delay = state.started ? nearestBeatDelay(performance.now(), beatOrigin, BPM) : 0;
  setTimeout(() => {
    state.plays++;
    state.lastIntensity = intensity;
    if (state.started) playSound(intensity);
    if (stage) stage.perform(intensity);
  }, delay);
}

// ---------- 방 코드·QR ----------
const codeEl = document.getElementById("code");
const qrEl = document.getElementById("qr");
const playersEl = document.getElementById("players");
const card = document.getElementById("join-card");

function showRoom(code) {
  state.code = code;
  try {
    sessionStorage.setItem(CODE_KEY, code);
  } catch (e) {
    // 저장소를 못 써도 동작에는 지장 없음
  }
  codeEl.textContent = code;
  const url = location.origin + "/phone/?room=" + code;
  QRCode.toDataURL(url, { width: 360, margin: 1, errorCorrectionLevel: "M" })
    .then(src => {
      qrEl.src = src;
    })
    .catch(() => {});
}

function showPlayers(count) {
  state.players = count;
  playersEl.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const d = document.createElement("div");
    d.className = "phone";
    playersEl.appendChild(d);
  }
}

const socket = io();
socket.on("connect", () => {
  let saved;
  try {
    saved = sessionStorage.getItem(CODE_KEY) || undefined;
  } catch (e) {
    saved = undefined;
  }
  // 재접속 시 같은 코드를 요청 → 폰이 다시 입력하지 않아도 이어진다
  socket.emit(EVENTS.TV_CREATE, { code: state.code || saved }, res => showRoom(res.code));
});
socket.on(EVENTS.PLAYERS, msg => showPlayers(msg.count));
socket.on(EVENTS.PLAY, onPlay);

// ---------- 시작 (소리 잠금 해제) ----------
const overlay = document.getElementById("start-overlay");
const startBtn = document.getElementById("start");

function start() {
  if (state.started) return;
  if (Howler.ctx && Howler.ctx.state !== "running") Howler.ctx.resume();
  state.started = true;
  beatOrigin = performance.now();
  overlay.classList.add("hidden");
  card.classList.remove("big");
  card.classList.add("small");
  playSound(0.6); // 시작 신호
}

startBtn.addEventListener("click", start);
// webOS 리모컨: OK(Enter) 키. 포커스가 다른 곳에 있어도 시작되게 한다.
document.addEventListener("keydown", e => {
  if (!state.started && (e.key === "Enter" || e.keyCode === 13)) start();
});
startBtn.focus();
