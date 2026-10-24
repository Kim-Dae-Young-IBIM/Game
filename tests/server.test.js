// 서버 통합 테스트: 실제 Socket.IO로 TV 1대 + 폰 2대를 연결해 흐름을 확인한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { io as connect } from "socket.io-client";
import { createGameServer } from "../server/index.js";
import { EVENTS } from "../shared/protocol.js";

let server;
let url;
const clients = [];

before(async () => {
  server = createGameServer({ tvGraceMs: 150 });
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
  assert.deepEqual(res, { ok: true, animal: "cat" });
  await players;

  const play = next(tv, EVENTS.PLAY);
  phone.emit(EVENTS.SHAKE, { intensity: 0.8 });
  const msg = await play;
  assert.equal(msg.intensity, 0.8);
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

test("TV가 잠깐 끊겼다 같은 코드로 돌아오면 폰은 그대로", async () => {
  const tv = await client();
  const { code } = await ask(tv, EVENTS.TV_CREATE, {});
  const phone = await client();
  await ask(phone, EVENTS.PHONE_JOIN, { code });
  tv.close();
  await new Promise(r => setTimeout(r, 30));

  const tv2 = await client();
  const res = await ask(tv2, EVENTS.TV_CREATE, { code });
  assert.equal(res.code, code);
  const play = next(tv2, EVENTS.PLAY);
  phone.emit(EVENTS.SHAKE, { intensity: 0.4 });
  assert.equal((await play).intensity, 0.4);
});

test("TV가 돌아오지 않으면 폰에 방 닫힘 알림", async () => {
  const tv = await client();
  const { code } = await ask(tv, EVENTS.TV_CREATE, {});
  const phone = await client();
  await ask(phone, EVENTS.PHONE_JOIN, { code });
  const closed = next(phone, EVENTS.ROOM_CLOSED);
  tv.close();
  await closed; // tvGraceMs(150ms) 후
  const again = await client();
  assert.deepEqual(await ask(again, EVENTS.PHONE_JOIN, { code }), { ok: false });
});
