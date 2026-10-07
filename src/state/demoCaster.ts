import type { StreamRecording } from "../stream/types";
import { casterStore } from "./casterStore";

const scopes = new WeakMap<
  StreamRecording,
  { id: string; readyTime: number; server: string }
>();

/** A demo's ghosting completion time distinguishes missions, including repeat maps. */
export function syncDemoCaster(
  recording: StreamRecording,
  ghostAlwaysDoneSec: number | null,
  sourceUrl: string | null,
): void {
  if (recording.source !== "demo") return;
  const readyTime = ghostAlwaysDoneSec ?? 0;
  let scope = scopes.get(recording);
  if (!scope || scope.readyTime !== readyTime) {
    const id = scope?.id ?? sourceUrl ?? crypto.randomUUID();
    scope = {
      id,
      readyTime,
      server: `demo:${JSON.stringify([id, readyTime])}`,
    };
    scopes.set(recording, scope);
  }
  const state = casterStore.getState();
  if (state.context?.server !== scope.server) {
    state.activate(scope.server, "demo", "");
  }
}
