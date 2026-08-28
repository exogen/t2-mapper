/**
 * Replay the auto-director planner over dumped dataset JSONs (see
 * director-dump.mjs), check plan invariants, and diff plans — the
 * offline verification loop for planner changes.
 *
 *   npx tsx scripts/director-plan.ts <dataset.json...>
 *       Check invariants (overlaps, caps covered, coverage counts).
 *   npx tsx scripts/director-plan.ts <dataset.json...> --write <tag>
 *       Also write <dataset-dir>/<dataset-stem>-plan-<tag>.json.
 *   npx tsx scripts/director-plan.ts --diff <a-plan.json> <b-plan.json>
 *       Shot-level diff of two written plans.
 *
 * Run from the repository root. Dataset fixtures are large and live
 * outside the repo; regenerate them with director-dump.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { planShots } from "../src/director/planner";
import type { Shot, ShotPlan } from "../src/director/types";

const args = process.argv.slice(2);

function shotKey(s: Shot): string {
  return `${s.startSec.toFixed(1)} ${s.endSec.toFixed(1)} ${s.reason}`;
}

if (args[0] === "--diff") {
  const [a, b] = args.slice(1);
  const planA = JSON.parse(fs.readFileSync(a, "utf8")) as ShotPlan;
  const planB = JSON.parse(fs.readFileSync(b, "utf8")) as ShotPlan;
  const keysA = planA.shots.map(shotKey);
  const keysB = planB.shots.map(shotKey);
  const onlyA = keysA.filter((k) => !keysB.includes(k));
  const onlyB = keysB.filter((k) => !keysA.includes(k));
  console.log(
    `${a}: ${keysA.length} shots, ${b}: ${keysB.length} shots, changed: ${onlyA.length}/${onlyB.length}`,
  );
  for (const k of onlyA) console.log(" -", k);
  for (const k of onlyB) console.log(" +", k);
  process.exit(onlyA.length + onlyB.length > 0 ? 2 : 0);
}

const writeIdx = args.indexOf("--write");
const tag = writeIdx >= 0 ? args[writeIdx + 1] : null;
const datasets = args.filter(
  (a, i) => a !== "--write" && (writeIdx < 0 || i !== writeIdx + 1),
);
let failed = false;

for (const file of datasets) {
  const dataset = JSON.parse(fs.readFileSync(file, "utf8"));
  const plan = planShots(dataset);
  let overlaps = 0;
  for (let i = 1; i < plan.shots.length; i++) {
    if (plan.shots[i].startSec < plan.shots[i - 1].endSec - 1e-6) overlaps++;
    if (plan.shots[i].endSec <= plan.shots[i].startSec) overlaps++;
  }
  const uncovered = plan.coverage.filter((c) => !c.covered);
  const uncoveredCaps = uncovered.filter((c) => /captur/i.test(c.description));
  const ok = overlaps === 0 && uncoveredCaps.length === 0;
  if (!ok) failed = true;
  console.log(
    `${path.basename(file)}: ${plan.shots.length} shots | overlaps ${overlaps} | uncovered caps ${uncoveredCaps.length} | uncovered other ${uncovered.length - uncoveredCaps.length}${ok ? "" : "  ← INVARIANT FAILURE"}`,
  );
  if (tag) {
    const outFile = path.join(
      path.dirname(file),
      `${path.basename(file, ".json").replace(/-dataset$/, "")}-plan-${tag}.json`,
    );
    fs.writeFileSync(outFile, JSON.stringify(plan));
    console.log(`  wrote ${outFile}`);
  }
}
process.exit(failed ? 1 : 0);
