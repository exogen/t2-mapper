import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { gameEntityStore } from "./gameEntityStore";
import { liveConnectionStore } from "./liveConnectionStore";

export interface CommandCircuitState {
  active: boolean;
  /**
   * Demo playback: whether the view tracks the recording player or pans
   * freely under user control. Ignored in map mode (always free) AND in
   * live mode — there the fly/follow state is server-owned and shared
   * with the 3D observer view, so read it via `isCommandFollowActive()`
   * (or derive from the input mode in React) instead of this flag.
   */
  follow: boolean;
  /**
   * Enters command circuit mode. No-op until a map, demo, or live
   * stream is loaded.
   */
  activate(): void;
  deactivate(): void;
  toggle(): void;
  toggleFollow(): void;
  setFollow(follow: boolean): void;
  /**
   * Live mode: ask for the server-side fly/follow toggle (trigger 2) to
   * be sent with the next move. Set by the CC UI (F key, pan
   * auto-switch), consumed by the move emitter. While a toggle is in
   * flight (the observer mode hasn't changed since the last request),
   * further requests are ignored so held pan keys can't queue extra
   * toggles; a generous timeout allows a retry in case the request was
   * somehow dropped. The server correction in InputConsumer keeps the
   * derived follow state honest either way.
   */
  requestObserverToggle(): void;
  consumeObserverToggle(): boolean;
  /** @internal Consumed by the move emitter via consumeObserverToggle. */
  observerToggleRequested: boolean;
  /** @internal Loss-recovery deadline for the in-flight toggle. */
  _observerTogglePendingUntil: number;
  /** @internal Observer mode captured when the toggle was requested. */
  _observerToggleFromMode: string | null;
}

export const commandCircuitStore = createStore<CommandCircuitState>(
  (set, get) => ({
    active: false,
    follow: true,
    activate() {
      if (gameEntityStore.getState().dataSource == null) return;
      set({ active: true, follow: true, observerToggleRequested: false });
    },
    deactivate() {
      set({ active: false, observerToggleRequested: false });
    },
    toggle() {
      if (get().active) {
        get().deactivate();
      } else {
        get().activate();
      }
    },
    toggleFollow() {
      set({ follow: !get().follow });
    },
    setFollow(follow) {
      set({ follow });
    },
    observerToggleRequested: false,
    _observerTogglePendingUntil: 0,
    _observerToggleFromMode: null,
    requestObserverToggle() {
      const now = Date.now();
      const mode = liveConnectionStore.getState().adapter?.observerMode ?? null;
      // Still waiting on the last toggle (mode unchanged since the
      // request): ignore unless the loss-recovery deadline passed. Moves
      // are re-sent until acked, so a lost request is nearly impossible —
      // the deadline is a belt-and-suspenders escape hatch.
      if (
        mode === get()._observerToggleFromMode &&
        now < get()._observerTogglePendingUntil
      ) {
        return;
      }
      set({
        observerToggleRequested: true,
        _observerTogglePendingUntil: now + 1500,
        _observerToggleFromMode: mode,
      });
    },
    consumeObserverToggle() {
      if (!get().observerToggleRequested) return false;
      set({ observerToggleRequested: false });
      return true;
    },
  }),
);

/**
 * The effective command circuit follow state. Live mode reads the
 * server-owned fly/follow observer mode — the exact same state the 3D
 * observer view uses (kept in sync by InputConsumer's server camera
 * reconciliation) — so CC and non-CC can never disagree. Demo playback
 * uses the local flag. Non-reactive; for React rendering derive the live
 * half from the input mode instead.
 */
export function isCommandFollowActive(): boolean {
  if (gameEntityStore.getState().dataSource === "live") {
    return liveConnectionStore.getState().adapter?.observerMode === "follow";
  }
  return commandCircuitStore.getState().follow;
}

export function useCommandCircuit<T>(
  selector: (state: CommandCircuitState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(commandCircuitStore, selector, equality);
}
