/**
 * The client script state saveDemoSettings (recordings.cs) saves that a
 * server's remote commands can change before the client loads a mission:
 * the player list, the chat HUD, the clock and the vote HUD flag. A
 * recording that starts after such commands keeps their effects only in
 * its demo values, as one Tribes2.exe starts there does. Commands run
 * through the stock client handlers that write this state. The HUD mode
 * and visibility a server's setHudMode can change are left out: the server
 * sets them again when the client drops into the mission.
 */
import type { DemoScriptState } from "./demoWriter.js";

/** PlayerRep fields, in the order getState(PLAYERLIST) saves them. */
const PLAYER_FIELDS = [
  "name",
  "guid",
  "clientId",
  "targetId",
  "teamId",
  "score",
  "ping",
  "packetLoss",
  "chatMuted",
  "canListen",
  "voiceEnabled",
  "isListening",
  "isBot",
  "isAdmin",
  "isSuperAdmin",
  "isSmurf",
] as const;

type PlayerRep = Record<(typeof PLAYER_FIELDS)[number], string>;

/** ConsoleFunction detag (FUN_0042a620): a tagged string's text. */
function detag(value: string): string {
  if (value.charCodeAt(0) !== 1) return value;
  const space = value.indexOf(" ");
  return space === -1 ? "" : value.slice(space + 1);
}

/**
 * NetStringTable::expandString (FUN_0058a670): "\x01<id> ", then the
 * string with %1–%9 replaced by the detagged parameters ("" past the
 * last) and any other escaped character kept, within 1023 characters.
 */
function expandString(
  id: number,
  template: string | undefined,
  params: readonly string[],
): string {
  let out = `\x01${id} `;
  if (template === undefined) return `${out}<NULL>`;
  for (let i = 0; i < template.length; i++) {
    let char = template[i];
    if (char === "%") {
      char = template.charAt(++i);
      const param = char.charCodeAt(0) - 0x31;
      if (param >= 0 && param < 9) {
        if (param < params.length) out += detag(params[param]);
        continue;
      }
    }
    out += char;
  }
  return out.slice(0, 1023);
}

/**
 * RemoteCommandEvent::process (FUN_005bfe00): each tagged argument, last
 * to first, expands with the arguments after it as its parameters.
 */
export function expandRemoteArgs(
  argv: readonly string[],
  strings: ReadonlyMap<number, string>,
): string[] {
  const out = [...argv];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].charCodeAt(0) !== 1) continue;
    const id = parseInt(out[i].slice(1), 10);
    out[i] = expandString(id, strings.get(id), out.slice(i + 1));
  }
  return out;
}

/** A script value in a numeric context, as atof reads it. */
const scriptNumber = (value: string) => parseFloat(value) || 0;

export class ClientScriptState {
  /** PlayerListGroup, in order; a repeated join leaves the old rep in it. */
  private readonly players: PlayerRep[] = [];
  /** $PlayerList: each client ID's current rep. */
  private readonly playerList = new Map<string, PlayerRep>();
  /** HudMessageVector, oldest first. */
  private readonly chat: string[] = [];
  /** The last MsgSystemClock's time left, and when it arrived. */
  private clock?: { timeLeftMs: number; atMs: number };
  /** voteHud.voting */
  private voting = false;

  /**
   * Run a RemoteCommandEvent's arguments, received at `atMs`, through its
   * clientCmd handler.
   */
  apply(
    argv: readonly string[],
    strings: ReadonlyMap<number, string>,
    atMs: number,
  ): void {
    const [command = "", ...args] = expandRemoteArgs(argv, strings);
    const arg = (i: number) => args[i] ?? "";
    switch (detag(command).toLowerCase()) {
      case "servermessage":
        this.serverMessage(argv[1] ?? "", args, strings, atMs);
        break;
      case "chatmessage":
        this.chatMessage(arg(0), arg(3));
        break;
      case "cannedchatmessage":
        // With $defaultVoiceBinds, as a client with no custom binds has.
        this.chatMessage(arg(0), `[${arg(4)}] ${detag(arg(1))}`);
        break;
      // clientTasks.cs, whose \c2, \c3 and \cr are 0x04, 0x05 and 0x0f.
      case "potentialteamtask":
        this.chat.push(`\x04Team:\x0f ${detag(arg(0))}.`);
        break;
      case "potentialtask":
        this.chat.push(`\x05${detag(arg(0))}:\x0f ${detag(arg(1))}.`);
        break;
      case "taskdeclined":
        this.chat.push(
          `${detag(arg(0))} refused your task '${detag(arg(1))}'.`,
        );
        break;
      case "taskaccepted":
        this.chat.push(
          `${detag(arg(0))} accepted your task '${detag(arg(1))}'.`,
        );
        break;
      case "taskcompleted":
        this.chat.push(
          `${detag(arg(0))} completed your task '${detag(arg(1))}'.`,
        );
        break;
      case "acceptedtask":
        this.chat.push(`\x05Your current task is:\x0f ${arg(0)}`);
        break;
    }
  }

  /** What saveDemoSettings saves at `atMs`. */
  save(atMs: number): DemoScriptState {
    const { clock } = this;
    return {
      voting: this.voting,
      players: this.players.map((player) =>
        PLAYER_FIELDS.map((field) => player[field]),
      ),
      // hudClock getTime (FUN_004fe840): minutes from the deadline the
      // clock's setTime (FUN_004fe7e0) last put the time left before.
      clockMinutes: clock
        ? Math.abs(atMs - clock.atMs - clock.timeLeftMs) / 60000
        : 0,
      chat: [...this.chat],
    };
  }

  /**
   * clientCmdServerMessage (message.cs): defaultMessageCallback, then the
   * callbacks for a tagged message type.
   */
  private serverMessage(
    rawType: string,
    args: readonly string[],
    strings: ReadonlyMap<number, string>,
    atMs: number,
  ): void {
    const message = args[1] ?? "";
    if (message !== "") {
      const text = detag(message);
      const wav = text.indexOf("~w");
      if (wav === -1) this.chat.push(text);
      else if (wav > 0) this.chat.push(text.slice(0, wav));
    }
    if (rawType.charCodeAt(0) !== 1) return;
    const arg = (i: number) => args[2 + i] ?? "";
    switch (strings.get(parseInt(rawType.slice(1), 10))) {
      case "MsgClientJoin": {
        // getPlayerPrefs changes nothing with an empty player database.
        const player: PlayerRep = {
          name: detag(arg(0)),
          guid: arg(7),
          clientId: arg(1),
          targetId: arg(2),
          teamId: "0",
          score: "0",
          ping: "0",
          packetLoss: "0",
          chatMuted: "0",
          canListen: "0",
          voiceEnabled: "0",
          isListening: "0",
          isBot: arg(3),
          isAdmin: arg(4),
          isSuperAdmin: arg(5),
          isSmurf: arg(6),
        };
        this.players.push(player);
        this.playerList.set(arg(1), player);
        break;
      }
      case "MsgClientDrop": {
        const player = this.playerList.get(arg(1));
        if (player) {
          this.players.splice(this.players.indexOf(player), 1);
          this.playerList.delete(arg(1));
        }
        break;
      }
      case "MsgClientJoinTeam":
        this.update(arg(2), { teamId: arg(3) });
        break;
      case "MsgClientNameChanged":
        this.update(arg(2), { name: detag(arg(1)) });
        break;
      case "MsgPlayerScore": // scoreList.cs
        this.update(arg(0), {
          score: arg(1),
          ping: arg(2),
          packetLoss: arg(3),
        });
        break;
      case "MsgVoiceEnable": // voiceChat.cs
        this.update(arg(1), { voiceEnabled: arg(0) });
        break;
      case "MsgCanListen":
        this.update(arg(1), { canListen: arg(0) });
        break;
      case "MsgListenState":
        this.update(arg(1), { isListening: arg(0) });
        break;
      case "MsgPlayerMuted": // client.cs
        this.update(arg(1), { chatMuted: arg(2) });
        break;
      case "MsgAdminPlayer": // LobbyGui.cs
      case "MsgAdminAdminPlayer":
        this.update(arg(0), { isAdmin: "1" });
        break;
      case "MsgSuperAdminPlayer":
        this.update(arg(0), { isAdmin: "1", isSuperAdmin: "1" });
        break;
      case "MsgSystemClock": // objectiveHud.cs setSystemClock
        this.clock = { timeLeftMs: scriptNumber(detag(arg(1))), atMs };
        break;
      case "openVoteHud": // hud.cs
        this.voting = true;
        break;
      case "closeVoteHud":
        this.voting = false;
        break;
    }
  }

  /** clientCmdChatMessage (message.cs), which drops unknown senders. */
  private chatMessage(sender: string, message: string): void {
    const text = detag(message);
    const player = this.playerList.get(sender);
    if (text === "" || !player || scriptNumber(player.chatMuted)) return;
    const wav = text.indexOf("~w");
    this.chat.push(wav === -1 ? text : text.slice(0, wav));
  }

  /** A message handler's update, which needs the client's rep. */
  private update(clientId: string, fields: Partial<PlayerRep>): void {
    const player = this.playerList.get(clientId);
    if (player) Object.assign(player, fields);
  }
}
