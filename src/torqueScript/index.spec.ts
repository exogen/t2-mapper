import { describe, expect, it, vi } from "vitest";
import { runServer } from "./index";
import type { TorqueRuntimeOptions } from "./types";

function createRuntimeOptions(
  files: Record<string, string>,
): TorqueRuntimeOptions {
  const normalizedFiles = Object.fromEntries(
    Object.entries(files).map(([path, source]) => [
      path.replace(/\\/g, "/").toLowerCase(),
      source,
    ]),
  );

  return {
    loadScript: async (path: string) =>
      normalizedFiles[path.replace(/\\/g, "/").toLowerCase()] ?? null,
    fileSystem: {
      findFiles: (pattern: string) => {
        if (pattern.toLowerCase() === "scripts/*game.cs") {
          return [];
        }
        return [];
      },
      isFile: (path: string) =>
        normalizedFiles[path.replace(/\\/g, "/").toLowerCase()] != null,
    },
  };
}

describe("runServer", () => {
  it("resolves when mission is running and notifies missionLoadDone callback", async () => {
    const runtimeOptions = createRuntimeOptions({
      "scripts/server.cs": `
        function DefaultGame::missionLoadDone(%game) {
          %game.ready = true;
        }

        function CreateServer(%mission, %missionType) {
          new ScriptObject(Game) {
            class = "DefaultGame";
          };
          Game.missionLoadDone();
          $missionRunning = true;
        }
      `,
      "missions/TestMap.mis": "",
    });
    const onMissionLoadDone = vi.fn();

    const { runtime, ready } = runServer({
      missionName: "TestMap",
      missionType: "CTF",
      runtimeOptions,
      onMissionLoadDone,
    });

    await ready;

    expect(onMissionLoadDone).toHaveBeenCalledTimes(1);
    expect(onMissionLoadDone.mock.calls[0][0]._name).toBe("Game");
    expect(runtime.$g.get("missionRunning")).toBe(true);
    runtime.destroy();
  });

  it("does not resolve readiness from missionLoadDone alone", async () => {
    const runtimeOptions = createRuntimeOptions({
      "scripts/server.cs": `
        function DefaultGame::missionLoadDone(%game) {
          %game.ready = true;
        }

        function CreateServer(%mission, %missionType) {
          new ScriptObject(Game) {
            class = "DefaultGame";
          };
          Game.missionLoadDone();
        }
      `,
      "missions/TestMap.mis": "",
    });
    const controller = new AbortController();
    const onMissionLoadDone = vi.fn();

    const { runtime, ready } = runServer({
      missionName: "TestMap",
      missionType: "CTF",
      runtimeOptions: {
        ...runtimeOptions,
        signal: controller.signal,
      },
      onMissionLoadDone,
    });

    await Promise.resolve();
    expect(onMissionLoadDone).toHaveBeenCalledTimes(0);
    controller.abort();
    await ready;

    expect(onMissionLoadDone).toHaveBeenCalledTimes(0);
    runtime.destroy();
  });
});
