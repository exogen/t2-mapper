import {
  decodeFlagEvent,
  decodeFlagStatus,
  decodeTeamAdd,
  type ResolveNetString,
} from "./serverMessageDecode.js";

/** Drop timestamps in the caller's clock, keyed by team; 0 is Rabbit's neutral flag. */
export type FlagDropTimes = Readonly<Partial<Record<number, number>>>;

/** Only observed drops start a timer. Status snapshots cannot tell us its age. */
export function updateFlagDropTimes(
  current: FlagDropTimes,
  msgType: string,
  args: string[],
  resolve: ResolveNetString,
  timeSec: number,
): FlagDropTimes {
  let teamId: number;
  let dropped = false;
  switch (msgType) {
    case "MsgCTFFlagDropped":
    case "MsgCTFFlagTaken":
    case "MsgCTFFlagReturned":
    case "MsgCTFFlagCapped": {
      const flag = decodeFlagEvent(msgType, args, resolve);
      if (!flag) return current;
      teamId = flag.teamId;
      if (!Number.isInteger(teamId) || teamId <= 0) return current;
      dropped = flag.status === "field";
      break;
    }
    case "MsgCTFAddTeam": {
      const team = decodeTeamAdd(msgType, args, resolve);
      if (!team) return current;
      teamId = team.teamId;
      if (!Number.isInteger(teamId) || teamId <= 0) return current;
      if (team.flag?.status === "field") return current;
      break;
    }
    case "MsgRabbitFlagDropped":
      teamId = 0;
      dropped = true;
      break;
    case "MsgRabbitFlagTaken":
    case "MsgRabbitFlagReturned":
      teamId = 0;
      break;
    case "MsgRabbitFlagStatus":
      if (args.length < 3 || decodeFlagStatus(resolve(args[2])) === "field")
        return current;
      teamId = 0;
      break;
    case "MsgClientReady":
      return args.length >= 3 ? {} : current;
    default:
      return current;
  }
  if (dropped) {
    // Out-of-bounds drops can send both a personal and a team notification.
    return current[teamId] == null
      ? { ...current, [teamId]: timeSec }
      : current;
  }
  if (current[teamId] == null) return current;
  const next = { ...current };
  delete next[teamId];
  return next;
}
