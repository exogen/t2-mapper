import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createLogger } from "../logger";
import { engineStore } from "./engineStore";
import { cameraTourStore } from "./cameraTourStore";
import { commandCircuitStore } from "./commandCircuitStore";
import { demoTimelineStore } from "./demoTimelineStore";
import type { TimelineEvent } from "./demoTimelineStore";
import {
  commentaryPlayback,
  streamClock,
  streamPlaybackStore,
} from "./streamPlaybackStore";

/** Lead-in before the commentary's first line: enough that demo-seek
 *  tick granularity and clock settle can't swallow the opening word.
 *  Exported so the audio player pre-buffers at the same position. */
export const DIRECTOR_INTRO_LEAD_SEC = 2;
/** An intro claiming to start further than this before the plan's own
 *  skip point is treated as bad sidecar data and ignored. */
const DIRECTOR_INTRO_MAX_LEAD_SEC = 120;
import { demoLoadStore } from "./demoLoadStore";
import { DIRECTOR_ORBIT_TARGET_DAMPING } from "../director/cameraRig";
import { exitToFreeFly } from "./watchFollow";
import type { DirectorDataset, ShotPlan } from "../director/types";

const log = createLogger("demoDirectorStore");

export type DirectorStatus =
  "idle" | "scanning" | "ready" | "playing" | "error";

/**
 * Auto-director state for the loaded demo. The scan/plan pipeline runs
 * lazily on the first button press (see startDirector); "playing" is the
 * lean-back mode where DirectorController drives the camera and every
 * camera input maps to a single interrupt that exits back to free-fly.
 */
export interface DemoDirectorState {
  status: DirectorStatus;
  scanProgress: number | null;
  dataset: DirectorDataset | null;
  plan: ShotPlan | null;
  error: string | null;
}

export const demoDirectorStore = createStore<DemoDirectorState>()(() => ({
  status: "idle",
  scanProgress: null,
  dataset: null,
  plan: null,
  error: null,
}));

export function useDirector<T>(
  selector: (state: DemoDirectorState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(demoDirectorStore, selector, equality);
}

// The loaded demo's raw buffer (for the director's own scan pass) and
// in-flight scan bookkeeping. Module-level like demoFileLoader's token
// state: a new load or an unload always cancels the previous pipeline.
let demoBuffer: ArrayBuffer | null = null;
let scanAbort: AbortController | null = null;
let scanToken = 0;

/** Called by demoFileLoader when a demo loads, after resetDirector(). */
export function setDirectorDemoBuffer(buffer: ArrayBuffer): void {
  demoBuffer = buffer;
}

/** Cancel any scan and clear all director state (demo unload/replace). */
export function resetDirector(): void {
  scanToken += 1;
  scanAbort?.abort();
  scanAbort = null;
  demoBuffer = null;
  streamPlaybackStore.setState({ orbitTargetDamping: null });
  demoDirectorStore.setState({
    status: "idle",
    scanProgress: null,
    dataset: null,
    plan: null,
    error: null,
  });
}

/**
 * The auto-director play button: scan + plan on first press (cached
 * after), then enter lean-back directing from the current playback time.
 */
let startingDirector = false;

export async function startDirector(): Promise<void> {
  const { status, plan } = demoDirectorStore.getState();
  if (
    startingDirector ||
    status === "playing" ||
    status === "scanning" ||
    status === "error"
  ) {
    return;
  }
  startingDirector = true;
  try {
    if (!plan) {
      const ok = await prepareDirector();
      if (!ok) return;
    }
    // Hold for the commentary track's opening buffer (the gate resolves
    // once enough audio is loaded at the start position, on error, or
    // at its safety ceiling), showing the scan spinner meanwhile — the
    // broadcast should open with the booth talking, not buffering.
    if (commentaryGate) {
      demoDirectorStore.setState({ status: "scanning", scanProgress: 0 });
      try {
        await commentaryGate();
      } catch (err) {
        // The broadcast must start even if the pre-roll buffer hold
        // misbehaves — a gate failure is a degraded start, not a stop
        // (an unhandled throw here would strand status at "scanning").
        log.warn("commentary gate failed: %o", err);
      }
    }
  } finally {
    startingDirector = false;
  }
  beginDirecting();
}

/**
 * A pre-start hold registered by the commentary audio player: begin
 * fetching the track and resolve when it's ready to play — or after a
 * short deadline, so a slow download never stalls the director for
 * long. Registered only while commentary can actually play (component
 * mounted, audio enabled).
 */
let commentaryGate: (() => Promise<void>) | null = null;

export function setCommentaryGate(gate: (() => Promise<void>) | null): void {
  commentaryGate = gate;
}

/**
 * Exit directing back to free-fly. The camera stays exactly where the
 * last shot left it (free-fly never repositions); playback keeps going.
 */
export function exitDirector(): void {
  if (demoDirectorStore.getState().status !== "playing") return;
  demoDirectorStore.setState({ status: "ready" });
  streamPlaybackStore.setState({ orbitTargetDamping: null });
  exitToFreeFly();
}

function beginDirecting(): void {
  // The director owns the whole view: no tour or command circuit.
  cameraTourStore.getState().cancel();
  commandCircuitStore.getState().deactivate();
  demoDirectorStore.setState({ status: "playing" });
  // The director's follow camera rides a loose spring: the orbit target
  // eases through flag drops, passes and pickups instead of teleporting
  // with them. Manual follow keeps the rigid feel (cleared on exit).
  streamPlaybackStore.setState({
    orbitTargetDamping: DIRECTOR_ORBIT_TARGET_DAMPING,
  });
  // Jump the dead air at the head of a recording — a tournament demo can
  // spend a quarter of an hour on team-picking before the whistle, and
  // nobody wants to watch a filling server. When a commentary track is
  // on (its intro may open before the plan's first scene — server, map
  // and matchup announcements), start where the broadcast starts
  // instead, with a beat of lead-in. Only ever skips FORWARD, so it
  // never fights a viewer who has already seeked into the match.
  const skipTo = demoDirectorStore.getState().plan?.skipToSec;
  // A sane intro opens a little before the plan's first scene; a stale
  // or mismatched sidecar could claim one minutes earlier, which would
  // drag the viewer back into the pre-match dead air the skip exists
  // to avoid — ignore an intro that leads the skip by too much.
  const introSane =
    commentaryPlayback.startSec != null &&
    (skipTo == null ||
      skipTo - commentaryPlayback.startSec <= DIRECTOR_INTRO_MAX_LEAD_SEC);
  const introAt = introSane
    ? Math.max(0, commentaryPlayback.startSec! - DIRECTOR_INTRO_LEAD_SEC)
    : null;
  const startAt =
    introAt != null && skipTo != null
      ? Math.min(introAt, skipTo)
      : (introAt ?? skipTo);
  const engine = engineStore.getState();
  if (startAt != null && streamClock.time < startAt) {
    log.info(
      "Skipping to %ds (%s)",
      Math.round(startAt),
      introAt != null && introAt <= (skipTo ?? Infinity)
        ? "broadcast intro"
        : "past pre-match dead air",
    );
    engine.seekPlayback(startAt);
  }
  engine.setPlaybackStatus("playing");
}

/**
 * Whether a Three-space point sits on a flag stand from the scanned
 * dataset — the destination of a capture/return teleport. Pass a slot
 * to test that flag's own stand; omit it to test all stands.
 */
export function nearFlagStand(
  threePos: { x: number; z: number },
  slot?: number,
): boolean {
  const stands = demoDirectorStore.getState().dataset?.flagStands;
  if (!stands) return false;
  return stands.some(
    (st) =>
      (slot == null || st.slot === slot) &&
      Math.hypot(threePos.x - st.pos[1], threePos.z - st.pos[0]) <= 25,
  );
}

/** The sidecar schema this build understands (see backfill-cast-plans). */
const CAST_FORMAT = "castgenius-plan";
const CAST_VERSION = 1;

/**
 * Debug escape hatch (CAST_LOCAL_PLAN=1 in the env): force the
 * director to scan and plan in the browser, ignoring any pre-generated
 * .cast.json sidecar — for testing planner/scanner changes against
 * demos whose sidecars haven't been regenerated yet. Commentary audio
 * is suppressed too (its cues were authored against the sidecar plan,
 * so they'd describe shots the local plan no longer takes).
 */
export const CAST_LOCAL_PLAN =
  process.env.CAST_LOCAL_PLAN === "1" || process.env.CAST_LOCAL_PLAN === "true";

/**
 * Try the demo's pre-generated plan sidecar. True when a valid plan was
 * adopted; false (never throwing) falls back to the in-browser scan.
 */
async function adoptPlanSidecar(token: number): Promise<boolean> {
  const sourceUrl = demoLoadStore.getState().sourceUrl;
  if (!sourceUrl) return false;
  try {
    const res = await fetch(`${sourceUrl}.cast.json`);
    if (!res.ok) return false;
    const doc = (await res.json()) as {
      format?: string;
      version?: number;
      plan?: ShotPlan;
    };
    if (
      doc.format !== CAST_FORMAT ||
      doc.version !== CAST_VERSION ||
      !doc.plan?.shots?.length
    ) {
      return false;
    }
    if (scanToken !== token) return false;
    log.info(
      "Adopted pre-generated cast plan: %d shots (%s)",
      doc.plan.shots.length,
      doc.plan.gameMode,
    );
    demoDirectorStore.setState({
      status: "ready",
      scanProgress: null,
      dataset: null,
      plan: doc.plan,
      error: null,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Populate the dataset behind an adopted sidecar plan, so the runtime
 * features that read it come online. Deliberately does NOT re-plan.
 */
async function fillDatasetInBackground(
  token: number,
  abort: AbortController,
): Promise<void> {
  try {
    if (!demoBuffer) return;
    const events = await waitForTimelineEvents(abort.signal);
    const killEvents = demoTimelineStore.getState().killEvents ?? [];
    const { scanDemoDirector } = await import("../stream/demoDirectorScanner");
    const dataset = await scanDemoDirector(
      demoBuffer,
      events,
      killEvents,
      undefined,
      abort.signal,
    );
    if (scanToken === token) {
      demoDirectorStore.setState({ dataset });
      log.info("Background dataset scan complete behind the sidecar plan");
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    log.warn("Background dataset scan failed: %o", err);
  }
}

async function prepareDirector(): Promise<boolean> {
  if (!demoBuffer) {
    // Only reachable when a progressive download failed partway (the
    // button QUEUES instead of starting while a download runs): the
    // whole demo never arrived, so neither the scan nor the background
    // dataset pass behind a sidecar plan can run. Say so instead of
    // silently doing nothing.
    demoDirectorStore.setState({
      status: "error",
      error: "Demo download incomplete — CastGenius unavailable",
    });
    return false;
  }
  const token = ++scanToken;
  scanAbort?.abort();
  const abort = new AbortController();
  scanAbort = abort;
  demoDirectorStore.setState({
    status: "scanning",
    scanProgress: 0,
    error: null,
  });
  // A pre-generated plan sidecar (the R2 backfill's <demo>.cast.json)
  // skips the minutes-long scan entirely. The sidecar carries only the
  // PLAN; the dataset that powers runtime niceties (walked-path doorway
  // detection, home-stand checks) is filled by a background scan while
  // playback runs — those features degrade gracefully until it lands,
  // and the sidecar's shot list is never replaced mid-watch.
  if (CAST_LOCAL_PLAN) {
    log.info("CAST_LOCAL_PLAN — ignoring any cast sidecar, planning locally");
  } else if (await adoptPlanSidecar(token)) {
    void fillDatasetInBackground(token, abort);
    return true;
  }
  if (scanToken !== token) return false;
  try {
    // Wait out the timeline scan rather than walking the buffer twice
    // concurrently; the director's dataset embeds its events.
    const events = await waitForTimelineEvents(abort.signal);
    const killEvents = demoTimelineStore.getState().killEvents ?? [];
    const { scanDemoDirector } = await import("../stream/demoDirectorScanner");
    const dataset = await scanDemoDirector(
      demoBuffer,
      events,
      killEvents,
      (p) => {
        if (scanToken === token) {
          demoDirectorStore.setState({ scanProgress: p });
        }
      },
      abort.signal,
    );
    if (scanToken !== token) return false;
    const { planShots } = await import("../director/planner");
    const plan = planShots(dataset);
    if (scanToken !== token) return false;
    log.info(
      "Planned %d shots (%s), %d/%d events covered",
      plan.shots.length,
      plan.gameMode,
      plan.coverage.filter((c) => c.covered).length,
      plan.coverage.length,
    );
    if (plan.shots.length === 0) {
      demoDirectorStore.setState({
        status: "error",
        scanProgress: null,
        dataset,
        plan,
        error: "No director plan for this recording",
      });
      return false;
    }
    demoDirectorStore.setState({
      status: "ready",
      scanProgress: null,
      dataset,
      plan,
    });
    return true;
  } catch (err) {
    if (scanToken !== token) return false;
    if (err instanceof Error && err.name === "AbortError") return false;
    log.error("Director scan failed: %o", err);
    demoDirectorStore.setState({
      status: "error",
      scanProgress: null,
      error: "Couldn't analyze the demo",
    });
    return false;
  }
}

/**
 * Resolves with the timeline events once the background scan finishes
 * (empty if it never ran or failed — the director degrades to sample
 * data alone).
 */
function waitForTimelineEvents(signal: AbortSignal): Promise<TimelineEvent[]> {
  const state = demoTimelineStore.getState();
  if (state.events) return Promise.resolve(state.events);
  if (state.scanProgress == null) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const unsubscribe = demoTimelineStore.subscribe((s) => {
      if (s.events) {
        cleanup();
        resolve(s.events);
      } else if (s.scanProgress == null) {
        // Scan ended without events (failed/aborted) — don't wait forever.
        cleanup();
        resolve([]);
      }
    });
    signal.addEventListener("abort", onAbort);
  });
}
