import { defineConfig, loadEnv } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Only expose specific env vars to the client bundle — loadEnv requires a
  // prefix, so we load with each var's own prefix and pick the value out.
  const allEnv = loadEnv(mode, process.cwd(), "");

  const publicEnv: Record<string, string> = {
    LOG_LEVEL: allEnv.LOG_LEVEL || "info",
    RELAY_URL: allEnv.RELAY_URL || "wss://t2-relay.fly.dev",
    BASE_PATH: allEnv.BASE_PATH || "/",
    GAME_ASSETS_BASE_URL:
      allEnv.GAME_ASSETS_BASE_URL || `${allEnv.BASE_PATH || "/"}base/`,
  };

  const define: Record<string, string> = {};
  for (const key in publicEnv) {
    define[`process.env.${key}`] = JSON.stringify(publicEnv[key]);
  }

  return {
    base: publicEnv.BASE_PATH,
    server: { port: 3000 },
    define,
    build: {
      outDir: "docs",
      emptyOutDir: false,
      copyPublicDir: false,
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  };
});
