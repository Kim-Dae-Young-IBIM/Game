// 흔들림 판정. DOM 없이 동작하는 순수 로직이라 Node 테스트와 폰 페이지가 함께 쓴다.
//
// 입력은 DeviceMotionEvent.accelerationIncludingGravity({x, y, z}, m/s²).
// `acceleration`(중력 제외)은 기기에 따라 null이라 중력 포함 값을 쓴다.
// 가만히 있으면 크기가 약 9.8이므로 임계값 12는 "살짝 흔들기"에 해당한다.

export const SHAKE_THRESHOLD = 12; // m/s², 이 값을 넘으면 1회
export const DEBOUNCE_MS = 150; // 판정 후 이 시간 동안은 다시 세지 않는다
export const MAX_FORCE = 30; // 이 이상은 최대 볼륨
export const MIN_VOLUME = 0.3; // 가장 약한 흔들기도 들리게
export const MAX_VOLUME = 1.0;

const num = v => (typeof v === "number" && isFinite(v) ? v : 0);

export function magnitude(accel) {
  if (!accel) return 0;
  const x = num(accel.x);
  const y = num(accel.y);
  const z = num(accel.z);
  return Math.sqrt(x * x + y * y + z * z);
}

// 흔들기 세기(m/s²) → 볼륨(0.3~1.0). 임계값 이하는 0.
export function forceToVolume(force, threshold = SHAKE_THRESHOLD, maxForce = MAX_FORCE) {
  if (!(force > threshold)) return 0;
  const t = Math.min(1, (force - threshold) / (maxForce - threshold));
  return MIN_VOLUME + (MAX_VOLUME - MIN_VOLUME) * t;
}

// 샘플을 하나씩 넣으면 흔들림 1회마다 {magnitude, intensity}를, 아니면 null을 돌려준다.
// 임계값을 넘은 첫 샘플에서 바로 판정하면 세기가 "올라가는 중"의 값이 되어 세게 흔들어도 작게 들린다.
// 그래서 넘은 뒤 값이 내려가기 시작하거나 PEAK_WINDOW_MS가 지나면 그때까지의 최댓값(정점)으로 판정한다.
// 60Hz 센서 기준 지연은 보통 1~3샘플(16~50ms).
export const PEAK_WINDOW_MS = 80;

export function createShakeDetector({
  threshold = SHAKE_THRESHOLD,
  debounceMs = DEBOUNCE_MS,
  maxForce = MAX_FORCE,
  peakWindowMs = PEAK_WINDOW_MS,
} = {}) {
  let lastShakeAt = -Infinity; // 디바운스 기준: 흔들림이 시작된(임계값을 넘은) 시각
  let candidate = null; // { start, peak }
  return function feed(accel, timeMs) {
    const m = magnitude(accel);
    if (candidate) {
      if (m > candidate.peak && timeMs - candidate.start < peakWindowMs) {
        candidate.peak = m;
        return null;
      }
      const peak = candidate.peak;
      lastShakeAt = candidate.start;
      candidate = null;
      return { magnitude: peak, intensity: forceToVolume(peak, threshold, maxForce) };
    }
    if (m <= threshold) return null;
    if (timeMs - lastShakeAt < debounceMs) return null;
    candidate = { start: timeMs, peak: m };
    return null;
  };
}
