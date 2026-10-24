// 동물 밴드 그림 생성기. 직접 그린 오리지널 캐릭터 8마리(펭귄 4 + 곰·토끼·오리·고양이)를 SVG로 만든다.
// 실행: npm run art → assets/animals/{art}.svg(깨어 있음), {art}-sleep.svg(졸음), face-{art}.svg(특별 버튼 얼굴)
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const outDir = fileURLToPath(new URL("../assets/animals/", import.meta.url));

const NAVY = "#263347";
const ORANGE = "#ff9f1c";

// 몸통·얼굴·발. flippers: 날개 위치(악기마다 다름)
function body({ flippers = "down", sleep = false }) {
  const eyes = sleep
    ? `<path d="M202 206 Q220 220 238 206" fill="none" stroke="#1d1d1d" stroke-width="7" stroke-linecap="round"/>
       <path d="M274 206 Q292 220 310 206" fill="none" stroke="#1d1d1d" stroke-width="7" stroke-linecap="round"/>`
    : `<ellipse cx="220" cy="204" rx="17" ry="21" fill="#1d1d1d"/><circle cx="226" cy="196" r="6" fill="#fff"/>
       <ellipse cx="292" cy="204" rx="17" ry="21" fill="#1d1d1d"/><circle cx="298" cy="196" r="6" fill="#fff"/>`;
  const wing = (cx, rot) =>
    `<ellipse cx="${cx}" cy="0" rx="30" ry="86" fill="${NAVY}" stroke="#7d8fb3" stroke-width="5" transform="translate(0 0) rotate(${rot} ${cx} 0)"/>`;
  // 날개: down(옆으로 내림), front(앞으로 모음: 드럼·실로폰), up(양쪽 들기: 마라카스), right(오른쪽만 들기: 탬버린)
  const wings = {
    down: `<g transform="translate(0 320)">${wing(128, 18)}${wing(384, -18)}</g>`,
    front: `<g transform="translate(0 330)">${wing(150, -35)}${wing(362, 35)}</g>`,
    up: `<g transform="translate(0 250)">${wing(128, 40)}${wing(384, -40)}</g>`,
    right: `<g transform="translate(0 320)">${wing(128, 18)}</g><g transform="translate(0 250)">${wing(384, -40)}</g>`,
  }[flippers];
  return `
  <ellipse cx="210" cy="476" rx="40" ry="17" fill="${ORANGE}"/>
  <ellipse cx="302" cy="476" rx="40" ry="17" fill="${ORANGE}"/>
  ${wings}
  <ellipse cx="256" cy="300" rx="140" ry="178" fill="${NAVY}" stroke="#7d8fb3" stroke-width="6"/>
  <ellipse cx="256" cy="335" rx="100" ry="135" fill="#f8f9fb"/>
  <ellipse cx="256" cy="212" rx="106" ry="80" fill="#f8f9fb"/>
  ${eyes}
  <ellipse cx="190" cy="242" rx="18" ry="11" fill="#ff8fa3" opacity="0.75"/>
  <ellipse cx="322" cy="242" rx="18" ry="11" fill="#ff8fa3" opacity="0.75"/>
  <path d="M234 232 Q256 220 278 232 Q256 266 234 232 Z" fill="${ORANGE}" stroke="#e07b00" stroke-width="3"/>`;
}

// 소품(머리·목)
const accessories = {
  scarf: `
  <path d="M146 270 Q256 300 366 270 L366 302 Q256 334 146 302 Z" fill="#e63946"/>
  <rect x="300" y="290" width="40" height="88" rx="10" fill="#e63946" transform="rotate(-8 320 290)"/>
  <path d="M160 284 L352 284" stroke="#fff" stroke-width="5" stroke-dasharray="14 12" opacity="0.6"/>`,
  beanie: `
  <path d="M142 168 Q256 44 370 168 Z" fill="#3a86ff"/>
  <rect x="138" y="152" width="236" height="32" rx="14" fill="#1f5fc7"/>
  <circle cx="256" cy="72" r="26" fill="#fff"/>`,
  ribbon: `
  <path d="M300 118 L250 84 L252 150 Z" fill="#ffbe0b" stroke="#e0a100" stroke-width="4" stroke-linejoin="round"/>
  <path d="M300 118 L350 84 L348 150 Z" fill="#ffbe0b" stroke="#e0a100" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="300" cy="118" r="16" fill="#ffd166" stroke="#e0a100" stroke-width="4"/>`,
  headphones: `
  <path d="M146 214 Q146 96 256 96 Q366 96 366 214" fill="none" stroke="#2a9d8f" stroke-width="20" stroke-linecap="round"/>
  <rect x="118" y="186" width="44" height="72" rx="18" fill="#2a9d8f"/>
  <rect x="350" y="186" width="44" height="72" rx="18" fill="#2a9d8f"/>
  <rect x="128" y="200" width="24" height="44" rx="10" fill="#7fd1c7"/>
  <rect x="360" y="200" width="24" height="44" rx="10" fill="#7fd1c7"/>`,
};

// 악기(앞에 드는 것)
const instruments = {
  drum: `
  <rect x="150" y="372" width="212" height="96" rx="14" fill="#e63946"/>
  <ellipse cx="256" cy="372" rx="106" ry="28" fill="#fff4e6" stroke="#c1121f" stroke-width="6"/>
  <path d="M160 392 L200 460 L240 392 L280 460 L320 392 L352 452" fill="none" stroke="#ffd166" stroke-width="8" stroke-linejoin="round"/>
  <line x1="176" y1="300" x2="226" y2="364" stroke="#8d5524" stroke-width="10" stroke-linecap="round"/>
  <line x1="336" y1="300" x2="286" y2="364" stroke="#8d5524" stroke-width="10" stroke-linecap="round"/>
  <circle cx="228" cy="366" r="11" fill="#ffd166"/><circle cx="284" cy="366" r="11" fill="#ffd166"/>`,
  tambourine: `
  <circle cx="410" cy="190" r="64" fill="#fff8e1" stroke="#c9a227" stroke-width="16"/>
  ${[0, 60, 120, 180, 240, 300]
    .map(a => {
      const r = (a * Math.PI) / 180;
      return `<circle cx="${(410 + 64 * Math.cos(r)).toFixed(1)}" cy="${(190 + 64 * Math.sin(r)).toFixed(1)}" r="12" fill="#d9d9d9" stroke="#9e9e9e" stroke-width="3"/>`;
    })
    .join("")}
  <path d="M380 160 Q410 150 440 170" fill="none" stroke="#3a86ff" stroke-width="6" stroke-linecap="round"/>`,
  xylophone: `
  <rect x="138" y="440" width="236" height="16" rx="6" fill="#8d5524"/>
  <rect x="138" y="384" width="236" height="12" rx="6" fill="#8d5524"/>
  ${["#ff595e", "#ff924c", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"]
    .map((c, i) => `<rect x="${148 + i * 38}" y="${370 + i * 4}" width="30" height="${92 - i * 8}" rx="6" fill="${c}"/>`)
    .join("")}
  <line x1="170" y1="300" x2="214" y2="366" stroke="#8d5524" stroke-width="8" stroke-linecap="round"/>
  <line x1="342" y1="300" x2="300" y2="366" stroke="#8d5524" stroke-width="8" stroke-linecap="round"/>
  <circle cx="216" cy="368" r="13" fill="#ff595e"/><circle cx="298" cy="368" r="13" fill="#1982c4"/>`,
  maracas: `
  <line x1="122" y1="236" x2="140" y2="300" stroke="#8d5524" stroke-width="12" stroke-linecap="round"/>
  <line x1="390" y1="236" x2="372" y2="300" stroke="#8d5524" stroke-width="12" stroke-linecap="round"/>
  <ellipse cx="114" cy="200" rx="36" ry="46" fill="#2a9d8f" transform="rotate(-15 114 200)"/>
  <ellipse cx="398" cy="200" rx="36" ry="46" fill="#ff924c" transform="rotate(15 398 200)"/>
  <path d="M86 196 Q114 210 142 190" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
  <path d="M370 190 Q398 210 426 196" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
};

const BAND = [
  { accessory: "scarf", instrument: "drum", flippers: "front" },
  { accessory: "beanie", instrument: "tambourine", flippers: "right" },
  { accessory: "ribbon", instrument: "xylophone", flippers: "front" },
  { accessory: "headphones", instrument: "maracas", flippers: "up" },
];

const OUTLINE = 6;
const eyes = (sleep, lx, rx, y) =>
  sleep
    ? `<path d="M${lx - 18} ${y + 2} Q${lx} ${y + 16} ${lx + 18} ${y + 2}" fill="none" stroke="#1d1d1d" stroke-width="7" stroke-linecap="round"/>
       <path d="M${rx - 18} ${y + 2} Q${rx} ${y + 16} ${rx + 18} ${y + 2}" fill="none" stroke="#1d1d1d" stroke-width="7" stroke-linecap="round"/>`
    : `<ellipse cx="${lx}" cy="${y}" rx="16" ry="20" fill="#1d1d1d"/><circle cx="${lx + 6}" cy="${y - 8}" r="6" fill="#fff"/>
       <ellipse cx="${rx}" cy="${y}" rx="16" ry="20" fill="#1d1d1d"/><circle cx="${rx + 6}" cy="${y - 8}" r="6" fill="#fff"/>`;
const cheeks = (lx, rx, y) =>
  `<ellipse cx="${lx}" cy="${y}" rx="18" ry="11" fill="#ff8fa3" opacity="0.75"/><ellipse cx="${rx}" cy="${y}" rx="18" ry="11" fill="#ff8fa3" opacity="0.75"/>`;

// 곰 · 빨간 멜빵 · 큰북
function bear(sleep, withInstrument = true) {
  const B = "#9c6644";
  const D = "#6f4429";
  const L = "#e6c9a8";
  return `
  <ellipse cx="208" cy="478" rx="44" ry="18" fill="${D}"/><ellipse cx="304" cy="478" rx="44" ry="18" fill="${D}"/>
  <ellipse cx="128" cy="330" rx="34" ry="80" fill="${B}" stroke="${D}" stroke-width="${OUTLINE}" transform="rotate(18 128 330)"/>
  <ellipse cx="384" cy="330" rx="34" ry="80" fill="${B}" stroke="${D}" stroke-width="${OUTLINE}" transform="rotate(-18 384 330)"/>
  <ellipse cx="256" cy="335" rx="132" ry="150" fill="${B}" stroke="${D}" stroke-width="${OUTLINE}"/>
  <ellipse cx="256" cy="365" rx="86" ry="100" fill="${L}"/>
  <rect x="190" y="250" width="22" height="200" rx="8" fill="#e63946"/><rect x="300" y="250" width="22" height="200" rx="8" fill="#e63946"/>
  <circle cx="201" cy="300" r="9" fill="#ffd166"/><circle cx="311" cy="300" r="9" fill="#ffd166"/>
  <circle cx="166" cy="110" r="42" fill="${B}" stroke="${D}" stroke-width="${OUTLINE}"/><circle cx="166" cy="110" r="22" fill="${L}"/>
  <circle cx="346" cy="110" r="42" fill="${B}" stroke="${D}" stroke-width="${OUTLINE}"/><circle cx="346" cy="110" r="22" fill="${L}"/>
  <circle cx="256" cy="192" r="108" fill="${B}" stroke="${D}" stroke-width="${OUTLINE}"/>
  <ellipse cx="256" cy="236" rx="54" ry="40" fill="${L}"/>
  ${eyes(sleep, 214, 298, 182)}
  ${cheeks(186, 326, 238)}
  <ellipse cx="256" cy="218" rx="19" ry="13" fill="#3b2418"/>
  <path d="M256 230 Q256 250 238 252 M256 230 Q256 250 274 252" fill="none" stroke="#3b2418" stroke-width="5" stroke-linecap="round"/>
  ${
    withInstrument
      ? `<circle cx="256" cy="400" r="86" fill="#fff4e6" stroke="#c1121f" stroke-width="16"/>
  <circle cx="256" cy="400" r="58" fill="none" stroke="#ffd166" stroke-width="5" stroke-dasharray="12 10"/>
  <line x1="370" y1="296" x2="318" y2="356" stroke="#8d5524" stroke-width="12" stroke-linecap="round"/>
  <circle cx="314" cy="360" r="18" fill="#fff" stroke="#ccc" stroke-width="4"/>`
      : ""
  }`;
}

// 토끼 · 분홍 리본 · 트라이앵글
function rabbit(sleep, withInstrument = true) {
  const W = "#f4f1f8";
  const O = "#c9bfd6";
  const P = "#ffb3c6";
  return `
  <ellipse cx="204" cy="478" rx="48" ry="18" fill="${W}" stroke="${O}" stroke-width="5"/><ellipse cx="308" cy="478" rx="48" ry="18" fill="${W}" stroke="${O}" stroke-width="5"/>
  <ellipse cx="136" cy="330" rx="30" ry="74" fill="${W}" stroke="${O}" stroke-width="${OUTLINE}" transform="rotate(18 136 330)"/>
  <ellipse cx="380" cy="270" rx="30" ry="74" fill="${W}" stroke="${O}" stroke-width="${OUTLINE}" transform="rotate(-40 380 270)"/>
  <ellipse cx="256" cy="345" rx="116" ry="136" fill="${W}" stroke="${O}" stroke-width="${OUTLINE}"/>
  <ellipse cx="256" cy="372" rx="72" ry="86" fill="#fff"/>
  <ellipse cx="208" cy="92" rx="30" ry="86" fill="${W}" stroke="${O}" stroke-width="${OUTLINE}" transform="rotate(-10 208 92)"/>
  <ellipse cx="208" cy="96" rx="14" ry="62" fill="${P}" transform="rotate(-10 208 96)"/>
  <ellipse cx="304" cy="92" rx="30" ry="86" fill="${W}" stroke="${O}" stroke-width="${OUTLINE}" transform="rotate(10 304 92)"/>
  <ellipse cx="304" cy="96" rx="14" ry="62" fill="${P}" transform="rotate(10 304 96)"/>
  <ellipse cx="256" cy="208" rx="104" ry="92" fill="${W}" stroke="${O}" stroke-width="${OUTLINE}"/>
  <path d="M330 150 L296 122 L300 176 Z" fill="#ff5d8f" stroke="#d63c6e" stroke-width="4" stroke-linejoin="round"/>
  <path d="M330 150 L364 122 L360 176 Z" fill="#ff5d8f" stroke="#d63c6e" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="330" cy="150" r="13" fill="#ff8fab" stroke="#d63c6e" stroke-width="4"/>
  ${eyes(sleep, 216, 296, 200)}
  ${cheeks(186, 326, 238)}
  <path d="M246 226 L266 226 L256 238 Z" fill="#ff5d8f"/>
  <path d="M256 238 Q248 252 236 248 M256 238 Q264 252 276 248" fill="none" stroke="#6b5b7b" stroke-width="5" stroke-linecap="round"/>
  <g stroke="#9a8fae" stroke-width="3" stroke-linecap="round"><line x1="168" y1="226" x2="118" y2="218"/><line x1="168" y1="238" x2="118" y2="244"/><line x1="344" y1="226" x2="394" y2="218"/><line x1="344" y1="238" x2="394" y2="244"/></g>
  ${
    withInstrument
      ? `<line x1="420" y1="120" x2="420" y2="160" stroke="#9a8fae" stroke-width="4"/>
  <path d="M420 160 L470 248 L370 248 Z" fill="none" stroke="#b0b7c3" stroke-width="10" stroke-linejoin="round" stroke-dasharray="190 0 112 20"/>
  <line x1="150" y1="280" x2="214" y2="214" stroke="#8d5524" stroke-width="8" stroke-linecap="round"/>`
      : ""
  }`;
}

// 오리 · 노란 비옷 · 장난감 나팔
function duck(sleep, withInstrument = true) {
  const W = "#fdfdfd";
  const O = "#d6d6d6";
  const Y = "#ffd23f";
  const YD = "#e0b000";
  return `
  <path d="M168 470 L232 470 L210 490 L190 490 Z" fill="#ff9f1c"/><path d="M280 470 L344 470 L322 490 L302 490 Z" fill="#ff9f1c"/>
  <ellipse cx="256" cy="340" rx="124" ry="142" fill="${W}" stroke="${O}" stroke-width="${OUTLINE}"/>
  <path d="M140 300 Q256 250 372 300 L380 440 Q256 488 132 440 Z" fill="${Y}" stroke="${YD}" stroke-width="5"/>
  <line x1="256" y1="276" x2="256" y2="462" stroke="${YD}" stroke-width="5"/>
  <circle cx="240" cy="320" r="8" fill="#fff"/><circle cx="240" cy="370" r="8" fill="#fff"/><circle cx="240" cy="420" r="8" fill="#fff"/>
  <ellipse cx="130" cy="350" rx="32" ry="72" fill="${Y}" stroke="${YD}" stroke-width="5" transform="rotate(16 130 350)"/>
  <ellipse cx="380" cy="300" rx="32" ry="72" fill="${Y}" stroke="${YD}" stroke-width="5" transform="rotate(-50 380 300)"/>
  <circle cx="256" cy="196" r="100" fill="${W}" stroke="${O}" stroke-width="${OUTLINE}"/>
  <path d="M164 118 Q256 0 348 118 Z" fill="${Y}" stroke="${YD}" stroke-width="5"/>
  <ellipse cx="256" cy="118" rx="138" ry="24" fill="${Y}" stroke="${YD}" stroke-width="5"/>
  ${eyes(sleep, 218, 294, 182)}
  ${cheeks(184, 328, 226)}
  <ellipse cx="256" cy="232" rx="56" ry="22" fill="#ff9f1c" stroke="#e07b00" stroke-width="4"/>
  <path d="M206 234 Q256 246 306 234" fill="none" stroke="#e07b00" stroke-width="4"/>
  ${
    withInstrument
      ? `<line x1="300" y1="250" x2="410" y2="226" stroke="#f4c430" stroke-width="16" stroke-linecap="round"/>
  <path d="M404 222 L474 186 L474 286 L404 250 Z" fill="#f4c430" stroke="#c9a227" stroke-width="5" stroke-linejoin="round"/>
  <rect x="340" y="214" width="12" height="22" rx="3" fill="#c9a227"/><rect x="362" y="210" width="12" height="22" rx="3" fill="#c9a227"/>`
      : ""
  }`;
}

// 고양이 · 방울 목걸이 · 핸드벨
function cat(sleep, withInstrument = true) {
  const C = "#f6a03c";
  const D = "#d9741a";
  const L = "#ffe2b8";
  const bell = (x, y, tilt) =>
    `<g transform="rotate(${tilt} ${x} ${y})"><rect x="${x - 6}" y="${y - 62}" width="12" height="34" rx="5" fill="#8d5524"/>
     <path d="M${x - 44} ${y + 30} Q${x - 38} ${y - 40} ${x} ${y - 38} Q${x + 38} ${y - 40} ${x + 44} ${y + 30} Z" fill="#ffd166" stroke="#c9a227" stroke-width="5"/>
     <circle cx="${x}" cy="${y + 34}" r="11" fill="#c9a227"/></g>`;
  return `
  <path d="M370 380 C450 360 470 280 430 240" fill="none" stroke="${D}" stroke-width="26" stroke-linecap="round"/>
  <ellipse cx="208" cy="476" rx="42" ry="17" fill="${C}"/><ellipse cx="304" cy="476" rx="42" ry="17" fill="${C}"/>
  <ellipse cx="256" cy="350" rx="122" ry="132" fill="${C}" stroke="${D}" stroke-width="${OUTLINE}"/>
  <ellipse cx="256" cy="372" rx="72" ry="86" fill="${L}"/>
  <path d="M148 150 L166 40 L238 110 Z" fill="${C}" stroke="${D}" stroke-width="${OUTLINE}" stroke-linejoin="round"/>
  <path d="M364 150 L346 40 L274 110 Z" fill="${C}" stroke="${D}" stroke-width="${OUTLINE}" stroke-linejoin="round"/>
  <path d="M166 130 L176 72 L220 112 Z" fill="#ffb3c1"/><path d="M346 130 L336 72 L292 112 Z" fill="#ffb3c1"/>
  <ellipse cx="256" cy="186" rx="128" ry="104" fill="${C}" stroke="${D}" stroke-width="${OUTLINE}"/>
  <path d="M236 92 Q256 116 276 92 M226 112 Q256 140 286 112" fill="none" stroke="${D}" stroke-width="10" stroke-linecap="round"/>
  ${eyes(sleep, 210, 302, 182)}
  ${cheeks(176, 336, 224)}
  <path d="M244 206 L268 206 L256 220 Z" fill="#e8577a"/>
  <path d="M256 220 Q244 240 228 232 M256 220 Q268 240 284 232" fill="none" stroke="#2b2b2b" stroke-width="5" stroke-linecap="round"/>
  <g stroke="#2b2b2b" stroke-width="4" stroke-linecap="round"><line x1="150" y1="200" x2="92" y2="190"/><line x1="150" y1="214" x2="90" y2="220"/><line x1="362" y1="200" x2="420" y2="190"/><line x1="362" y1="214" x2="422" y2="220"/></g>
  <path d="M170 272 Q256 300 342 272 L342 294 Q256 322 170 294 Z" fill="#e63946"/>
  <circle cx="256" cy="312" r="16" fill="#ffd166" stroke="#c9a227" stroke-width="4"/><line x1="248" y1="316" x2="264" y2="316" stroke="#c9a227" stroke-width="3"/>
  ${withInstrument ? bell(118, 300, -28) + bell(394, 300, 28) : ""}`;
}

const svg = (inner, label, viewBox = "0 0 512 512") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="512" height="512">
  <!-- 흔들흔들 동물 밴드: 직접 그린 오리지널 캐릭터 (${label}) -->
${inner}
</svg>
`;

// 펭귄: 탬버린·마라카스는 날개 위에 그려야 손에 든 것처럼 보이므로 악기를 마지막에 그린다
function penguin({ accessory, instrument, flippers }, sleep, withInstrument = true) {
  return `${body({ flippers: withInstrument ? flippers : "down", sleep })}
  ${accessories[accessory]}
  ${withInstrument ? instruments[instrument] : ""}`;
}

// art 이름 → (졸음, 악기 포함) → 그림, 얼굴 버튼용으로 자를 영역
const CHARACTERS = [
  ...BAND.map((p, i) => ({ art: `penguin-${i + 1}`, draw: (s, w) => penguin(p, s, w), face: "128 40 256 256" })),
  { art: "bear", draw: bear, face: "120 50 272 272" },
  { art: "rabbit", draw: rabbit, face: "110 10 292 292" },
  { art: "duck", draw: duck, face: "110 10 292 292" },
  { art: "cat", draw: cat, face: "110 30 292 292" },
];

mkdirSync(outDir, { recursive: true });
for (const c of CHARACTERS) {
  writeFileSync(`${outDir}${c.art}.svg`, svg(c.draw(false, true), c.art));
  writeFileSync(`${outDir}${c.art}-sleep.svg`, svg(c.draw(true, true), c.art + " · 졸음"));
  writeFileSync(`${outDir}face-${c.art}.svg`, svg(c.draw(false, false), c.art + " · 얼굴", c.face));
  console.log("wrote", c.art);
}
