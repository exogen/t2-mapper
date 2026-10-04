/**
 * Server patrol: with demo recording enabled, MapGenius proactively
 * joins servers whose names match a configured list and records them —
 * no human watcher required. Sessions are "pinned" (exempt from idle
 * teardown) while the server qualifies.
 *
 * Join is probational: the server-list player count is only a rough
 * pre-filter (it can't distinguish observers or teams). The accurate
 * non-observer count arrives once connected, and a pinned session that
 * stays below the threshold for consecutive polls is released. The
 * recording keep-gates (min players, match started) ensure a mistaken
 * probe never produces a junk demo.
 */
import { demoLog as log } from "./logger.js";
import { normalizeAddress, type WatchSessionManager } from "./watchSession.js";
import type { ServerInfo, WatchStatus } from "./types.js";

/** Consecutive failing polls before a pinned server is released. */
const PATROL_STRIKES = 3;
/** Polls a pin may sit in pre-live states before that counts as failing
 *  (bounds servers that stall mid-handshake without disconnecting). */
const CONNECT_GRACE_TICKS = 5;
/** Re-pin cooldown after a quiet release or a died session — damps
 *  thrash loops (threshold oscillation, servers that kill sessions). */
const RELEASE_COOLDOWN_MS = 2 * 60_000;

export interface PatrolOptions {
  /** Case-insensitive whole-name globs (`*` wildcard; no `*` = exact). */
  patterns: string[];
  /** Mission-type display names to patrol — exact strings, matched
   *  case-insensitively; empty = all types. Live values: "Capture the
   *  Flag", "Capture the Flag (Practice)", "LakRabbit", "LCTF",
   *  "MA Duel MOD", "Team Rabbit 2", "Arena", "Construction". */
  missionTypes: string[];
  /** Exact, case-insensitive type exclusions, including allowed types. */
  excludedMissionTypes?: string[];
  /** Non-observer players required to join and to stay pinned. */
  minPlayers: number;
  /** Exact, case-insensitive type overrides; other types use minPlayers. */
  minPlayersByType?: Readonly<Record<string, number>>;
  /** Concurrent pinned sessions cap (each is a full game connection). */
  maxSessions: number;
  intervalMs: number;
  getServerList: () => Promise<ServerInfo[]>;
  /** Relay-only availability check; no passwords enter patrol status. */
  hasServerPassword?: (server: ServerInfo) => boolean;
  sessions: WatchSessionManager;
}

export function loadPatrolInteger(
  raw: string | undefined,
  envName: string,
  fallback: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const value = raw?.trim();
  const parsed = value ? Number(value) : fallback;
  if (
    (value && !/^\d+$/.test(value)) ||
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    throw new Error(`${envName} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

/** JSON array or comma-separated list, shared by patrol and tournament filters. */
export function loadPatrolList(
  raw: string | undefined,
  envName: string,
): string[] {
  const value = raw?.trim();
  if (!value) return [];
  if (!value.startsWith("[") && !value.startsWith("{")) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `${envName} must be a JSON string array or comma-separated list`,
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== "string")
  ) {
    throw new Error(
      `${envName} must be a JSON string array or comma-separated list`,
    );
  }
  return parsed.map((item: string) => item.trim()).filter(Boolean);
}

export function loadPatrolPlayerMinimums(
  raw: string | undefined,
): Record<string, number> {
  if (!raw?.trim()) return {};
  const error = () =>
    new Error(
      "DEMO_PATROL_MIN_PLAYERS_BY_TYPE must be a JSON object of distinct game types and non-negative integer minimums",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw error();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw error();
  const seen = new Set<string>();
  const entries: Array<[string, number]> = [];
  for (const [type, minimum] of Object.entries(parsed)) {
    const name = type.trim();
    const normalized = name.toLowerCase();
    if (
      !name ||
      seen.has(normalized) ||
      !Number.isSafeInteger(minimum) ||
      minimum < 0
    ) {
      throw error();
    }
    seen.add(normalized);
    entries.push([name, minimum]);
  }
  return Object.fromEntries(entries);
}

/** Case-insensitive whole-string glob (only `*` is special). */
export function globToRegExp(pattern: string): RegExp {
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = pattern.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${source}$`, "i");
}

/**
 * Best estimate of non-observer, non-bot players. With a roster (the
 * info response's status tail) in a team game, count players on a real
 * team — observers sit on $teamName[0], never among the header teams —
 * then subtract botCount, since bots hold teams and are indistinguishable
 * from humans in the roster (but the server counts them accurately:
 * bot-showcase servers report botCount == playerCount). Teamless modes
 * can't separate observers. Without a roster, raw counts are all there
 * is (they include observers — our own included).
 */
export function estimateEligiblePlayers(server: ServerInfo): number {
  const { players, teams } = server;
  if (!players) return Math.max(0, server.playerCount - server.botCount);
  let count = players.length;
  if (teams && teams.length >= 2) {
    const teamNames = new Set(teams.map((t) => t.name.toLowerCase()));
    count = players.filter((p) => teamNames.has(p.team.toLowerCase())).length;
  }
  return Math.max(0, count - server.botCount);
}

interface PinState {
  strikes: number;
  /**
   * Total polls since the pin.
   */
  ticks: number;
  serverName: string;
  gameType: string;
  pinnedAt: number;
  /**
   * Eligible-player estimate from the most recent poll.
   */
  lastEligible: number;
}

export interface PatrolStatus {
  patterns: string[];
  missionTypes: string[];
  excludedMissionTypes: string[];
  minPlayers: number;
  minPlayersByType: Record<string, number>;
  maxSessions: number;
  intervalMs: number;
  /**
   * Seconds since the last successful evaluation (null before the
   * first) — grows past intervalMs when server-list polls fail.
   */
  lastTickAgoSec: number | null;
  pinned: Array<{
    address: string;
    serverName: string;
    gameType: string;
    minPlayers: number;
    /**
     * "missing" = session died; released on the next tick.
     */
    status: WatchStatus | "missing";
    eligiblePlayers: number;
    watchers: number;
    recording: boolean;
    strikes: number;
    pinnedForSec: number;
  }>;
  cooldowns: Array<{ address: string; remainingSec: number }>;
}

export class Patroller {
  private opts: PatrolOptions;
  private regexps: RegExp[];
  private missionTypes: Set<string>;
  private excludedMissionTypes: Set<string>;
  private minPlayersByType: Map<string, number>;
  /** Normalized addresses this patroller pinned, with failing-poll
   *  counts and total polls since the pin. */
  private pinned = new Map<string, PinState>();
  /** Addresses in re-pin cooldown (until epoch ms). */
  private cooldown = new Map<string, number>();
  private lastTickAt: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private stopped = false;

  constructor(opts: PatrolOptions) {
    this.opts = opts;
    this.regexps = opts.patterns.map(globToRegExp);
    this.missionTypes = new Set(
      opts.missionTypes.map((t) => t.trim().toLowerCase()),
    );
    this.excludedMissionTypes = new Set(
      (opts.excludedMissionTypes ?? []).map((t) => t.trim().toLowerCase()),
    );
    this.minPlayersByType = new Map(
      Object.entries(opts.minPlayersByType ?? {}).map(([type, minimum]) => [
        type.trim().toLowerCase(),
        minimum,
      ]),
    );
  }

  get pinnedCount(): number {
    return this.pinned.size;
  }

  /**
   * Snapshot for the /health endpoint.
   */
  getStatus(): PatrolStatus {
    const now = Date.now();
    return {
      patterns: [...this.opts.patterns],
      missionTypes: [...this.opts.missionTypes],
      excludedMissionTypes: [...(this.opts.excludedMissionTypes ?? [])],
      minPlayers: this.opts.minPlayers,
      minPlayersByType: { ...this.opts.minPlayersByType },
      maxSessions: this.opts.maxSessions,
      intervalMs: this.opts.intervalMs,
      lastTickAgoSec:
        this.lastTickAt === null
          ? null
          : Math.round((now - this.lastTickAt) / 1000),
      pinned: [...this.pinned].map(([address, state]) => {
        const session = this.opts.sessions.getSession(address);
        return {
          address,
          serverName: state.serverName,
          gameType: state.gameType,
          minPlayers: this.minimumPlayers(state.gameType),
          status: session?.watchStatus ?? "missing",
          eligiblePlayers: state.lastEligible,
          watchers: session?.watcherCount ?? 0,
          recording: session?.recording ?? false,
          strikes: state.strikes,
          pinnedForSec: Math.round((now - state.pinnedAt) / 1000),
        };
      }),
      // Expired entries are pruned by evaluate(); skip any caught
      // between ticks — they no longer block a re-pin.
      cooldowns: [...this.cooldown]
        .filter(([, until]) => until > now)
        .map(([address, until]) => ({
          address,
          remainingSec: Math.round((until - now) / 1000),
        })),
    };
  }

  start(): void {
    if (this.timer) return;
    log.info(
      {
        patterns: this.opts.patterns,
        missionTypes: this.opts.missionTypes,
        excludedMissionTypes: this.opts.excludedMissionTypes ?? [],
        minPlayers: this.opts.minPlayers,
        minPlayersByType: this.opts.minPlayersByType ?? {},
        maxSessions: this.opts.maxSessions,
      },
      "Server patrol active",
    );
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
    void this.tick();
  }

  /** Idempotent; an in-flight tick becomes a no-op past its next await. */
  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private matches(name: string): boolean {
    return this.regexps.some((re) => re.test(name));
  }

  private matchesType(gameType: string): boolean {
    const type = gameType.trim().toLowerCase();
    return (
      !this.excludedMissionTypes.has(type) &&
      (this.missionTypes.size === 0 || this.missionTypes.has(type))
    );
  }

  private minimumPlayers(gameType: string): number {
    return (
      this.minPlayersByType.get(gameType.trim().toLowerCase()) ??
      this.opts.minPlayers
    );
  }

  async tick(): Promise<void> {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      await this.evaluate();
    } catch (err) {
      log.warn({ err }, "Patrol tick failed");
    } finally {
      this.ticking = false;
    }
  }

  private async evaluate(): Promise<void> {
    const servers = await this.opts.getServerList();
    // Shutdown may have started while the list query was in flight —
    // never create sessions past that point.
    if (this.stopped) return;
    const now = Date.now();
    this.lastTickAt = now;
    for (const [address, until] of this.cooldown) {
      if (until <= now) this.cooldown.delete(address);
    }
    const byAddress = new Map(
      servers.map((s) => [normalizeAddress(s.address), s]),
    );

    // Re-evaluate current pins. Prefer the fresh list roster (it knows
    // botCount, which the post-join view can't see — bots hold teams);
    // fall back to the session's accurate non-observer count.
    for (const [address, state] of this.pinned) {
      state.ticks++;
      const session = this.opts.sessions.getSession(address);
      if (!session) {
        // Session died (server unreachable, kicked, resync budget
        // exhausted) — release with a cooldown so a session-killing
        // server isn't re-probed every tick.
        log.info({ address }, "Patrol releasing dead session");
        this.pinned.delete(address);
        this.cooldown.set(address, now + RELEASE_COOLDOWN_MS);
        continue;
      }
      const listed = byAddress.get(address);
      if (listed) {
        state.serverName = listed.name;
        state.gameType = listed.gameType;
      }
      if (!this.matches(state.serverName)) {
        log.info(
          { address, name: state.serverName },
          "Patrol releasing server (server name not allowed)",
        );
        this.opts.sessions.unpin(address);
        this.pinned.delete(address);
        continue;
      }
      // A disallowed mission type releases immediately (no strikes, no
      // cooldown — the type filter keeps it out until it rotates back).
      if (!this.matchesType(state.gameType)) {
        log.info(
          { address, gameType: state.gameType },
          "Patrol releasing server (mission type not allowed)",
        );
        this.opts.sessions.unpin(address);
        this.pinned.delete(address);
        continue;
      }
      const minPlayers = this.minimumPlayers(state.gameType);
      const eligible = listed?.players
        ? estimateEligiblePlayers(listed)
        : session.activePlayerCount;
      // Pre-live with no roster, the session count is an empty stub —
      // keep the pin-time estimate for status reporting instead.
      if (session.watchStatus === "live" || listed?.players) {
        state.lastEligible = eligible;
      }
      // Pre-live states get a bounded grace — a server that stalls the
      // handshake without disconnecting must not hold a pin forever.
      const qualifies =
        session.watchStatus !== "live"
          ? state.ticks <= CONNECT_GRACE_TICKS
          : eligible >= minPlayers;
      if (qualifies) {
        state.strikes = 0;
        continue;
      }
      state.strikes++;
      if (state.strikes >= PATROL_STRIKES) {
        log.info(
          { address, gameType: state.gameType, eligible, minPlayers },
          "Patrol releasing quiet server",
        );
        this.opts.sessions.unpin(address);
        this.pinned.delete(address);
        this.cooldown.set(address, now + RELEASE_COOLDOWN_MS);
      }
    }

    // Probe new candidates from the list.
    for (const server of servers) {
      if (this.pinned.size >= this.opts.maxSessions) break;
      const address = normalizeAddress(server.address);
      if (this.pinned.has(address)) continue;
      if (this.cooldown.has(address)) continue;
      if (!this.matches(server.name)) continue;
      if (!this.matchesType(server.gameType)) continue;
      // Can't join what we can't authenticate to.
      if (server.passwordRequired && !this.opts.hasServerPassword?.(server))
        continue;
      const eligible = estimateEligiblePlayers(server);
      const minPlayers = this.minimumPlayers(server.gameType);
      if (eligible < minPlayers) continue;
      log.info(
        {
          address,
          name: server.name,
          gameType: server.gameType,
          eligible,
          minPlayers,
          players: server.playerCount,
          bots: server.botCount,
          roster: server.players != null,
        },
        "Patrol joining server",
      );
      this.opts.sessions.pin(address);
      this.pinned.set(address, {
        strikes: 0,
        ticks: 0,
        serverName: server.name,
        gameType: server.gameType,
        pinnedAt: now,
        lastEligible: eligible,
      });
    }
  }
}
