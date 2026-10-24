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

// 현재가 몇 번째 박자인지(0부터). 무대 조명 등 시각 박자 표시에 쓴다.
export function beatIndex(nowMs, originMs, bpm = DEFAULT_BPM) {
  return Math.floor((nowMs - originMs) / beatInterval(bpm));
}
