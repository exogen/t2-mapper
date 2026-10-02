import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import type { StreamingPlayback } from "../stream/types";
import { streamClock } from "../state/streamPlaybackStore";
import { engineStore } from "../state/engineStore";
import { collisionState } from "../collision/collisionContext";
import { interiorColliderVersion } from "../collision/worldCollision";
import type { DebrisHistory } from "../stream/debrisHistory";
import { DebrisSimulation } from "../particles/DebrisSimulation";
import { DebrisRenderer } from "./DebrisRenderer";
import { useAnisotropy } from "./useAnisotropy";
import { useSettings } from "./SettingsProvider";
import { useAudio } from "./AudioContext";
import { playOneShotSound, resolveAudioProfile } from "./AudioEmitter";
import { FramePriority } from "./framePriority";
import { requestShockwave } from "./shockwaveRequests";

class Runtime {
  renderer: DebrisRenderer;
  simulation: DebrisSimulation;
  generation: number;
  seek = -1;
  terrain: unknown;
  interiors = -1;
  time = -Infinity;
  warming = true;
  constructor(
    renderer: DebrisRenderer,
    simulation: DebrisSimulation,
    generation: number,
  ) {
    this.renderer = renderer;
    this.simulation = simulation;
    this.generation = generation;
  }
  update(
    now: number,
    history: DebrisHistory,
    seek: number,
    delta: number,
  ): "pending" | "replay" | "fresh" {
    const { simulation, renderer } = this;
    const terrain = collisionState().terrain,
      interiors = interiorColliderVersion();
    const assetsReady = [...simulation.missingShapes].some(
      (name) => !!renderer.model(name),
    );
    if (
      this.seek !== seek ||
      this.terrain !== terrain ||
      this.interiors !== interiors ||
      now < this.time ||
      assetsReady
    ) {
      simulation.clear();
      renderer.reset();
      this.warming = true;
      this.seek = seek;
      this.terrain = terrain;
      this.interiors = interiors;
    }
    this.time = now;
    const complete = simulation.update(
      now,
      history.events,
      256,
      history.gravityChanges,
    );
    renderer.root.visible = complete;
    if (!complete) {
      this.warming = true;
      return "pending";
    }
    renderer.update(simulation, now, delta);
    const result = this.warming ? "replay" : "fresh";
    this.warming = false;
    return result;
  }
}

/** One stable owner for cosmetic debris, including bodies whose ghost is gone. */
export function DebrisEffects({ playback }: { playback: StreamingPlayback }) {
  const group = useMemo(() => new Group(), []);
  const runtime = useRef<Runtime | null>(null);
  const anisotropy = useAnisotropy();
  const { animationEnabled, audioEnabled } = useSettings();
  const { audioListener, audioLoader } = useAudio();
  const enabled = useRef(animationEnabled);
  useEffect(() => {
    enabled.current = animationEnabled;
  }, [animationEnabled]);
  useEffect(
    () => () => {
      runtime.current?.renderer.dispose();
      runtime.current = null;
    },
    [playback],
  );
  useFrame(({ invalidate }, delta) => {
    const transport = engineStore.getState().playback;
    if (
      transport.status === "seeking" ||
      transport.recording?.streamingPlayback !== playback
    )
      return;
    const history = playback.debrisHistory;
    if (!history) return;
    let state = runtime.current;
    // Datablock IDs may be reused on a mission change; discard cached factories.
    if (!state || state.generation !== history.generation) {
      state?.renderer.dispose();
      const renderer = new DebrisRenderer(
        anisotropy,
        () => enabled.current,
        invalidate,
      );
      const simulation = new DebrisSimulation(
        (id) => playback.getDataBlockData(id),
        renderer.parts,
      );
      state = new Runtime(renderer, simulation, history.generation);
      runtime.current = state;
      group.add(renderer.root);
    }
    const result = state.update(
      streamClock.worldTime,
      history,
      transport.seekNonce,
      delta,
    );
    if (result === "pending") {
      invalidate();
      return;
    }
    if (result === "fresh" && transport.status === "playing")
      for (const entity of state.simulation.newImpacts) {
        const data = playback.getDataBlockData(entity.explosionDataBlockId!);
        if (typeof data?.shockwave === "number")
          requestShockwave({
            dataBlockId: data.shockwave,
            origin: entity.position!,
            normal: [0, 0, 1],
            ownerId: entity.id,
          });
        if (
          audioEnabled &&
          audioListener &&
          audioLoader &&
          typeof data?.soundProfile === "number"
        ) {
          const profile = resolveAudioProfile(data.soundProfile, (id) =>
            playback.getDataBlockData(id),
          );
          const pos = entity.position!;
          if (profile)
            playOneShotSound(
              profile,
              audioListener,
              audioLoader,
              new Vector3(pos[1], pos[2], pos[0]),
              group,
            );
        }
      }
  }, FramePriority.ShapeAnimation - 2);
  useFrame(({ camera }, delta) => {
    if (engineStore.getState().playback.status !== "seeking")
      runtime.current?.renderer.updateCamera(camera, delta);
  });
  return <primitive object={group} />;
}
