import { createStore } from "zustand/vanilla";
import { streamClock } from "./streamPlaybackStore";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { createLogger } from "../logger";
import { engineStore } from "./engineStore";
import { cameraTourStore } from "./cameraTourStore";
import { commandCircuitStore } from "./commandCircuitStore";
import { commentaryPlayback, streamPlaybackStore } from "./streamPlaybackStore";

export { DIRECTOR_INTRO_LEAD_SEC } from "./directorStart";
import { directorStartSec } from "./directorStart";
import { demoLoadStore } from "./demoLoadStore";
import { DIRECTOR_ORBIT_TARGET_DAMPING } from "../director/cameraRig";
import { exitToFreeFly } from "./watchFollow";
import type { DirectorDataset, ShotPlan } from "../director/types";
import { planFromSidecar } from "../director/castSidecar";
import { sidecarUrl } from "../stream/demoIndex";

const log = createLogger("demoDirectorStore");

export type DirectorStatus =
  "idle" | "scanning" | "ready" | "playing" | "error";

/**
 * Auto-director state for the loaded demo. The scan/plan pipeline runs
 * lazily on the first button press (see startDirector); "playing" is the
 * lean-back mode where DirectorController drives the camera until F or
 * Escape (or the CastGenius button) exits back to free-fly.
 */
export interface DemoDirectorState {
  status: DirectorStatus;
  scanProgress: number | null;
  dataset: DirectorDataset | null;
  plan: ShotPlan | null;
  /**
   * How far the cast has been planned. The plan GROWS while it plays,
   * so running off the end of `plan.shots` is not the end of the
   * broadcast unless `planComplete` says so.
   */
  plannedToSec: number;
  planComplete: boolean;
  error: string | null;
}

export const demoDirectorStore = createStore<DemoDirectorState>()(() => ({
  status: "idle",
  scanProgress: null,
  dataset: null,
  plan: null,
  plannedToSec: 0,
  planComplete: false,
  error: null,
}));

/** How often the background planner tops the plan up. */
const PLAN_AHEAD_POLL_MS = 1000;

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
    plannedToSec: 0,
    planComplete: false,
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
  // Jump the dead air at the head of a recording: to a beat before the
  // commentary's first line when a track is loaded — that is where the
  // broadcast starts, on the bucket's legacy casts and the new ones
  // alike — else to the plan's own skip mark. Forward only. (Directing
  // ran from wherever the playhead sat for a while, on the grounds that
  // the new director covers the picking period; it does, but the 207
  // casts already in the bucket open on a quarter of an hour of a quiet
  // flag stand, and their commentary starts ten minutes in.) Live never
  // gets here: there is no head of a recording to seek past.
  const startAt = directorStartSec({
    nowSec: streamClock.time,
    introSec: commentaryPlayback.startSec,
    skipToSec: demoDirectorStore.getState().plan?.skipToSec,
  });
  const engine = engineStore.getState();
  if (startAt != null) {
    log.info(
      "Skipping to %ds (%s)",
      Math.round(startAt),
      commentaryPlayback.startSec != null
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
    const res = await fetch(sidecarUrl(sourceUrl, "cast.json"));
    if (!res.ok) return false;
    const plan = planFromSidecar(await res.json());
    if (!plan) return false;
    if (scanToken !== token) return false;
    log.info(
      "Adopted pre-generated cast plan: %d shots (%s)",
      plan.shots.length,
      plan.gameMode,
    );
    // A sidecar is a finished cast: past its last shot the broadcast is
    // over and control goes back to the viewer. Left false, the
    // controller held the final shot forever, waiting for a plan that
    // was never going to grow.
    demoDirectorStore.setState({
      status: "ready",
      scanProgress: null,
      dataset: null,
      plan,
      plannedToSec: plan.shots[plan.shots.length - 1].endSec,
      planComplete: true,
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
    const { scanDemoDirector } = await import("../stream/demoDirectorScanner");
    const dataset = await scanDemoDirector(demoBuffer, undefined, abort.signal);
    if (scanToken === token) {
      demoDirectorStore.setState({ dataset });
      log.info("Background dataset scan complete behind the sidecar plan");
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    log.warn("Background dataset scan failed: %o", err);
  }
}

/** How long the interior-collider registry must sit unchanged before
 *  the world counts as loaded, and the longest staging will wait. */
const COLLISION_QUIET_SEC = 4;
const COLLISION_WAIT_CEILING_SEC = 30;

/**
 * Resolve once the collision world looks fully loaded: at least one
 * interior registered and the registry quiet for a few seconds.
 * Bounded — a map with genuinely few interiors (or a stalled load)
 * proceeds at the ceiling rather than blocking the director forever.
 */
async function waitForCollisionWorld(signal: AbortSignal): Promise<void> {
  const { interiorColliderCount } = await import("../collision/worldCollision");
  const started = Date.now();
  let lastCount = interiorColliderCount();
  let quietSince = Date.now();
  for (;;) {
    if (signal.aborted) return;
    const elapsed = (Date.now() - started) / 1000;
    const count = interiorColliderCount();
    if (count !== lastCount) {
      lastCount = count;
      quietSince = Date.now();
    }
    const quiet = (Date.now() - quietSince) / 1000;
    if (count > 0 && quiet >= COLLISION_QUIET_SEC) return;
    if (elapsed >= COLLISION_WAIT_CEILING_SEC) {
      log.warn(
        "Collision world still settling after %ds (%d interiors) — staging anyway",
        Math.round(elapsed),
        count,
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
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
      error: "Demo download incomplete – CastGenius unavailable",
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
    // CastGenius scans and parses its own events from the raw stream —
    // no dependency on the app's timeline feature. The SEQUENCE lives in
    // director/castPipeline so the headless build cannot drift from it.
    // STREAMED, not scanned-then-planned. Walking the whole recording
    // first is 64% of the wait before anything plays, and none of it is
    // needed to choose the first shot — the director never looks past
    // now + lookahead. Measured on a 25-minute demo: 10.1s to 1.7s,
    // with the resulting plan identical shot for shot.
    const { createCastStream } = await import("../director/castPipeline");
    const stream = await createCastStream(demoBuffer, {
      signal: abort.signal,
      // On a cold start (the backfill's fresh page, a probe) the scan
      // can outrun the interior GLBs. BOTH the scan and the staging
      // pass raycast, so wait for the collider registry to go quiet
      // before either runs — with no world, every death reads as
      // airborne and every placement is certified against nothing.
      ensureWorld: () => waitForCollisionWorld(abort.signal),
    });
    if (scanToken !== token) return false;
    const plan = stream.plan;
    const dataset = stream.dataset;
    // NOT an error if it is empty right now. The director decides each
    // shot as its moment arrives, so at the two-second mark the opening
    // shot is still being framed and the plan is legitimately bare.
    // Treating that as "no cast for this recording" refused every demo.
    // FOLLOW THE PLAYHEAD, and nothing more.
    //
    // The stream can also be walked to the end — that is how a whole
    // .rec is cast for backfill — but never here. Doing that in the
    // browser is a batch job running behind a playing demo: it burns
    // the main thread on a future the viewer has not reached, and it is
    // what made playback stall for seconds at a time. On demand, the
    // director is live: it decides each shot as its moment arrives.
    void (async () => {
      try {
        while (scanToken === token) {
          await stream.advanceTo(streamClock.time);
          if (scanToken !== token) return;
          const done = stream.plannedToSec >= stream.durationSec;
          demoDirectorStore.setState({
            plan: stream.plan,
            dataset: stream.dataset,
            plannedToSec: stream.plannedToSec,
            // Only once the playhead has actually reached the end is
            // running off the plan the end of the broadcast.
            planComplete: done,
          });
          if (done && stream.plan.shots.length === 0) {
            // Watched to the end and never decided a shot: now it is
            // fair to say there is no cast here.
            demoDirectorStore.setState({
              status: "error",
              scanProgress: null,
              error: "No director plan for this recording",
            });
            return;
          }
          if (done) {
            log.info(
              "Cast complete: %d shots planned as it played",
              stream.plan.shots.length,
            );
            return;
          }
          await new Promise<void>((r) => setTimeout(r, PLAN_AHEAD_POLL_MS));
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        log.error("Cast streaming failed: %o", err);
      }
    })();
    demoDirectorStore.setState({
      status: "ready",
      scanProgress: null,
      dataset,
      plan,
      planComplete: false,
      plannedToSec: stream.plannedToSec,
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
