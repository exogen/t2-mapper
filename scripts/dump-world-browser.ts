/**
 * Emit the same world fingerprint as `dump-world.ts`, but from the REAL
 * app in a browser — so the headless world builder can be diffed
 * against the thing it is meant to reproduce.
 *
 * The dump functions read the shared collision registry rather than any
 * scene graph, so both stacks run identical code; the only difference
 * is who populated the registry (React components here, `HeadlessWorld`
 * there).
 *
 * Needs the dev server up (`npm start`). Stages the .rec into public/
 * so the page can fetch it, exactly as backfill-cast-plans.ts does.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.node.json scripts/dump-world-browser.ts \
 *     demos/foo.rec --at 120 --out browser-world.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { arg, positionals, usage } from "./lib/args";
import {
  APP_URL_DEFAULT,
  launchApp,
  loadDemoScript,
  openApp,
} from "./lib/browserApp";

const [demoPath] = positionals();
if (!demoPath) {
  usage(
    "dump-world-browser.ts <demo.rec> [--at 120] [--out world.json] [--app url]",
  );
}
const atSec = Number(arg("at", "120"));
const appUrl = arg("app", APP_URL_DEFAULT)!;
const outPath = arg("out", "browser-world.json")!;

const recName = `__worlddump_${path.basename(demoPath)}`;
const staged = path.join("public", recName);
await fs.copyFile(demoPath, staged);
console.error(`staged ${staged}`);

const browser = await launchApp();

try {
  const page = await openApp(browser, appUrl, /^\[dump\]/);
  const script = `(async () => {
    ${loadDemoScript(`/${recName}`)}
    const collision = await import(resolve("/src/collision/worldCollision"));
    const dump = await import("/src/world/worldDump.ts");
    console.log("[dump] demo loaded");

    // Seek to the same instant the headless dump used: statics and
    // force fields come and go with ghost scope, so the comparison is
    // only meaningful at a matching time.
    engine.engineStore.getState().seekPlayback(${atSec});

    // Wait for the world to finish mounting. Interiors load
    // asynchronously through Suspense, so poll until the collider count
    // stops growing rather than guessing a delay.
    await new Promise((res, rej) => {
      const t0 = Date.now();
      let last = -1;
      let stableFor = 0;
      const poll = () => {
        const n = collision.interiorColliderCount();
        if (n === last && n > 0) stableFor++;
        else { stableFor = 0; last = n; }
        if (stableFor >= 8) res();
        else if (Date.now() - t0 > 300000) rej(new Error("world load timeout"));
        else setTimeout(poll, 250);
      };
      poll();
    });
    const counts = collision.getWorldColliderCounts();
    console.log("[dump] world ready: " + JSON.stringify(counts));

    return JSON.stringify({
      demo: ${JSON.stringify(path.basename(demoPath))},
      atSec: ${atSec},
      counts,
      colliders: collision.getColliderDump(),
      fingerprint: dump.raycastFingerprint(),
    });
  })()`;

  const json = (await page.evaluate(script)) as string;
  await fs.writeFile(outPath, json);
  const parsed = JSON.parse(json);
  console.error(
    `wrote ${outPath}\ncounts: ${JSON.stringify(parsed.counts)}\n` +
      `rays: ${parsed.fingerprint.summary.hits}/${parsed.fingerprint.summary.total} hit ` +
      `(${JSON.stringify(parsed.fingerprint.summary.bySource)})`,
  );
} finally {
  await browser.close();
  await fs.rm(staged, { force: true });
}
