import { generate, type GeneratorOptions } from "./codegen";
import { parse, type ParseOptions } from "./parser";
import type { Program } from "./ast";
import { createRuntime } from "./runtime";
import { registerEngineStubs } from "./engineMethods";
import { TorqueObject, TorqueRuntime, TorqueRuntimeOptions } from "./types";

export { parse, type ParseOptions } from "./parser";
export { generate, type GeneratorOptions } from "./codegen";
export type { Program } from "./ast";
export { createBuiltins } from "./builtins";
export { createProgressTracker, type ProgressTracker } from "./progress";
export { createRuntime, createScriptCache } from "./runtime";
export {
  DEFAULT_REACTIVE_FIELD_RULES,
  DEFAULT_REACTIVE_GLOBAL_NAMES,
  DEFAULT_REACTIVE_METHOD_RULES,
} from "./reactivity";
export { normalizePath } from "./utils";
export type {
  BuiltinsContext,
  BuiltinsFactory,
  FileSystemHandler,
  ReactiveFieldRule,
  ReactiveMethodRule,
  RuntimeEvent,
  RuntimeEventListener,
  RuntimeMutationEvent,
  RuntimeState,
  ScriptCache,
  TorqueObject,
  TorqueRuntime,
  TorqueRuntimeOptions,
} from "./types";

export type TranspileOptions = ParseOptions & GeneratorOptions;

export function transpile(
  source: string,
  options?: TranspileOptions,
): { code: string; ast: Program } {
  const ast = parse(source, options);
  const code = generate(ast, options);
  return { code, ast };
}

export interface RunServerOptions {
  missionName: string;
  missionType: string;
  runtimeOptions?: TorqueRuntimeOptions;
  onMissionLoadDone?: (game: TorqueObject) => void;
}

export interface RunServerResult {
  /** The runtime instance - available immediately for cleanup */
  runtime: TorqueRuntime;
  /** Promise that resolves when the mission has reached mission-ready state */
  ready: Promise<void>;
}

function isTruthyTorqueValue(value: any): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized !== "" && normalized !== "0" && normalized !== "false";
  }
  return Boolean(value);
}

function createAbortError(): Error {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

function waitForMissionReady(
  runtime: TorqueRuntime,
  options: {
    signal?: AbortSignal;
    onMissionLoadDone?: (game: TorqueObject) => void;
  },
): Promise<void> {
  const { signal, onMissionLoadDone } = options;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let didNotifyMissionLoadDone = false;

    const getGameObject = (): TorqueObject | undefined =>
      runtime.getObjectByName("Game");
    const isMissionRunning = (): boolean =>
      isTruthyTorqueValue(runtime.$g.get("missionRunning"));

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const notifyMissionLoadDone = (explicitGame?: TorqueObject) => {
      if (!onMissionLoadDone || didNotifyMissionLoadDone) {
        return;
      }
      const game = explicitGame ?? getGameObject();
      if (!game) {
        return;
      }
      didNotifyMissionLoadDone = true;
      onMissionLoadDone(game);
    };

    const handleAbort = () => fail(createAbortError());
    const unsubscribeRuntimeEvents = runtime.subscribeRuntimeEvents((event) => {
      if (event.type === "global.changed" && event.name === "missionrunning") {
        if (isTruthyTorqueValue(event.value)) {
          notifyMissionLoadDone();
          finish();
        }
        return;
      }

      if (event.type !== "batch.flushed") {
        return;
      }

      if (isMissionRunning()) {
        notifyMissionLoadDone();
        finish();
      }
    });

    function cleanup(): void {
      unsubscribeRuntimeEvents();
      signal?.removeEventListener("abort", handleAbort);
    }

    if (signal) {
      if (signal.aborted) {
        fail(createAbortError());
        return;
      }
      signal.addEventListener("abort", handleAbort, { once: true });
    }

    if (isMissionRunning()) {
      notifyMissionLoadDone();
      finish();
    }
  });
}

/**
 * Creates a TorqueScript runtime and loads a mission.
 *
 * Returns the runtime immediately (for cleanup) along with a promise that
 * resolves when the mission is ready. The caller is responsible for calling
 * runtime.destroy() in their cleanup, regardless of whether ready resolves
 * or rejects.
 */
export function runServer(options: RunServerOptions): RunServerResult {
  const { missionName, missionType, runtimeOptions, onMissionLoadDone } =
    options;
  const {
    signal,
    fileSystem,
    globals = {},
    preloadScripts = [],
    reactiveGlobalNames,
  } = runtimeOptions ?? {};

  // server.cs has a loop that calls `findFirstFile("scripts/*Game.cs")` and
  // runs `exec()` on each resulting glob match. Since we can't statically
  // analyze dynamic exec paths, we need to preload all game scripts in the same
  // way (so they're available when exec() is called). We could assume that we
  // only need some (like DefaultGame.cs and the one for our game type), but
  // sometimes map authors bundle a custom script that they don't exec() in the
  // .mis file, instead preferring to give it a "*Game.cs" name so it's loaded
  // automatically.
  const gameScripts = fileSystem?.findFiles("scripts/*Game.cs") ?? [];
  const mergedReactiveGlobalNames = reactiveGlobalNames
    ? Array.from(new Set([...reactiveGlobalNames, "missionRunning"]))
    : undefined;

  const runtime = createRuntime({
    ...runtimeOptions,
    reactiveGlobalNames: mergedReactiveGlobalNames,
    globals: {
      ...globals,
      "$Host::Map": missionName,
      "$Host::MissionType": missionType,
    },
    preloadScripts: [...preloadScripts, ...gameScripts],
  });

  registerEngineStubs(runtime);

  const ready = (async function createServer() {
    try {
      // Load all required scripts
      const serverScript = await runtime.loadFromPath("scripts/server.cs");
      signal?.throwIfAborted();

      // Also preload the mission file (another dynamic exec path)
      await runtime.loadFromPath(`missions/${missionName}.mis`);
      signal?.throwIfAborted();

      // Execute server.cs - it will exec() the game type and mission scripts
      serverScript.execute();

      // Tribes 2 mission readiness is script-driven (`Game.missionLoadDone()`
      // and then `$missionRunning = true` in loadMissionStage2), so we wait on
      // reactive global updates instead of hooking a specific method call.
      const missionReady = waitForMissionReady(runtime, {
        signal,
        onMissionLoadDone,
      });

      // Run CreateServer to start the mission
      const createServerScript = await runtime.loadFromSource(
        "CreateServer($Host::Map, $Host::MissionType);",
      );
      signal?.throwIfAborted();
      createServerScript.execute();
      await missionReady;
    } catch (err) {
      // AbortError is expected when the caller cancels - don't propagate
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      throw err;
    }
  })();

  return { runtime, ready };
}
