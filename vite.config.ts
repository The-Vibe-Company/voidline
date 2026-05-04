import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  const apiPort = process.env.VITE_API_PROXY_PORT;
  // Proxy /api/* to the Vercel dev server when both run in dev (Conductor split mode).
  // In single-process dev (vite alone) the proxy is harmless: the target won't respond,
  // and the client falls back to its offline-mode handling.
  const proxy =
    command === "serve" && apiPort
      ? {
          "/api": {
            target: `http://127.0.0.1:${apiPort}`,
            changeOrigin: true,
          },
        }
      : undefined;
  return {
    server: {
      host: "127.0.0.1",
      proxy,
    },
    preview: {
      host: "127.0.0.1",
    },
    build: {
      target: "es2022",
      sourcemap: true,
    },
  };
});
