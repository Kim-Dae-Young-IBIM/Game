// 펭귄 밴드 그림 생성기. 직접 그린 오리지널 펭귄 4마리(깨어 있음/졸음)를 SVG로 만든다.
// 실행: npm run art → assets/animals/penguin-{1..4}.svg, penguin-{1..4}-sleep.svg
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

function penguin({ accessory, instrument, flippers }, sleep) {
  // 탬버린·마라카스는 날개 위에 그려야 손에 든 것처럼 보이므로 악기를 마지막에 그린다
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- 흔들흔들 펭귄 밴드: 직접 그린 오리지널 캐릭터 (${accessory} · ${instrument}${sleep ? " · 졸음" : ""}) -->
  ${body({ flippers, sleep })}
  ${accessories[accessory]}
  ${instruments[instrument]}
</svg>
`;
}

mkdirSync(outDir, { recursive: true });
BAND.forEach((p, i) => {
  writeFileSync(`${outDir}penguin-${i + 1}.svg`, penguin(p, false));
  writeFileSync(`${outDir}penguin-${i + 1}-sleep.svg`, penguin(p, true));
  console.log("wrote penguin", i + 1);
});
