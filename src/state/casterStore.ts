import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { streamPlaybackStore } from "./streamPlaybackStore";

export const QUICK_CAM_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;
export type QuickCamSlot = (typeof QUICK_CAM_SLOTS)[number];
type Orbit = { yaw: number; pitch: number; distance: number };
export type SavedCamera = {
  label: string;
  fov: number;
  followBehindPlayer: boolean;
  commandCircuit?: { x: number; z: number; zoom: number };
} & (
  | { kind: "original" }
  | { kind: "fly"; position: number[]; quaternion: number[] }
  | ({ kind: "flag"; slot: number } & Orbit)
  | ({
      kind: "follow" | "fp";
      playerName: string;
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
  version: 1;
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
      value?.version !== 1 ||
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
      ...value,
      quickCams: Object.fromEntries(
        Object.entries(value.quickCams).filter(([, camera]) =>
          isSavedCamera(camera),
        ),
      ),
    };
  } catch {
    return null;
  }
}

function isSavedCamera(value: unknown): value is SavedCamera {
  if (!value || typeof value !== "object") return false;
  const c = value as SavedCamera;
  if (
    typeof c.label !== "string" ||
    !Number.isFinite(c.fov) ||
    c.fov <= 0 ||
    c.fov >= 180 ||
    typeof c.followBehindPlayer !== "boolean"
  )
    return false;
  if (
    c.commandCircuit &&
    ![c.commandCircuit.x, c.commandCircuit.z, c.commandCircuit.zoom].every(
      Number.isFinite,
    )
  )
    return false;
  if (c.kind === "original") return true;
  if (c.kind === "fly")
    return (
      Array.isArray(c.position) &&
      c.position.length === 3 &&
      c.position.every(Number.isFinite) &&
      Array.isArray(c.quaternion) &&
      c.quaternion.length === 4 &&
      c.quaternion.every(Number.isFinite)
    );
  if (![c.yaw, c.pitch, c.distance].every(Number.isFinite)) return false;
  if (c.kind === "flag") return Number.isInteger(c.slot) && c.slot > 0;
  return (
    (c.kind === "follow" || c.kind === "fp") &&
    typeof c.playerName === "string" &&
    c.playerName.trim().length > 0
  );
}

function write(context: MissionContext, settings: MissionSettings) {
  try {
    if (
      Object.keys(settings.teamNames).length ||
      Object.keys(settings.quickCams).length
    ) {
      sessionStorage.setItem(
        CASTER_STORAGE_KEY,
        JSON.stringify({ version: 1, ...context, ...settings }),
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
