import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { streamPlaybackStore } from "./streamPlaybackStore";

export const QUICK_CAM_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;
export type QuickCamSlot = (typeof QUICK_CAM_SLOTS)[number];
type Orbit = { yaw: number; pitch: number; distance: number };
export type SavedCamera = {
  fov: number;
  followBehindPlayer: boolean;
  commandCircuit?: { x: number; z: number; zoom: number };
} & (
  | { kind: "original" }
  | { kind: "fly"; position: number[]; quaternion: number[] }
  | ({ kind: "flag"; slot: number } & Orbit)
  | ({
      kind: "player";
      mode: "follow" | "firstPerson";
      /** Tagless name used to find the player after respawning or reconnecting. */
      playerName: string;
      displayName: string;
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

interface StoredSettings extends MissionSettings, MissionContext {
  version: 2;
}

interface CasterState {
  context: MissionContext | null;
  settings: MissionSettings | null;
  fov: number | null;
  /** Transient feedback for saves and recalls; a fresh object retriggers the flash. */
  lastCameraAction: { slot: QuickCamSlot } | null;
  activate(server: string, sequence: string, map: string): void;
  suspend(): void;
  renameTeam(teamId: number, name: string): void;
  renameTeams(names: Record<number, string>): void;
  saveCamera(slot: QuickCamSlot, camera: SavedCamera | null): boolean;
}

export const CASTER_STORAGE_KEY = "t2-caster";

function read(): StoredSettings | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(CASTER_STORAGE_KEY) ?? "null",
    );
    if (
      (value?.version !== 1 && value?.version !== 2) ||
      typeof value.server !== "string" ||
      typeof value.mission !== "string" ||
      !value.teamNames ||
      typeof value.teamNames !== "object" ||
      !Object.values(value.teamNames).every(
        (name) => typeof name === "string",
      ) ||
      !value.quickCams ||
      typeof value.quickCams !== "object"
    )
      return null;
    return {
      version: 2,
      server: value.server,
      mission: value.mission,
      teamNames: value.teamNames,
      quickCams: Object.fromEntries(
        Object.entries(value.quickCams).flatMap(([slot, cameraValue]) => {
          const camera = readCamera(cameraValue, value.version);
          return camera ? [[slot, camera]] : [];
        }),
      ),
    };
  } catch {
    return null;
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
        position: c.position,
        quaternion: c.quaternion,
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
  if (typeof c.playerName !== "string" || !c.playerName.trim()) return null;
  if (version === 1 && (c.kind === "follow" || c.kind === "fp")) {
    // Old labels mixed names with presentation text. Migrate from identity fields only.
    return {
      kind: "player",
      mode: c.kind === "fp" ? "firstPerson" : "follow",
      playerName: c.playerName,
      displayName: c.playerName,
      ...orbit,
      ...common,
    };
  }
  if (
    c.kind === "player" &&
    (c.mode === "follow" || c.mode === "firstPerson") &&
    typeof c.displayName === "string" &&
    c.displayName.trim()
  )
    return {
      kind: "player",
      mode: c.mode,
      playerName: c.playerName,
      displayName: c.displayName,
      ...orbit,
      ...common,
    };
  return null;
}

function write(context: MissionContext, settings: MissionSettings) {
  try {
    if (
      Object.keys(settings.teamNames).length ||
      Object.keys(settings.quickCams).length
    ) {
      sessionStorage.setItem(
        CASTER_STORAGE_KEY,
        JSON.stringify({ version: 2, ...context, ...settings }),
      );
    } else {
      sessionStorage.removeItem(CASTER_STORAGE_KEY);
    }
  } catch {
    /* Keep controls usable when browser storage is unavailable. */
  }
}

export const casterStore = createStore<CasterState>((set, get) => {
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
      ...(savedSlot != null && { lastCameraAction: { slot: savedSlot } }),
    });
    return true;
  }
  return {
    context: null,
    settings: null,
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
      if (streamPlaybackStore.getState().pendingFollowPlayerName)
        streamPlaybackStore.setState({ pendingFollowPlayerName: null });
      const stored = read();
      const matches = stored?.server === server && stored.mission === mission;
      const settings: MissionSettings = matches
        ? { teamNames: stored.teamNames, quickCams: stored.quickCams }
        : { teamNames: {}, quickCams: {} };
      if (!matches) write(context, settings);
      set({
        context,
        settings,
        fov: null,
        lastCameraAction: null,
      });
    },
    suspend() {
      if (streamPlaybackStore.getState().pendingFollowPlayerName)
        streamPlaybackStore.setState({ pendingFollowPlayerName: null });
      set({
        context: null,
        settings: null,
        fov: null,
        lastCameraAction: null,
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
    casterStore.getState().settings?.teamNames[teamId] ||
    serverName ||
    DEFAULT_TEAM_NAMES[teamId] ||
    `Team ${teamId}`
  );
}
