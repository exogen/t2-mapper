import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";

export type DemoLoadPhase = "idle" | "downloading" | "parsing" | "error";

/**
 * Progress of a demo load (indexed download or local file) between
 * selection and the recording appearing — drives the drop screen's
 * feedback while demoFileLoader works.
 */
export interface DemoLoadState {
  phase: DemoLoadPhase;
  /**
   * Download progress 0..1, or null when indeterminate.
   */
  progress: number | null;
  /**
   * Failure message; cleared when the next load begins.
   */
  error: string | null;
  /**
   * The URL the current demo was loaded from (null for local files).
   * Outlives reset() — it describes the loaded demo, not the load.
   */
  sourceUrl: string | null;
  /**
   * Demo time downloaded so far (seconds) while a progressive load is
   * still running, or null when complete / not applicable — drives the
   * buffered bar under the seek control. Outlives reset(): the bar
   * shows exactly while the demo plays mid-download.
   */
  downloadedSec: number | null;
  begin(phase: "downloading" | "parsing"): void;
  setProgress(progress: number | null): void;
  setDownloadedSec(downloadedSec: number | null): void;
  fail(error: string): void;
  setSourceUrl(sourceUrl: string | null): void;
  reset(): void;
}

export const demoLoadStore = createStore<DemoLoadState>((set) => ({
  phase: "idle",
  progress: null,
  error: null,
  sourceUrl: null,
  downloadedSec: null,
  begin(phase) {
    set({ phase, progress: null, error: null, downloadedSec: null });
  },
  setProgress(progress) {
    set({ progress });
  },
  setDownloadedSec(downloadedSec) {
    set({ downloadedSec });
  },
  fail(error) {
    set({ phase: "error", progress: null, error });
  },
  setSourceUrl(sourceUrl) {
    set({ sourceUrl });
  },
  reset() {
    set({ phase: "idle", progress: null, error: null });
  },
}));

export function useDemoLoad<T>(
  selector: (state: DemoLoadState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(demoLoadStore, selector, equality);
}
