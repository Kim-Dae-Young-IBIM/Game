import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoomManager } from "../server/rooms.js";
import { isValidRoomCode, clampIntensity } from "../shared/protocol.js";

test("방 코드는 4자리 숫자, 0으로 시작하지 않음", () => {
  const rooms = createRoomManager();
  for (let i = 0; i < 200; i++) {
    const { code } = rooms.createRoom("tv" + i);
    assert.ok(isValidRoomCode(code), code);
  }
  assert.equal(rooms.size, 200);
});

test("코드가 겹치면 다른 코드를 고른다", () => {
  const seq = [0, 0, 0.5];
  const rooms = createRoomManager({ random: () => seq.shift() });
  const a = rooms.createRoom("tv1").code;
  const b = rooms.createRoom("tv2").code;
  assert.equal(a, "1000");
  assert.notEqual(a, b);
});

test("폰은 있는 방에만 들어간다", () => {
  const rooms = createRoomManager();
  const { code } = rooms.createRoom("tv1");
  assert.ok(rooms.joinRoom(code, "p1"));
  assert.equal(rooms.joinRoom("0000", "p2"), null);
  assert.equal(rooms.joinRoom("12", "p2"), null);
  assert.equal(rooms.joinRoom(undefined, "p2"), null);
  assert.equal(rooms.getRoom(code).phones.size, 1);
});

test("폰이 나가면 인원이 줄어든다", () => {
  const rooms = createRoomManager();
  const { code } = rooms.createRoom("tv1");
  rooms.joinRoom(code, "p1");
  rooms.joinRoom(code, "p2");
  assert.equal(rooms.removeSocket("p1").role, "phone");
  assert.equal(rooms.getRoom(code).phones.size, 1);
});

test("TV가 끊겨도 방은 남고, 같은 코드로 돌아오면 폰이 이어진다", () => {
  const rooms = createRoomManager();
  const { code } = rooms.createRoom("tv1");
  rooms.joinRoom(code, "p1");
  rooms.removeSocket("tv1");
  assert.equal(rooms.getRoom(code).tvId, null);
  const again = rooms.createRoom("tv1b", code);
  assert.equal(again.code, code);
  assert.equal(again.tvId, "tv1b");
  assert.ok(again.phones.has("p1"));
});

test("다른 TV가 쓰고 있는 코드는 빼앗지 못한다", () => {
  const rooms = createRoomManager();
  const { code } = rooms.createRoom("tv1");
  const other = rooms.createRoom("tv2", code);
  assert.notEqual(other.code, code);
  assert.equal(rooms.getRoom(code).tvId, "tv1");
});

test("세기 값은 0~1로 자른다", () => {
  assert.equal(clampIntensity(2), 1);
  assert.equal(clampIntensity(-1), 0);
  assert.equal(clampIntensity("abc"), 0);
  assert.equal(clampIntensity(0.5), 0.5);
});
