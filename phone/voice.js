// 누르고 말하기 녹음기. 마이크 소리를 그대로(압축 없이) 모았다가 16kHz 16bit PCM으로 바꿔 돌려준다.
// iPhone(AAC)·안드로이드(Opus)와 TV의 녹음 형식 호환 문제를 피하려고 MediaRecorder 대신 Web Audio로 직접 모은다.
// ScriptProcessor는 오래된 방식이지만 iOS Safari·삼성 인터넷·Chrome 모두에서 동작한다.
import { encodeVoice, VOICE_RATE, VOICE_MAX_SEC } from "../shared/pcm.js";

export function isVoiceSupported() {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    (window.AudioContext || window.webkitAudioContext)
  );
}

const IDLE_RELEASE_MS = 15000; // 마지막 녹음 뒤 이 시간 동안 안 쓰면 마이크를 끈다(표시등·배터리)

// onAutoStop(result): 최대 길이(5초)가 되어 저절로 멈췄을 때 호출
export function createVoiceRecorder({ onAutoStop }) {
  let ctx = null;
  let stream = null;
  let source = null;
  let processor = null;
  let chunks = [];
  let recording = false;
  let timer = null;
  let idleTimer = null;
  let preparing = null; // 진행 중인 준비(겹쳐 누르면 같은 것을 기다린다)
  let generation = 0; // release()마다 올라간다: 늦게 끝난 준비는 버린다

  // 사용자 탭 안에서 먼저(동기적으로) 불러야 iOS가 오디오를 허락한다
  function wake() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state !== "running") ctx.resume().catch(() => {});
  }

  // 마이크 준비(처음 한 번은 권한 창이 뜬다). 거부되면 예외.
  function prepare() {
    wake();
    clearTimeout(idleTimer);
    const live = stream && stream.getAudioTracks().some(t => t.readyState === "live");
    if (live) return Promise.resolve();
    if (!preparing) {
      const gen = generation;
      preparing = open(gen).then(
        () => {
          preparing = null;
        },
        err => {
          preparing = null;
          throw err;
        }
      );
    }
    return preparing;
  }

  async function open(gen) {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (gen !== generation) {
      // 준비하는 사이 화면을 떠났다 → 바로 끈다
      s.getTracks().forEach(t => t.stop());
      throw Object.assign(new Error("released"), { name: "AbortError" });
    }
    stream = s;
    source = ctx.createMediaStreamSource(stream);
    processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = e => {
      if (recording) chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(ctx.destination); // 연결해야 onaudioprocess가 불린다(출력은 무음)
  }

  function start() {
    chunks = [];
    recording = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const result = stop();
      if (onAutoStop) onAutoStop(result);
    }, VOICE_MAX_SEC * 1000);
  }

  // 녹음을 멈추고 { pcm: ArrayBuffer, rate } 또는 너무 짧으면 null
  function stop() {
    clearTimeout(timer);
    if (!recording) return null;
    recording = false;
    const pcm = encodeVoice(chunks, ctx.sampleRate, VOICE_RATE);
    chunks = [];
    clearTimeout(idleTimer);
    idleTimer = setTimeout(release, IDLE_RELEASE_MS);
    return pcm ? { pcm: pcm.buffer, rate: VOICE_RATE } : null;
  }

  // 화면을 떠나면 마이크를 끈다(다시 누르면 다시 켠다)
  function release() {
    generation++;
    recording = false;
    clearTimeout(timer);
    clearTimeout(idleTimer);
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (source) source.disconnect();
    if (processor) processor.disconnect();
    stream = source = processor = null;
  }

  return {
    wake,
    prepare,
    start,
    stop,
    release,
    get recording() {
      return recording;
    },
    // 오디오 상태(진단용): iOS에서 suspended면 녹음이 비어 있다
    get audioState() {
      return ctx ? ctx.state : "-";
    },
  };
}
