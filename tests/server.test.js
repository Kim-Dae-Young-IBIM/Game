// 서버 통합 테스트: 실제 Socket.IO로 TV 1대 + 폰 2대를 연결해 흐름을 확인한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { io as connect } from "socket.io-client";
import { createGameServer } from "../server/index.js";
import { EVENTS } from "../shared/protocol.js";
import { toInt16 } from "../shared/pcm.js";

let server;
let url;
const logs = [];
const clients = [];

before(async () => {
  server = createGameServer({ tvGraceMs: 1000, log: m => logs.push(m) });
  const port = await server.listen(0);
  url = `http://localhost:${port}`;
});

after(async () => {
  for (const c of clients) c.close();
  await server.close();
});

function client() {
  const c = connect(url, { transports: ["websocket"], reconnection: false, forceNew: true });
  clients.push(c);
  return new Promise(res => c.on("connect", () => res(c)));
}
const until = async (cond, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timeout");
    await new Promise(r => setTimeout(r, 10));
  }
};
const ask = (c, ev, payload) => new Promise(res => c.emit(ev, payload, res));
const next = (c, ev) => new Promise(res => c.once(ev, res));
// 인원 수 이벤트는 순서가 섞여 도착할 수 있어, 원하는 값이 올 때까지 기다린다
const playersBecome = (tv, count) =>
  new Promise(res => {
    const on = m => m.count === count && (tv.off(EVENTS.PLAYERS, on), res(m));
    tv.on(EVENTS.PLAYERS, on);
  });

test("TV 방 생성 → 폰 입장 → 흔들림이 TV로 전달", async () => {
  const tv = await client();
  const { code } = await ask(tv, EVENTS.TV_CREATE, {});
  assert.match(code, /^[1-9]\d{3}$/);

  const phone = await client();
  const players = playersBecome(tv, 1);
  const res = await ask(phone, EVENTS.PHONE_JOIN, { code });
  assert.deepEqual(res, { ok: true, slot: 0, instrument: "drum" });
  await players;

  const play = next(tv, EVENTS.PLAY);
  phone.emit(EVENTS.SHAKE, { intensity: 0.8 });
  const msg = await play;
  assert.equal(msg.intensity, 0.8);
  assert.equal(msg.slot, 0);
  assert.equal(msg.phoneId, phone.id);
});

test("틀린 코드는 거절", async () => {
  const phone = await client();
  assert.deepEqual(await ask(phone, EVENTS.PHONE_JOIN, { code: "0001" }), { ok: false });
  assert.deepEqual(await ask(phone, EVENTS.PHONE_JOIN, { code: 1234 }), { ok: false });
});

test("이상한 세기 값은 0~1로 잘라서 전달", async () => {
  const tv = await client();
  const { code } = await ask(tv, EVENTS.TV_CREATE, {});
  const phone = await client();
  await ask(phone, EVENTS.PHONE_JOIN, { code });
  const play = next(tv, EVENTS.PLAY);
  phone.emit(EVENTS.SHAKE, { intensity: 99 });
  assert.equal((await play).intensity, 1);
});

test("입장하지 않은 소켓의 흔들림은 무시", async () => {
  const tv = await client();
  await ask(tv, EVENTS.TV_CREATE, {});
  const stranger = await client();
  let got = false;
  tv.on(EVENTS.PLAY, () => (got = true));
  stranger.emit(EVENTS.SHAKE, { intensity: 1 });
  await new Promise(r => setTimeout(r, 100));
  assert.equal(got, false);
});

test("폰 2대: 둘 다 TV로 전달되고 인원 수가 맞다", async () => {
  const tv = await client();
  const { code } = await ask(tv, EVENTS.TV_CREATE, {});
  const p1 = await client();
  const p2 = await client();
  const players = playersBecome(tv, 2);
  await ask(p1, EVENTS.PHONE_JOIN, { code });
  await ask(p2, EVENTS.PHONE_JOIN, { code });
  await players;

  const seen = new Set();
  const both = new Promise(res =>
    tv.on(EVENTS.PLAY, m => {
      seen.add(m.phoneId);
      if (seen.size === 2) res();
    })
  );
  p1.emit(EVENTS.SHAKE, { intensity: 0.5 });
  p2.emit(EVENTS.SHAKE, { intensity: 0.5 });
  await both;

  const left = playersBecome(tv, 1);
  p2.close();
  await left;
});

test("TV가 끊겼다 같은 코드+토큰으로 돌아오면 폰은 그대로", async () => {
  const tv = await client();
  const { code, token } = await ask(tv, EVENTS.TV_CREATE, {});
  assert.ok(token);
  const phone = await client();
  await ask(phone, EVENTS.PHONE_JOIN, { code });
  tv.close();
  await until(() => server.rooms.getRoom(code).tvId === null);

  const tv2 = await client();
  const res = await ask(tv2, EVENTS.TV_CREATE, { code, token });
  assert.equal(res.code, code);
  const play = next(tv2, EVENTS.PLAY);
  phone.emit(EVENTS.SHAKE, { intensity: 0.4 });
  assert.equal((await play).intensity, 0.4);
});

test("옛 TV 소켓이 아직 연결된 채로(와이파이 끊김 직후) 새 TV가 오면 넘겨받고 옛 소켓은 끊는다", async () => {
  const tvOld = await client();
  const { code, token } = await ask(tvOld, EVENTS.TV_CREATE, {});
  const phone = await client();
  await ask(phone, EVENTS.PHONE_JOIN, { code });
  const kicked = next(tvOld, "disconnect");

  const tvNew = await client();
  assert.equal((await ask(tvNew, EVENTS.TV_CREATE, { code, token })).code, code);
  await kicked;
  const play = next(tvNew, EVENTS.PLAY);
  phone.emit(EVENTS.SHAKE, { intensity: 0.6 });
  assert.equal((await play).intensity, 0.6);
});

test("토큰 없이 같은 코드를 요청하면 다른 코드를 받는다(가로채기 불가)", async () => {
  const tv = await client();
  const { code } = await ask(tv, EVENTS.TV_CREATE, {});
  const intruder = await client();
  assert.notEqual((await ask(intruder, EVENTS.TV_CREATE, { code })).code, code);
});

test("TV가 돌아오지 않으면 폰에 방 닫힘 알림", async () => {
  const tv = await client();
  const { code } = await ask(tv, EVENTS.TV_CREATE, {});
  const phone = await client();
  await ask(phone, EVENTS.PHONE_JOIN, { code });
  const closed = next(phone, EVENTS.ROOM_CLOSED);
  tv.close();
  await closed; // tvGraceMs(1초) 후
  const again = await client();
  assert.deepEqual(await ask(again, EVENTS.PHONE_JOIN, { code }), { ok: false });
});

test("같은 소켓이 방을 여러 번 만들거나 옮겨 들어가도 유령 플레이어가 남지 않는다", async () => {
  const tvA = await client();
  const a = (await ask(tvA, EVENTS.TV_CREATE, {})).code;
  const tvB = await client();
  const b = (await ask(tvB, EVENTS.TV_CREATE, {})).code;
  const phone = await client();
  await ask(phone, EVENTS.PHONE_JOIN, { code: a });
  await ask(phone, EVENTS.PHONE_JOIN, { code: a }); // 재입장(같은 방)
  assert.equal(server.rooms.getRoom(a).phones.size, 1);
  await ask(phone, EVENTS.PHONE_JOIN, { code: b }); // 다른 방으로
  assert.equal(server.rooms.getRoom(a).phones.size, 0);
  assert.equal(server.rooms.getRoom(b).phones.size, 1);

  const again = (await ask(tvA, EVENTS.TV_CREATE, {})).code; // TV가 새 방을 또 만듦
  assert.notEqual(again, a);
  assert.equal(server.rooms.getRoom(a).tvId, null, "이전 방은 TV 없음 → 유예 후 닫힘");
});

test("폰 1대의 흔들림 폭주는 서버에서 100ms 간격으로 줄인다", async () => {
  const tv = await client();
  const { code } = await ask(tv, EVENTS.TV_CREATE, {});
  const phone = await client();
  await ask(phone, EVENTS.PHONE_JOIN, { code });
  let got = 0;
  tv.on(EVENTS.PLAY, () => got++);
  for (let i = 0; i < 50; i++) phone.emit(EVENTS.SHAKE, { intensity: 0.5 });
  await new Promise(r => setTimeout(r, 200));
  assert.equal(got, 1);
});

test("같은 IP에서 틀린 코드를 계속 넣으면 다시 접속해도 막힌다", async () => {
  const web = createGameServer({ ipJoinFails: { max: 3, windowMs: 60000 } });
  const port = await web.listen(0);
  const conn = () =>
    new Promise(res => {
      const c = connect(`http://localhost:${port}`, { transports: ["websocket"], reconnection: false, forceNew: true });
      clients.push(c);
      c.on("connect", () => res(c));
    });
  try {
    const tv = await conn();
    const { code } = await ask(tv, EVENTS.TV_CREATE, {});
    for (let i = 0; i < 3; i++) {
      const p = await conn(); // 매번 새 소켓
      assert.deepEqual(await ask(p, EVENTS.PHONE_JOIN, { code: "9999" === code ? "9998" : "9999" }), { ok: false });
      p.close();
    }
    const late = await conn();
    assert.deepEqual(await ask(late, EVENTS.PHONE_JOIN, { code }), { ok: false }, "맞는 코드여도 잠시 막힘");
  } finally {
    await web.close();
  }
});

// ---------- 2단계: 펭귄 자리·효과음·목소리 ----------
async function roomWithPhones(n) {
  const tv = await client();
  const { code } = await ask(tv, EVENTS.TV_CREATE, {});
  const phones = [];
  for (let i = 0; i < n; i++) {
    const p = await client();
    p.joined = await ask(p, EVENTS.PHONE_JOIN, { code });
    phones.push(p);
  }
  return { tv, code, phones };
}

test("폰마다 다른 펭귄 자리와 악기, TV에 쓰는 자리 목록", async () => {
  const { tv, code, phones } = await roomWithPhones(2);
  assert.deepEqual(phones.map(p => p.joined.slot), [0, 1]);
  assert.deepEqual(phones.map(p => p.joined.instrument), ["drum", "tambourine"]);
  const players = playersBecome(tv, 3);
  const third = await client();
  assert.equal((await ask(third, EVENTS.PHONE_JOIN, { code })).slot, 2);
  assert.deepEqual((await players).slots, [0, 1, 2]);
  const play = next(tv, EVENTS.PLAY);
  phones[1].emit(EVENTS.SHAKE, { intensity: 0.5 });
  assert.equal((await play).slot, 1, "흔든 폰의 자리로 연주");
});

test("새로고침한 폰은 원래 자리를 다시 받는다", async () => {
  const { code, phones } = await roomWithPhones(3);
  phones[1].close(); // 자리 1이 빈다
  await until(() => server.rooms.getRoom(code).phones.size === 2);
  const again = await client();
  assert.equal((await ask(again, EVENTS.PHONE_JOIN, { code, slot: 1 })).slot, 1);
  const other = await client();
  assert.equal((await ask(other, EVENTS.PHONE_JOIN, { code, slot: 0 })).slot, 3, "남이 쓰는 자리는 못 받음");
});

test("펭귄 효과음: 자리와 함께 TV로, 1초에 1번", async () => {
  const { tv, phones } = await roomWithPhones(2);
  const got = [];
  tv.on(EVENTS.EFFECT, m => got.push(m));
  for (let i = 0; i < 5; i++) phones[1].emit(EVENTS.EFFECT, { type: "evil" });
  await until(() => got.length >= 1);
  await new Promise(r => setTimeout(r, 150));
  assert.deepEqual(got, [{ slot: 1, type: "squawk" }]);
});

test("목소리: 검사 통과한 PCM만 TV로, 2초에 1번", async () => {
  const { tv, phones } = await roomWithPhones(1);
  const got = [];
  tv.on(EVENTS.VOICE, m => got.push(m));
  phones[0].emit(EVENTS.VOICE, { pcm: new Int16Array(3).buffer.slice(0, 5), rate: 16000 }); // 홀수 바이트
  phones[0].emit(EVENTS.VOICE, { pcm: "not binary", rate: 16000 });
  const pcm = new Int16Array(16000);
  pcm[0] = 1234;
  phones[0].emit(EVENTS.VOICE, { pcm: pcm.buffer, rate: 16000 });
  phones[0].emit(EVENTS.VOICE, { pcm: pcm.buffer, rate: 16000 }); // 2초 안에 또 → 버림
  await until(() => got.length >= 1);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(got.length, 1);
  assert.equal(got[0].slot, 0);
  assert.equal(got[0].rate, 16000);
  const back = toInt16(got[0].pcm);
  assert.equal(back.length, 16000);
  assert.equal(back[0], 1234);
});

test("입장 안 한 소켓의 효과음·목소리는 무시", async () => {
  const { tv } = await roomWithPhones(0);
  const stranger = await client();
  let got = 0;
  tv.on(EVENTS.EFFECT, () => got++);
  tv.on(EVENTS.VOICE, () => got++);
  stranger.emit(EVENTS.EFFECT, {});
  stranger.emit(EVENTS.VOICE, { pcm: new Int16Array(8000).buffer, rate: 16000 });
  await new Promise(r => setTimeout(r, 150));
  assert.equal(got, 0);
});

// ---------- 진단 ----------
test("왕복 지연 측정용 ping에 서버 시각으로 답한다", async () => {
  const c = await client();
  const t = await new Promise(res => c.emit(EVENTS.PING, res));
  assert.ok(typeof t === "number" && Math.abs(Date.now() - t) < 5000);
});

test("기기 오류·진단 기록이 방 코드와 함께 서버 터미널에 찍힌다", async () => {
  const tv = await client();
  const { code } = await ask(tv, EVENTS.TV_CREATE, {});
  const before = logs.length;
  tv.emit(EVENTS.CLIENT_LOG, { role: "tv", kind: "error", message: "TypeError: x is undefined" });
  await until(() => logs.length > before);
  assert.equal(logs[logs.length - 1], `[tv ${code}] error: TypeError: x is undefined`);
});

test("기기 기록은 소켓당 초당 5줄까지, 이상한 값은 무시", async () => {
  const junk = await client();
  const c = await client();
  const before = logs.length;
  junk.emit(EVENTS.CLIENT_LOG, "not an object");
  junk.emit(EVENTS.CLIENT_LOG, null);
  junk.emit(EVENTS.CLIENT_LOG, { role: "tv", message: "" });
  for (let i = 0; i < 30; i++) c.emit(EVENTS.CLIENT_LOG, { role: "phone", kind: "info", message: "m" + i });
  await new Promise(r => setTimeout(r, 200));
  assert.equal(logs.length - before, 5);
  assert.ok(logs.slice(before).every(l => l.startsWith("[phone] info: m")));
});

// ---------- 정적 파일 서빙 ----------
test("정적 서빙: 이상한 경로로 서버가 죽지 않고, 폴더 밖 파일을 주지 않는다", async () => {
  const dir = mkdtempSync(join(tmpdir(), "band-static-"));
  mkdirSync(join(dir, "tv"));
  writeFileSync(join(dir, "tv", "index.html"), "<p>tv</p>");
  const web = createGameServer({ staticDir: dir });
  const port = await web.listen(0);
  const get = path =>
    new Promise((res, rej) => {
      const r = request({ host: "localhost", port, path, method: "GET" }, resp => {
        resp.resume();
        resp.on("end", () => res({ status: resp.statusCode, location: resp.headers.location }));
      });
      r.on("error", rej);
      r.end();
    });
  try {
    assert.equal((await get("//")).status, 400);
    assert.equal((await get("/%E0%A4%A")).status, 400);
    assert.equal((await get("/tv/%00")).status, 400);
    assert.ok([403, 404].includes((await get("/..%2f..%2fetc%2fpasswd")).status));
    assert.ok([403, 404].includes((await get("/../../etc/passwd")).status));
    assert.deepEqual(await get("/"), { status: 302, location: "/tv/" });
    assert.deepEqual(await get("/p?room=1234"), { status: 302, location: "/phone/?room=1234" });
    assert.equal((await get("/tv/")).status, 200);
    assert.equal((await get("/healthz")).status, 200);
    assert.equal((await get("/tv/")).status, 200, "위 요청들 뒤에도 서버가 살아 있다");
  } finally {
    await web.close();
  }
});
