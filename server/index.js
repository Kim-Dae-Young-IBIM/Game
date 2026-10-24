// HTTP(정적 파일) + Socket.IO 서버. TV 1대 + 폰 N대를 방 코드로 묶어 흔들림을 TV로 전달한다.
import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { createRoomManager } from "./rooms.js";
import { EVENTS, clampIntensity } from "../shared/protocol.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

// 짧은 주소: / → TV, /p → 폰
const REDIRECTS = { "/": "/tv/", "/tv": "/tv/", "/p": "/phone/", "/phone": "/phone/" };

function staticHandler(staticDir) {
  const base = resolve(staticDir);
  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (REDIRECTS[url.pathname]) {
      res.writeHead(302, { Location: REDIRECTS[url.pathname] + url.search });
      return res.end();
    }
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(join(base, path));
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error("not a file");
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": path.endsWith(".html") ? "no-cache" : "public, max-age=3600",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  };
}

// staticDir가 없으면 소켓만 연다(개발 모드: 정적 파일은 vite가 서빙).
// tvGraceMs: TV가 끊긴 뒤 방을 유지하는 시간. 그 안에 TV가 같은 코드로 돌아오면 폰은 그대로 이어진다.
export function createGameServer({ staticDir, tvGraceMs = 60000 } = {}) {
  const httpServer = createHttpServer(
    staticDir
      ? staticHandler(staticDir)
      : (req, res) => {
          res.writeHead(404);
          res.end();
        }
  );
  const io = new Server(httpServer, { cors: { origin: true } });
  const rooms = createRoomManager();
  const closeTimers = new Map(); // code -> timeout

  const playerCount = room => io.to(room.tvId).emit(EVENTS.PLAYERS, { count: room.phones.size });

  io.on("connection", socket => {
    socket.on(EVENTS.TV_CREATE, (payload, ack) => {
      if (typeof ack !== "function") return;
      const preferred = payload && typeof payload.code === "string" ? payload.code : undefined;
      const room = rooms.createRoom(socket.id, preferred);
      clearTimeout(closeTimers.get(room.code));
      closeTimers.delete(room.code);
      ack({ code: room.code });
      playerCount(room);
    });

    socket.on(EVENTS.PHONE_JOIN, (payload, ack) => {
      if (typeof ack !== "function") return;
      const room = rooms.joinRoom(payload && payload.code, socket.id);
      if (!room) return ack({ ok: false });
      ack({ ok: true, animal: room.animal });
      if (room.tvId) playerCount(room);
    });

    socket.on(EVENTS.SHAKE, payload => {
      const entry = rooms.roomOf(socket.id);
      if (!entry || entry.role !== "phone" || !entry.room || !entry.room.tvId) return;
      io.to(entry.room.tvId).emit(EVENTS.PLAY, {
        intensity: clampIntensity(payload && payload.intensity),
        phoneId: socket.id,
      });
    });

    socket.on("disconnect", () => {
      const removed = rooms.removeSocket(socket.id);
      if (!removed) return;
      const { room, role } = removed;
      if (role === "phone") {
        if (room.tvId) playerCount(room);
        return;
      }
      const timer = setTimeout(() => {
        closeTimers.delete(room.code);
        if (room.tvId) return;
        for (const id of room.phones) io.to(id).emit(EVENTS.ROOM_CLOSED);
        rooms.deleteRoom(room.code);
      }, tvGraceMs);
      closeTimers.set(room.code, timer);
    });
  });

  return {
    httpServer,
    io,
    rooms,
    listen(port) {
      return new Promise(res => httpServer.listen(port, () => res(httpServer.address().port)));
    },
    close() {
      for (const t of closeTimers.values()) clearTimeout(t);
      closeTimers.clear();
      return new Promise(res => io.close(() => res()));
    },
  };
}

// node server/index.js 로 직접 실행하면 dist/를 서빙한다. SOCKET_ONLY=1이면 소켓만(개발용).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const staticDir = process.env.SOCKET_ONLY ? undefined : join(ROOT, "dist");
  const server = createGameServer({ staticDir });
  server.listen(port).then(p => {
    console.log(`흔들흔들 동물 밴드 서버: http://localhost:${p}/  (TV: /tv/, 폰: /phone/)`);
    if (!staticDir) console.log("소켓 전용 모드(개발). 화면은 vite 개발 서버에서 엽니다.");
  });
}
