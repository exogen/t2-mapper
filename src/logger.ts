import pino from "pino";

/**
 * Module-scoped browser logging via pino.
 *
 * Control via VITE_LOG (comma-separated):
 *   "debug"                                    → all modules at debug
 *   "liveStreaming:debug,DebugSuspense:trace"  → those modules only, rest silent
 *   "debug,liveStreaming:trace"                → all at debug, liveStreaming at trace
 *
 * Bare level names (no colon) set the global default. Entries with colons
 * set per-module overrides. If no global level is specified but module
 * overrides exist, unlisted modules default to silent.
 *
 * Unset or empty → all modules default to "info".
 *
 * At runtime: `logger.level = "debug"` on any module logger.
 */

const PINO_LEVELS = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
]);

/** Parse VITE_PUBLIC_LOG into a global default and per-module overrides. */
function parseLogConfig(): {
  globalLevel: string;
  modules: Map<string, string>;
} {
  const raw = import.meta.env.VITE_PUBLIC_LOG?.trim();
  if (!raw) return { globalLevel: "info", modules: new Map() };

  let globalLevel: string | null = null;
  const modules = new Map<string, string>();

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (trimmed.includes(":")) {
      const [name, level] = trimmed.split(":");
      if (name && level) modules.set(name, level);
    } else if (PINO_LEVELS.has(trimmed)) {
      globalLevel = trimmed;
    }
  }

  // If only module overrides were given, default the rest to silent.
  globalLevel ??= modules.size > 0 ? "silent" : "info";

  return { globalLevel, modules };
}

const { globalLevel, modules: moduleLevels } = parseLogConfig();

// Map pino numeric levels → console methods.
const LEVEL_TO_CONSOLE: Record<number, "debug" | "log" | "warn" | "error"> = {
  10: "debug", // trace
  20: "debug",
  30: "log", // info
  40: "warn",
  50: "error",
  60: "error", // fatal
};

/**
 * Stash for raw log arguments so `write` can pass objects (like Errors)
 * directly to console instead of relying on pino's JSON serialization
 * (which turns Error objects into `{}`).
 */
let pendingArgs: unknown[] | null = null;

function write(o: { level: number; module?: string; msg: string }) {
  const method = LEVEL_TO_CONSOLE[o.level] ?? "log";
  const prefix = o.module ? `[${o.module}]` : "[t2-mapper]";
  if (pendingArgs) {
    console[method](prefix, ...pendingArgs);
    pendingArgs = null;
  } else {
    console[method](prefix, o.msg);
  }
}

export const rootLogger = pino({
  name: "t2-mapper",
  level: "trace", // allow children to go as low as they want
  browser: { write },
  hooks: {
    logMethod(inputArgs, method) {
      // Stash the raw args so `write` can forward objects to console directly
      // instead of relying on pino's %o (which JSON.stringifies Errors to {}).
      pendingArgs = inputArgs as unknown[];
      return method.apply(this, inputArgs as Parameters<typeof method>);
    },
  },
});

/** Create a named child logger. */
export function createLogger(name: string): pino.Logger {
  const level = moduleLevels.get(name) ?? globalLevel;
  return rootLogger.child({ module: name }, { level });
}
