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
import type { ServerInfo } from "./types.js";

/** Consecutive failing polls before a pinned server is released. */
const PATROL_STRIKES = 3;
/** Polls a pin may sit in pre-live states before that counts as failing
 *  (bounds servers that stall mid-handshake without disconnecting). */
const CONNECT_GRACE_TICKS = 5;
/** Re-pin cooldown after a quiet release or a died session — damps
 *  thrash loops (threshold oscillation, servers that kill sessions). */
const RELEASE_COOLDOWN_MS = 5 * 60_000;

export interface PatrolOptions {
  /** Case-insensitive whole-name globs (`*` wildcard; no `*` = exact). */
  patterns: string[];
  /** Mission-type display names to patrol — exact strings, matched
   *  case-insensitively; empty = all types. Live values: "Capture the
   *  Flag", "Capture the Flag (Practice)", "LakRabbit", "LCTF",
   *  "MA Duel MOD", "Team Rabbit 2", "Arena", "Construction". */
  missionTypes: string[];
  /** Non-observer players required to join and to stay pinned. */
  minPlayers: number;
  /** Concurrent pinned sessions cap (each is a full game connection). */
  maxSessions: number;
  intervalMs: number;
  getServerList: () => Promise<ServerInfo[]>;
  sessions: WatchSessionManager;
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
  if (!players) return server.playerCount - server.botCount;
  let count = players.length;
  if (teams && teams.length >= 2) {
    const teamNames = new Set(teams.map((t) => t.name.toLowerCase()));
    count = players.filter((p) => teamNames.has(p.team.toLowerCase())).length;
  }
  return Math.max(0, count - server.botCount);
}

export class Patroller {
  private opts: PatrolOptions;
  private regexps: RegExp[];
  private missionTypes: Set<string>;
  /** Normalized addresses this patroller pinned, with failing-poll
   *  counts and total polls since the pin. */
  private pinned = new Map<string, { strikes: number; ticks: number }>();
  /** Addresses in re-pin cooldown (until epoch ms). */
  private cooldown = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private stopped = false;

  constructor(opts: PatrolOptions) {
    this.opts = opts;
    this.regexps = opts.patterns.map(globToRegExp);
    this.missionTypes = new Set(
      opts.missionTypes.map((t) => t.trim().toLowerCase()),
    );
  }

  get pinnedCount(): number {
    return this.pinned.size;
  }

  start(): void {
    if (this.timer) return;
    log.info(
      {
        patterns: this.opts.patterns,
        minPlayers: this.opts.minPlayers,
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
    if (this.missionTypes.size === 0) return true;
    return this.missionTypes.has(gameType.trim().toLowerCase());
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
      // A disallowed mission type releases immediately (no strikes, no
      // cooldown — the type filter keeps it out until it rotates back).
      if (listed && !this.matchesType(listed.gameType)) {
        log.info(
          { address, gameType: listed.gameType },
          "Patrol releasing server (mission type not allowed)",
        );
        this.opts.sessions.unpin(address);
        this.pinned.delete(address);
        continue;
      }
      const eligible = listed?.players
        ? estimateEligiblePlayers(listed)
        : session.activePlayerCount;
      // Pre-live states get a bounded grace — a server that stalls the
      // handshake without disconnecting must not hold a pin forever.
      const qualifies =
        session.watchStatus !== "live"
          ? state.ticks <= CONNECT_GRACE_TICKS
          : eligible >= this.opts.minPlayers;
      if (qualifies) {
        state.strikes = 0;
        continue;
      }
      state.strikes++;
      if (state.strikes >= PATROL_STRIKES) {
        log.info({ address, eligible }, "Patrol releasing quiet server");
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
      if (server.passwordRequired) continue;
      const eligible = estimateEligiblePlayers(server);
      if (eligible < this.opts.minPlayers) continue;
      log.info(
        {
          address,
          name: server.name,
          eligible,
          players: server.playerCount,
          bots: server.botCount,
          roster: server.players != null,
        },
        "Patrol joining server",
      );
      this.opts.sessions.pin(address);
      this.pinned.set(address, { strikes: 0, ticks: 0 });
    }
  }
}
