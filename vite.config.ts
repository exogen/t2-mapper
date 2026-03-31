import { defineConfig, loadEnv } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Only expose specific env vars to the client bundle — loadEnv requires a
  // prefix, so we load with each var's own prefix and pick the value out.
  const allEnv = loadEnv(mode, process.cwd(), "");
  const publicEnvKeys = ["LOG_LEVEL", "RELAY_URL"];
  const define: Record<string, string> = {};
  for (const key of publicEnvKeys) {
    define[`process.env.${key}`] = JSON.stringify(allEnv[key] ?? "");
  }
  return {
    base: "/t2-mapper/",
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
