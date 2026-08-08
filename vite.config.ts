import { defineConfig, loadEnv, type Plugin } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

/**
 * Injects a preconnect for the game asset host into the HTML when assets
 * are served from another origin, so the connection is ready before the
 * first asset request.
 */
function preconnectGameAssets(gameAssetsBaseUrl: string): Plugin {
  return {
    name: "preconnect-game-assets",
    transformIndexHtml() {
      if (!/^https?:/.test(gameAssetsBaseUrl)) return;
      return [
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: new URL(gameAssetsBaseUrl).origin,
            crossorigin: true,
          },
          injectTo: "head",
        },
      ];
    },
  };
}

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
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      preconnectGameAssets(publicEnv.GAME_ASSETS_BASE_URL),
    ],
  };
});
