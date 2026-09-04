/**
 * Produce a director cast plan in bare Node — the same pipeline
 * `demoDirectorStore` runs in the browser, with `HeadlessWorld` standing
 * in for the mounted React scene.
 *
 * Order matters and is the whole point. Both the SCAN (mid-air kill
 * detection) and the STAGING pass (fixed-camera placement, line of
 * sight) raycast the collision world, so the world has to exist before
 * either runs. Without it a headless scan silently marks every death
 * airborne and certifies cameras that stare into walls.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.node.json scripts/headless-cast.ts \
 *     demos/foo.rec [--out foo.rec.cast.json]
 *   npx tsx --tsconfig tsconfig.node.json scripts/headless-cast.ts \
 *     https://demos.tribes2.online/demos/foo.rec [--dir demos]
 *   npx tsx --tsconfig tsconfig.node.json scripts/headless-cast.ts \
 *     --diff a.json b.json
 *
 * A URL is downloaded into --dir (default demos/) under its own file
 * name — the name is the key every sidecar is found by — and skipped
 * if it is already there. Writes the same sidecar the R2 backfill
 * publishes, next to the demo by default: with LOCAL_CAST_DIR pointed
 * at that folder the app adopts it, and CastGenius writes its
 * commentary beside it.
 */
import fs from "node:fs";
import path from "node:path";
import { describeStaging, runCastPipeline } from "@/src/director/castPipeline";
import { HeadlessWorld } from "@/src/world/headlessWorld";
import { getWorldColliderCounts } from "@/src/collision/worldCollision";
import type { Shot, ShotPlan } from "@/src/director/types";
import {
  castSidecar,
  commentaryFromSidecar,
  type CastSidecar,
} from "@/src/director/castSidecar";
import { arg } from "./lib/args";
import { loadWorld, readDemo } from "./lib/demo";

function summarize(plan: ShotPlan): Record<string, unknown> {
  const events = plan.shots.flatMap((s) => s.scene?.events ?? []);
  const byType: Record<string, number> = {};
  for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1;
  const byKind: Record<string, number> = {};
  for (const s of plan.shots) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
  return {
    gameMode: plan.gameMode,
    shots: plan.shots.length,
    coverage: plan.coverage.length,
    covered: plan.coverage.filter((c) => c.covered).length,
    shotKinds: byKind,
    sceneEvents: byType,
  };
}

async function build(demoPath: string): Promise<CastSidecar> {
  const ab = readDemo(demoPath);

  // `--no-world` skips the world build, as a negative control: it
  // should make the plan DIVERGE from the browser's. If a run passes
  // without it, the comparison is not actually testing the geometry.
  const skipWorld = process.argv.includes("--no-world");
  if (skipWorld) {
    console.error("!! --no-world: skipping world build (negative control)");
  }

  const world = new HeadlessWorld();

  // Build the world at the first frame with a scene to render — where
  // the app itself sits after loading a demo, so both stacks stage
  // against the same geometry. The pipeline calls this before anything
  // raycasts; see director/castPipeline.
  const ensureWorld = async () => {
    const t0 = Date.now();
    const { readySec } = await loadWorld(ab, world);
    console.error(
      `world @ ${readySec.toFixed(1)}s in ${Date.now() - t0}ms: ` +
        `${JSON.stringify(world.stats())}\n` +
        `  registry: ${JSON.stringify(getWorldColliderCounts())}`,
    );
  };

  // Everything runs inside this world's collision context, so the scan
  // and the staging pass raycast THIS world — and a second cast in the
  // same process would see its own. There is no separate batch mode:
  // runCastPipeline IS the streaming director driven to the end of the
  // recording, so this script is exactly the "backfill a whole .rec"
  // path — the browser drives the very same stream to the playhead
  // instead.
  const { plan, staged } = await world.run(() =>
    runCastPipeline(ab, {
      ensureWorld: skipWorld ? undefined : ensureWorld,
    }),
  );

  console.error(
    `planned ${plan.shots.length} shots; staged ${describeStaging(staged)}`,
  );
  return castSidecar(plan, path.basename(demoPath));
}

/** Fetch a demo into `dir` under its own name; reuse it if present. */
async function download(url: string, dir: string): Promise<string> {
  const name = decodeURIComponent(new URL(url).pathname.split("/").pop()!);
  if (!name.endsWith(".rec")) throw new Error(`not a .rec URL: ${url}`);
  const dest = path.join(dir, name);
  if (fs.existsSync(dest)) {
    console.error(`using ${dest} (already downloaded)`);
    return dest;
  }
  const t0 = Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dest, bytes);
  console.error(
    `downloaded ${dest} (${(bytes.length / 1e6).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  return dest;
}

/** A shot's full identity INCLUDING `staged` — the camera placement
 *  that `stagePlan` solves by raycasting the collision world. Comparing
 *  only start/end/kind would pass even if every camera had been placed
 *  somewhere different, which is precisely what the world affects.
 *  Floats are rounded so last-bit noise doesn't read as a difference; a
 *  real placement difference is orders of magnitude larger. */
function shotKey(s: Shot): string {
  return JSON.stringify(s, (key, value) => {
    if (key === "scene") return undefined;
    return typeof value === "number" ? Math.round(value * 1e4) / 1e4 : value;
  });
}

/** Human-readable label for a shot that only differs in placement.
 *  `staged` is attached by stagePlan at runtime and is not on the Shot
 *  type, hence the widening. */
function shotLabel(key: string): string {
  const s = JSON.parse(key) as Shot & { staged?: unknown };
  return `${s.startSec}-${s.endSec} ${s.kind} ${JSON.stringify(s.staged ?? {})}`;
}

function reportDiff(aPath: string, bPath: string): void {
  const read = (p: string): ShotPlan => {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return (j.plan ?? j) as ShotPlan;
  };
  const a = read(aPath);
  const b = read(bPath);

  const sa = summarize(a);
  const sb = summarize(b);
  console.log("            headless        browser");
  for (const key of Object.keys(sa)) {
    const va = JSON.stringify(sa[key]);
    const vb = JSON.stringify(sb[key]);
    const mark = va === vb ? "  " : "✗ ";
    console.log(`${mark}${key.padEnd(12)} ${va.padEnd(15)} ${vb}`);
  }

  const keysA = a.shots.map(shotKey);
  const keysB = b.shots.map(shotKey);
  const setB = new Set(keysB);
  const setA = new Set(keysA);
  const onlyA = keysA.filter((k) => !setB.has(k));
  const onlyB = keysB.filter((k) => !setA.has(k));
  console.log(
    `\nshots: ${keysA.length} vs ${keysB.length}; ` +
      `${keysA.length - onlyA.length} identical, ` +
      `${onlyA.length} only in headless, ${onlyB.length} only in browser`,
  );
  for (const k of onlyA.slice(0, 6))
    console.log(`  headless only: ${shotLabel(k)}`);
  for (const k of onlyB.slice(0, 6))
    console.log(`  browser  only: ${shotLabel(k)}`);

  const clean = onlyA.length === 0 && onlyB.length === 0;
  console.log(clean ? "\n✓ plans are identical" : "\n✗ plans differ");
  process.exitCode = clean ? 0 : 1;
}

const diffIndex = process.argv.indexOf("--diff");
if (diffIndex >= 0) {
  reportDiff(process.argv[diffIndex + 1], process.argv[diffIndex + 2]);
} else {
  const demoArg = process.argv[2];
  if (!demoArg) {
    console.error(
      "usage: headless-cast.ts <demo.rec | https://…/demo.rec> [--out cast.json] [--dir demos]",
    );
    process.exit(1);
  }
  const t0 = Date.now();
  const demoPath = /^https?:\/\//.test(demoArg)
    ? await download(demoArg, arg("dir", "demos")!)
    : demoArg;
  const doc = await build(demoPath);
  // Next to the demo by default: that is where the app looks for it
  // (LOCAL_CAST_DIR), and where CastGenius writes commentary beside it.
  const out = arg("out", `${demoPath}.cast.json`)!;
  // The sidecar being replaced lists the commentary tracks made from
  // it; a re-cast keeps that list, or every re-cast would orphan them.
  if (fs.existsSync(out)) {
    try {
      const previous = commentaryFromSidecar(
        JSON.parse(fs.readFileSync(out, "utf8")),
      );
      if (previous.length > 0) doc.commentary = previous;
    } catch {
      // An unreadable old sidecar carries nothing over.
    }
  }
  fs.writeFileSync(out, JSON.stringify(doc, null, 2));
  const durationSec = doc.plan.matchFacts?.durationSec;
  console.error(
    `wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s` +
      (durationSec ? ` (${(durationSec / 60).toFixed(1)} min of demo)` : ""),
  );
  console.error(JSON.stringify(summarize(doc.plan), null, 2));
}
