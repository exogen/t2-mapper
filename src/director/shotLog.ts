/**
 * Console descriptions of director shots, for debugging by eye: every
 * line leads with the demo timestamp in the same mm:ss form as the seek
 * bar, so a shot seen at "18:45" can be quoted and found.
 */
import type { Shot, ShotAim, ShotSubject } from "./types";

/** Seek-bar style timestamp: 1121.6 → "18:41.6". */
export function demoClock(timeSec: number): string {
  const m = Math.floor(timeSec / 60);
  const s = timeSec - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}

function describeSubject(subject: ShotSubject | undefined | null): string {
  if (!subject) return "";
  return subject.type === "flag"
    ? `flag ${subject.slot}`
    : `player #${subject.targetId}`;
}

function describeAim(aim: ShotAim | undefined): string {
  if (!aim) return "drift";
  switch (aim.mode) {
    case "forward":
      return "aim forward";
    case "backward":
      return "aim back at pursuers";
    case "hold":
      return `aim held at ${((aim.yaw * 180) / Math.PI).toFixed(0)}°`;
    case "toward":
      return `aim toward [${aim.target.map((v) => v.toFixed(0)).join(", ")}]`;
  }
}

function describeFraming(shot: Shot): string {
  switch (shot.kind) {
    case "fixedOrbit":
      return (
        `at [${shot.center.map((v) => v.toFixed(0)).join(", ")}] ` +
        `r=${shot.radius.toFixed(0)}` +
        (shot.angularSpeed ? ` orbiting` : ` static`) +
        (shot.lookSubject
          ? ` panning on ${describeSubject(shot.lookSubject)}`
          : "")
      );
    case "followFlag":
      return (
        `following flag ${shot.slot}` +
        (shot.distance != null ? ` @${shot.distance.toFixed(0)}m` : "") +
        `, ${describeAim(shot.aim)}`
      );
    case "followPlayer":
      return (
        `following player #${shot.targetId}` +
        (shot.distance != null ? ` @${shot.distance.toFixed(0)}m` : "") +
        `, ${describeAim(shot.aim)}`
      );
    case "dolly":
      return `dolly on ${describeSubject(shot.subject)}`;
    case "sweep":
      return (
        `sweep [${shot.from.map((v) => v.toFixed(0)).join(", ")}] → ` +
        `[${shot.to.map((v) => v.toFixed(0)).join(", ")}]`
      );
  }
}

/**
 * One line per shot, e.g.:
 * `#142/256 18:41.6→18:53.5 fixedOrbit at [-459, -446, 128] r=12 static
 *  panning on flag 1 — "Storm flag held inside the base"`
 */
export function describeShot(shot: Shot, index: number, total: number): string {
  return (
    `#${index + 1}/${total} ` +
    `${demoClock(shot.startSec)}→${demoClock(shot.endSec)} ` +
    `${shot.kind} ${describeFraming(shot)}` +
    (shot.reason ? ` — "${shot.reason}"` : "")
  );
}
