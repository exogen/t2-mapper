import { normalizePlayerGuid, stripTaggedStringMarkup } from "./shared.js";
import {
  applyDebriefRowToRoster,
  applyScoreHudToRoster,
  decodeFlagEvent,
  decodeTeamAdd,
  shouldReplaceScore,
  type FlagStatus,
  type ResolveNetString,
} from "./serverMessageDecode.js";

/** Protocol state shared by browser playback and relay catch-up. */
export interface ServerMessageRosterEntry {
  /** Markup-stripped name for matching; rawName retains scoreboard colors. */
  name: string;
  rawName: string;
  guid?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  /** Explicit MsgClientJoin flag; absent if the server omitted it. */
  isSmurf?: boolean;
  targetId?: number;
  teamId: number;
  score: number;
  ping: number;
  packetLoss: number;
  kills?: number;
}

export interface ServerMessageTeamScore {
  teamId: number;
  name: string;
  score: number;
  flagStatus?: FlagStatus;
  flagCarrier?: string;
}

export interface ServerMessageChanges {
  /** Accepted updates invalidate browser snapshots even if values are equal. */
  readonly rosterChanged?: boolean;
  readonly teamScoresChanged?: boolean;
  /** Membership, name or team updates that the relay records in wire order. */
  readonly rosterMetadataChanged?: boolean;
  /** A positive objective score signals a running match, even for an unknown team. */
  readonly matchStarted?: boolean;
  readonly joinedClientId?: number;
  /** The adapter propagates this rename to its target tables / rendered entities. */
  readonly renamedPlayer?: ServerMessageRosterEntry;
}

const NO_CHANGES: ServerMessageChanges = {};

/**
 * Apply roster, score and flag messages without retaining state references.
 * Callers pass their current collections (including after checkpoint restore)
 * and consume effects immediately, before the next message. Identity detection,
 * time sources, target/entity updates and notification hooks remain local.
 *
 * The team factory preserves adapter fields: browser teams start with
 * playerCount=0, while relay payloads contain only the protocol fields.
 * null means the message belongs to the adapter; malformed recognized messages
 * return no effects and leave state untouched.
 */
export function applyServerMessageState<Team extends ServerMessageTeamScore>(
  msgType: string,
  args: string[],
  resolve: ResolveNetString,
  state: {
    playerRoster: Map<number, ServerMessageRosterEntry>;
    teamScores: Team[];
  },
  createTeam: (entry: ServerMessageTeamScore) => Team,
): ServerMessageChanges | null {
  const { playerRoster, teamScores } = state;
  switch (msgType) {
    case "MsgTeamScoreIs":
    case "MsgTeamScore": {
      if (args.length < 4) return NO_CHANGES;
      const teamId = parseInt(resolve(args[2]), 10);
      const score = parseInt(resolve(args[3]), 10);
      if (isNaN(teamId) || isNaN(score)) return NO_CHANGES;
      const team = teamScores.find((entry) => entry.teamId === teamId);
      if (team) team.score = score;
      return { teamScoresChanged: !!team, matchStarted: score > 0 };
    }
    case "MsgCTFAddTeam":
    case "MsgCnHAddTeam":
    case "MsgHuntAddTeam":
    case "MsgSiegeAddTeam": {
      const decoded = decodeTeamAdd(msgType, args, resolve);
      if (!decoded) return NO_CHANGES;
      // Only CTF's AddTeam score describes match progress. Siege's value
      // denotes offense; other modes retain their existing start signals.
      const matchStarted =
        msgType === "MsgCTFAddTeam" && (decoded.score ?? 0) > 0;
      if (isNaN(decoded.teamId) || decoded.teamId <= 0) return { matchStarted };
      const team = teamScores.find((entry) => entry.teamId === decoded.teamId);
      if (team) {
        team.name = decoded.name;
        if (decoded.score != null) team.score = decoded.score;
        if (decoded.flag) {
          team.flagStatus = decoded.flag.status;
          team.flagCarrier = decoded.flag.carrier;
        }
      } else {
        teamScores.push(
          createTeam({
            teamId: decoded.teamId,
            name: decoded.name,
            score: decoded.score ?? 0,
            ...(decoded.flag && {
              flagStatus: decoded.flag.status,
              flagCarrier: decoded.flag.carrier,
            }),
          }),
        );
      }
      return { teamScoresChanged: true, matchStarted };
    }
    case "MsgCTFFlagTaken":
    case "MsgCTFFlagDropped":
    case "MsgCTFFlagReturned":
    case "MsgCTFFlagCapped": {
      const decoded = decodeFlagEvent(msgType, args, resolve);
      if (!decoded) return NO_CHANGES;
      const team = teamScores.find((entry) => entry.teamId === decoded.teamId);
      if (!team) return NO_CHANGES;
      team.flagStatus = decoded.status;
      team.flagCarrier = decoded.carrier;
      return { teamScoresChanged: true };
    }
    case "MsgClientJoin": {
      if (args.length < 4) return NO_CHANGES;
      const clientId = parseInt(resolve(args[3]), 10);
      if (isNaN(clientId)) return NO_CHANGES;
      const rawName = resolve(args[2]);
      const targetId = parseInt(resolve(args[4] ?? ""), 10);
      const smurf = resolve(args[8] ?? "");
      // message.cs handleClientJoin replaces an existing client entry,
      // clearing scores, team and identity left by a previous connection.
      playerRoster.set(clientId, {
        name: stripTaggedStringMarkup(rawName).trim(),
        rawName,
        guid: normalizePlayerGuid(resolve(args[9] ?? "")),
        ...(resolve(args[6] ?? "") === "1" && { isAdmin: true }),
        ...(resolve(args[7] ?? "") === "1" && { isSuperAdmin: true }),
        ...((smurf === "0" || smurf === "1") && { isSmurf: smurf === "1" }),
        targetId: isNaN(targetId) ? undefined : targetId,
        teamId: 0,
        score: 0,
        ping: 0,
        packetLoss: 0,
      });
      return {
        rosterChanged: true,
        rosterMetadataChanged: true,
        joinedClientId: clientId,
      };
    }
    case "MsgClientDrop": {
      if (args.length < 4) return NO_CHANGES;
      const clientId = parseInt(resolve(args[3]), 10);
      if (isNaN(clientId)) return NO_CHANGES;
      const deleted = playerRoster.delete(clientId);
      return { rosterChanged: true, rosterMetadataChanged: deleted };
    }
    case "MsgAdminPlayer":
    case "MsgAdminAdminPlayer":
    case "MsgSuperAdminPlayer":
    case "MsgStripAdminPlayer": {
      // Stock LobbyGui.cs promotions; TacoServer's broadcast strip message
      // carries the target after the two names, not in the first argument.
      const id = resolve(args[msgType === "MsgStripAdminPlayer" ? 4 : 2] ?? "");
      const entry = /^\d+$/.test(id) ? playerRoster.get(Number(id)) : undefined;
      if (!entry) return NO_CHANGES;
      if (msgType === "MsgStripAdminPlayer") {
        delete entry.isAdmin;
        delete entry.isSuperAdmin;
      } else {
        entry.isAdmin = true;
        if (msgType === "MsgSuperAdminPlayer") entry.isSuperAdmin = true;
      }
      return { rosterChanged: true };
    }
    case "MsgClientNameChanged": {
      if (args.length < 5) return NO_CHANGES;
      const rawName = resolve(args[3]);
      const name = stripTaggedStringMarkup(rawName).trim();
      const clientId = parseInt(resolve(args[4]), 10);
      const entry = isNaN(clientId) ? undefined : playerRoster.get(clientId);
      // Empty/markup-only names cannot match score rows. Ignore them on
      // both sides so catch-up does not erase a name the browser retained.
      if (!entry || !name) return NO_CHANGES;
      entry.name = name;
      entry.rawName = rawName;
      return {
        rosterChanged: true,
        rosterMetadataChanged: true,
        renamedPlayer: entry,
      };
    }
    case "MsgClientJoinTeam": {
      if (args.length < 6) return NO_CHANGES;
      const clientId = parseInt(resolve(args[4]), 10);
      const teamId = parseInt(resolve(args[5]), 10);
      if (isNaN(clientId) || isNaN(teamId)) return NO_CHANGES;
      const entry = playerRoster.get(clientId);
      if (entry) {
        entry.teamId = teamId;
      } else {
        playerRoster.set(clientId, {
          name: "",
          rawName: "",
          teamId,
          score: 0,
          ping: 0,
          packetLoss: 0,
        });
      }
      return { rosterChanged: true, rosterMetadataChanged: true };
    }
    case "MsgPlayerScore": {
      if (args.length < 5) return NO_CHANGES;
      const clientId = parseInt(resolve(args[2]), 10);
      const entry = isNaN(clientId) ? undefined : playerRoster.get(clientId);
      // scoreList.cs ignores scores for clients that have not joined.
      if (!entry) return NO_CHANGES;
      const score = parseInt(resolve(args[3]), 10);
      const ping = parseInt(resolve(args[4]), 10);
      const packetLoss = parseInt(resolve(args[5] ?? ""), 10);
      if (shouldReplaceScore(score, entry.score)) entry.score = score;
      if (!isNaN(ping)) entry.ping = ping;
      if (!isNaN(packetLoss)) entry.packetLoss = packetLoss;
      return { rosterChanged: true };
    }
    case "SetLineHud":
      return args.length >= 7
        ? { rosterChanged: applyScoreHudToRoster(args, resolve, playerRoster) }
        : NO_CHANGES;
    case "MsgDebriefAddLine":
      return args.length >= 5
        ? {
            rosterChanged: applyDebriefRowToRoster(args, resolve, playerRoster),
          }
        : NO_CHANGES;
    default:
      return null;
  }
}
