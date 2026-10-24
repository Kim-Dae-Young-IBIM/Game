// HTTP(정적 파일) + Socket.IO 서버. TV 1대 + 폰 N대를 방 코드로 묶어 흔들림을 TV로 전달한다.
import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { createRoomManager } from "./rooms.js";
import { formatClientLog } from "./client-log.js";
import { createFailLimiter, clientIp } from "./limits.js";
import { EVENTS, clampIntensity } from "../shared/protocol.js";
import { PENGUINS } from "../shared/band.js";
import { isValidVoice } from "../shared/pcm.js";

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
  const send = (res, status, headers, body) => {
    if (res.headersSent) return res.end();
    res.writeHead(status, headers);
    res.end(body);
  };
  async function handle(req, res) {
    let url, path;
    try {
      // 외부 입력: "//", 잘못된 % 인코딩 등은 400 (예외가 새면 서버가 죽는다)
      url = new URL(req.url, "http://localhost");
      path = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 400);
    }
    if (url.pathname === "/healthz") return send(res, 200, { "Content-Type": "text/plain" }, "ok"); // Render 상태 확인
    if (REDIRECTS[url.pathname]) return send(res, 302, { Location: REDIRECTS[url.pathname] + url.search });
    if (path.includes("\0")) return send(res, 400);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(join(base, path));
    if (file !== base && !file.startsWith(base + sep)) return send(res, 403);
    try {
      if (!(await stat(file)).isFile()) throw new Error("not a file");
      const body = await readFile(file);
      send(
        res,
        200,
        {
          "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
          "Cache-Control": path.endsWith(".html") ? "no-cache" : "public, max-age=3600",
        },
        body
      );
    } catch {
      send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
    }
  }
  return (req, res) => {
    handle(req, res).catch(() => send(res, 500));
  };
}

// staticDir가 없으면 소켓만 연다(개발 모드: 정적 파일은 vite가 서빙).
// tvGraceMs: TV가 끊긴 뒤 방을 유지하는 시간. 그 안에 TV가 같은 코드로 돌아오면 폰은 그대로 이어진다.
// log: 기기에서 온 오류·진단 기록을 찍을 함수(테스트에서는 바꿔 끼운다).
export function createGameServer({ staticDir, tvGraceMs = 60000, log = console.log, ipJoinFails = {} } = {}) {
  const httpServer = createHttpServer(
    staticDir
      ? staticHandler(staticDir)
      : (req, res) => {
          res.writeHead(404);
          res.end();
        }
  );
  // 목소리(최대 400KB)가 들어가도록 하되, 그보다 큰 메시지는 받지 않는다
  const io = new Server(httpServer, { cors: { origin: true }, maxHttpBufferSize: 500000 });
  const rooms = createRoomManager();
  const closeTimers = new Map(); // code -> timeout

  const SHAKE_MIN_INTERVAL_MS = 100; // 폰 1대당 흔들림 전달 최소 간격(폭주 방지, 폰 디바운스는 150ms)
  const MAX_JOIN_FAILS = 20; // 소켓당 틀린 코드 허용 횟수(코드 무차별 대입 방지)
  const ipFails = createFailLimiter(ipJoinFails); // IP당 틀린 코드 제한(다시 접속해도 유지)
  const LOGS_PER_SEC = 5; // 소켓당 기기 기록 출력 상한(터미널 폭주 방지)
  const EFFECT_MIN_INTERVAL_MS = 1000; // 펭귄 효과음 버튼: 1초에 1번
  const VOICE_MIN_INTERVAL_MS = 2000; // 목소리: 2초에 1번

  const playerCount = room => {
    if (room.tvId) io.to(room.tvId).emit(EVENTS.PLAYERS, { count: room.phones.size, slots: rooms.slotsOf(room) });
  };

  // 입장한 폰이고 TV가 있을 때만 { room, slot }
  const phoneInRoom = socketId => {
    const entry = rooms.roomOf(socketId);
    if (!entry || entry.role !== "phone" || !entry.room || !entry.room.tvId) return null;
    return { room: entry.room, slot: entry.room.phones.get(socketId) };
  };

  function scheduleClose(room) {
    clearTimeout(closeTimers.get(room.code));
    const timer = setTimeout(() => {
      closeTimers.delete(room.code);
      if (room.tvId) return;
      for (const id of room.phones.keys()) io.to(id).emit(EVENTS.ROOM_CLOSED);
      rooms.deleteRoom(room.code);
    }, tvGraceMs);
    closeTimers.set(room.code, timer);
  }

  // 소켓의 기존 소속을 정리한다(끊김, 또는 같은 소켓이 다시 만들기·입장할 때).
  function leave(socketId) {
    const removed = rooms.removeSocket(socketId);
    if (!removed) return;
    const { room, role } = removed;
    if (role === "phone") playerCount(room);
    else if (!room.tvId) scheduleClose(room);
  }

  io.on("connection", socket => {
    let lastShakeAt = 0;
    let lastEffectAt = 0;
    let lastVoiceAt = 0;
    let joinFails = 0;
    const ip = clientIp(socket.handshake);
    let logWindowAt = 0;
    let logsInWindow = 0;

    socket.on(EVENTS.PING, ack => {
      if (typeof ack === "function") ack(Date.now());
    });

    socket.on(EVENTS.CLIENT_LOG, payload => {
      const now = Date.now();
      if (now - logWindowAt >= 1000) {
        logWindowAt = now;
        logsInWindow = 0;
      }
      if (++logsInWindow > LOGS_PER_SEC) return;
      const entry = formatClientLog(payload);
      if (!entry) return;
      const where = rooms.roomOf(socket.id);
      const code = where && where.room ? " " + where.room.code : "";
      try {
        log(`[${entry.role}${code}] ${entry.kind}: ${entry.message}`);
      } catch {
        // 출력 실패는 무시
      }
    });

    socket.on(EVENTS.TV_CREATE, (payload, ack) => {
      if (typeof ack !== "function") return;
      const p = payload || {};
      try {
        leave(socket.id);
        const { room, previousTvId } = rooms.createRoom(
          socket.id,
          typeof p.code === "string" ? p.code : undefined,
          typeof p.token === "string" ? p.token : undefined
        );
        // 끊긴 줄 모르고 남아 있던 옛 TV 소켓은 정리
        if (previousTvId) {
          const old = io.sockets.sockets.get(previousTvId);
          if (old) old.disconnect(true);
        }
        clearTimeout(closeTimers.get(room.code));
        closeTimers.delete(room.code);
        ack({ code: room.code, token: room.tvToken });
        playerCount(room);
      } catch (e) {
        ack({ error: "unavailable" });
      }
    });

    socket.on(EVENTS.PHONE_JOIN, (payload, ack) => {
      if (typeof ack !== "function") return;
      if (joinFails >= MAX_JOIN_FAILS || ipFails.blocked(ip)) return ack({ ok: false });
      const code = payload && payload.code;
      const current = rooms.roomOf(socket.id);
      if (!(current && current.role === "phone" && current.room && current.room.code === code)) {
        leave(socket.id);
      }
      const room = rooms.joinRoom(code, socket.id, payload && payload.slot);
      if (!room) {
        joinFails++;
        ipFails.fail(ip);
        return ack({ ok: false });
      }
      const slot = room.phones.get(socket.id);
      ack({ ok: true, slot, instrument: PENGUINS[slot].instrument });
      playerCount(room);
    });

    socket.on(EVENTS.SHAKE, payload => {
      const p = phoneInRoom(socket.id);
      if (!p) return;
      const now = Date.now();
      if (now - lastShakeAt < SHAKE_MIN_INTERVAL_MS) return;
      lastShakeAt = now;
      io.to(p.room.tvId).emit(EVENTS.PLAY, {
        intensity: clampIntensity(payload && payload.intensity),
        slot: p.slot,
        phoneId: socket.id,
      });
    });

    // 펭귄 효과음 버튼(내용 없음, 종류는 서버가 정한다)
    socket.on(EVENTS.EFFECT, () => {
      const p = phoneInRoom(socket.id);
      if (!p) return;
      const now = Date.now();
      if (now - lastEffectAt < EFFECT_MIN_INTERVAL_MS) return;
      lastEffectAt = now;
      io.to(p.room.tvId).emit(EVENTS.EFFECT, { slot: p.slot, type: "squawk" });
    });

    // 누르고 말하기: 16bit PCM을 검사해 TV로 그대로 전달
    socket.on(EVENTS.VOICE, payload => {
      const p = phoneInRoom(socket.id);
      if (!p || !isValidVoice(payload)) return;
      const now = Date.now();
      if (now - lastVoiceAt < VOICE_MIN_INTERVAL_MS) return;
      lastVoiceAt = now;
      io.to(p.room.tvId).emit(EVENTS.VOICE, { slot: p.slot, pcm: payload.pcm, rate: payload.rate });
    });

    socket.on("disconnect", () => leave(socket.id));
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
    console.log(`흔들흔들 펭귄 밴드 서버: http://localhost:${p}/  (TV: /tv/, 폰: /phone/)`);
    if (!staticDir) console.log("소켓 전용 모드(개발). 화면은 vite 개발 서버에서 엽니다.");
  });
}
