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

// onAutoStop(result): 최대 길이(5초)가 되어 저절로 멈췄을 때 호출
export function createVoiceRecorder({ onAutoStop }) {
  let ctx = null;
  let stream = null;
  let source = null;
  let processor = null;
  let chunks = [];
  let recording = false;
  let timer = null;

  // 사용자 탭 안에서 먼저(동기적으로) 불러야 iOS가 오디오를 허락한다
  function wake() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state !== "running") ctx.resume().catch(() => {});
  }

  // 마이크 준비(처음 한 번은 권한 창이 뜬다). 거부되면 예외.
  async function prepare() {
    wake();
    const live = stream && stream.getAudioTracks().some(t => t.readyState === "live");
    if (live) return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
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
    return pcm ? { pcm: pcm.buffer, rate: VOICE_RATE } : null;
  }

  // 화면을 떠나면 마이크를 끈다(다시 누르면 다시 켠다)
  function release() {
    recording = false;
    clearTimeout(timer);
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
  };
}
