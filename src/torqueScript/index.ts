import TorqueScript from "@/generated/TorqueScript.cjs";
import { generate, type GeneratorOptions } from "./codegen";
import type { Program } from "./ast";
import { createRuntime } from "./runtime";
import { TorqueObject, TorqueRuntime, TorqueRuntimeOptions } from "./types";

export { generate, type GeneratorOptions } from "./codegen";
export type { Program } from "./ast";
export { createBuiltins } from "./builtins";
export { createProgressTracker, type ProgressTracker } from "./progress";
export { createRuntime, createScriptCache } from "./runtime";
export { normalizePath } from "./utils";
export type {
  BuiltinsContext,
  BuiltinsFactory,
  FileSystemHandler,
  RuntimeState,
  ScriptCache,
  TorqueObject,
  TorqueRuntime,
  TorqueRuntimeOptions,
} from "./types";

export interface ParseOptions {
  filename?: string;
}

export type TranspileOptions = ParseOptions & GeneratorOptions;

export function parse(source: string, options?: ParseOptions): Program {
  try {
    return TorqueScript.parse(source);
  } catch (error: any) {
    if (options?.filename && error.location) {
      throw new Error(
        `${options.filename}:${error.location.start.line}:${error.location.start.column}: ${error.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}

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
  /** Promise that resolves when the mission is fully loaded and CreateServer has run */
  ready: Promise<void>;
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
  const { signal, fileSystem } = runtimeOptions ?? {};

  const runtime = createRuntime({
    ...runtimeOptions,
    globals: {
      ...runtimeOptions?.globals,
      "$Host::Map": missionName,
      "$Host::MissionType": missionType,
    },
  });
  const gameTypeName = `${missionType}Game`;
  const gameTypeScript = `scripts/${gameTypeName}.cs`;

  const ready = (async function createServer() {
    try {
      // Load all required scripts
      const serverScript = await runtime.loadFromPath("scripts/server.cs");
      signal?.throwIfAborted();

      // server.cs has a glob loop that does: findFirstFile("scripts/*Game.cs")
      // and then exec()s each result dynamically. Since we can't statically
      // analyze dynamic exec paths, we need to either preload all game scripts
      // in the same way (so they're available when exec() is called) or just
      // exec() the ones we know we need...
      //
      // To load them all, do:
      // if (fileSystem) {
      //   const gameScripts = fileSystem.findFiles("scripts/*Game.cs");
      //   await Promise.all(
      //     gameScripts.map((path) => runtime.loadFromPath(path)),
      //   );
      //   signal?.throwIfAborted();
      // }
      await runtime.loadFromPath("scripts/DefaultGame.cs");
      signal?.throwIfAborted();
      try {
        await runtime.loadFromPath(gameTypeScript);
      } catch (err) {
        // It's OK if that one fails. Not every game type needs its own script.
      }
      signal?.throwIfAborted();

      // Also preload the mission file (another dynamic exec path)
      await runtime.loadFromPath(`missions/${missionName}.mis`);
      signal?.throwIfAborted();

      // Execute server.cs - it will exec() the game type and mission scripts
      serverScript.execute();

      // Set up mission ready hook. It's unfortunate that we have to do it this
      // way, but there's no event system in TorqueScript. The problem is that
      // `CreateServer` will defer some actions using `schedule()`, so the
      // objects are created some arbitrary amount of time afterward, and we
      // don't actually know when they're ready. But, we can spy on the
      // `missionLoadDone` method using the runtime's `onMethodCalled` feature,
      // which we added specifically to solve this problem.
      if (onMissionLoadDone) {
        runtime.$.onMethodCalled(
          "DefaultGame",
          "missionLoadDone",
          onMissionLoadDone,
        );
      }

      // Run CreateServer to start the mission
      const createServerScript = await runtime.loadFromSource(
        "CreateServer($Host::Map, $Host::MissionType);",
      );
      signal?.throwIfAborted();
      createServerScript.execute();
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
