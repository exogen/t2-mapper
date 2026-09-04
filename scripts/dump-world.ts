/**
 * Build the world headlessly from a demo and dump its fingerprint, for
 * comparing against the browser's build of the same map.
 *
 * Two dumps of the same demo must agree exactly. When they do not, the
 * collider dump names the interior whose transform is wrong, and the
 * raycast diff shows where the geometry actually ends up.
 *
 * Usage:
 *   npx tsx scripts/dump-world.ts <demo.rec> [--at 120] [--out world.json]
 *   npx tsx scripts/dump-world.ts --diff a.json b.json
 */
import fs from "node:fs";
import { HeadlessWorld } from "@/src/world/headlessWorld";
import {
  getColliderDump,
  type ColliderDumpEntry,
} from "@/src/collision/worldCollision";
import {
  diffFingerprints,
  raycastFingerprint,
  type WorldFingerprint,
} from "@/src/world/worldDump";
import { arg, positionals, usage } from "./lib/args";
import { readDemo } from "./lib/demo";
import { createDemoStreamingRecording } from "@/src/stream/demoStreaming";

interface WorldDump {
  demo: string;
  atSec: number;
  stats: ReturnType<HeadlessWorld["stats"]>;
  colliders: ColliderDumpEntry[];
  fingerprint: WorldFingerprint;
}

async function build(demoPath: string, atSec: number): Promise<WorldDump> {
  const ab = readDemo(demoPath);

  const started = Date.now();
  const recording = await createDemoStreamingRecording(ab);
  const snapshot = recording.streamingPlayback.stepToTime(atSec);
  const stepped = Date.now();

  const world = new HeadlessWorld();
  await world.sync(snapshot.entities as never);
  const built = Date.now();

  // Inside `world.run`, or the registry reads resolve to the shared
  // default world — which is empty — and the dump silently comes back
  // with no colliders and every ray missing.
  const dump: WorldDump = await world.run(() => ({
    demo: demoPath.split("/").pop()!,
    atSec,
    stats: world.stats(),
    colliders: getColliderDump(),
    fingerprint: raycastFingerprint(),
  }));

  console.error(
    `stepped to ${atSec}s in ${stepped - started}ms, world built in ${built - stepped}ms, ` +
      `fingerprint in ${Date.now() - built}ms`,
  );
  return dump;
}

function reportDiff(aPath: string, bPath: string): void {
  const a: WorldDump = JSON.parse(fs.readFileSync(aPath, "utf8"));
  const b: WorldDump = JSON.parse(fs.readFileSync(bPath, "utf8"));

  // 1. Collider placement.
  const key = (c: ColliderDumpEntry) => `${c.kind}:${c.id}:${c.mesh}`;
  const bById = new Map(b.colliders.map((c) => [key(c), c]));
  let matrixMismatches = 0;
  let missing = 0;
  for (const ca of a.colliders) {
    const cb = bById.get(key(ca));
    if (!cb) {
      missing++;
      continue;
    }
    const differs = ca.matrixWorld.some(
      (v, i) => Math.abs(v - cb.matrixWorld[i]) > 1e-4,
    );
    if (differs) {
      if (matrixMismatches < 5) {
        console.log(`\nmatrix differs: ${key(ca)}`);
        console.log(
          `  a: ${ca.matrixWorld.map((n) => n.toFixed(2)).join(" ")}`,
        );
        console.log(
          `  b: ${cb.matrixWorld.map((n) => n.toFixed(2)).join(" ")}`,
        );
      }
      matrixMismatches++;
    }
  }

  console.log(`\ncolliders: ${a.colliders.length} vs ${b.colliders.length}`);
  console.log(`  matrix mismatches: ${matrixMismatches}`);
  console.log(`  present in a, absent in b: ${missing}`);

  // 2. What the rays actually see.
  const rays = diffFingerprints(a.fingerprint, b.fingerprint);
  const total = a.fingerprint.probes.length;
  console.log(`\nrays: ${rays.matched}/${total} identical`);
  for (const d of rays.differing.slice(0, 10)) {
    const fmt = (h: typeof d.a) => (h ? `${h.source}@z=${h.z}` : "MISS");
    console.log(`  (${d.x}, ${d.y}): ${fmt(d.a)} → ${fmt(d.b)}`);
  }
  if (rays.differing.length > 10) {
    console.log(`  … and ${rays.differing.length - 10} more`);
  }

  const clean =
    matrixMismatches === 0 && missing === 0 && rays.differing.length === 0;
  console.log(clean ? "\n✓ worlds are identical" : "\n✗ worlds differ");
  process.exitCode = clean ? 0 : 1;
}

const diffIndex = process.argv.indexOf("--diff");
if (diffIndex >= 0) {
  reportDiff(process.argv[diffIndex + 1], process.argv[diffIndex + 2]);
} else {
  const [demoPath] = positionals();
  if (!demoPath)
    usage("dump-world.ts <demo.rec> [--at 120] [--out world.json]");
  const dump = await build(demoPath, Number(arg("at", "120")));
  const out = arg("out");
  const json = JSON.stringify(dump, null, 2);
  if (out) {
    fs.writeFileSync(out, json);
    console.error(`wrote ${out}`);
  } else {
    console.log(json);
  }
  console.error(
    `stats: ${JSON.stringify(dump.stats)}\n` +
      `rays: ${dump.fingerprint.summary.hits}/${dump.fingerprint.summary.total} hit ` +
      `(${JSON.stringify(dump.fingerprint.summary.bySource)})`,
  );
}
