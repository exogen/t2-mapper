import { classifyDevice, type DeviceSignals } from "../deviceConstraints";
import { deviceTierValue, performanceTuning } from "../performanceTuning";

/** Entry budgets, not estimates of the decoded graph's retained bytes. */
export interface CheckpointMemoryPolicy {
  sessionEntries: number;
  importedEntries: number;
}

/** Browser callers opt into these budgets; offline readers keep all anchors. */
export function browserCheckpointMemoryPolicy(
  signals: DeviceSignals,
): CheckpointMemoryPolicy {
  const { constrained } = classifyDevice(signals);
  return {
    sessionEntries: deviceTierValue(
      performanceTuning.browserCheckpoints.sessionEntries,
      constrained,
    ),
    importedEntries: deviceTierValue(
      performanceTuning.browserCheckpoints.importedEntries,
      constrained,
    ),
  };
}

/** Keep recent boundaries plus progressively sparse anchors over older history. */
export function retainedSessionCheckpointTicks(
  ticks: readonly number[],
  limit: number,
): Set<number> {
  if (!Number.isFinite(limit) || ticks.length <= limit) return new Set(ticks);
  limit = Math.max(0, Math.floor(limit));
  if (!limit) return new Set();
  const sorted = [...ticks].sort((a, b) => a - b);
  const recentCount = Math.ceil(limit / 2);
  const recent = sorted.slice(-recentCount);
  const older = sorted.slice(0, -recentCount);
  const anchorCount = limit - recentCount;
  const retained = new Set(recent);
  for (let i = 0; i < anchorCount; i++) {
    const index =
      anchorCount === 1
        ? 0
        : Math.round((i * (older.length - 1)) / (anchorCount - 1));
    retained.add(older[index]);
  }
  return retained;
}
