import { RefObject } from "react";
import { Group } from "three";
import { ShapeEntity } from "../state/gameEntityTypes";
import { useSettings } from "./SettingsProvider";
import { useFrame } from "@react-three/fiber";

const noop = () => {};

export function useRotation(entity: ShapeEntity, ref: RefObject<Group | null>) {
  const { animationEnabled } = useSettings();

  useFrame(
    entity.rotate && animationEnabled
      ? () => {
          if (ref.current) {
            const t = performance.now() / 1000;
            ref.current.rotation.y = (t / 3.0) * Math.PI * 2;
          }
        }
      : noop,
  );
}
