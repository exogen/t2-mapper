import { parseScoreHudLine, stripTaggedStringMarkup } from "./shared.js";

/**
 * Pure decoders for the roster/score/team family of `ServerMessage`
 * events, shared by the relay's `WatchStateAccumulator` and the browser's
 * `StreamEngine` so the wire-format decoding (arg indices, flag-status
 * strings, debrief column offsets, score guards) lives in exactly one
 * place. Each side keeps its own state storage and side-effect hooks
 * (generation counters, match-started signals) and calls these to decode.
 */

export type FlagStatus = "home" | "field" | "held";
export type ResolveNetString = (s: string) => string;

/** A roster entry as these decoders mutate it — the shared subset both
 *  sides' entries structurally satisfy. */
export interface MutableRosterEntry {
  name: string;
  teamId: number;
  score: number;
  kills?: number;
}

/** $flagStatus[team] text → our enum. "<At Base>" / "<In the Field>" /
 *  otherwise a carrier name (or empty → home). */
export function decodeFlagStatus(statusText: string): FlagStatus {
  return statusText.startsWith("<At Base")
    ? "home"
    : statusText.startsWith("<In the Field")
      ? "field"
      : statusText
        ? "held"
        : "home";
}

export interface TeamAddDecoded {
  teamId: number;
  name: string;
  /** null when the message carries no usable score (Siege, or NaN) — the
   *  caller should leave an existing score untouched. */
  score: number | null;
  /** Present only for CTF (`MsgCTFAddTeam`), the only *AddTeam with flag
   *  state; the caller applies it just for that message. */
  flag?: { status: FlagStatus; carrier?: string };
}

/**
 * Decode `MsgCTFAddTeam` / `MsgCnHAddTeam` / `MsgHuntAddTeam` /
 * `MsgSiegeAddTeam`. Wire order: args[2]=teamId (1-based), args[3]=name.
 * CTF adds args[4]=flagStatus, args[5]=score; CnH/TeamHunters add
 * args[4]=score; Siege sends args[4]=isOffense (time-based scoring → no
 * score). Returns raw values (teamId may be ≤0/NaN — the caller guards
 * the upsert) or null if the message is too short to be one of these.
 */
export function decodeTeamAdd(
  msgType: string,
  args: string[],
  resolve: ResolveNetString,
): TeamAddDecoded | null {
  if (msgType === "MsgCTFAddTeam") {
    if (args.length < 6) return null;
    const teamId = parseInt(resolve(args[2]), 10);
    const name = stripTaggedStringMarkup(resolve(args[3]));
    const statusText = stripTaggedStringMarkup(resolve(args[4]));
    const status = decodeFlagStatus(statusText);
    const score = parseInt(resolve(args[5]), 10);
    const carrier =
      status === "held" ? statusText.trim() || undefined : undefined;
    return {
      teamId,
      name,
      score: isNaN(score) ? null : score,
      flag: { status, carrier },
    };
  }
  if (
    msgType === "MsgCnHAddTeam" ||
    msgType === "MsgHuntAddTeam" ||
    msgType === "MsgSiegeAddTeam"
  ) {
    if (args.length < 4) return null;
    const teamId = parseInt(resolve(args[2]), 10);
    const name = stripTaggedStringMarkup(resolve(args[3]));
    const score =
      msgType === "MsgSiegeAddTeam"
        ? NaN
        : parseInt(resolve(args[4] ?? ""), 10);
    return { teamId, name, score: isNaN(score) ? null : score };
  }
  return null;
}

export interface FlagEventDecoded {
  teamId: number;
  status: FlagStatus;
  /** Carrier name while held (empty otherwise). */
  carrier?: string;
}

/**
 * Decode the four `MsgCTFFlag*` events. CTFGame.cs sends the flag's team
 * as args[4] and the acting client's name as args[2]. Returns null if too
 * short; the caller looks up the team and applies status/carrier only if
 * the team exists.
 */
export function decodeFlagEvent(
  msgType: string,
  args: string[],
  resolve: ResolveNetString,
): FlagEventDecoded | null {
  if (args.length < 5) return null;
  const teamId = parseInt(resolve(args[4]), 10);
  const status: FlagStatus =
    msgType === "MsgCTFFlagTaken"
      ? "held"
      : msgType === "MsgCTFFlagDropped"
        ? "field"
        : "home";
  const actor = stripTaggedStringMarkup(resolve(args[2])).trim();
  return {
    teamId,
    status,
    carrier: status === "held" && actor ? actor : undefined,
  };
}

/**
 * Whether a fresh `MsgPlayerScore` value should replace the stored one.
 * The live score HUD (`SetLineHud`) is authoritative on servers
 * (TacoServer) whose `MsgPlayerScore` reports 0, so a 0 here must not
 * clobber a real score already applied — unless nothing real is stored.
 */
export function shouldReplaceScore(
  newScore: number,
  existingScore: number,
): boolean {
  return !isNaN(newScore) && (newScore !== 0 || existingScore === 0);
}

/**
 * Apply a live in-game score-HUD line (`SetLineHud`) to the roster,
 * matched by name — only real-team players (team-header / observer /
 * total rows match no roster name and are skipped). Returns whether any
 * entry changed (so callers can fire a change hook). The roster is passed
 * as anything with `values()` because a two-player stock line re-scans it
 * per player.
 */
export function applyScoreHudToRoster(
  args: string[],
  resolve: ResolveNetString,
  roster: { values(): IterableIterator<MutableRosterEntry> },
): boolean {
  const dataArgs = args.slice(5).map(resolve);
  let changed = false;
  for (const { name, score, kills } of parseScoreHudLine(dataArgs)) {
    for (const entry of roster.values()) {
      if (entry.teamId > 0 && entry.name === name) {
        entry.score = score;
        if (kills != null) entry.kills = kills;
        changed = true;
        break;
      }
    }
  }
  return changed;
}

/**
 * Apply an end-of-match debrief player row (`MsgDebriefAddLine`) to the
 * roster, matched by name — the debrief carries real final score/kills
 * even where the live channel reports 0 (TacoServer). Stock formats:
 *   multi-team: [_, "", format, name, team, score, kills]
 *   single-team:[_, "", format, name, score, kills]
 * distinguished by whether args[4] is numeric. Header/team/MOTD rows
 * match no roster name and are ignored. Returns whether an entry changed.
 */
export function applyDebriefRowToRoster(
  args: string[],
  resolve: ResolveNetString,
  roster: { values(): IterableIterator<MutableRosterEntry> },
): boolean {
  const name = stripTaggedStringMarkup(resolve(args[3] ?? "")).trim();
  if (!name) return false;
  const singleTeam = /^-?\d+$/.test(resolve(args[4] ?? ""));
  const score = parseInt(resolve(args[singleTeam ? 4 : 5] ?? ""), 10);
  const kills = parseInt(resolve(args[singleTeam ? 5 : 6] ?? ""), 10);
  if (isNaN(score)) return false;
  for (const entry of roster.values()) {
    if (entry.name === name) {
      entry.score = score;
      if (!isNaN(kills)) entry.kills = kills;
      return true;
    }
  }
  return false;
}
