import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const page = p => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // assets/ 내용이 그대로 루트에 복사된다: /animals/cat.svg, /sounds/drum.wav
  publicDir: "assets",
  build: {
    // LG webOS 6.5 내장 브라우저(Chromium 79)에 맞춰 문법을 낮춘다(?., ?? 등).
    target: "chrome79",
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000, // Phaser가 커서 경고만 끈다
    rollupOptions: {
      input: {
        tv: page("./tv/index.html"),
        phone: page("./phone/index.html"),
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: true, // ngrok 등 터널 주소 허용(PC 개발용)
    proxy: {
      "/socket.io": { target: "http://localhost:3001", ws: true },
    },
  },
});
