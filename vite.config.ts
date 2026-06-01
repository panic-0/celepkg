import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const DEFAULT_DEV_HOST = "127.0.0.1";
const DEFAULT_DEV_PORT = 5173;
const DEFAULT_PREVIEW_PORT = 4173;

function readPort(value: string | undefined, fallback: number) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "CELEPKG_");
  const apiProxyTarget = env.CELEPKG_API_PROXY_TARGET?.trim();

  return {
    plugins: [react()],
    server: {
      host: env.CELEPKG_DEV_HOST || DEFAULT_DEV_HOST,
      port: readPort(env.CELEPKG_DEV_PORT, DEFAULT_DEV_PORT),
      strictPort: true,
      proxy: apiProxyTarget ? { "/api": apiProxyTarget } : undefined
    },
    preview: {
      host: env.CELEPKG_PREVIEW_HOST || DEFAULT_DEV_HOST,
      port: readPort(env.CELEPKG_PREVIEW_PORT, DEFAULT_PREVIEW_PORT),
      strictPort: true
    }
  };
});
