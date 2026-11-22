/**
 * A time-bounded lens over a DirectorDataset: everything the causal
 * director may know at a moment. The switcher and predictors take a
 * CausalView, never the raw dataset — queries are clamped (and, for
 * explicit timestamps, asserted) to `now + DIRECTOR_LOOKAHEAD_SEC`,
 * which is what makes the same decisions honest over a delayed live
 * feed. Static pre-match knowledge (stands, teams, map span, geometry)
 * is exempt: a broadcast rigs before kickoff.
 *
 * `maxQueriedAhead` records the furthest any query has actually
 * reached past `now`, so tests can prove a whole planning run stayed
 * inside the horizon.
 */
import type {
  DirectorDataset,
  DirectorEvent,
  DirectorFlagSample,
  DirectorFlagStand,
  DirectorPlayerSample,
  DirectorVec3,
} from "./types";
import { DIRECTOR_LOOKAHEAD_SEC } from "./tunables";
import {
  buildFlagTracks,
  carryDestination,
  eventFlagSlot,
  playersAtSecFor,
  playerTracksFor,
  sampleAt,
  sampleIndexAt,
  type FlagTrack,
  type PlayersAtSec,
} from "./dataset";
import { dist } from "./geometry";

export class CausalView {
  dataset: DirectorDataset;
  readonly lookaheadSec: number;
  /** Live tail playback may have less than a full window of recorded input. */
  private readonly boundToDataset: boolean;
  /** Per-flag samples/grab times (the future-laced outPeriods stay
   *  private — only horizon-filtered queries touch them). */
  private tracks: Map<number, FlagTrack>;
  playersAtSec: PlayersAtSec;
  private _now = 0;
  private _maxQueriedAhead = 0;
  /** Events sorted by time, with a cursor for cheap range scans. */
  private eventsByTime: DirectorEvent[];
  /** The array `eventsByTime` was sorted from. */
  private eventsSource: DirectorEvent[];

  constructor(
    dataset: DirectorDataset,
    lookaheadSec = DIRECTOR_LOOKAHEAD_SEC,
    boundToDataset = false,
  ) {
    this.dataset = dataset;
    this.lookaheadSec = lookaheadSec;
    this.boundToDataset = boundToDataset;
    this.tracks = buildFlagTracks(dataset);
    this.playersAtSec = playersAtSecFor(dataset);
    this.eventsSource = dataset.events;
    this.eventsByTime = [...dataset.events].sort(
      (a, b) => a.timeSec - b.timeSec,
    );
  }

  /**
   * Point the view at a GROWN dataset.
   *
   * Streaming feeds the switcher a dataset that gets longer as the scan
   * walks the demo, and the derived caches here (flag tracks, the
   * per-second player index, the sorted event list) are built from it —
   * so they have to be rebuilt when it grows. Rebuilding is O(dataset),
   * which is why callers extend in slices rather than every tick.
   *
   * The clock is untouched: `now` and the causality proof carry over.
   */
  useDataset(dataset: DirectorDataset): void {
    if (dataset === this.dataset) return;
    this.dataset = dataset;
    // Both memoized on the sample arrays, which a streamed scan reuses
    // across slices — the object is new every time, the arrays grow.
    this.tracks = buildFlagTracks(dataset);
    this.playersAtSec = playersAtSecFor(dataset);
    if (
      dataset.events !== this.eventsSource ||
      dataset.events.length !== this.eventsByTime.length
    ) {
      this.eventsSource = dataset.events;
      this.eventsByTime = [...dataset.events].sort(
        (a, b) => a.timeSec - b.timeSec,
      );
    }
  }

  get now(): number {
    return this._now;
  }

  /** The edge of the knowable: now + the configured lookahead. */
  get horizon(): number {
    const horizon = this._now + this.lookaheadSec;
    return this.boundToDataset
      ? Math.min(horizon, this.dataset.durationSec)
      : horizon;
  }

  /** Furthest past `now` any query has reached — the causality proof. */
  get maxQueriedAhead(): number {
    return this._maxQueriedAhead;
  }

  advanceTo(t: number): void {
    if (t < this._now) {
      throw new Error(`CausalView time went backward: ${this._now} → ${t}`);
    }
    this._now = t;
  }

  private clamp(t: number): number {
    const clamped = Math.min(t, this.horizon);
    this._maxQueriedAhead = Math.max(
      this._maxQueriedAhead,
      clamped - this._now,
    );
    return clamped;
  }

  // ── Static pre-match knowledge ──

  get stands(): DirectorFlagStand[] {
    return this.dataset.flagStands;
  }

  standFor(slot: number): DirectorFlagStand | undefined {
    return this.dataset.flagStands.find((s) => s.slot === slot);
  }

  /** The carrier's destination: their OWN stand — the other flag's in
   *  stock CTF. Static map knowledge, not a prediction. */
  carryDestination(slot: number): DirectorVec3 | null {
    return carryDestination(slot, this.dataset);
  }

  flagSlots(): number[] {
    return [...this.tracks.keys()].sort((a, b) => a - b);
  }

  // ── Time-bounded state ──

  /** The flag's last sample at or before `t` (≤ horizon). */
  flagAt(slot: number, t = this._now): DirectorFlagSample | null {
    return sampleAt(this.tracks.get(slot)?.samples ?? [], this.clamp(t));
  }

  matchPhaseAt(t = this._now) {
    return sampleAt(this.dataset.matchPhases ?? [], this.clamp(t))?.phase;
  }

  /** Use the current bucket only after its samples have arrived. */
  playersAt(t = this._now): NonNullable<ReturnType<PlayersAtSec["get"]>> {
    const time = this.clamp(t);
    const sec = Math.round(time);
    const players = this.playersAtSec.get(sec);
    if (players?.length) {
      if (players[players.length - 1].timeSec <= time) return players;
      const known = players.filter((player) => player.timeSec <= time);
      if (known.length > 0) return known;
    }
    return this.playersAtSec.get(sec - 1) ?? [];
  }

  /** Events in [fromSec, toSec], the top clamped to the horizon. */
  eventsIn(fromSec: number, toSec: number): DirectorEvent[] {
    const to = this.clamp(toSec);
    // Linear from a binary-searched start; ranges here are short.
    const out: DirectorEvent[] = [];
    let lo = 0;
    let hi = this.eventsByTime.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.eventsByTime[mid].timeSec < fromSec) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < this.eventsByTime.length; i++) {
      const event = this.eventsByTime[i];
      if (event.timeSec > to) break;
      out.push(event);
    }
    return out;
  }

  /** Grab times in [fromSec, toSec ≤ horizon] for a flag. */
  grabsIn(slot: number, fromSec: number, toSec: number): number[] {
    const to = this.clamp(toSec);
    return (this.tracks.get(slot)?.grabTimes ?? []).filter(
      (t) => t >= fromSec && t <= to,
    );
  }

  /** Trailing length of the current "held" stretch, optionally capped at
   *  the duration the caller needs to distinguish. */
  trailingHeldSec(slot: number, limitSec = Infinity): number {
    const samples = this.tracks.get(slot)?.samples ?? [];
    let i = sampleIndexAt(samples, this._now);
    if (i < 0 || samples[i].status !== "held") return 0;
    const end = samples[i].timeSec;
    while (
      i > 0 &&
      end - samples[i].timeSec < limitSec &&
      samples[i - 1].status === "held"
    )
      i--;
    return Math.min(limitSec, end - samples[i].timeSec);
  }

  /** How long the flag has lain continuously in the FIELD as of now
   *  — the age of a parked flag, which is what makes it stale. */
  trailingFieldSec(slot: number): number {
    const samples = this.tracks.get(slot)?.samples ?? [];
    let i = samples.length - 1;
    while (i >= 0 && samples[i].timeSec > this._now) i--;
    if (i < 0 || samples[i].status !== "field") return 0;
    const end = samples[i].timeSec;
    while (i > 0 && samples[i - 1].status === "field") i--;
    return end - samples[i].timeSec;
  }

  /** Average speed of a flag over the trailing window (u/s). */
  trailingFlagSpeed(slot: number, windowSec: number): number | null {
    const samples = this.tracks.get(slot)?.samples ?? [];
    const from = this._now - windowSec;
    let travelled = 0;
    let first: DirectorFlagSample | null = null;
    let prev: DirectorFlagSample | null = null;
    for (const s of samples) {
      if (s.timeSec > this._now) break;
      if (s.timeSec < from) continue;
      if (prev) travelled += dist(prev.pos, s.pos);
      else first = s;
      prev = s;
    }
    if (!first || !prev || prev.timeSec <= first.timeSec) return null;
    return travelled / (prev.timeSec - first.timeSec);
  }

  /** Require a whole window of local movement. A run that loops back to
   *  its starting point is still a run. */
  flagStayedNear(slot: number, windowSec: number, radius: number): boolean {
    const samples = this.tracks.get(slot)?.samples ?? [];
    const end = sampleIndexAt(samples, this._now);
    const start = sampleIndexAt(samples, this._now - windowSec);
    if (start < 0 || end <= start) return false;
    if (this._now - samples[start].timeSec > windowSec + 3) return false;
    const pos = samples[end].pos;
    for (let i = start; i < end; i++) {
      if (dist(samples[i].pos, pos) > radius) return false;
    }
    return true;
  }

  /** A player's last sample at or before `t` (≤ horizon), scanning the
   *  trailing few seconds of the per-second buckets. */
  playerAt(targetId: number, t = this._now): DirectorPlayerSample | null {
    const to = this.clamp(t);
    const sample = sampleAt(
      playerTracksFor(this.dataset).get(targetId) ?? [],
      to,
    );
    return sample && to - sample.timeSec <= 3 ? sample : null;
  }

  /** Entity-state deaths in [fromSec, toSec ≤ horizon] — present in
   *  every recording, unlike kill chat events (relay/observer demos
   *  carry none of those). */
  deathsIn(fromSec: number, toSec: number): DirectorDataset["deaths"] {
    const to = this.clamp(toSec);
    return this.dataset.deaths.filter(
      (d) => d.timeSec >= fromSec && d.timeSec <= to,
    );
  }

  // ── The peek: exact knowledge inside (now, horizon] ──

  /** Tier-1 flag events for `slot` inside the peek window. */
  peekFlagEvents(
    slot: number | null,
    types: readonly string[],
  ): DirectorEvent[] {
    return this.eventsIn(this._now, this.horizon).filter(
      (e) =>
        e.timeSec > this._now &&
        types.includes(e.type) &&
        (slot == null || this.eventSlot(e) === slot),
    );
  }

  /** Resolve an event's flag slot via its team name. */
  eventSlot(event: DirectorEvent): number | null {
    return eventFlagSlot(event, this.dataset);
  }
}
