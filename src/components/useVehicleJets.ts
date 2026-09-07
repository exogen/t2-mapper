import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AdditiveAnimationBlendMode,
  type AnimationAction,
  type AnimationClip,
  type AnimationMixer,
  type Object3D,
} from "three";
import { engineStore } from "../state/engineStore";
import { THRUST_FORWARD } from "../stream/types";
import type { VisNode } from "./visSequences";
import {
  createDtsThread,
  destroyDtsThread,
  dtsThreadPosition,
  scrubDtsThread,
  type DtsThread,
} from "./dtsThread";
import {
  addNodeEmitter,
  removeNodeEmitter,
  type NodeEmitter,
  type NodeEmitterFrame,
} from "./nodeEmitters";
import {
  backJetsActive,
  bottomJetsActive,
  contrailDeltaScale,
  createJetDirectionState,
  stepJetDirection,
  vehicleForwardSpeed,
  type JetDirectionState,
} from "./jetThreads";
import { useJetSound } from "./useJetSound";
import { collectOwnNodes } from "./sceneNodes";

/** The loaded shape pieces the jet threads animate. */
export interface VehicleJetShape {
  scene: Object3D;
  mixer: AnimationMixer | null;
  clipsByName: ReadonlyMap<string, AnimationClip>;
  morphClipsBySeq: ReadonlyMap<string, AnimationClip[]>;
  visNodesBySequence: ReadonlyMap<string, VisNode[]>;
  seqBlendByName: ReadonlyMap<string, boolean>;
  /** Readies a vis mesh's material for opacity animation. */
  prepareVisNode: (node: VisNode) => void;
}

/** The ghost fields FlyingVehicle/HoverVehicle::updateJet read. */
export interface VehicleJetEntity {
  id: string;
  className?: string;
  dataBlockId?: number;
  jetting?: boolean;
  thrustDirection?: number;
  /** The live keyframe (index 0) carries the ghost's velocity and rotation. */
  keyframes?: Array<{
    rotation: [number, number, number, number];
    velocity?: [number, number, number];
  }>;
}

interface VehicleJetConfig {
  /** forward, backward, down jet emitter datablock ids. */
  jetEmitterIds: (number | null)[];
  trailEmitterId: number | null;
  minTrailSpeed: number;
  /** maneuveringForce / mass: the speed band the contrail ramps over. */
  trailAccel: number;
  jetSoundId: number | null;
}

interface JetDirection {
  state: JetDirectionState;
  activate: DtsThread | null;
  maintain: DtsThread | null;
}

interface VehicleJetParts {
  back: JetDirection;
  bottom: JetDirection;
  /** Per thrust direction, the nozzle emitters it lights. */
  jetEmitters: NodeEmitter[][];
  contrails: NodeEmitter[];
}

/**
 * FlyingVehicleData's node table (0x7a5c08): two nozzles per thrust
 * direction, then the four contrail nodes. HoverVehicleData shares the
 * nozzle part.
 */
const NOZZLE_NODES = [
  ["jetnozzle0", "jetnozzle1"],
  ["jetnozzlex", "jetnozzlex"],
  ["jetnozzle2", "jetnozzle3"],
];
const CONTRAIL_NODES = ["contrail0", "contrail1", "contrail2", "contrail3"];

function createEmitterFrames(): {
  jet: NodeEmitterFrame;
  contrail: NodeEmitterFrame;
} {
  const velocity: [number, number, number] = [0, 0, 0];
  return {
    jet: { velocity, dtScale: 1 },
    contrail: { velocity, dtScale: 0 },
  };
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readVehicleJetConfig(
  className: string | undefined,
  dataBlockId: number | undefined,
): VehicleJetConfig | null {
  const flying = className === "FlyingVehicle";
  if ((!flying && className !== "HoverVehicle") || dataBlockId == null) {
    return null;
  }
  const sp = engineStore.getState().playback.recording?.streamingPlayback;
  const db = sp?.getDataBlockData(dataBlockId);
  if (!db) return null;
  const emitters = Array.isArray(db.jetEmitters)
    ? (db.jetEmitters as (number | null)[])
    : [];
  const mass = readNumber(db.mass) ?? 0;
  const force = readNumber(db.maneuveringForce) ?? 0;
  return {
    jetEmitterIds: [
      emitters[0] ?? null,
      emitters[1] ?? null,
      emitters[2] ?? null,
    ],
    // FlyingVehicleData packs trailEmitter as the fourth jet emitter ref.
    trailEmitterId: flying ? (emitters[3] ?? null) : null,
    minTrailSpeed: readNumber(db.minTrailSpeed) ?? Infinity,
    trailAccel: mass > 0 ? force / mass : 0,
    // The parser labels FlyingVehicleData's first sound ref (+0x430, the
    // script's jetSound) jetActivateSound. HoverVehicleData's sound order
    // is unverified, so hover jets stay silent here.
    jetSoundId: flying ? (readNumber(db.jetActivateSound) ?? null) : null,
  };
}

function buildJetThread(
  shape: VehicleJetShape,
  name: string,
  cyclic: boolean,
): DtsThread | null {
  const clip = shape.clipsByName.get(name);
  const morphs = shape.morphClipsBySeq.get(name) ?? [];
  const visNodes = shape.visNodesBySequence.get(name) ?? [];
  if (!clip && morphs.length === 0 && visNodes.length === 0) return null;
  const actions: AnimationAction[] = [];
  if (shape.mixer) {
    if (clip) {
      const action = shape.mixer.clipAction(clip);
      if (shape.seqBlendByName.has(name)) {
        action.blendMode = AdditiveAnimationBlendMode;
      }
      actions.push(action);
    }
    for (const morph of morphs) actions.push(shape.mixer.clipAction(morph));
  }
  for (const node of visNodes) shape.prepareVisNode(node);
  return createDtsThread(
    name,
    actions,
    visNodes,
    clip?.duration ?? morphs[0]?.duration ?? visNodes[0].duration,
    cyclic,
  );
}

function buildDirection(
  shape: VehicleJetShape,
  activateName: string,
  maintainName: string,
): JetDirection {
  return {
    state: createJetDirectionState(),
    activate: buildJetThread(shape, activateName, false),
    maintain: buildJetThread(shape, maintainName, true),
  };
}

function buildVehicleJetParts(
  shape: VehicleJetShape,
  config: VehicleJetConfig,
  ownerId: string,
  jetFrame: NodeEmitterFrame,
  contrailFrame: NodeEmitterFrame,
): VehicleJetParts {
  const nodesByName = collectOwnNodes(shape.scene);
  const emitterAt = (
    nodeName: string,
    dataBlockId: number | null,
    frame: NodeEmitterFrame,
  ): NodeEmitter | null => {
    const anchor = nodesByName.get(nodeName);
    if (!anchor || dataBlockId == null) return null;
    return { dataBlockId, anchor, frame, ownerId };
  };
  const jetEmitters = NOZZLE_NODES.map((names, direction) =>
    names
      .map((name) => emitterAt(name, config.jetEmitterIds[direction], jetFrame))
      .filter((e): e is NodeEmitter => e != null),
  );
  const contrails = CONTRAIL_NODES.map((name) =>
    emitterAt(name, config.trailEmitterId, contrailFrame),
  ).filter((e): e is NodeEmitter => e != null);
  return {
    back: buildDirection(shape, "activateback", "maintainback"),
    bottom: buildDirection(shape, "activatebot", "maintainbot"),
    jetEmitters,
    contrails,
  };
}

function releaseParts(parts: VehicleJetParts): void {
  for (const dir of [parts.back, parts.bottom]) {
    if (dir.activate) destroyDtsThread(dir.activate);
    if (dir.maintain) destroyDtsThread(dir.maintain);
  }
  for (const list of parts.jetEmitters) {
    for (const emitter of list) removeNodeEmitter(emitter);
  }
  for (const emitter of parts.contrails) removeNodeEmitter(emitter);
}

/**
 * One frame of a direction's activate/maintain pair: Activate scrubs to
 * its thread position (parked at 0 while Maintain runs), Maintain loops
 * from when it started and owns the meshes both key while it runs.
 */
function driveDirection(
  dir: JetDirection,
  active: boolean,
  dtSec: number,
  nowSec: number,
): void {
  if (!dir.activate && !dir.maintain) return;
  const wasMaintaining = dir.state.maintaining;
  stepJetDirection(
    dir.state,
    active,
    dtSec,
    dir.activate?.duration ?? 0,
    dir.maintain != null,
    nowSec,
  );
  if (wasMaintaining && !dir.state.maintaining && dir.maintain) {
    destroyDtsThread(dir.maintain);
    // Meshes both sequences key are Activate's again.
    if (dir.activate) dir.activate.appliedPosition = -1;
  }
  if (dir.activate) scrubDtsThread(dir.activate, dir.state.activatePosition);
  if (dir.state.maintaining && dir.maintain) {
    const elapsed = nowSec - dir.state.maintainStartSec;
    scrubDtsThread(dir.maintain, dtsThreadPosition(dir.maintain, elapsed));
  }
}

/**
 * Client jet effects of a ghosted FlyingVehicle or HoverVehicle
 * (Tribes2.exe FlyingVehicle::updateJet FUN_00610e20, HoverVehicle
 * FUN_00619090): the back jets' Activate/Maintain threads run while the
 * thrust direction is forward, the bottom jets' while jetting downward;
 * the direction's nozzle emitters run while jetting; the contrail
 * emitters run above minTrailSpeed with a delta that ramps up over
 * maneuveringForce/mass; the jet sound loops while jetting. Returns the
 * per-frame driver, called with the playback-scaled frame delta.
 */
export function useVehicleJets(
  entityRef: RefObject<VehicleJetEntity | undefined>,
  ownerId: string | undefined,
  shape: VehicleJetShape,
  className: string | undefined,
  dataBlockId: number | undefined,
): (dtSec: number) => void {
  const config = useMemo(
    () => readVehicleJetConfig(className, dataBlockId),
    [className, dataBlockId],
  );
  const updateJetSound = useJetSound(shape.scene, config?.jetSoundId);
  const partsRef = useRef<VehicleJetParts | null>(null);
  // Per-frame emitter inputs: one velocity array shared by every emitter,
  // the contrails with their own speed-ramped delta scale.
  const framesRef = useRef(createEmitterFrames());
  const clockRef = useRef(0);

  useEffect(() => {
    if (!config || ownerId == null) return;
    const parts = buildVehicleJetParts(
      shape,
      config,
      ownerId,
      framesRef.current.jet,
      framesRef.current.contrail,
    );
    partsRef.current = parts;
    return () => {
      releaseParts(parts);
      partsRef.current = null;
    };
  }, [shape, config, ownerId]);

  return useCallback(
    (dtSec: number) => {
      const entity = entityRef.current;
      const parts = partsRef.current;
      if (!entity || !parts || !config) return;
      clockRef.current += dtSec;
      const now = clockRef.current;
      const jetting = !!entity.jetting;
      const thrust = entity.thrustDirection ?? THRUST_FORWARD;
      updateJetSound(jetting);

      const keyframe = entity.keyframes?.[0];
      const velocity = keyframe?.velocity;
      if (velocity) {
        const shared = framesRef.current.jet.velocity;
        shared[0] = velocity[0];
        shared[1] = velocity[1];
        shared[2] = velocity[2];
      }

      driveDirection(parts.back, backJetsActive(thrust), dtSec, now);
      driveDirection(
        parts.bottom,
        bottomJetsActive(thrust, jetting),
        dtSec,
        now,
      );

      for (
        let direction = 0;
        direction < parts.jetEmitters.length;
        direction++
      ) {
        const on = jetting && thrust === direction;
        for (const emitter of parts.jetEmitters[direction]) {
          if (on) addNodeEmitter(emitter);
          else removeNodeEmitter(emitter);
        }
      }

      const speed =
        velocity && keyframe
          ? vehicleForwardSpeed(velocity, keyframe.rotation)
          : 0;
      const scale = contrailDeltaScale(
        speed,
        config.minTrailSpeed,
        config.trailAccel,
      );
      framesRef.current.contrail.dtScale = scale;
      for (const emitter of parts.contrails) {
        if (scale > 0) addNodeEmitter(emitter);
        else removeNodeEmitter(emitter);
      }
    },
    [entityRef, config, updateJetSound],
  );
}
