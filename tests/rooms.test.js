import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoomManager } from "../server/rooms.js";
import { isValidRoomCode, clampIntensity } from "../shared/protocol.js";

test("방 코드는 4자리 숫자, 0으로 시작하지 않음", () => {
  const rooms = createRoomManager();
  for (let i = 0; i < 200; i++) {
    const { code } = rooms.createRoom("tv" + i).room;
    assert.ok(isValidRoomCode(code), code);
  }
  assert.equal(rooms.size, 200);
});

test("코드가 겹치면 다른 코드를 고른다", () => {
  const seq = [0, 0, 0.5];
  const rooms = createRoomManager({ random: () => seq.shift() });
  const a = rooms.createRoom("tv1").room.code;
  const b = rooms.createRoom("tv2").room.code;
  assert.equal(a, "1000");
  assert.notEqual(a, b);
});

test("폰은 있는 방에만 들어간다", () => {
  const rooms = createRoomManager();
  const { code } = rooms.createRoom("tv1").room;
  assert.ok(rooms.joinRoom(code, "p1"));
  assert.equal(rooms.joinRoom("0000", "p2"), null);
  assert.equal(rooms.joinRoom("12", "p2"), null);
  assert.equal(rooms.joinRoom(undefined, "p2"), null);
  assert.equal(rooms.getRoom(code).phones.size, 1);
});

test("폰이 나가면 인원이 줄어든다", () => {
  const rooms = createRoomManager();
  const { code } = rooms.createRoom("tv1").room;
  rooms.joinRoom(code, "p1");
  rooms.joinRoom(code, "p2");
  assert.equal(rooms.removeSocket("p1").role, "phone");
  assert.equal(rooms.getRoom(code).phones.size, 1);
});

test("TV가 끊겨도 방은 남고, 같은 코드+토큰으로 돌아오면 폰이 이어진다", () => {
  const rooms = createRoomManager();
  const { room } = rooms.createRoom("tv1");
  rooms.joinRoom(room.code, "p1");
  rooms.removeSocket("tv1");
  assert.equal(rooms.getRoom(room.code).tvId, null);
  const again = rooms.createRoom("tv1b", room.code, room.tvToken);
  assert.equal(again.room.code, room.code);
  assert.equal(again.room.tvId, "tv1b");
  assert.equal(again.previousTvId, null);
  assert.ok(again.room.phones.has("p1"));
});

test("옛 TV 소켓이 아직 살아 있어도(와이파이 끊김 직후) 토큰이 맞으면 넘겨받는다", () => {
  const rooms = createRoomManager();
  const { room } = rooms.createRoom("tvOld");
  const again = rooms.createRoom("tvNew", room.code, room.tvToken);
  assert.equal(again.room.code, room.code);
  assert.equal(again.previousTvId, "tvOld");
  assert.equal(rooms.roomOf("tvOld"), null, "옛 소켓의 소속은 정리");
  assert.equal(rooms.removeSocket("tvOld"), null, "옛 소켓이 늦게 끊겨도 새 TV에 영향 없음");
  assert.equal(rooms.getRoom(room.code).tvId, "tvNew");
});

test("토큰 없이는 코드를 알아도 방을 가로채지 못한다(TV가 없을 때도)", () => {
  const rooms = createRoomManager();
  const { room } = rooms.createRoom("tv1");
  assert.notEqual(rooms.createRoom("tv2", room.code).room.code, room.code);
  rooms.removeSocket("tv1");
  assert.notEqual(rooms.createRoom("tv3", room.code, "wrong").room.code, room.code);
  assert.equal(rooms.getRoom(room.code).tvId, null);
});

test("빈 코드를 원하면 그 코드로 만든다(서버 재시작 뒤 TV 재접속)", () => {
  const rooms = createRoomManager();
  assert.equal(rooms.createRoom("tv1", "4321", "old-token").room.code, "4321");
});

test("방을 지우면 소켓 소속도 정리된다", () => {
  const rooms = createRoomManager();
  const { room } = rooms.createRoom("tv1");
  rooms.joinRoom(room.code, "p1");
  rooms.deleteRoom(room.code);
  assert.equal(rooms.roomOf("p1"), null);
  assert.equal(rooms.roomOf("tv1"), null);
  assert.equal(rooms.size, 0);
});

test("폰 자리: 순서대로, 같은 폰이 다시 들어와도 유지, 원하는 빈 자리", () => {
  const rooms = createRoomManager();
  const { code } = rooms.createRoom("tv").room;
  const room = rooms.joinRoom(code, "a");
  rooms.joinRoom(code, "b");
  rooms.joinRoom(code, "a", 3);
  assert.equal(room.phones.get("a").slot, 0, "이미 들어온 폰은 자리 유지");
  assert.equal(room.phones.get("b").slot, 1);
  rooms.joinRoom(code, "c", 3);
  assert.equal(room.phones.get("c").slot, 3);
  assert.deepEqual(rooms.slotsOf(room), [0, 1, 3]);
  rooms.removeSocket("b");
  assert.deepEqual(rooms.slotsOf(room), [0, 3]);
});

test("캐릭터: 기본은 자리 펭귄, 원하는 캐릭터, 겹치지 않게", () => {
  const rooms = createRoomManager();
  const { code } = rooms.createRoom("tv").room;
  const room = rooms.joinRoom(code, "a");
  assert.equal(room.phones.get("a").character, 0, "자리 0 → 펭귄 0");
  rooms.joinRoom(code, "b", undefined, 5);
  assert.deepEqual(room.phones.get("b"), { slot: 1, character: 5 }, "새로고침 전 토끼");
  rooms.joinRoom(code, "c", undefined, 5);
  assert.equal(room.phones.get("c").character, 2, "토끼는 b가 써서 자리 기본(펭귄 2)");
  assert.deepEqual(rooms.playersOf(room), [
    { slot: 0, character: 0 },
    { slot: 1, character: 5 },
    { slot: 2, character: 2 },
  ]);
});

test("◀ ▶ 고르기: 남이 쓰는 캐릭터를 건너뛴다", () => {
  const rooms = createRoomManager();
  const { code } = rooms.createRoom("tv").room;
  rooms.joinRoom(code, "a"); // 0
  rooms.joinRoom(code, "b"); // 1
  assert.equal(rooms.chooseCharacter("a", 1), 2, "1은 b가 씀");
  assert.equal(rooms.chooseCharacter("a", -1), 0);
  assert.equal(rooms.chooseCharacter("a", -1), 7, "왼쪽으로 돌면 고양이");
  assert.equal(rooms.chooseCharacter("tv", 1), null, "TV는 못 고름");
  assert.equal(rooms.chooseCharacter("nobody", 1), null);
});

test("세기 값은 0~1로 자른다", () => {
  assert.equal(clampIntensity(2), 1);
  assert.equal(clampIntensity(-1), 0);
  assert.equal(clampIntensity("abc"), 0);
  assert.equal(clampIntensity(0.5), 0.5);
});
