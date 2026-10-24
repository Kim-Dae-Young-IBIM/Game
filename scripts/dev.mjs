// 개발 모드: 소켓 서버(3001) + vite 개발 서버(3000, /socket.io를 3001로 프록시)를 함께 띄운다.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const procs = [
  spawn(process.execPath, ["--watch", "server/index.js"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PORT: "3001", SOCKET_ONLY: "1" },
  }),
  spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))], {
    cwd: root,
    stdio: "inherit",
  }),
];

const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", code => code && stop());
