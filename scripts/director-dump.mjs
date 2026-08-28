/**
 * Dump an auto-director dataset from a demo recording, via the running
 * dev server (the scanner needs the app's collision world and shape
 * pipeline, so this drives a headless browser rather than node).
 *
 *   node scripts/director-dump.mjs <demo.rec> <out-dataset.json> [appUrl]
 *
 * Run from the repository root with the dev server up. The .rec is
 * staged into public/ under a temporary name and removed afterwards.
 */
import puppeteer from "puppeteer";
import fs from "node:fs/promises";
import path from "node:path";

const [rec, out, appUrl = "http://localhost:3000"] = process.argv.slice(2);
if (!rec || !out) {
  console.error(
    "usage: node scripts/director-dump.mjs <demo.rec> <out-dataset.json> [appUrl]",
  );
  process.exit(1);
}

const staged = path.join("public", `director-dump-${process.pid}.rec`);
await fs.copyFile(rec, staged);
try {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("[page]", e.message));
    await page.goto(`${appUrl}/?mode=demo`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 2000));
    const dataset = await page.evaluate(async (recName) => {
      const urls = performance.getEntriesByType("resource").map((r) => r.name);
      const resolve = (p) => urls.find((n) => n.includes(p)) ?? p;
      const loader = await import(resolve("/src/stream/demoFileLoader"));
      const director = await import(resolve("/src/state/demoDirectorStore"));
      const engine = await import(resolve("/src/state/engineStore"));
      await loader.loadDemoUrl(`/${recName}`);
      await new Promise((res, rej) => {
        const t0 = Date.now();
        const poll = () => {
          if (engine.engineStore.getState().playback.recording != null) {
            res();
          } else if (Date.now() - t0 > 180000) rej(new Error("load timeout"));
          else setTimeout(poll, 250);
        };
        poll();
      });
      void director.startDirector();
      await new Promise((res, rej) => {
        const t0 = Date.now();
        const poll = () => {
          const st = director.demoDirectorStore.getState();
          if (st.status === "playing") res();
          else if (st.status === "error")
            rej(new Error(st.error ?? "scan failed"));
          else if (Date.now() - t0 > 900000) rej(new Error("scan timeout"));
          else setTimeout(poll, 500);
        };
        poll();
      });
      return JSON.stringify(director.demoDirectorStore.getState().dataset);
    }, path.basename(staged));
    await fs.writeFile(out, dataset);
    console.log(`${out}: ${dataset.length} bytes`);
  } finally {
    await browser.close();
  }
} finally {
  await fs.rm(staged, { force: true });
}
