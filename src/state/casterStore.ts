import type { PlayerReference } from "../../relay/playerReference";
import type { PublishedGame } from "../../relay/gamePresentation";
import { readPlayerReference } from "./playerReferenceStorage";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { streamSnapshotStore } from "./streamSnapshotStore";
import { getPlayerResolver } from "./playerResolver";

export const QUICK_CAM_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;
export type QuickCamSlot = (typeof QUICK_CAM_SLOTS)[number];
type Orbit = { yaw: number; pitch: number; distance: number };
export type SavedCamera = {
  fov: number;
  followBehindPlayer: boolean;
  commandCircuit?: { x: number; z: number; zoom: number };
} & (
  | { kind: "original" }
  | {
      kind: "fly";
      position: [number, number, number];
      quaternion: [number, number, number, number];
    }
  | ({ kind: "flag"; slot: number } & Orbit)
  | ({
      kind: "player";
      mode: "follow" | "firstPerson";
      player: PlayerReference;
    } & Orbit)
);

interface MissionSettings {
  teamNames: Record<number, string>;
  quickCams: Partial<Record<QuickCamSlot, SavedCamera>>;
}

interface MissionContext {
  server: string;
  mission: string;
}

type StoredMissionSettings = MissionSettings & MissionContext;

interface CasterState {
  context: MissionContext | null;
  settings: MissionSettings | null;
  publishedGame: PublishedGame | null;
  /** Effective labels; personal entries always override relay-saved entries. */
  teamNames: Record<number, string>;
  fov: number | null;
  /** Transient feedback for saves and recalls; a fresh object retriggers the flash. */
  lastCameraAction: { slot: QuickCamSlot } | null;
  activate(server: string, sequence: string, map: string): void;
  suspend(): void;
  setPublishedGame(game: PublishedGame | null): void;
  renameTeam(teamId: number, name: string): void;
  renameTeams(names: Record<number, string>): void;
  saveCamera(slot: QuickCamSlot, camera: SavedCamera | null): boolean;
}

export const CASTER_STORAGE_KEY = "t2-caster";
const MAX_RECENT_MISSIONS = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readEntry(
  value: unknown,
  version: number,
): StoredMissionSettings | null {
  if (
    !isRecord(value) ||
    typeof value.server !== "string" ||
    typeof value.mission !== "string" ||
    !isRecord(value.teamNames) ||
    !isRecord(value.quickCams)
  )
    return null;
  return {
    server: value.server,
    mission: value.mission,
    teamNames: Object.fromEntries(
      Object.entries(value.teamNames).flatMap(([teamId, name]) =>
        /^(0|[1-9]\d*)$/.test(teamId) &&
        Number.isSafeInteger(Number(teamId)) &&
        typeof name === "string" &&
        name.trim()
          ? [[teamId, name.trim()]]
          : [],
      ),
    ),
    quickCams: Object.fromEntries(
      Object.entries(value.quickCams).flatMap(([slot, cameraValue]) => {
        if (!QUICK_CAM_SLOTS.some((key) => String(key) === slot)) return [];
        const camera = readCamera(cameraValue, version);
        return camera ? [[slot, camera]] : [];
      }),
    ),
  };
}

function read(): StoredMissionSettings[] {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(CASTER_STORAGE_KEY) ?? "null",
    );
    if (!isRecord(value)) return [];
    if (value.version === 4 && Array.isArray(value.entries)) {
      const entries: StoredMissionSettings[] = [];
      for (const candidate of value.entries) {
        const entry = readEntry(candidate, 4);
        if (
          entry &&
          !entries.some(
            (other) =>
              other.server === entry.server && other.mission === entry.mission,
          )
        )
          entries.push(entry);
        if (entries.length === MAX_RECENT_MISSIONS) break;
      }
      return entries;
    }
    if (value.version === 1 || value.version === 2 || value.version === 3) {
      const entry = readEntry(value, value.version);
      return entry ? [entry] : [];
    }
    return [];
  } catch {
    return [];
  }
}

function readCamera(value: unknown, version: number): SavedCamera | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  if (
    typeof c.fov !== "number" ||
    !Number.isFinite(c.fov) ||
    c.fov <= 0 ||
    c.fov >= 180 ||
    typeof c.followBehindPlayer !== "boolean"
  )
    return null;
  const common: Pick<
    SavedCamera,
    "fov" | "followBehindPlayer" | "commandCircuit"
  > = {
    fov: c.fov,
    followBehindPlayer: c.followBehindPlayer,
  };
  if (c.commandCircuit !== undefined) {
    if (!c.commandCircuit || typeof c.commandCircuit !== "object") return null;
    const view = c.commandCircuit as Record<string, unknown>;
    if (
      typeof view.x !== "number" ||
      typeof view.z !== "number" ||
      typeof view.zoom !== "number" ||
      ![view.x, view.z, view.zoom].every(Number.isFinite)
    )
      return null;
    common.commandCircuit = { x: view.x, z: view.z, zoom: view.zoom };
  }
  if (c.kind === "original") return { kind: "original", ...common };
  if (c.kind === "fly") {
    if (
      Array.isArray(c.position) &&
      c.position.length === 3 &&
      c.position.every(Number.isFinite) &&
      Array.isArray(c.quaternion) &&
      c.quaternion.length === 4 &&
      c.quaternion.every(Number.isFinite)
    )
      return {
        kind: "fly",
        position: c.position as [number, number, number],
        quaternion: c.quaternion as [number, number, number, number],
        ...common,
      };
    return null;
  }
  if (
    typeof c.yaw !== "number" ||
    typeof c.pitch !== "number" ||
    typeof c.distance !== "number" ||
    ![c.yaw, c.pitch, c.distance].every(Number.isFinite)
  )
    return null;
  const orbit = { yaw: c.yaw, pitch: c.pitch, distance: c.distance };
  if (c.kind === "flag")
    return typeof c.slot === "number" && Number.isInteger(c.slot) && c.slot > 0
      ? { kind: "flag", slot: c.slot, ...orbit, ...common }
      : null;
  const mode =
    version === 1
      ? c.kind === "fp"
        ? "firstPerson"
        : c.kind === "follow"
          ? "follow"
          : null
      : c.mode;
  const player =
    version < 3
      ? typeof c.playerName === "string" && c.playerName.trim()
        ? {
            kind: "name" as const,
            rawName: c.playerName,
            match: "base" as const,
          }
        : null
      : readPlayerReference(c.player);
  if (
    player &&
    (mode === "follow" || mode === "firstPerson") &&
    (version === 1 || c.kind === "player")
  )
    return { kind: "player", mode, player, ...orbit, ...common };
  return null;
}

function customized(settings: MissionSettings): boolean {
  return !!(
    Object.keys(settings.teamNames).length ||
    Object.keys(settings.quickCams).length
  );
}

function write(
  context: MissionContext,
  settings: MissionSettings,
  visited = false,
) {
  try {
    const others = read().filter(
      (entry) =>
        entry.server !== context.server || entry.mission !== context.mission,
    );
    const entries = (
      customized(settings) || visited
        ? [{ ...context, ...settings }, ...others]
        : others
    ).slice(0, MAX_RECENT_MISSIONS);
    if (!entries.some(customized)) {
      sessionStorage.removeItem(CASTER_STORAGE_KEY);
      return;
    }
    const encoded = JSON.stringify({ version: 4, entries });
    if (sessionStorage.getItem(CASTER_STORAGE_KEY) !== encoded)
      sessionStorage.setItem(CASTER_STORAGE_KEY, encoded);
  } catch {
    /* Keep controls usable when browser storage is unavailable. */
  }
}

export const casterStore = createStore<CasterState>((set, get) => {
  let unsubscribePlayers: (() => void) | undefined;

  function refreshPlayers() {
    const { context, settings } = get();
    if (!context || !settings) return;
    const players = getPlayerResolver();
    let quickCams = settings.quickCams;
    for (const slot of QUICK_CAM_SLOTS) {
      const camera = quickCams[slot];
      if (camera?.kind !== "player") continue;
      const player = players.refresh(camera.player);
      if (player === camera.player) continue;
      if (quickCams === settings.quickCams) quickCams = { ...quickCams };
      quickCams[slot] = { ...camera, player };
    }
    if (quickCams === settings.quickCams) return;
    const next = { ...settings, quickCams };
    write(context, next);
    set({ settings: next });
  }

  function edit(
    update: (settings: MissionSettings) => MissionSettings,
    savedSlot?: QuickCamSlot,
  ): boolean {
    const { context, settings } = get();
    if (!context || !settings) return false;
    const next = update(settings);
    write(context, next);
    set({
      settings: next,
      ...(next.teamNames !== settings.teamNames && {
        teamNames: {
          ...get().publishedGame?.presentation.teamNames,
          ...next.teamNames,
        },
      }),
      ...(savedSlot != null && { lastCameraAction: { slot: savedSlot } }),
    });
    return true;
  }
  return {
    context: null,
    settings: null,
    publishedGame: null,
    teamNames: {},
    fov: null,
    lastCameraAction: null,
    activate(server, sequence, map) {
      const mission = JSON.stringify([
        sequence,
        map
          .replaceAll("\\", "/")
          .split("/")
          .pop()!
          .replace(/\.mis$/i, "")
          .toLowerCase(),
      ]);
      const old = get().context;
      const context = { server, mission };
      if (old?.server === server && old.mission === mission) {
        return;
      }
      if (streamPlaybackStore.getState().followPlayer)
        streamPlaybackStore.setState({ followPlayer: null });
      const recent = read();
      const stored = recent.find(
        (entry) => entry.server === server && entry.mission === mission,
      );
      const settings: MissionSettings = stored
        ? { teamNames: stored.teamNames, quickCams: stored.quickCams }
        : { teamNames: {}, quickCams: {} };
      if (stored !== recent[0]) write(context, settings, true);
      set({
        context,
        settings,
        publishedGame: null,
        teamNames: settings.teamNames,
        fov: null,
        lastCameraAction: null,
      });
      unsubscribePlayers ??= streamSnapshotStore.subscribe((next, previous) => {
        if (
          next.snapshot &&
          (next.snapshot.playerRoster !== previous.snapshot?.playerRoster ||
            next.snapshot.playerTargets !== previous.snapshot?.playerTargets ||
            next.snapshot.playerIdentityScope !==
              previous.snapshot?.playerIdentityScope)
        )
          refreshPlayers();
      });
    },
    suspend() {
      unsubscribePlayers?.();
      unsubscribePlayers = undefined;
      if (streamPlaybackStore.getState().followPlayer)
        streamPlaybackStore.setState({ followPlayer: null });
      set({
        context: null,
        settings: null,
        publishedGame: null,
        teamNames: {},
        fov: null,
        lastCameraAction: null,
      });
    },
    setPublishedGame(game) {
      const state = get();
      if (
        state.publishedGame === game ||
        (game &&
          state.publishedGame?.id === game.id &&
          state.publishedGame.revision >= game.revision)
      )
        return;
      set({
        publishedGame: game,
        teamNames: {
          ...game?.presentation.teamNames,
          ...state.settings?.teamNames,
        },
      });
    },
    renameTeam(teamId, name) {
      get().renameTeams({ [teamId]: name });
    },
    renameTeams(names) {
      if (Object.keys(names).length === 0) return;
      edit((settings) => {
        const teamNames = { ...settings.teamNames };
        for (const [teamId, name] of Object.entries(names)) {
          const trimmed = name.trim();
          if (trimmed) teamNames[Number(teamId)] = trimmed;
          else delete teamNames[Number(teamId)];
        }
        return { ...settings, teamNames };
      });
    },
    saveCamera(slot, camera) {
      return edit(
        (settings) => {
          const quickCams = { ...settings.quickCams };
          if (camera) quickCams[slot] = camera;
          else delete quickCams[slot];
          return { ...settings, quickCams };
        },
        camera ? slot : undefined,
      );
    },
  };
});

export function useCaster<T>(selector: (state: CasterState) => T): T {
  return useStore(casterStore, selector);
}

export function displayTeamName(
  teamId: number,
  serverName?: string | null,
): string {
  return (
    casterStore.getState().teamNames[teamId] ||
    serverName ||
    DEFAULT_TEAM_NAMES[teamId] ||
    `Team ${teamId}`
  );
}
