import {
  PlayerResolver,
  playerName,
  referencePlayer,
  type PlayerRecord,
  type PlayerReference,
} from "../../relay/playerReference";
import type { StreamSnapshot } from "../stream/types";
import { gameEntityStore } from "./gameEntityStore";
import type { PlayerEntity } from "./gameEntityTypes";
import { streamSnapshotStore } from "./streamSnapshotStore";

const emptyResolver = new PlayerResolver("demo", []);

let cached:
  | {
      roster: StreamSnapshot["playerRoster"];
      targets: StreamSnapshot["playerTargets"];
      resolver: PlayerResolver;
    }
  | undefined;

/** Roster identity and target metadata share one lookup; no alias/name cache to invalidate. */
export function getPlayerResolver(
  snapshot = streamSnapshotStore.getState().snapshot,
): PlayerResolver {
  const scope = snapshot?.playerIdentityScope ?? "demo";
  if (!snapshot) {
    cached = undefined;
    return emptyResolver;
  }
  if (
    cached &&
    cached.roster === snapshot.playerRoster &&
    cached.targets === snapshot.playerTargets &&
    cached.resolver.scope === scope
  )
    return cached.resolver;
  const resolver = new PlayerResolver(
    scope,
    snapshot.playerRoster ?? [],
    snapshot.playerTargets,
  );
  cached = {
    roster: snapshot.playerRoster,
    targets: snapshot.playerTargets,
    resolver,
  };
  return resolver;
}

export function playerForEntity(
  entity: PlayerEntity,
  resolver = getPlayerResolver(),
): PlayerRecord {
  const targetId =
    entity.targetId != null && entity.targetId >= 0
      ? entity.targetId
      : undefined;
  const candidates =
    targetId == null
      ? []
      : resolver.players.filter(
          (p) =>
            p.targetId === targetId &&
            (p.targetGeneration == null ||
              entity.targetGeneration == null ||
              p.targetGeneration === entity.targetGeneration),
        );
  if (candidates.length === 1 && candidates[0].name) return candidates[0];
  const rawName = entity.playerRawName || entity.playerName || "";
  // Old recordings can have a PLAYERLIST without target IDs.
  const named = resolver.byName(rawName);
  if (named && named.targetId == null)
    return { ...named, targetId, targetGeneration: entity.targetGeneration };
  return {
    ...(candidates.length === 1 ? candidates[0] : undefined),
    targetId,
    targetGeneration: entity.targetGeneration,
    rawName,
    name: playerName(rawName),
    teamId: entity.teamId,
  };
}

export function referencePlayerEntity(entity: PlayerEntity): PlayerReference {
  const resolver = getPlayerResolver();
  return referencePlayer(playerForEntity(entity, resolver), resolver.scope);
}

type PlayerBodyResult =
  | { status: "found"; body: PlayerEntity }
  | { status: "missing" | "ambiguous"; body?: undefined };

/** Identity ambiguity is independent of which players currently have visible bodies. */
export function lookupPlayerBody(
  ref: PlayerReference,
  livingOnly = true,
): PlayerBodyResult {
  const resolver = getPlayerResolver();
  const players = resolver.matches(ref);
  if (players.length > 1) return { status: "ambiguous" };
  const current = players[0];
  const target = current?.targetId;
  if (target != null && target < 0) return { status: "missing" };
  let newest: PlayerEntity | undefined;
  if (current && target != null && target >= 0) {
    for (const body of gameEntityStore.getState().streamEntities.values()) {
      if (
        body.renderType !== "Player" ||
        body.targetId !== target ||
        (livingOnly && body.damageState != null && body.damageState !== 0) ||
        (current.targetGeneration != null &&
          body.targetGeneration != null &&
          current.targetGeneration !== body.targetGeneration)
      )
        continue;
      if (!newest || (body.ghostIndex ?? 0) > (newest.ghostIndex ?? 0))
        newest = body;
    }
    return newest ? { status: "found", body: newest } : { status: "missing" };
  }
  // Targets can precede the roster, and old demo rosters can omit target IDs.
  const records = new Map<PlayerRecord, PlayerEntity>();
  const byTarget = new Map<number, PlayerRecord>();
  for (const body of gameEntityStore.getState().streamEntities.values()) {
    if (
      body.renderType !== "Player" ||
      (livingOnly && body.damageState != null && body.damageState !== 0)
    )
      continue;
    const record = playerForEntity(body, resolver);
    const existing =
      record.targetId != null ? byTarget.get(record.targetId) : undefined;
    if (!existing) {
      records.set(record, body);
      if (record.targetId != null) byTarget.set(record.targetId, record);
    } else if (
      (body.ghostIndex ?? 0) > (records.get(existing)!.ghostIndex ?? 0)
    )
      records.set(existing, body);
  }
  const bodyResolver = new PlayerResolver(
    resolver.scope,
    Array.from(records.keys()),
  );
  const matches = bodyResolver.matches(
    current ? referencePlayer(current, resolver.scope) : ref,
  );
  if (matches.length > 1) return { status: "ambiguous" };
  const player = matches[0];
  if (!player) return { status: "missing" };
  const record =
    player.targetId == null
      ? player
      : (byTarget.get(player.targetId) ?? player);
  const body = records.get(record);
  return body ? { status: "found", body } : { status: "missing" };
}

export function resolvePlayerBody(
  ref: PlayerReference,
  livingOnly = true,
): PlayerEntity | undefined {
  return lookupPlayerBody(ref, livingOnly).body;
}
