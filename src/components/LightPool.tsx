import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { PointLight } from "three";
import { effectLights, type EffectLight } from "./effectLights";

/**
 * Fixed number of pooled point lights. The scene keeps exactly this many
 * point lights at all times (unused ones at intensity 0), so Three's
 * NUM_POINT_LIGHTS never changes and lit materials never recompile their
 * shader for a new light count. Sized to cover realistic firefight peaks;
 * when more effect lights are active than slots, the farthest from the
 * camera are dropped (matching how the game prioritized lights).
 */
export const POINT_LIGHT_POOL_SIZE = 8;

/**
 * Drives POINT_LIGHT_POOL_SIZE real point lights from the effect-light
 * registry each frame: the nearest active lights fill the slots, the rest
 * are parked at intensity 0 (still counted, so the light count stays fixed).
 */
export function LightPool() {
  const slotsRef = useRef<(PointLight | null)[]>([]);
  const activeRef = useRef<EffectLight[]>([]);

  useFrame((state) => {
    const slots = slotsRef.current;
    if (slots.length === 0) return;

    // Collect the lights that are on this frame.
    const active = activeRef.current;
    active.length = 0;
    for (const light of effectLights()) {
      if (light.intensity > 0) active.push(light);
    }
    // Only prioritize by camera distance when we have to drop some — with
    // few enough lights they all fit and the order is irrelevant.
    if (active.length > slots.length) {
      const camPos = state.camera.position;
      active.sort(
        (a, b) =>
          a.position.distanceToSquared(camPos) -
          b.position.distanceToSquared(camPos),
      );
    }

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot) continue;
      const src = active[i];
      if (src) {
        slot.position.copy(src.position);
        slot.color.copy(src.color);
        slot.distance = src.distance;
        slot.intensity = src.intensity;
      } else {
        slot.intensity = 0;
      }
    }
  });

  return (
    <>
      {Array.from({ length: POINT_LIGHT_POOL_SIZE }, (_, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            slotsRef.current[i] = el;
          }}
          intensity={0}
          decay={1}
        />
      ))}
    </>
  );
}
