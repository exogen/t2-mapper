/**
 * End-to-end mission-load smoke test: runs the real Tribes 2 server-side
 * scripts from docs/base through runServer() under Node and asserts the
 * script-driven world setup that the renderer depends on (vehicle station
 * spawning, targets/skins, power, mission-type filtering).
 */
import { describe, it, expect } from "vitest";
import fsSync from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { runServer } from "./index";
import { createScriptLoader } from "./scriptLoader.node";
import { ignoreScripts } from "./ignoreScripts";
import type { FileSystemHandler, TorqueObject } from "./types";

const SEARCH_PATHS = [
  "docs/base/@vl2/scripts.vl2",
  "docs/base/@vl2/missions.vl2",
  "docs/base",
];

const hasGameAssets = fsSync.existsSync(
  "docs/base/@vl2/scripts.vl2/scripts/server.cs",
);

function listFilesRecursive(root: string, prefix = ""): string[] {
  const results: string[] = [];
  let entries: fsSync.Dirent[];
  try {
    entries = fsSync.readdirSync(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(path.join(root, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

function createNodeFileSystem(): FileSystemHandler {
  const allFiles = SEARCH_PATHS.flatMap((base) => listFilesRecursive(base));
  return {
    findFiles(pattern: string): string[] {
      const isMatch = picomatch(pattern, { nocase: true });
      return allFiles.filter((file) => isMatch(file));
    },
    isFile(filePath: string): boolean {
      const normalized = filePath.replace(/\\/g, "/").toLowerCase();
      return allFiles.some((file) => file.toLowerCase() === normalized);
    },
  };
}

function findByDatablock(
  objects: Iterable<TorqueObject>,
  datablockName: string,
): TorqueObject[] {
  const found: TorqueObject[] = [];
  for (const obj of objects) {
    if (
      !obj._isDatablock &&
      String(obj.datablock ?? "").toLowerCase() === datablockName.toLowerCase()
    ) {
      found.push(obj);
    }
  }
  return found;
}

describe.skipIf(!hasGameAssets)("mission load integration", () => {
  it(
    "boots Recalescence (CTF) with faithful script-driven world setup",
    { timeout: 60_000 },
    async () => {
      const { runtime, ready } = await runServer({
        missionName: "Recalescence",
        missionType: "CTF",
        runtimeOptions: {
          loadScript: createScriptLoader({ searchPaths: SEARCH_PATHS }),
          fileSystem: createNodeFileSystem(),
          ignoreScripts,
        },
      });
      try {
        await ready;

        // Mission is running with a populated MissionGroup.
        expect(runtime.$g.get("missionRunning")).toBeTruthy();
        const missionGroup = runtime.getObjectByName("MissionGroup")!;
        expect(missionGroup).toBeDefined();
        expect(missionGroup._children!.length).toBeGreaterThan(0);

        // Vehicle station terminals were spawned by
        // StationVehiclePad::createStationVehicle via schedule(0):
        // dispatch + getSlotTransform + SimGroup::add + settle all working.
        const pads = findByDatablock(
          runtime.state.objectsById.values(),
          "StationVehiclePad",
        );
        expect(pads.length).toBeGreaterThan(0);
        for (const pad of pads) {
          const station = pad.station as TorqueObject;
          expect(station, `pad ${pad._id} has a station`).toBeDefined();
          expect(String(station.datablock).toLowerCase()).toBe(
            "stationvehicle",
          );
          // Placed via the pad's mount0 (no stationPos overrides in retail
          // missions): position differs from the pad's own.
          expect(station.position).toBeDefined();
          expect(station.position).not.toBe(pad.position);
          // In the pad's mission group (powered + cleaned up like the
          // engine), with the back-links station.cs sets.
          expect(station._parent).toBe(pad._parent);
          expect(station.pad).toBe(pad);
          // Trigger creation ran (StationData::createTrigger).
          expect(station.trigger).toBeDefined();
          // Station team follows the pad team (setUpTeams ran first).
          expect(String(station.team)).toBe(String(pad.team));
          // GameBaseData::onAdd re-tags nameTag through addTaggedString;
          // identity tagged-string semantics must keep it human-readable
          // (a numeric value here means the stub regressed to tag ids).
          expect(String(pad.nametag)).toBe("Main Base");
        }

        // Flags got targets and team skins from CTFGame's objectiveInit.
        const flags = findByDatablock(
          runtime.state.objectsById.values(),
          "Flag",
        );
        expect(flags.length).toBe(2);
        for (const flag of flags) {
          expect(flag._target, `flag ${flag._id} target`).toBeGreaterThan(0);
          expect(String(flag._targetSkin ?? "")).not.toBe("");
        }

        // Power propagated: generators exist and stations play power
        // threads via StaticShapeData::onGainPowerEnabled.
        const invStations = findByDatablock(
          runtime.state.objectsById.values(),
          "StationInventory",
        );
        expect(invStations.length).toBeGreaterThan(0);
        const powered = invStations.filter(
          (station) => station._threads && Object.keys(station._threads).length,
        );
        expect(powered.length).toBeGreaterThan(0);

        // Ambient always-on threads (ShapeBaseData::onAdd alwaysAmbient).
        const flagsAnimating = flags.filter((flag) => flag._threads);
        expect(flagsAnimating.length).toBe(2);
      } finally {
        runtime.destroy();
      }
    },
  );

  it(
    "hides non-matching ShapeBase objects for other mission types",
    { timeout: 60_000 },
    async () => {
      // DustToDust marks its flags with missionTypesList = "CTF"; loading
      // as DM must hide them via ShapeBase::cleanNonType -> hide(true),
      // while leaving non-ShapeBase objects (interiors with a
      // missionTypesList) alone — SimObject::cleanNonType is a no-op.
      const { runtime, ready } = await runServer({
        missionName: "DustToDust",
        missionType: "DM",
        runtimeOptions: {
          loadScript: createScriptLoader({ searchPaths: SEARCH_PATHS }),
          fileSystem: createNodeFileSystem(),
          ignoreScripts,
        },
      });
      try {
        await ready;
        expect(runtime.$g.get("missionRunning")).toBeTruthy();

        const flags = findByDatablock(
          runtime.state.objectsById.values(),
          "Flag",
        );
        expect(flags.length).toBeGreaterThan(0);
        for (const flag of flags) {
          expect(flag.hidden, `flag ${flag._id} hidden in DM`).toBe(true);
        }

        // Interiors with missionTypesList survive un-hidden (the engine
        // never hides non-ShapeBase objects).
        let taggedInteriors = 0;
        for (const obj of runtime.state.objectsById.values()) {
          if (
            obj._class === "interiorinstance" &&
            obj.missiontypeslist != null &&
            obj.missiontypeslist !== ""
          ) {
            taggedInteriors++;
            expect(obj.hidden, `interior ${obj._id}`).not.toBe(true);
          }
        }
        expect(taggedInteriors).toBeGreaterThan(0);
      } finally {
        runtime.destroy();
      }
    },
  );
});
