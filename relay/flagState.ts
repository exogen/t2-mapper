import {
  PlayerResolver,
  playerName,
  type PlayerReference,
  type PlayerRecord,
} from "./playerReference.js";
import {
  decodeFlagEvent,
  decodeFlagStatus,
  decodeTeamAdd,
  type FlagStatus,
  type ResolveNetString,
} from "./serverMessageDecode.js";

/** Independent of team scores: team 0 is Rabbit's neutral flag. */
export interface FlagState {
  teamId: number;
  status: FlagStatus;
  carrier?: PlayerReference;
}

export function applyFlagMessage(
  flags: Map<number, FlagState>,
  msgType: string,
  args: string[],
  resolve: ResolveNetString,
  players: () => PlayerResolver,
): boolean {
  let teamId: number;
  let status: FlagStatus;
  let rawName: string | undefined;
  if (msgType === "MsgCTFAddTeam") {
    const team = decodeTeamAdd(msgType, args, resolve);
    if (!team?.flag) return false;
    teamId = team.teamId;
    status = team.flag.status;
    rawName = team.flag.carrierRawName;
  } else if (
    [
      "MsgCTFFlagTaken",
      "MsgCTFFlagDropped",
      "MsgCTFFlagReturned",
      "MsgCTFFlagCapped",
    ].includes(msgType)
  ) {
    const flag = decodeFlagEvent(msgType, args, resolve);
    if (!flag) return false;
    teamId = flag.teamId;
    status = flag.status;
    rawName = flag.carrierRawName;
  } else if (msgType === "MsgRabbitFlagStatus") {
    if (args.length < 3) return false;
    teamId = 0;
    rawName = resolve(args[2]);
    status = decodeFlagStatus(playerName(rawName));
  } else if (
    [
      "MsgRabbitFlagTaken",
      "MsgRabbitFlagDropped",
      "MsgRabbitFlagReturned",
    ].includes(msgType)
  ) {
    teamId = 0;
    status =
      msgType === "MsgRabbitFlagTaken"
        ? "held"
        : msgType === "MsgRabbitFlagDropped"
          ? "field"
          : "home";
    rawName = args[2] && resolve(args[2]);
  } else return false;
  if (
    !Number.isInteger(teamId) ||
    teamId < 0 ||
    (teamId === 0 && !msgType.startsWith("MsgRabbit"))
  )
    return false;
  flags.set(teamId, {
    teamId,
    status,
    ...(status === "held" &&
      rawName && { carrier: players().reference(rawName) }),
  });
  return true;
}

/** Only used at old checkpoint / relay boundaries, never as active name state. */
export interface LegacyFlagFields {
  teamId: number;
  flagStatus?: FlagStatus;
  flagCarrier?: string;
  flagCarrierRawName?: string;
}

/** Keep older, already-open watcher clients usable during a relay deployment. */
export function legacyFlagFields(
  flag: FlagState | undefined,
  players: PlayerResolver,
): Omit<LegacyFlagFields, "teamId"> {
  if (!flag) return {};
  const carrier = flag.carrier && players.display(flag.carrier);
  return {
    flagStatus: flag.status,
    flagCarrier: carrier?.name,
    flagCarrierRawName: carrier?.rawName,
  };
}

/** Bind unresolved carriers and retain their latest confirmed public identity. */
export function refreshFlagCarriers(
  flags: Map<number, FlagState>,
  players: PlayerResolver,
): void {
  for (const [teamId, flag] of flags) {
    if (!flag.carrier) continue;
    const carrier = players.refresh(flag.carrier);
    if (carrier !== flag.carrier) flags.set(teamId, { ...flag, carrier });
  }
}

export function restoreFlagStates(
  flags: Iterable<FlagState> | undefined,
  teams: readonly LegacyFlagFields[],
  scope: string,
  players: readonly PlayerRecord[],
): Map<number, FlagState> {
  if (flags) return new Map(Array.from(flags, (flag) => [flag.teamId, flag]));
  const resolver = new PlayerResolver(scope, players);
  return new Map(
    teams.flatMap((team) => {
      if (!team.flagStatus) return [];
      const rawName = team.flagCarrierRawName || team.flagCarrier;
      return [
        [
          team.teamId,
          {
            teamId: team.teamId,
            status: team.flagStatus,
            ...(team.flagStatus === "held" &&
              rawName && { carrier: resolver.reference(rawName) }),
          },
        ],
      ];
    }),
  );
}
