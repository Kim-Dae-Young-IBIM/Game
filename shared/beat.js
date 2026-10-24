// 박자 보정. 흔들림 소리를 가장 가까운 박자에 맞춰 재생하기 위한 계산.
// 가장 가까운 박자가 이미 지났으면(반 박자 이내) 바로 재생, 앞에 있으면 그때까지 기다린다.

export const DEFAULT_BPM = 100;

export function beatInterval(bpm = DEFAULT_BPM) {
  return 60000 / bpm;
}

// originMs: 박자 시계의 0박 시각, nowMs: 현재 시각(같은 시계 기준).
// 반환값: 재생까지 기다릴 시간(ms, 0 이상).
export function nearestBeatDelay(nowMs, originMs, bpm = DEFAULT_BPM) {
  const interval = beatInterval(bpm);
  const elapsed = nowMs - originMs;
  if (elapsed <= 0) return originMs - nowMs;
  const nearest = originMs + Math.round(elapsed / interval) * interval;
  return Math.max(0, nearest - nowMs);
}

// 가장 가까운 박자의 번호와 기다릴 시간. 같은 박자에 들어온 흔들림을 한 번으로 묶는 데 쓴다.
export function nearestBeat(nowMs, originMs, bpm = DEFAULT_BPM) {
  const interval = beatInterval(bpm);
  const index = Math.max(0, Math.round((nowMs - originMs) / interval));
  return { index, delay: Math.max(0, originMs + index * interval - nowMs) };
}

// 현재가 몇 번째 박자인지(0부터). 무대 조명 등 시각 박자 표시에 쓴다.
export function beatIndex(nowMs, originMs, bpm = DEFAULT_BPM) {
  return Math.floor((nowMs - originMs) / beatInterval(bpm));
}

// 같은 박자에 들어온 흔들림(여러 번·여러 폰)을 가장 센 것 하나로 묶어 그 박자에 한 번만 연주한다.
// 이미 친 박자에 늦게 온 흔들림은 버린다 → 아무리 빨리 흔들어도 박자대로 정리되어 들린다.
// schedule(fn, delayMs)는 타이머(브라우저는 setTimeout, 테스트는 가짜 타이머).
export function createBeatQueue({ onBeat, schedule, bpm = DEFAULT_BPM }) {
  const pending = {}; // 박자 번호 -> 가장 센 세기
  let lastPlayed = -1;
  return function add(intensity, nowMs, originMs) {
    const beat = nearestBeat(nowMs, originMs, bpm);
    if (beat.index <= lastPlayed) return false;
    if (pending[beat.index] !== undefined) {
      pending[beat.index] = Math.max(pending[beat.index], intensity);
      return false;
    }
    pending[beat.index] = intensity;
    schedule(() => {
      const strongest = pending[beat.index];
      delete pending[beat.index];
      lastPlayed = Math.max(lastPlayed, beat.index);
      onBeat(strongest, beat.index);
    }, beat.delay);
    return true;
  };
}
