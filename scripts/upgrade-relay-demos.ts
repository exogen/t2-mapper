/**
 * Rewrite relay recordings made before the Tribes2.exe compatibility fixes
 * as the current relay records them (scripts/lib/upgradeRelayDemo.ts).
 * Each upgraded demo is written to the output directory under its own
 * name; recordings that are already current are skipped unless their
 * welcome page needs rewriting.
 *
 * Usage: npx tsx scripts/upgrade-relay-demos.ts --out <dir> <demo.rec>...
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { formatDemoTime, upgradeRelayDemo } from "./lib/upgradeRelayDemo";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" } },
});
if (!values.out || positionals.length === 0) {
  console.error(
    "Usage: npx tsx scripts/upgrade-relay-demos.ts --out <dir> <demo.rec>...",
  );
  process.exit(1);
}
await fs.mkdir(values.out, { recursive: true });

let failed = 0;
for (const file of positionals) {
  const name = path.basename(file);
  try {
    const bytes = new Uint8Array(await fs.readFile(file));
    const output = path.join(values.out, name);
    const report = await upgradeRelayDemo(bytes, output);
    const welcomePage = report.gameOversRewritten
      ? `, welcome page rewritten`
      : "";
    if (report.generation === "current") {
      console.log(
        `${name}: ${welcomePage ? `current${welcomePage}` : "already current"}`,
      );
      continue;
    }
    const { size } = await fs.stat(output);
    console.log(
      `${name}: ${report.generation}` +
        `, ${formatDemoTime(report.oldLengthMs)} → ${formatDemoTime(report.newLengthMs)}` +
        ` (start ${report.cutMs} ms later` +
        (report.droppedTicks ? `, ${report.droppedTicks} ticks dropped` : "") +
        `)` +
        (report.ackedPackets ? `, ${report.ackedPackets} packets acked` : "") +
        (report.clampedPitches
          ? `, ${report.clampedPitches} camera pitches clamped`
          : "") +
        (report.clientId.new !== report.clientId.old
          ? `, client id ${report.clientId.old} → ${report.clientId.new}`
          : "") +
        welcomePage +
        `, ${bytes.length} → ${size} bytes` +
        (report.fallback ? `; FROM CONNECT: ${report.fallback}` : ""),
    );
  } catch (err) {
    failed++;
    console.error(`FAILED ${name}: ${String(err)}`);
  }
}
if (failed > 0) process.exitCode = 1;
