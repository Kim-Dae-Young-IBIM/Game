// 방 코드 관리. 방 하나 = TV 1대 + 폰 N대. 소켓 없이 동작해 단위 테스트가 쉽다.
import { ANIMALS, isValidRoomCode } from "../shared/protocol.js";

const CODE_MIN = 1000;
const CODE_MAX = 9999;

export function createRoomManager({ random = Math.random } = {}) {
  const rooms = new Map(); // code -> { code, tvId, phones: Set, animal }
  const bySocket = new Map(); // socketId -> { code, role: "tv" | "phone" }

  function newCode() {
    for (let i = 0; i < 1000; i++) {
      const code = String(CODE_MIN + Math.floor(random() * (CODE_MAX - CODE_MIN + 1)));
      if (!rooms.has(code)) return code;
    }
    throw new Error("빈 방 코드를 찾지 못했습니다");
  }

  // TV가 방을 만든다. preferredCode가 TV 없는 기존 방이면 다시 붙고(재접속), 비어 있으면 그 코드로 만든다.
  function createRoom(tvId, preferredCode) {
    let room = isValidRoomCode(preferredCode) ? rooms.get(preferredCode) : undefined;
    if (room && room.tvId === null) {
      room.tvId = tvId;
    } else {
      const code = isValidRoomCode(preferredCode) && !room ? preferredCode : newCode();
      room = { code, tvId, phones: new Set(), animal: ANIMALS[0] };
      rooms.set(code, room);
    }
    bySocket.set(tvId, { code: room.code, role: "tv" });
    return room;
  }

  function joinRoom(code, phoneId) {
    const room = isValidRoomCode(code) ? rooms.get(code) : undefined;
    if (!room) return null;
    room.phones.add(phoneId);
    bySocket.set(phoneId, { code, role: "phone" });
    return room;
  }

  // 소켓이 끊기면 호출. TV가 끊기면 방은 남겨 두고 tvId만 비운다(재접속 대기).
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
    for (const id of room.phones) bySocket.delete(id);
    rooms.delete(code);
  }

  return {
    createRoom,
    joinRoom,
    removeSocket,
    deleteRoom,
    getRoom: code => rooms.get(code),
    roomOf: socketId => {
      const entry = bySocket.get(socketId);
      return entry ? { room: rooms.get(entry.code), role: entry.role } : null;
    },
    get size() {
      return rooms.size;
    },
  };
}
