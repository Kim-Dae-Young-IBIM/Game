// 방 코드 관리. 방 하나 = TV 1대 + 폰 N대(폰마다 펭귄 자리 slot). 소켓 없이 동작해 단위 테스트가 쉽다.
import { randomBytes } from "node:crypto";
import { isValidRoomCode } from "../shared/protocol.js";
import { pickSlot } from "../shared/band.js";

const CODE_MIN = 1000;
const CODE_MAX = 9999;

const newToken = () => randomBytes(16).toString("hex");

export function createRoomManager({ random = Math.random, token = newToken } = {}) {
  const rooms = new Map(); // code -> { code, tvId, tvToken, phones: Map(socketId -> slot) }
  const bySocket = new Map(); // socketId -> { code, role: "tv" | "phone" }

  function newCode() {
    for (let i = 0; i < 1000; i++) {
      const code = String(CODE_MIN + Math.floor(random() * (CODE_MAX - CODE_MIN + 1)));
      if (!rooms.has(code)) return code;
    }
    throw new Error("빈 방 코드를 찾지 못했습니다");
  }

  // TV가 방을 만든다. (code, token)이 기존 방과 맞으면 그 방을 넘겨받는다(재접속).
  // 와이파이가 잠깐 끊기면 서버는 옛 소켓을 아직 살아 있다고 보므로, tvId가 남아 있어도 토큰이 맞으면 넘겨받는다.
  // 반환: { room, previousTvId } — previousTvId는 넘겨받기 전 TV 소켓(있으면 끊어야 함)
  function createRoom(tvId, preferredCode, tvToken) {
    const existing = isValidRoomCode(preferredCode) ? rooms.get(preferredCode) : undefined;
    if (existing && typeof tvToken === "string" && tvToken === existing.tvToken) {
      const previousTvId = existing.tvId !== tvId ? existing.tvId : null;
      if (previousTvId) bySocket.delete(previousTvId);
      existing.tvId = tvId;
      bySocket.set(tvId, { code: existing.code, role: "tv" });
      return { room: existing, previousTvId };
    }
    const code = isValidRoomCode(preferredCode) && !existing ? preferredCode : newCode();
    const room = { code, tvId, tvToken: token(), phones: new Map() };
    rooms.set(code, room);
    bySocket.set(tvId, { code, role: "tv" });
    return { room, previousTvId: null };
  }

  // 폰 입장. preferredSlot: 새로고침 전에 쓰던 자리(비어 있으면 그대로 준다). 이미 들어와 있으면 자리 유지.
  function joinRoom(code, phoneId, preferredSlot) {
    const room = isValidRoomCode(code) ? rooms.get(code) : undefined;
    if (!room) return null;
    if (!room.phones.has(phoneId)) {
      room.phones.set(phoneId, pickSlot(room.phones.values(), preferredSlot, room.phones.size));
    }
    bySocket.set(phoneId, { code, role: "phone" });
    return room;
  }

  // 소켓이 끊기거나 다른 방으로 옮길 때 호출. TV가 나가면 방은 남겨 두고 tvId만 비운다(재접속 대기).
  function removeSocket(socketId) {
    const entry = bySocket.get(socketId);
    if (!entry) return null;
    bySocket.delete(socketId);
    const room = rooms.get(entry.code);
    if (!room) return null;
    if (entry.role === "tv" && room.tvId === socketId) room.tvId = null;
    if (entry.role === "phone") room.phones.delete(socketId);
    return { room, role: entry.role };
  }

  function deleteRoom(code) {
    const room = rooms.get(code);
    if (!room) return;
    for (const id of room.phones.keys()) bySocket.delete(id);
    if (room.tvId) bySocket.delete(room.tvId);
    rooms.delete(code);
  }

  return {
    createRoom,
    joinRoom,
    removeSocket,
    deleteRoom,
    getRoom: code => rooms.get(code),
    // 방에서 쓰는 자리들(중복 없이, 작은 순)
    slotsOf: room => Array.from(new Set(room.phones.values())).sort((a, b) => a - b),
    roomOf: socketId => {
      const entry = bySocket.get(socketId);
      return entry ? { room: rooms.get(entry.code), role: entry.role } : null;
    },
    get size() {
      return rooms.size;
    },
  };
}
