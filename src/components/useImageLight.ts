import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Object3D } from "three";
import { gameEntityStore } from "../state/gameEntityStore";
import { streamClock } from "../state/streamPlaybackStore";
import { engineStore } from "../state/engineStore";
import { useEffectLight } from "./useEffectLight";

/**
 * A ShapeImageData light (mounted weapons, turret barrels), registered
 * by the owner's image loop (Tribes2.exe FUN_005f6810): type 1 constant,
 * 2 pulsing, 3 "WeaponFireLight" — full when the image fires, fading
 * to nothing over lightTime.
 */
export interface ImageLightConfig {
  type: number;
  /** sRGB colour. */
  color: [number, number, number];
  /** lightTime in ms. */
  time: number;
  radius: number;
}

/** The mounted image datablock's light fields, if it has a light. */
export function resolveImageLight(
  imageDataBlockId?: number,
): ImageLightConfig | undefined {
  if (imageDataBlockId == null) return undefined;
  const sp = engineStore.getState().playback.recording?.streamingPlayback;
  const db = sp?.getDataBlockData(imageDataBlockId);
  const type = db?.lightType as number | undefined;
  if (!db || !type) return undefined;
  const color = db.lightColor as
    { r: number; g: number; b: number } | undefined;
  return {
    type,
    color: color ? [color.r, color.g, color.b] : [1, 1, 1],
    time: (db.lightTime as number | undefined) ?? 1000,
    radius: (db.lightRadius as number | undefined) ?? 2,
  };
}

/**
 * Drive a mounted image's light from its owner's ghosted image state:
 * the slot's fire counter advancing marks the shot that starts a
 * WeaponFireLight's fade. The light sits at the image's mount (`root`).
 */
export function useImageLight(
  root: Object3D,
  config: ImageLightConfig | undefined,
  ownerId: string | undefined,
  slot: number | undefined,
): void {
  const lightConfig = useMemo(
    () =>
      config && {
        radius: config.radius,
        color: { r: config.color[0], g: config.color[1], b: config.color[2] },
      },
    [config],
  );
  const lightRef = useEffectLight(root, lightConfig, 0);
  const fireTimeRef = useRef<number | null>(null);
  const lastFireCountRef = useRef<number | null>(null);
  const mountTimeRef = useRef(streamClock.time);

  useFrame(() => {
    const light = lightRef.current;
    if (!light || !config) return;
    const now = streamClock.time;
    const owner =
      ownerId != null
        ? gameEntityStore.getState().streamEntities.get(ownerId)
        : undefined;
    const fireCount =
      owner && slot != null && "imageSlots" in owner
        ? owner.imageSlots?.[slot]?.imageState?.fireCount
        : undefined;
    if (fireCount != null) {
      if (
        lastFireCountRef.current != null &&
        fireCount !== lastFireCountRef.current
      ) {
        fireTimeRef.current = now;
      }
      lastFireCountRef.current = fireCount;
    }
    let intensity = 0;
    if (config.type === 1) {
      intensity = 1;
    } else if (config.type === 2) {
      const elapsedMs = (now - mountTimeRef.current) * 1000;
      intensity =
        0.15 +
        0.85 * (0.5 + 0.5 * Math.sin((Math.PI * elapsedMs) / config.time));
    } else if (config.type === 3 && fireTimeRef.current != null) {
      const elapsedMs = (now - fireTimeRef.current) * 1000;
      intensity = elapsedMs <= config.time ? 1 - elapsedMs / config.time : 0;
    }
    light.intensity = Math.max(0, Math.min(1, intensity));
  });
}
