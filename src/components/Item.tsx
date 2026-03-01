import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { ShapeRenderer } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import { useSimGroup } from "./SimGroup";
import { FloatingLabel } from "./FloatingLabel";
import { useDatablock } from "./useDatablock";
import { useSettings } from "./SettingsProvider";

/** Handles TorqueScript's various truthy representations. */
function isTruthy(value: unknown): boolean {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower !== "0" && lower !== "false" && lower !== "";
  }
  return !!value;
}

const TEAM_NAMES: Record<number, string> = {
  1: "Storm",
  2: "Inferno",
};

export function Item({ object }: { object: TorqueObject }) {
  const simGroup = useSimGroup();
  const datablockName = getProperty(object, "dataBlock") ?? "";
  const datablock = useDatablock(datablockName);

  const shouldRotate = isTruthy(
    getProperty(object, "rotate") ?? getProperty(datablock, "rotate")
  );

  const position = useMemo(() => getPosition(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);

  const { animationEnabled } = useSettings();
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    if (!groupRef.current || !shouldRotate || !animationEnabled) return;
    const t = performance.now() / 1000;
    groupRef.current.rotation.y = (t / 3.0) * Math.PI * 2;
  });

  const shapeName = getProperty(datablock, "shapeFile");

  if (!shapeName) {
    console.error(`<Item> missing shape for datablock: ${datablockName}`);
  }

  const isFlag = datablockName?.toLowerCase() === "flag";
  const team = simGroup?.team ?? null;
  const teamName = team && team > 0 ? TEAM_NAMES[team] : null;
  const label = isFlag && teamName ? `${teamName} Flag` : null;

  return (
    <ShapeInfoProvider type="Item" object={object} shapeName={shapeName}>
      <group
        ref={groupRef}
        position={position}
        {...(!shouldRotate && { quaternion: q })}
        scale={scale}
      >
        <ShapeRenderer loadingColor="pink">
          {label ? <FloatingLabel opacity={0.6}>{label}</FloatingLabel> : null}
        </ShapeRenderer>
      </group>
    </ShapeInfoProvider>
  );
}
