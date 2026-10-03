import type { GhostUpdate, InitialBlockData, ParsedData } from "t2-demo-parser";
import { decodeTeamAdd } from "../../relay/serverMessageDecode";
import type { TimelineEvent } from "../state/demoTimelineStore";
import { GhostMessage } from "./entityClassification";
import {
  isValidPosition,
  isVec3Like,
  resolveNetString,
  stripTaggedStringMarkup,
} from "./streamHelpers";
import type { TeamScore } from "./types";

// Tribes2.exe 0x4364aa registers GeneratorObjectType as 1 << 30.
// Includes solar panels and modded generators without matching model names.
const GENERATOR_TYPE = 0x40000000;
// Reliable commands and ghost updates can arrive in different packets. Keep
// attribution conservative; this is a matching window, not an engine rule.
const DESTRUCTION_MATCH_SEC = 1;
// Deliberately narrow inference, not native damage radii or timing rules.
// No trajectory, splash-damage, or collision simulation.
const NEAR_IMPACT_DISTANCE_SQ = 10 ** 2;
const IMPACT_LOOKBACK_SEC = 0.5;
const IMPACT_PROJECTILES = new Set([
  "LinearProjectile",
  "LinearFlareProjectile",
  "EnergyProjectile",
  "TracerProjectile",
  "GrenadeProjectile",
  "BombProjectile",
  "SeekerProjectile",
  "SniperProjectile",
  "ShockLanceProjectile",
]);

interface Generator {
  dataBlockId: number;
  position?: [number, number, number];
  target?: Target;
  damageState?: number;
  damageLevel?: number;
  offlineEvent?: TimelineEvent;
}

interface Target {
  dataBlockId?: number;
  name?: string;
  pendingNameTag?: number;
  typeDescription?: string;
  pendingTypeTag?: number;
  sensorGroup?: number;
}

interface Player {
  target?: Target;
}

interface RepairBeam {
  sourceIndex: number;
  targetIndex: number;
  source?: Player;
  generator?: Generator;
}

interface Projectile {
  sourceIndex: number;
  source?: Player;
  kind: string;
  exploded: boolean;
}

interface Impact {
  projectile: Projectile;
  position: { x: number; y: number; z: number };
  timeSec: number;
  rawActor?: string;
}

interface Destruction {
  timeSec: number;
  target?: Target;
  catalog: GeneratorTarget[];
  event?: TimelineEvent;
}

interface DestructionMessage {
  timeSec: number;
  name?: string;
  kind: string;
  rawActor: string;
  actorTeamId: number | null;
  target?: Target;
}

interface GeneratorTarget {
  target: Target;
  name?: string;
  kind: string;
  teamId?: number;
}

type Ghost = Pick<GhostUpdate, "index" | "type" | "parsedData" | "classId">;

const clean = (value: string) => stripTaggedStringMarkup(value).trim();

function playerName(rawName: string) {
  if (rawName.startsWith("\x01")) return; // Unresolved network string, not a name.
  const name = clean(rawName);
  if (!name || /^(a teammate|you)$/i.test(name)) return;
  return { name, rawName };
}

function attribute(
  event: TimelineEvent,
  rawActor: string,
  inferred = false,
): boolean {
  const actor = playerName(rawActor);
  if (!actor) return false;
  event.actor = actor.name;
  event.raw = { actor: actor.rawName };
  if (inferred) event.actorInferred = true;
  const action = event.type === "generator-online" ? "repaired" : "destroyed";
  event.description = `${actor.name} ${action} the ${event.generatorLabel ?? "generator"}`;
  return true;
}

/** Track generator transitions and their actors without simulating the world. */
export class GeneratorTimeline {
  private readonly generatorDataBlocks = new Set<number>();
  private readonly ghosts = new Map<number, Generator>();
  private readonly targets = new Map<number, Target>();
  private readonly pendingTargets = new Set<Target>();
  private readonly teams = new Map<number, string>();
  private readonly netStrings: Map<number, string>;
  private readonly ghostClass: (classId: number) => string | undefined;
  private readonly players = new Map<number, Player>();
  private readonly beams = new Map<number, RepairBeam>();
  private readonly unboundBeams: RepairBeam[] = [];
  private readonly projectiles = new Map<number, Projectile>();
  private readonly unboundProjectiles: Projectile[] = [];
  private readonly impacts: Impact[] = [];
  private readonly recentImpacts: Impact[] = [];
  private readonly inferredActors = new Map<
    TimelineEvent,
    string | undefined
  >();
  private readonly destructions: Destruction[] = [];
  private readonly destructionMessages: DestructionMessage[] = [];

  constructor(
    initial: Pick<
      InitialBlockData,
      "dataBlocks" | "initialGhosts" | "targetEntries"
    >,
    netStrings: Map<number, string>,
    teamScores: readonly TeamScore[],
    ghostClass: (classId: number) => string | undefined,
  ) {
    this.netStrings = netStrings;
    this.ghostClass = ghostClass;
    for (const [id, block] of initial.dataBlocks)
      this.dataBlock(id, block.data);
    for (const target of initial.targetEntries)
      this.targets.set(target.targetId, {
        name: target.name,
        dataBlockId: target.dataBlockRef,
        typeDescription: target.typeDescription,
        sensorGroup: target.sensorGroup,
      });
    for (const team of teamScores) this.teams.set(team.teamId, team.name);
    // A demo may start mid-match with a disabled generator. Seed its state;
    // creation/re-entry into scope is never itself an offline/repair event.
    this.packet(initial.initialGhosts, 0, null);
  }

  private dataBlock(id: number, data: ParsedData): void {
    if (
      typeof data.dynamicTypeField === "number" &&
      data.dynamicTypeField & GENERATOR_TYPE
    )
      this.generatorDataBlocks.add(id);
    else this.generatorDataBlocks.delete(id);
  }

  event(data: ParsedData, type: string | undefined, timeSec: number): void {
    switch (type) {
      case "NetStringEvent":
        if (typeof data.id === "number" && typeof data.value === "string") {
          for (const target of this.pendingTargets) {
            if (target.pendingNameTag === data.id) {
              target.name = data.value;
              target.pendingNameTag = undefined;
            }
            if (target.pendingTypeTag === data.id) {
              target.typeDescription = data.value;
              target.pendingTypeTag = undefined;
            }
            if (target.pendingNameTag == null && target.pendingTypeTag == null)
              this.pendingTargets.delete(target);
          }
        }
        break;
      case "SimDataBlockEvent":
        if (typeof data.objectId === "number" && data.dataBlockData)
          this.dataBlock(data.objectId, data.dataBlockData as ParsedData);
        break;
      case "TargetInfoEvent": {
        if (typeof data.targetId !== "number") break;
        const target = this.target(data.targetId);
        if (!target) break;
        // Tribes2.exe TargetInfoEvent::process (0x673a30) retains resolved
        // string handles. Reusing a network slot must not rename old targets.
        if (typeof data.nameTag === "number") {
          target.name = this.targetString(data.nameTag);
          target.pendingNameTag =
            target.name == null ? data.nameTag : undefined;
        }
        if (typeof data.typeTag === "number") {
          target.typeDescription = this.targetString(data.typeTag);
          target.pendingTypeTag =
            target.typeDescription == null ? data.typeTag : undefined;
        }
        if (target.pendingNameTag != null || target.pendingTypeTag != null)
          this.pendingTargets.add(target);
        else this.pendingTargets.delete(target);
        if (typeof data.dataBlockId === "number")
          target.dataBlockId = data.dataBlockId;
        if (typeof data.sensorGroup === "number")
          target.sensorGroup = data.sensorGroup;
        break;
      }
      case "TargetFreeEvent":
        if (typeof data.targetId === "number") {
          // Existing ghosts must not inherit a recycled target's identity.
          const target = this.targets.get(data.targetId);
          if (target) {
            target.name = target.pendingNameTag = undefined;
            target.typeDescription = target.pendingTypeTag = undefined;
            target.sensorGroup = undefined;
            target.dataBlockId = undefined;
            this.pendingTargets.delete(target);
          }
          this.targets.delete(data.targetId);
        }
        break;
      case "GhostAlwaysObjectEvent":
        if (typeof data.ghostIndex === "number")
          this.ghost(
            {
              index: data.ghostIndex,
              type: "create",
              classId:
                typeof data.classId === "number" ? data.classId : undefined,
              parsedData: data.objectData as ParsedData | undefined,
            },
            timeSec,
            null,
          );
        break;
      case "GhostingMessageEvent":
        if (data.message === GhostMessage.EndGhosting) {
          this.finish();
          this.ghosts.clear();
          this.players.clear();
          this.beams.clear();
          this.unboundBeams.length = 0;
          this.projectiles.clear();
          this.unboundProjectiles.length = 0;
          this.impacts.length = 0;
          this.recentImpacts.length = 0;
        }
        break;
    }
  }

  serverMessage(
    msgType: string,
    args: string[],
    timeSec: number,
    recipientTeamId: number | null,
    recorder?: { rawName: string; teamId: number },
  ): void {
    const team = decodeTeamAdd(msgType, args, (value) =>
      resolveNetString(value, this.netStrings),
    );
    if (team && Number.isFinite(team.teamId))
      this.teams.set(team.teamId, team.name);
    // Classic's TeamDestroyMessage carries a player and a target label, but
    // no object ID. Confirmed credit takes precedence over impact inference.
    const type = msgType.toLowerCase();
    if (
      type !== "msgdestroyed" &&
      type !== "msggendes" &&
      type !== "msgsolardes"
    )
      return;
    const template = clean(resolveNetString(args[1] ?? "", this.netStrings));
    let message: DestructionMessage;
    if (type === "msgdestroyed") {
      // Classic and shipped DnDGame.cs use these two templates respectively.
      const match =
        /^%1 destroyed (?:an enemy|a) %2 (Generator|Solar Panel)!$/i.exec(
          template,
        );
      if (!match) return;
      const rawActor = resolveNetString(args[2] ?? "", this.netStrings);
      const rawLabel = resolveNetString(args[3] ?? "", this.netStrings);
      if (rawLabel.startsWith("\x01")) return;
      const actorTeams = new Set(
        [...this.targets.values()]
          .filter(
            (target) =>
              this.targetKind(target) === "_clientconnection" &&
              clean(target.name ?? "").toLowerCase() ===
                clean(rawActor).toLowerCase(),
          )
          .map((target) => target.sensorGroup),
      );
      message = {
        timeSec,
        name: clean(rawLabel).toLowerCase(),
        kind: match[1].toLowerCase(),
        rawActor,
        actorTeamId:
          actorTeams.size === 1
            ? ([...actorTeams][0] ?? null)
            : recipientTeamId,
      };
    } else if ((type === "msggendes" || type === "msgsolardes") && recorder) {
      // CTFGame/DnDGame award this private bonus to the recorder. It carries
      // no location, so credit it only if the target catalog is unambiguous.
      const kind = type === "msggendes" ? "generator" : "solar panel";
      const match =
        /^You received a %1 point bonus for destroying an enemy (generator|solar panel)\.$/i.exec(
          template,
        );
      if (!match || match[1].toLowerCase() !== kind) return;
      message = {
        timeSec,
        kind,
        rawActor: recorder.rawName,
        actorTeamId: recorder.teamId,
      };
    } else return;
    message.target = this.uniqueMessageTarget(this.generatorCatalog(), message);
    this.destructionMessages.push(message);
  }

  private target(id: number): Target | undefined {
    if (id < 0) return;
    let target = this.targets.get(id);
    if (!target) this.targets.set(id, (target = {}));
    return target;
  }

  private targetString(tag: number): string | undefined {
    return tag === 0x400 ? "" : this.netStrings.get(tag);
  }

  private targetKind(target: Target): string {
    return clean(target.typeDescription ?? "").toLowerCase();
  }

  private generatorCatalog(): GeneratorTarget[] {
    const result: GeneratorTarget[] = [];
    for (const target of this.targets.values()) {
      const kind = this.targetKind(target);
      if (
        kind === "generator" ||
        kind === "solar panel" ||
        (target.dataBlockId != null &&
          this.generatorDataBlocks.has(target.dataBlockId))
      ) {
        result.push({
          target,
          kind,
          name:
            target.name != null ? clean(target.name).toLowerCase() : undefined,
          teamId: target.sensorGroup,
        });
      }
    }
    return result;
  }

  private uniqueMessageTarget(
    catalog: GeneratorTarget[],
    message: DestructionMessage,
  ): Target | undefined {
    const candidates = catalog.filter(
      (entry) =>
        (!entry.kind || entry.kind === message.kind) &&
        (message.name == null ||
          entry.name == null ||
          entry.name === message.name) &&
        (!(message.actorTeamId != null && message.actorTeamId > 0) ||
          entry.teamId == null ||
          entry.teamId !== message.actorTeamId),
    );
    const [entry] = candidates;
    if (
      candidates.length === 1 &&
      entry.kind === message.kind &&
      (message.name == null || entry.name === message.name) &&
      (!(message.actorTeamId != null && message.actorTeamId > 0) ||
        entry.teamId != null)
    )
      return entry.target;
  }

  private repairBeams(generator: Generator): Set<RepairBeam> {
    const result = new Set<RepairBeam>();
    for (const beam of this.beams.values()) {
      if (
        beam.generator === generator &&
        this.ghosts.get(beam.targetIndex) === generator &&
        beam.source &&
        this.players.get(beam.sourceIndex) === beam.source
      )
        result.add(beam);
    }
    return result;
  }

  private impactActor(position: readonly number[]): string | undefined {
    // Packet/ghost receive order breaks ties. Never use a later packet, even
    // if it carries the same demo timestamp, or skip an unknown latest shooter.
    for (let i = this.recentImpacts.length - 1; i >= 0; i--) {
      const impact = this.recentImpacts[i];
      const p = impact.position;
      const distanceSq =
        (p.x - position[0]) ** 2 +
        (p.y - position[1]) ** 2 +
        (p.z - position[2]) ** 2;
      if (distanceSq <= NEAR_IMPACT_DISTANCE_SQ)
        return impact.projectile.source?.target?.name ?? impact.rawActor;
    }
  }

  packet(
    ghosts: readonly Ghost[],
    timeSec: number,
    recorderTeamId: number | null,
  ): TimelineEvent[] {
    let before: Map<Generator, Set<RepairBeam>> | undefined;
    for (const ghost of ghosts) {
      const generator = this.ghosts.get(ghost.index);
      if (
        ghost.type === "update" &&
        ghost.parsedData?.damageState === 0 &&
        generator?.damageState != null &&
        generator.damageState !== 0
      )
        (before ??= new Map()).set(generator, this.repairBeams(generator));
    }
    const events: { generator: Generator; event: TimelineEvent }[] = [];
    for (const ghost of ghosts) {
      const event = this.ghost(ghost, timeSec, recorderTeamId);
      if (event)
        events.push({ generator: this.ghosts.get(ghost.index)!, event });
    }
    // Bind once, after the packet, so wire order cannot affect attribution and
    // a subsequently reused ghost index cannot redirect an old repair beam.
    for (const beam of this.unboundBeams) {
      beam.source = this.players.get(beam.sourceIndex);
      beam.generator = this.ghosts.get(beam.targetIndex);
    }
    this.unboundBeams.length = 0;
    for (const projectile of this.unboundProjectiles) {
      const source = this.players.get(projectile.sourceIndex);
      projectile.source =
        !projectile.source || projectile.source === source ? source : undefined;
    }
    this.unboundProjectiles.length = 0;
    for (const impact of this.impacts) {
      impact.rawActor = impact.projectile.source?.target?.name;
      this.recentImpacts.push(impact);
    }
    this.impacts.length = 0;
    while (
      this.recentImpacts.length &&
      this.recentImpacts[0].timeSec < timeSec - IMPACT_LOOKBACK_SEC
    )
      this.recentImpacts.shift();
    for (const { event } of events) {
      if (!this.inferredActors.has(event)) continue;
      const actor =
        event.generator && this.impactActor(event.generator.position);
      if (actor) this.inferredActors.set(event, actor);
      else this.inferredActors.delete(event);
    }
    return events.flatMap(({ generator, event }) => {
      if (event.type !== "generator-online") return event;
      // Keep multiple contributors, but reject starts/stops/handoffs in the
      // transition packet: packet batching cannot establish their causal order.
      const repairers = new Set<Player>();
      for (const beam of this.repairBeams(generator)) {
        if (beam.source && before?.get(generator)?.has(beam))
          repairers.add(beam.source);
      }
      const attributed: TimelineEvent[] = [];
      for (const repairer of repairers) {
        const entry = { ...event };
        if (attribute(entry, repairer.target?.name ?? ""))
          attributed.push(entry);
      }
      return attributed.length ? attributed : event;
    });
  }

  /** Complete a mission before publishing events, including delayed credits. */
  finish(): void {
    let start = 0;
    const matches = this.destructionMessages.map((message) => {
      if (!message.target) return [];
      while (
        start < this.destructions.length &&
        this.destructions[start].timeSec <
          message.timeSec - DESTRUCTION_MATCH_SEC
      )
        start++;
      const candidates: Destruction[] = [];
      for (let i = start; i < this.destructions.length; i++) {
        const destruction = this.destructions[i];
        if (destruction.timeSec > message.timeSec + DESTRUCTION_MATCH_SEC)
          break;
        if (
          destruction.target === message.target &&
          this.uniqueMessageTarget(destruction.catalog, message) ===
            message.target
        )
          candidates.push(destruction);
      }
      return candidates;
    });
    const credits = new Map<Destruction, Map<string, string>>();
    for (let i = 0; i < matches.length; i++) {
      const rawActor = this.destructionMessages[i].rawActor;
      const actor = playerName(rawActor);
      for (const candidate of matches[i]) {
        let names = credits.get(candidate);
        if (!names) credits.set(candidate, (names = new Map()));
        names.set(
          matches[i].length === 1 && actor ? actor.name.toLowerCase() : "",
          rawActor,
        );
      }
    }
    for (const [candidate, names] of credits) {
      // Conflicting server credits must not fall back to a spatial guess.
      if (candidate.event) this.inferredActors.delete(candidate.event);
      if (
        names.size === 1 &&
        !names.has("") &&
        candidate.event &&
        candidate.timeSec - candidate.event.timeSec <= DESTRUCTION_MATCH_SEC
      ) {
        // Repeated identical announcements agree; competing names do not.
        attribute(candidate.event, [...names.values()][0]);
      }
    }
    for (const [event, actor] of this.inferredActors) {
      if (!event.actor && actor) attribute(event, actor, true);
    }
    this.inferredActors.clear();
    this.destructions.length = 0;
    this.destructionMessages.length = 0;
  }

  private ghost(
    ghost: Ghost,
    timeSec: number,
    recorderTeamId: number | null,
  ): TimelineEvent | undefined {
    if (ghost.type === "delete" || ghost.type === "create") {
      this.ghosts.delete(ghost.index);
      this.players.delete(ghost.index);
      this.beams.delete(ghost.index);
      this.projectiles.delete(ghost.index);
    }
    if (ghost.type === "delete" || !ghost.parsedData) return;
    const data = ghost.parsedData;
    const className =
      ghost.classId == null ? undefined : this.ghostClass(ghost.classId);
    if (className === "Player" || this.players.has(ghost.index)) {
      let player = this.players.get(ghost.index) ?? {};
      if (typeof data.targetId === "number") {
        const target = this.target(data.targetId);
        if (target !== player.target) player = { target };
      }
      this.players.set(ghost.index, player);
      return;
    }
    // Tribes2.exe RepairProjectile::unpackUpdate (0x645520) explicitly
    // resolves these two ghost references to the source and repaired object.
    if (
      className === "RepairProjectile" &&
      typeof data.sourceObject === "number" &&
      typeof data.repairingObject === "number"
    ) {
      const beam: RepairBeam = {
        sourceIndex: data.sourceObject,
        targetIndex: data.repairingObject,
      };
      this.beams.set(ghost.index, beam);
      this.unboundBeams.push(beam);
      return;
    }
    let projectile = this.projectiles.get(ghost.index);
    if (!projectile && className && IMPACT_PROJECTILES.has(className)) {
      const sourceIndex =
        typeof data.sourceObject === "number" ? data.sourceObject : -1;
      projectile = {
        sourceIndex,
        source: this.players.get(sourceIndex),
        kind: className,
        exploded: false,
      };
      this.projectiles.set(ghost.index, projectile);
      this.unboundProjectiles.push(projectile);
    }
    if (projectile) {
      // Native explosion updates give a point, not a damaged-object list
      // (e.g. LinearProjectile::unpackUpdate, Tribes2.exe 0x62f190).
      const position =
        data.explodePosition ??
        data.explodePoint ??
        (projectile.kind === "BombProjectile" ? data.endPoint : undefined) ??
        (projectile.kind === "SniperProjectile" && data.truncated
          ? data.endPos
          : undefined) ??
        (projectile.kind === "ShockLanceProjectile" && data.hitObject
          ? data.end
          : undefined);
      if (
        !projectile.exploded &&
        isVec3Like(position) &&
        isValidPosition(position)
      ) {
        projectile.exploded = true;
        this.impacts.push({ projectile, position, timeSec });
      }
      return;
    }
    let state = this.ghosts.get(ghost.index);
    const dataBlockId =
      typeof data.dataBlockId === "number"
        ? data.dataBlockId
        : state?.dataBlockId;
    if (dataBlockId == null || !this.generatorDataBlocks.has(dataBlockId)) {
      this.ghosts.delete(ghost.index);
      return;
    }
    if (!state || state.dataBlockId !== dataBlockId) {
      state = { dataBlockId };
      this.ghosts.set(ghost.index, state);
    }
    if (typeof data.targetId === "number")
      state.target = this.target(data.targetId);
    if (state.target) state.target.dataBlockId = dataBlockId;
    if (isVec3Like(data.position) && isValidPosition(data.position))
      state.position = [data.position.x, data.position.y, data.position.z];
    const previousDamageLevel = state.damageLevel;
    if (
      typeof data.damageLevel === "number" &&
      Number.isFinite(data.damageLevel)
    )
      state.damageLevel = data.damageLevel;
    if (
      data.damageState !== 0 &&
      data.damageState !== 1 &&
      data.damageState !== 2
    )
      return;
    const previousDamageState = state.damageState;
    const online = data.damageState === 0;
    state.damageState = data.damageState;

    let event: TimelineEvent | undefined;
    if (previousDamageState != null && online !== (previousDamageState === 0)) {
      event = this.transition(state, online, timeSec, recorderTeamId);
      state.offlineEvent = online ? undefined : event;
      if (
        !online &&
        previousDamageLevel != null &&
        state.damageLevel != null &&
        state.damageLevel > previousDamageLevel
      )
        this.inferredActors.set(event, undefined);
    }
    if (data.damageState === 2 && previousDamageState !== 2) {
      const target = state.target;
      this.destructions.push({
        timeSec,
        target,
        catalog: this.generatorCatalog(),
        event: state.offlineEvent,
      });
      state.offlineEvent = undefined;
    }
    return event;
  }

  private transition(
    state: Generator,
    online: boolean,
    timeSec: number,
    recorderTeamId: number | null,
  ): TimelineEvent {
    const target = state.target;
    const teamId = target?.sensorGroup;
    const team =
      teamId != null && teamId > 0
        ? stripTaggedStringMarkup(
            this.teams.get(teamId) ?? `Team ${teamId}`,
          ).trim()
        : "";
    return {
      timeSec,
      type: online ? "generator-online" : "generator-offline",
      description: `${team ? `${team} generator` : "Generator"} ${online ? "online" : "offline"}`,
      generatorLabel: `${team ? `${team} ` : ""}generator`,
      ...(state.position && {
        generator: { position: state.position, dataBlockId: state.dataBlockId },
      }),
      teamAffinity:
        teamId == null ||
        teamId <= 0 ||
        recorderTeamId == null ||
        recorderTeamId <= 0
          ? "neutral"
          : teamId === recorderTeamId
            ? "friendly"
            : "enemy",
    };
  }
}
