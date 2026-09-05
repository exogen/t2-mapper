import fs from "node:fs";
import path from "node:path";
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

/** Where a local cast folder is served when CAST_BASE_URL does not say. */
const DEFAULT_LOCAL_CASTS_PATH = "/casts";

/**
 * Dev-only: serve a folder of cast sidecars for the app to find by the
 * same names it would use in the demo bucket.
 *
 * `LOCAL_CAST_DIR=demos` serves that folder AT CAST_BASE_URL — which
 * defaults to /casts when only the folder is given — so
 * `<name>.rec.cast.json`, `.commentary.json` and `.commentary.m4a`
 * generated locally are tried against demos that are still listed and
 * streamed from R2. Range requests are honoured, which the commentary
 * audio needs to seek.
 */
function localCasts(dir: string, mountPath: string): Plugin {
  const MIME: Record<string, string> = {
    ".json": "application/json",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
  };
  return {
    name: "local-casts",
    configureServer(server) {
      server.middlewares.use(mountPath, (req, res) => {
        const url = new URL(req.url ?? "", "http://localhost");
        const name = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
        // Files directly in the folder only. A miss is a real 404, not
        // the SPA fallback page: the demo loader trusts a 200.
        const file = path.join(dir, name);
        if (
          !name ||
          name.includes("/") ||
          name.includes("..") ||
          !fs.existsSync(file) ||
          !fs.statSync(file).isFile()
        ) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const size = fs.statSync(file).size;
        const type = MIME[path.extname(name)] ?? "application/octet-stream";
        res.setHeader("Content-Type", type);
        res.setHeader("Accept-Ranges", "bytes");
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
        if (range && size > 0) {
          const start = range[1] ? Number(range[1]) : size - Number(range[2]);
          const end = range[1] && range[2] ? Number(range[2]) : size - 1;
          if (start > end || end >= size) {
            res.statusCode = 416;
            res.setHeader("Content-Range", `bytes */${size}`);
            res.end();
            return;
          }
          res.statusCode = 206;
          res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
          res.setHeader("Content-Length", String(end - start + 1));
          fs.createReadStream(file, { start, end }).pipe(res);
          return;
        }
        res.setHeader("Content-Length", String(size));
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Only expose specific env vars to the client bundle — loadEnv requires a
  // prefix, so we load with each var's own prefix and pick the value out.
  const allEnv = loadEnv(mode, process.cwd(), "");
  // A local folder of cast sidecars, served by the dev server (see
  // localCasts).
  const localCastDir = allEnv.LOCAL_CAST_DIR
    ? path.resolve(allEnv.LOCAL_CAST_DIR)
    : "";
  const castBaseUrl =
    allEnv.CAST_BASE_URL || (localCastDir ? DEFAULT_LOCAL_CASTS_PATH : "");
  // The folder can only be served on this origin: the base must be a
  // path, not another host.
  if (localCastDir && !castBaseUrl.startsWith("/")) {
    throw new Error(
      `LOCAL_CAST_DIR is set, so CAST_BASE_URL must be a path on the dev server (like ${DEFAULT_LOCAL_CASTS_PATH}), not ${castBaseUrl}`,
    );
  }

  const publicEnv: Record<string, string> = {
    LOG_LEVEL: allEnv.LOG_LEVEL || "info",
    RELAY_URL: allEnv.RELAY_URL || "wss://t2-relay.fly.dev",
    // Public base URL serving the demo bucket (index.json + .rec files).
    // Empty disables the indexed-demo browser in demo mode.
    DEMOS_BASE_URL:
      allEnv.DEMOS_BASE_URL || "https://demos.tribes2.online/demos",
    // Where a demo's sidecars (.cast.json, .commentary.json/.mp3) are
    // fetched from, by the same names as in the bucket. Empty = the
    // bucket. With LOCAL_CAST_DIR this is also where that folder is
    // served.
    CAST_BASE_URL: castBaseUrl,
    // Debug: "1" makes CastGenius ignore pre-generated .cast.json
    // sidecars (and their commentary audio) and always scan/plan in
    // the browser — for testing director changes before regenerating.
    CAST_LOCAL_PLAN: allEnv.CAST_LOCAL_PLAN || "",
    // Cast generation's information horizon in seconds (the causal
    // director's lookahead). Empty = the default in director/tunables.
    CAST_LOOKAHEAD_SEC: allEnv.CAST_LOOKAHEAD_SEC || "",
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
    // Unknown paths 404, as they do on the static host. Vite's default
    // "spa" mode answers every miss with index.html, which hid a
    // sidecar route that was not mounted behind a page that loaded fine.
    appType: "mpa",
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
      ...(localCastDir
        ? [localCasts(localCastDir, castBaseUrl.replace(/\/+$/, ""))]
        : []),
    ],
  };
});
