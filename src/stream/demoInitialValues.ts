/** Mission metadata and HUD state saved in a recording's initial block. */
import {
  normalizePlayerGuid,
  stripTaggedStringMarkup,
} from "../../relay/shared";
import { decodeFlagStatus } from "../../relay/serverMessageDecode";
import type { FlagState } from "../../relay/flagState";
import type { TeamScore } from "./types";

export interface DemoMissionInfo {
  /** Mission display name from readplayerinfo row 2 (e.g. "S5-WoodyMyrk"). */
  missionDisplayName: string | null;
  /** Mission type display name from readplayerinfo row 3 (e.g. "Capture the Flag"). */
  missionType: string | null;
  /** Game class name from the SCORE header (e.g. "CTFGame"). */
  gameClassName: string | null;
  /** Server display name from readplayerinfo row 2. */
  serverDisplayName: string | null;
  /** Server address ("host:port") from readplayerinfo row 2. */
  serverAddress: string | null;
  /** Mod name from readplayerinfo row 3 (e.g. "classic"). */
  mod: string | null;
  /** PJ's recorded 0/1 mode flag; zero can also be an older recorder's default. */
  tournamentMode: boolean | null;
  /** Name of the player who recorded the demo (from readplayerinfo row 1). */
  recorderName: string | null;
  /** Recording date string from readplayerinfo row 2 (e.g. "May-4-2025 10:37PM"). */
  recordingDate: string | null;
  /** Client ID of the recorder. */
  recorderClientId: number | null;
}

export function extractMissionInfo(demoValues: string[]): DemoMissionInfo {
  let missionDisplayName: string | null = null;
  let missionType: string | null = null;
  let gameClassName: string | null = null;
  let serverDisplayName: string | null = null;
  let serverAddress: string | null = null;
  let mod: string | null = null;
  let tournamentMode: boolean | null = null;
  let recorderName: string | null = null;
  let recorderClientId: number = NaN;
  let recordingDate: string | null = null;

  for (let i = 0; i < demoValues.length; i++) {
    // SCORE header: "visible\tgameClassName\tobjCount"
    const scoreFields = demoValues[i].split("\t");
    if (scoreFields.length >= 3 && scoreFields[1]?.endsWith("Game")) {
      gameClassName = scoreFields[1];
    }

    if (demoValues[i] !== "readplayerinfo") continue;
    const value = demoValues[i + 1];
    if (!value) continue;

    if (value.startsWith("1\t")) {
      // Row 1: "1\tclientId\trecorderName\tteamName\tguid"
      const fields = value.split("\t");
      if (fields[1]) recorderClientId = parseInt(fields[1], 10);
      if (fields[2])
        recorderName = stripTaggedStringMarkup(fields[2]).trim() || null;
      continue;
    }

    if (value.startsWith("2\t")) {
      // Row 2: "2\tserverName\taddress\tdate\tmissionDisplayName"
      const fields = value.split("\t");
      if (fields[1])
        serverDisplayName = stripTaggedStringMarkup(fields[1]).trim() || null;
      if (fields[2]) serverAddress = fields[2];
      if (fields[3]) recordingDate = fields[3];
      if (fields[4]) missionDisplayName = fields[4];
      continue;
    }

    if (value.startsWith("3\t")) {
      // Row 3: "3\tmod\tmissionTypeDisplayName\ttourneymode\t..."
      const fields = value.split("\t");
      if (fields[1]) mod = fields[1];
      if (fields[2]) missionType = fields[2];
      tournamentMode =
        fields[3] === "1" ? true : fields[3] === "0" ? false : null;
    }
  }

  return {
    missionDisplayName,
    missionType,
    gameClassName,
    serverDisplayName,
    serverAddress,
    mod,
    tournamentMode,
    recorderName,
    recorderClientId: Number.isFinite(recorderClientId)
      ? recorderClientId
      : null,
    recordingDate,
  };
}

const BACKPACK_BITMAP_TO_INDEX = new Map<string, number>([
  ["gui/hud_new_packammo", 0],
  ["gui/hud_new_packcloak", 1],
  ["gui/hud_new_packenergy", 2],
  ["gui/hud_new_packrepair", 3],
  ["gui/hud_new_packsatchel", 4],
  ["gui/hud_new_packshield", 5],
  ["gui/hud_new_packinventory", 6],
  ["gui/hud_new_packmotionsens", 7],
  ["gui/hud_new_packradar", 8],
  ["gui/hud_new_packturretout", 9],
  ["gui/hud_new_packturretin", 10],
  ["gui/hud_new_packsensjam", 11],
  ["gui/hud_new_packturret", 12],
  ["gui/hud_satchel_unarmed", 18],
]);

function backpackBitmapToIndex(bitmap: string): number {
  const lower = bitmap.toLowerCase();
  for (const [key, val] of BACKPACK_BITMAP_TO_INDEX) {
    if (key === lower) return val;
  }
  return -1;
}

interface ParsedDemoValues {
  weaponsHud: { slots: Map<number, number>; activeIndex: number } | null;
  backpackHud: { packIndex: number; active: boolean; text: string } | null;
  inventoryHud: {
    slots: Map<number, number>;
    activeSlot: number;
  } | null;
  teamScores: TeamScore[];
  flags: FlagState[];
  playerRoster: Map<
    number,
    {
      name: string;
      rawName: string;
      guid?: string;
      targetId?: number;
      teamId: number;
      score: number;
      ping: number;
      packetLoss: number;
    }
  >;
  chatMessages: string[];
  /** Value from clockHud.getTime() — minutes passed to setTime(). */
  clockTimeMin: number | null;
  gravity: number;
}

/**
 * Parse the $DemoValue[] array to extract initial HUD state.
 *
 * Sections are written sequentially by saveDemoSettings/getState in
 * recordings.cs: MISC, PLAYERLIST, RETICLE, BACKPACK, WEAPON, INVENTORY,
 * SCORE, CLOCK, CHAT, GRAVITY.
 */
export function parseDemoValues(demoValues: string[]): ParsedDemoValues {
  const result: ParsedDemoValues = {
    weaponsHud: null,
    backpackHud: null,
    inventoryHud: null,
    teamScores: [],
    flags: [],
    playerRoster: new Map(),
    chatMessages: [],
    clockTimeMin: null,
    gravity: -20,
  };
  if (!demoValues.length) return result;

  // Early relay recordings wrote only the PJEnhancedRecording metadata
  // tail ("NewDemoData" + rows) with no standard sections in front —
  // walking those rows positionally misreads them (the last row lands
  // in the CHAT slots and shows as a bogus chat line).
  if (demoValues[0] === "NewDemoData") return result;

  let idx = 0;
  const next = () => {
    const v = demoValues[idx++];
    return v === "<BLANK>" ? "" : (v ?? "");
  };

  // MISC: 1 value
  next();

  // PLAYERLIST: count + count entries
  if (idx >= demoValues.length) return result;
  const playerCount = parseInt(next(), 10) || 0;
  const playerCountByTeam = new Map<number, number>();
  for (let i = 0; i < playerCount; i++) {
    const fields = next().split("\t");
    const rawName = fields[0] ?? "";
    const name = stripTaggedStringMarkup(rawName).trim();
    const clientId = parseInt(fields[2], 10);
    const targetId = parseInt(fields[3], 10);
    const teamId = parseInt(fields[4], 10);
    const score = parseInt(fields[5], 10) || 0;
    const ping = parseInt(fields[6], 10) || 0;
    const packetLoss = parseInt(fields[7], 10) || 0;
    if (!isNaN(clientId) && !isNaN(teamId)) {
      result.playerRoster.set(clientId, {
        name,
        rawName,
        guid: normalizePlayerGuid(fields[1]),
        targetId:
          Number.isInteger(targetId) && targetId >= 0 ? targetId : undefined,
        teamId,
        score,
        ping,
        packetLoss,
      });
    }
    if (!isNaN(teamId) && teamId > 0) {
      playerCountByTeam.set(teamId, (playerCountByTeam.get(teamId) ?? 0) + 1);
    }
  }

  // RETICLE: 1 value
  if (idx >= demoValues.length) return result;
  next();

  // BACKPACK: 1 value (bitmap TAB visible TAB text TAB textVisible TAB pack)
  if (idx >= demoValues.length) return result;
  {
    const backpackVal = next();
    const fields = backpackVal.split("\t");
    const bitmap = fields[0] ?? "";
    const visible = fields[1] === "1" || fields[1] === "true";
    const text = fields[2] ?? "";
    const pack = fields[4] === "1" || fields[4] === "true";
    if (visible && bitmap) {
      const packIndex = backpackBitmapToIndex(bitmap);
      result.backpackHud = { packIndex, active: pack, text };
    }
  }

  // WEAPON: header + count bitmap entries + slotCount slot entries
  if (idx >= demoValues.length) return result;
  const weaponHeader = next().split("\t");
  const weaponCount = parseInt(weaponHeader[4], 10) || 0;
  const weaponSlotCount = parseInt(weaponHeader[5], 10) || 0;
  const weaponActive = parseInt(weaponHeader[6], 10);

  for (let i = 0; i < weaponCount; i++) next();

  const slots = new Map<number, number>();
  for (let i = 0; i < weaponSlotCount; i++) {
    const fields = next().split("\t");
    const slotId = parseInt(fields[0], 10);
    const ammo = parseInt(fields[1], 10);
    if (!isNaN(slotId)) {
      slots.set(slotId, isNaN(ammo) ? -1 : ammo);
    }
  }
  result.weaponsHud = {
    slots,
    activeIndex: isNaN(weaponActive) ? -1 : weaponActive,
  };

  // INVENTORY: header + count bitmap entries + slotCount slot entries
  if (idx >= demoValues.length) return result;
  const invHeader = next().split("\t");
  const invCount = parseInt(invHeader[4], 10) || 0;
  const invSlotCount = parseInt(invHeader[5], 10) || 0;
  const invActive = parseInt(invHeader[6], 10);
  for (let i = 0; i < invCount; i++) next();
  {
    const invSlots = new Map<number, number>();
    for (let i = 0; i < invSlotCount; i++) {
      const fields = next().split("\t");
      const slotId = parseInt(fields[0], 10);
      const count = parseInt(fields[1], 10);
      if (!isNaN(slotId) && !isNaN(count) && count > 0) {
        invSlots.set(slotId, count);
      }
    }
    if (invSlots.size > 0) {
      result.inventoryHud = {
        slots: invSlots,
        activeSlot: isNaN(invActive) ? -1 : invActive,
      };
    }
  }

  // SCORE: header (visible TAB gameType TAB objCount) + objCount entries.
  if (idx >= demoValues.length) return result;
  const scoreHeader = next().split("\t");
  const gameType = scoreHeader[1] ?? "";
  const objCount = parseInt(scoreHeader[2], 10) || 0;
  const scoreObjs: string[] = [];
  for (let i = 0; i < objCount; i++) scoreObjs.push(next());

  if (gameType === "CTFGame" && objCount >= 8) {
    for (let t = 0; t < 2; t++) {
      const base = t * 4;
      const teamId = t + 1;
      result.teamScores.push({
        teamId,
        name: scoreObjs[base] ?? "",
        score: parseInt(scoreObjs[base + 1], 10) || 0,
        playerCount: playerCountByTeam.get(teamId) ?? 0,
      });
      // recordings.cs saves each team's name, score, FLAG label and location.
      const rawName = scoreObjs[base + 3];
      const location = stripTaggedStringMarkup(rawName ?? "").trim();
      if (location) {
        const status = decodeFlagStatus(location);
        result.flags.push({
          teamId,
          status,
          ...(status === "held" && {
            // ctfFlagTaken/ctfAddTeam display the carrier's nameBase.
            carrier: { kind: "name", rawName, match: "base" } as const,
          }),
        });
      }
    }
  } else if (gameType === "TR2Game" && objCount >= 4) {
    for (let t = 0; t < 2; t++) {
      const base = t * 2;
      const teamId = t + 1;
      result.teamScores.push({
        teamId,
        name: scoreObjs[base + 1] ?? "",
        score: parseInt(scoreObjs[base], 10) || 0,
        playerCount: playerCountByTeam.get(teamId) ?? 0,
      });
    }
  }

  // CLOCK: 1 value — "isVisible\tminutes" (clockHud.getTime(), which is
  // |deadline − now| — always non-negative). Exactly like the real client
  // (recordings.cs loadDemoSettings calls clockHud.setTime regardless of
  // the visibility flag), seed whenever a time is present: "0" counts up
  // from 00:00, which is what Tribes2.exe shows for relay demos until the
  // joiner sync / checkTimeLimit MsgSystemClock re-anchors it.
  if (idx >= demoValues.length) return result;
  {
    const clockFields = next().split("\t");
    const timeMin = parseFloat(clockFields[1] ?? "");
    if (Number.isFinite(timeMin)) {
      result.clockTimeMin = timeMin;
    }
  }

  // CHAT: always 10 entries
  for (let i = 0; i < 10; i++) {
    if (idx >= demoValues.length) break;
    const line = next();
    if (line) {
      result.chatMessages.push(line);
    }
  }

  // GRAVITY: 1 value
  if (idx < demoValues.length) {
    const g = parseFloat(next());
    if (Number.isFinite(g)) {
      result.gravity = g;
    }
  }

  return result;
}
