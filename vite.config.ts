import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

/**
 * Dev-server convenience: serve the /watch entry at /watch and /watch/
 * (production hosts resolve docs/watch/index.html for those URLs
 * natively, so this is dev-only parity).
 */
function watchEntryDevRewrite(): Plugin {
  return {
    name: "watch-entry-dev-rewrite",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Match on the pathname — req.url includes any query string
        // (e.g. /watch?name=…), which must survive in both branches.
        const url = new URL(req.url ?? "", "http://localhost");
        if (url.pathname === "/watch") {
          // Real redirect to the canonical trailing-slash URL, mirroring
          // Cloudflare/GitHub Pages resolving docs/watch/index.html.
          res.statusCode = 308;
          res.setHeader("Location", `/watch/${url.search}`);
          res.end();
          return;
        }
        if (url.pathname === "/watch/") {
          req.url = `/watch/index.html${url.search}`;
        }
        next();
      });
    },
  };
}

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
    // Public base URL serving the demo bucket (index.json + .rec files).
    // Empty disables the indexed-demo browser in demo mode.
    DEMOS_BASE_URL:
      allEnv.DEMOS_BASE_URL || "https://demos.tribes2.online/demos",
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
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL("index.html", import.meta.url)),
          watch: fileURLToPath(new URL("watch/index.html", import.meta.url)),
        },
      },
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      preconnectGameAssets(publicEnv.GAME_ASSETS_BASE_URL),
      watchEntryDevRewrite(),
    ],
  };
});
