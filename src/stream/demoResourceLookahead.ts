import type {
  DemoParser,
  GhostUpdate,
  PacketData,
  ParsedData,
} from "t2-demo-parser";
import {
  TargetTable,
  type TargetInfoFields,
} from "../../relay/connectionState";
import { resolveEmitterData } from "../particles/ParticleSystem";
import { resolveShapeName } from "./streamHelpers";
import { GhostMessage, projectileClassNames } from "./entityClassification";
import {
  forkDemoLookahead,
  readDemoLookaheadBlock,
  type DemoLookaheadFork,
} from "./demoLookaheadParser";

export type DemoResourceHint = (
  | {
      kind: "shape" | "effectShape" | "texture" | "particleTexture";
      name: string;
    }
  | {
      kind: "playerSkin";
      shapeName: string;
      skinName?: string;
      skinPrefName?: string;
    }
) & { observedEffect?: true };

export function isDemoEffectEntity(className: string): boolean {
  return (
    projectileClassNames.has(className) ||
    className === "SniperProjectile" ||
    className === "ShockLanceProjectile" ||
    className === "ELFProjectile" ||
    className === "RepairProjectile" ||
    className === "Explosion" ||
    className === "Splash" ||
    className === "Debris" ||
    className === "ParticleEmissionDummy"
  );
}

/** Effects spawned or in flight take precedence over potential weapon effects. */
export function asObservedDemoEffect(hint: DemoResourceHint): DemoResourceHint {
  return hint.kind === "shape"
    ? { kind: "effectShape", name: hint.name, observedEffect: true }
    : { ...hint, observedEffect: true };
}

export function demoResourceKey(hint: DemoResourceHint): string {
  return hint.kind === "playerSkin"
    ? JSON.stringify([
        hint.kind,
        hint.shapeName,
        hint.skinName,
        hint.skinPrefName,
      ])
    : `${hint.kind}:${hint.name}`;
}

export interface DemoResourceScanResult {
  hints: readonly DemoResourceHint[];
  complete: boolean;
}

type DataBlockLookup = (id: number) => ParsedData | undefined;
type AddResource = (hint: DemoResourceHint) => void;

const SHAPE_FIELDS = [
  "shapeName",
  "projectileShapeName",
  "dtsFileName",
  "debrisShapeName",
  "casingShapeName",
];
const TEXTURE_FIELDS = [
  "texture",
  "texture0",
  "texture1",
  "tracerTex0",
  "tracerTex1",
  "foamTexture",
  "mapToTexture",
  "smokeTexture",
  "bombTexture",
  "flareTexture",
  "flareBaseTexture",
  "flareModTexture",
  "lensFlareTexture",
];
const EFFECT_REFS = [
  "projectile",
  "explosion",
  "underwaterExplosion",
  "subExplosions",
  "splash",
  "debris",
  "casing",
  "casingDebris",
  "muzzleFlash",
  "shockwave",
  "baseEmitter",
  "emitter",
  "delayEmitter",
  "bubbleEmitter",
  "particleEmitter",
  "puffEmitter",
  "exhaustEmitter",
  "jetEmitter",
  "jetEmitters",
  "footPuffEmitter",
  "dustEmitter",
  "dustTrailEmitter",
  "tireEmitter",
  "damageEmitters",
  "splashEmitters",
  "emitter0",
  "emitter1",
  "emitters",
  "decalData",
  "decals",
];

function resourceName(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Related resources for already observed datablocks, including effects that are
 * synthesized by the client at impact and may never have a ghost of their own. */
export function collectDemoDatablockResources(
  id: unknown,
  lookup: DataBlockLookup,
  add: AddResource,
  seen = new Set<number>(),
): void {
  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    seen.has(id) ||
    seen.size >= 256
  )
    return;
  const data = lookup(id);
  if (!data) return;
  seen.add(id);
  for (const field of SHAPE_FIELDS) {
    const name = resourceName(data[field]);
    if (name) add({ kind: "shape", name });
  }
  for (const field of TEXTURE_FIELDS) {
    const name = resourceName(data[field]);
    if (name) add({ kind: "texture", name });
  }
  const particleTexture = resourceName(data.textureName);
  if (particleTexture) add({ kind: "particleTexture", name: particleTexture });
  if (Array.isArray(data.particles)) {
    const name = resolveEmitterData(data, lookup)?.particles.textureName;
    if (name) add({ kind: "particleTexture", name });
  }
  if (Array.isArray(data.textures)) {
    const kind = Array.isArray(data.keys) ? "particleTexture" : "texture";
    for (const value of data.textures) {
      const name = resourceName(value);
      if (name) add({ kind, name });
    }
  }
  for (const field of EFFECT_REFS) {
    const value = data[field];
    if (Array.isArray(value)) {
      for (const ref of value)
        collectDemoDatablockResources(ref, lookup, add, seen);
    } else {
      collectDemoDatablockResources(value, lookup, add, seen);
    }
  }
  if (Array.isArray(data.states))
    for (const state of data.states)
      collectDemoDatablockResources(state?.emitter, lookup, add, seen);
}

interface PlayerResourceState {
  ghostIndex: number;
  className: string;
  dataBlockId?: number;
  targetId?: number;
}

interface LookaheadSeed {
  netStrings: ReadonlyMap<number, string>;
  targets: TargetTable;
  entities: Iterable<PlayerResourceState>;
}

interface ResourceOccurrence {
  hint: DemoResourceHint;
  /** One entry per observed move tick, within the bounded lookahead window. */
  ticks: number[];
  effectTicks: number[];
}

interface Cursor {
  tick: number;
  requestedTick: number;
  netStrings: Map<number, string>;
  targets: TargetTable;
  players: Map<number, PlayerResourceState>;
  pending: Map<string, DemoResourceHint>;
  resources: Map<string, ResourceOccurrence>;
  stopped: boolean;
  completed?: { targetTick: number; result: DemoResourceScanResult };
}

const EMPTY_RESULT: DemoResourceScanResult = { hints: [], complete: true };
const MAX_AHEAD_TICKS = 1_024;
const MAX_CATCHUP_TICKS = 16;
const MAX_BLOCKS_PER_SLICE = 128;
const MAX_SLICE_MS = 2;
const MAX_HINTS = 256;

function collectPlayerSkin(
  player: PlayerResourceState,
  targets: TargetTable,
  lookup: DataBlockLookup,
  add: AddResource,
): void {
  const { dataBlockId, targetId } = player;
  if (dataBlockId === undefined || targetId === undefined) return;
  const skinName = targets.skins.get(targetId) || undefined;
  const skinPrefName = targets.skinPrefs.get(targetId) || undefined;
  if (!skinName && !skinPrefName) return;
  const shapeName = resolveShapeName("Player", lookup(dataBlockId));
  if (shapeName) add({ kind: "playerSkin", shapeName, skinName, skinPrefName });
}

function collectPacketResources(
  parser: DemoParser,
  cursor: Cursor,
  packet: PacketData,
): void {
  const packetDatablocks = parser.getPacketParser().getDataBlockDataMap();
  const lookup: DataBlockLookup = (id) =>
    parser.initialBlock.dataBlocks.get(id)?.data ?? packetDatablocks?.get(id);
  const add: AddResource = (hint) => {
    const key = demoResourceKey(hint);
    const previous = cursor.pending.get(key);
    if (previous?.observedEffect && !hint.observedEffect) return;
    if (previous || cursor.pending.size < MAX_HINTS)
      cursor.pending.set(key, hint);
  };
  const addEffect: AddResource = (hint) => add(asObservedDemoEffect(hint));
  const seen = new Set<number>();
  const seenEffects = new Set<number>();
  const collectGhost = ({ type, index, classId, parsedData }: GhostUpdate) => {
    if (type !== "update") cursor.players.delete(index);
    if (!parsedData || type === "delete") return;
    const className =
      (classId === undefined
        ? parser.getGhostTracker().getGhost(index)?.className
        : parser.getRegistry().getGhostParser(classId)?.name) ??
      cursor.players.get(index)?.className;
    const effect = className !== undefined && isDemoEffectEntity(className);
    const addResource = effect ? addEffect : add;
    const seenDatablocks = effect ? seenEffects : seen;
    collectDemoDatablockResources(
      parsedData.dataBlockId,
      lookup,
      addResource,
      seenDatablocks,
    );
    collectDemoDatablockResources(
      parsedData.emitterDatablockId,
      lookup,
      addResource,
      seenDatablocks,
    );
    if (Array.isArray(parsedData.images))
      for (const image of parsedData.images)
        collectDemoDatablockResources(image?.dataBlockId, lookup, add, seen);
    if (className === "TSStatic") {
      const name = resourceName(parsedData.shapeName);
      if (name) add({ kind: "shape", name });
    }
    if (
      className === "Player" &&
      (typeof parsedData.dataBlockId === "number" ||
        typeof parsedData.targetId === "number")
    ) {
      const previous = cursor.players.get(index);
      const player = {
        ghostIndex: index,
        className,
        dataBlockId:
          typeof parsedData.dataBlockId === "number"
            ? parsedData.dataBlockId
            : previous?.dataBlockId,
        targetId:
          typeof parsedData.targetId === "number"
            ? parsedData.targetId
            : previous?.targetId,
      };
      cursor.players.set(index, player);
      collectPlayerSkin(player, cursor.targets, lookup, add);
    }
  };
  const refreshSkins = (targetIds: readonly number[]) => {
    for (const player of cursor.players.values())
      if (player.targetId !== undefined && targetIds.includes(player.targetId))
        collectPlayerSkin(player, cursor.targets, lookup, add);
  };
  for (const event of packet.events) {
    const data = event.parsedData;
    switch (data?.type) {
      case "NetStringEvent":
        if (typeof data.id === "number") {
          if (data.hasValue === false) cursor.netStrings.delete(data.id);
          else if (typeof data.value === "string") {
            cursor.netStrings.set(data.id, data.value);
            refreshSkins(cursor.targets.resolveNetString(data.id, data.value));
          }
        }
        break;
      case "TargetInfoEvent":
        if (typeof data.targetId === "number") {
          cursor.targets.applyInfo(data as unknown as TargetInfoFields);
          refreshSkins([data.targetId]);
        }
        break;
      case "TargetFreeEvent":
        if (typeof data.targetId === "number") {
          cursor.targets.free(data.targetId);
          for (const player of cursor.players.values())
            if (player.targetId === data.targetId) player.targetId = undefined;
        }
        break;
      case "GhostingMessageEvent":
        if (data.message === GhostMessage.EndGhosting) cursor.players.clear();
        break;
      case "GhostAlwaysObjectEvent":
        if (
          typeof data.ghostIndex === "number" &&
          typeof data.classId === "number"
        )
          collectGhost({
            type: "create",
            index: data.ghostIndex,
            classId: data.classId,
            parsedData: data.objectData as ParsedData | undefined,
            updateBitsStart: 0,
            updateBitsEnd: 0,
          });
        break;
    }
  }
  for (const ghost of packet.ghosts) collectGhost(ghost);
}

/** Incremental decoded-packet lookahead. Never steps the visible simulator. */
export class DemoResourceLookahead {
  private fork?: DemoLookaheadFork;
  private cursor?: Cursor;
  private failedSource?: DemoParser;

  reset(): void {
    this.cursor = undefined;
    this.failedSource = undefined;
  }

  read(
    source: DemoParser,
    tick: number,
    targetTick: number,
    seed: () => LookaheadSeed,
  ): DemoResourceScanResult {
    if (this.fork && this.fork.source !== source) {
      this.fork = undefined;
      this.cursor = undefined;
    }
    if (this.failedSource !== source) this.failedSource = undefined;
    // Forking a progressive parser is safe only once it has finished growing.
    if (
      !source.isComplete ||
      targetTick <= tick ||
      this.failedSource === source
    )
      return EMPTY_RESULT;
    targetTick = Math.min(targetTick, tick + MAX_AHEAD_TICKS);
    try {
      const fork = (this.fork ??= forkDemoLookahead(source));
      if (!fork) return EMPTY_RESULT;
      let cursor = this.cursor;
      if (
        !cursor ||
        tick < cursor.requestedTick ||
        tick - cursor.tick > MAX_CATCHUP_TICKS ||
        (cursor.stopped && tick > cursor.tick)
      ) {
        this.cursor = undefined;
        fork.rebase();
        const initial = seed();
        const netStrings = new Map(initial.netStrings);
        const targets = new TargetTable(netStrings);
        targets.restore(initial.targets.save());
        cursor = {
          tick,
          requestedTick: tick,
          netStrings,
          targets,
          players: new Map(),
          pending: new Map(),
          resources: new Map(),
          stopped: false,
        };
        for (const entity of initial.entities) {
          if (entity.className === "Player")
            cursor.players.set(entity.ghostIndex, {
              className: entity.className,
              ghostIndex: entity.ghostIndex,
              dataBlockId: entity.dataBlockId,
              targetId: entity.targetId,
            });
        }
        this.cursor = cursor;
      }
      if (
        cursor.requestedTick === tick &&
        cursor.completed?.targetTick === targetTick
      )
        return cursor.completed.result;
      cursor.completed = undefined;
      cursor.requestedTick = tick;
      for (const [key, { ticks, effectTicks }] of cursor.resources) {
        const next = ticks.findIndex((seen) => seen > tick);
        if (next === -1) cursor.resources.delete(key);
        else {
          if (next > 0) ticks.splice(0, next);
          const nextEffect = effectTicks.findIndex((seen) => seen > tick);
          effectTicks.splice(
            0,
            nextEffect === -1 ? effectTicks.length : nextEffect,
          );
        }
      }
      this.advance(fork.parser, cursor, targetTick);
      const result = {
        hints: this.currentHints(cursor, targetTick),
        complete: cursor.stopped || cursor.tick >= targetTick,
      };
      if (result.complete) cursor.completed = { targetTick, result };
      return result;
    } catch {
      // The actual playback path still handles malformed recordings.
      this.failedSource = source;
      return {
        hints: this.cursor ? this.currentHints(this.cursor, targetTick) : [],
        complete: true,
      };
    }
  }

  private currentHints(cursor: Cursor, targetTick: number): DemoResourceHint[] {
    return [...cursor.resources.values()]
      .filter(({ ticks }) => ticks[0] <= targetTick)
      .map(({ hint, ticks, effectTicks }) => {
        const effectTick = effectTicks[0];
        return effectTick <= targetTick
          ? { tick: effectTick, hint: asObservedDemoEffect(hint) }
          : { tick: ticks[0], hint };
      })
      .sort((a, b) => a.tick - b.tick)
      .map(({ hint }) => hint);
  }

  private advance(
    parser: DemoParser,
    cursor: Cursor,
    targetTick: number,
  ): void {
    const protocol = parser.getPacketParser();
    const deadline = performance.now() + MAX_SLICE_MS;
    for (
      let count = 0;
      !cursor.stopped &&
      cursor.tick < targetTick &&
      count < MAX_BLOCKS_PER_SLICE &&
      (count === 0 || performance.now() < deadline);
      count++
    ) {
      const block = readDemoLookaheadBlock(parser, protocol);
      if (block === "stop") {
        cursor.stopped = true;
        break;
      }
      if (block === "move") {
        cursor.tick++;
        if (cursor.tick > cursor.requestedTick) {
          for (const [key, hint] of cursor.pending) {
            const occurrence = cursor.resources.get(key);
            if (occurrence) {
              occurrence.ticks.push(cursor.tick);
              if (hint.observedEffect) occurrence.effectTicks.push(cursor.tick);
            } else if (cursor.resources.size < MAX_HINTS) {
              const { observedEffect, ...resource } = hint;
              cursor.resources.set(key, {
                hint: resource,
                ticks: [cursor.tick],
                effectTicks: observedEffect ? [cursor.tick] : [],
              });
            }
          }
        }
        cursor.pending.clear();
      } else if (block !== "skip")
        collectPacketResources(parser, cursor, block);
    }
  }
}
