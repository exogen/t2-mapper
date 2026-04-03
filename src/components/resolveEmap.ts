/**
 * Resolve the `emap` flag from a datablock. Works for both streaming mode
 * (numeric datablock ID) and mission mode (name-based lookup).
 */

import { engineStore } from "../state/engineStore";

export function resolveEmapFromDatablock(
  dataBlockId?: number,
  dataBlockName?: string,
): boolean {
  // Streaming mode: look up by numeric ID.
  if (dataBlockId != null) {
    const sp = engineStore.getState().playback.recording?.streamingPlayback;
    if (sp) {
      const db = sp.getDataBlockData(dataBlockId);
      return !!db?.emap;
    }
  }
  // Mission mode: look up by name via TorqueScript runtime.
  if (dataBlockName) {
    const runtime = engineStore.getState().runtime.runtime;
    if (runtime) {
      const db = runtime.state.datablocks.get(dataBlockName);
      return !!db?.emap;
    }
  }
  return false;
}

/** Resolve emap for a mounted image by its datablock ID. */
export function resolveEmapFromImageSlot(imageDataBlockId?: number): boolean {
  if (imageDataBlockId == null) return false;
  const sp = engineStore.getState().playback.recording?.streamingPlayback;
  if (sp) {
    const db = sp.getDataBlockData(imageDataBlockId);
    return !!db?.emap;
  }
  return false;
}
