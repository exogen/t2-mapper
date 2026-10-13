import {
  normalizePlayerGuid,
  stripTaggedStringMarkup,
  taglessPlayerName,
} from "./shared.js";

/** Prefer protocol identity; retain the public name for unresolved/reconnected players. */
export type PlayerReference =
  | { kind: "name"; rawName: string; match?: "base" }
  | {
      kind: "player";
      scope: string;
      clientId?: number;
      clientGeneration?: number;
      targetId?: number;
      targetGeneration?: number;
      guid?: string;
      rawName: string;
    };

export interface PlayerIdentityState {
  scope: string;
  /** Null when an older checkpoint/catch-up omitted the prior join history. */
  generations: Map<number, number> | null;
}

export interface PlayerRecord {
  clientId?: number;
  clientGeneration?: number;
  targetId?: number;
  targetGeneration?: number;
  guid?: string;
  name: string;
  rawName: string;
  teamId?: number;
}

export function playerName(rawName: string): string {
  return stripTaggedStringMarkup(rawName).trim();
}

export function referencePlayer(
  player: PlayerRecord,
  scope: string,
): PlayerReference {
  const { clientId, clientGeneration, targetId, targetGeneration, guid } =
    player;
  const rawName = player.rawName || player.name;
  if (clientId == null && (targetId == null || targetId < 0))
    return { kind: "name", rawName };
  return {
    kind: "player",
    scope,
    clientId,
    clientGeneration: clientId != null ? (clientGeneration ?? 0) : undefined,
    ...(targetId != null && targetId >= 0 && { targetId, targetGeneration }),
    guid: normalizePlayerGuid(guid),
    rawName,
  };
}

function unique<T>(values: T[]): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function withTarget(player: PlayerRecord, target?: PlayerRecord): PlayerRecord {
  return {
    ...player,
    targetId: target?.targetId ?? player.targetId,
    targetGeneration: target?.targetGeneration ?? player.targetGeneration,
    teamId: player.teamId ?? target?.teamId,
    rawName: target?.rawName || player.rawName || player.name,
    name: target?.name || player.name,
  };
}

/** Pure lookup over current protocol records. Never keeps aliases or account names. */
export class PlayerResolver {
  readonly scope: string;
  readonly players: readonly PlayerRecord[];
  constructor(
    scope: string,
    players: readonly PlayerRecord[],
    targets: readonly PlayerRecord[] = [],
  ) {
    this.scope = scope;
    if (!targets.length) {
      this.players = players;
      return;
    }
    const remaining = new Map(
      targets.map((target) => [target.targetId, target]),
    );
    const linkedIds = new Set(players.map((player) => player.targetId));
    this.players = players
      .map<PlayerRecord>((player) => {
        let target = remaining.get(player.targetId);
        if (player.targetId == null) {
          // PLAYERLIST headers in older demos omit target IDs. Only associate
          // a name when neither table has another player with that full name.
          if (
            player.name &&
            players.filter((p) => p.name === player.name).length === 1
          )
            target = unique(
              Array.from(remaining.values()).filter(
                (p) => !linkedIds.has(p.targetId) && p.name === player.name,
              ),
            );
        }
        if (target) remaining.delete(target.targetId);
        return withTarget(player, target);
      })
      .concat(Array.from(remaining.values()));
  }

  private named(rawName: string, base = false): PlayerRecord[] {
    const name = playerName(rawName);
    if (!name) return [];
    // Full names distinguish players who happen to share a tagless name.
    if (!base) return this.players.filter((p) => p.name === name);
    const key = taglessPlayerName(rawName, name).toLowerCase();
    return this.players.filter(
      (p) => taglessPlayerName(p.rawName, p.name).toLowerCase() === key,
    );
  }

  byName(rawName: string, base = false): PlayerRecord | undefined {
    return unique(this.named(rawName, base));
  }

  matches(ref: PlayerReference): PlayerRecord[] {
    if (ref.kind === "name")
      return this.named(ref.rawName, ref.match === "base");
    if (ref.scope === this.scope) {
      const candidates = this.players.filter((p) =>
        ref.clientId != null
          ? p.clientId === ref.clientId
          : p.targetId === ref.targetId,
      );
      let current = unique(candidates);
      if (current && current.targetId == null && ref.targetGeneration != null) {
        // A saved reference can retain the target association that an old
        // PLAYERLIST omitted, even after the target's public name changes.
        const target = unique(
          this.players.filter(
            (p) =>
              p.clientId == null &&
              p.targetId === ref.targetId &&
              p.targetGeneration === ref.targetGeneration,
          ),
        );
        if (target) current = withTarget(current, target);
      }
      const sameTarget =
        current &&
        ref.targetId != null &&
        current.targetId === ref.targetId &&
        ref.targetGeneration != null &&
        current.targetGeneration === ref.targetGeneration;
      const sameClient =
        current &&
        ref.clientId != null &&
        ref.clientGeneration != null &&
        (current.clientGeneration ?? 0) === ref.clientGeneration &&
        (current.clientGeneration != null ||
          ref.targetGeneration == null ||
          sameTarget);
      if (
        current &&
        (!ref.guid || !current.guid || ref.guid === current.guid) &&
        (sameClient ||
          (sameTarget &&
            (!ref.clientGeneration || current.clientGeneration == null)) ||
          (ref.clientGeneration == null &&
            ref.targetGeneration == null &&
            taglessPlayerName(
              ref.rawName,
              playerName(ref.rawName),
            ).toLowerCase() ===
              taglessPlayerName(current.rawName, current.name).toLowerCase()))
      )
        return [current];
    }
    // An account can reconnect with new connection/target IDs and a new name.
    if (ref.guid) {
      const accounts = this.players.filter((p) => p.guid === ref.guid);
      if (accounts.length) return accounts;
    }
    // Hidden GUIDs leave only a public name across reconnects. Never use that
    // fallback to accept a different occupant of an ID in the same stream.
    const exact = this.named(ref.rawName);
    const named = exact.length ? exact : this.named(ref.rawName, true);
    return named.filter(
      (player) =>
        (!ref.guid || !player.guid || ref.guid === player.guid) &&
        (ref.scope !== this.scope ||
          (ref.clientId != null
            ? player.clientId !== ref.clientId
            : player.targetId !== ref.targetId)),
    );
  }

  resolve(ref: PlayerReference): PlayerRecord | undefined {
    return unique(this.matches(ref));
  }

  reference(rawName: string): PlayerReference {
    const player = this.byName(rawName);
    return player
      ? referencePlayer(player, this.scope)
      : { kind: "name", rawName };
  }

  /** Retain the latest confirmed identity/name for a later reconnect. */
  refresh(ref: PlayerReference): PlayerReference {
    const current = this.resolve(ref);
    if (!current) return ref;
    const next = referencePlayer(
      {
        ...current,
        rawName: current.rawName || current.name || ref.rawName,
        guid: current.guid ?? (ref.kind === "player" ? ref.guid : undefined),
        clientGeneration:
          current.clientGeneration ??
          (ref.kind === "player" &&
          ref.scope === this.scope &&
          ref.clientId === current.clientId
            ? ref.clientGeneration
            : undefined),
      },
      this.scope,
    );
    return Object.entries(next).every(
      ([key, value]) => Reflect.get(ref, key) === value,
    )
      ? ref
      : next;
  }

  display(ref: PlayerReference): {
    name: string;
    rawName: string;
    teamId?: number;
  } {
    const player = this.resolve(ref);
    const rawName = player?.rawName || player?.name || ref.rawName;
    return { name: playerName(rawName), rawName, teamId: player?.teamId };
  }
}

/** Player targets remain available even while their bodies are out of scope. */
export function collectPlayerTargets(
  names: ReadonlyMap<number, string>,
  types: ReadonlyMap<number, string>,
  teams: ReadonlyMap<number, number>,
  generations: ReadonlyMap<number, number>,
  knownIds: Iterable<number>,
): PlayerRecord[] {
  const ids = new Set(knownIds);
  for (const [id, type] of types) if (type === "_ClientConnection") ids.add(id);
  return Array.from(ids)
    .filter((id) => id >= 0)
    .map((targetId) => {
      const rawName = names.get(targetId) ?? "";
      return {
        targetId,
        targetGeneration: generations.get(targetId) ?? 0,
        rawName,
        name: playerName(rawName),
        teamId: teams.get(targetId),
      };
    });
}
