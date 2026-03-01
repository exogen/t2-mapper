import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import {
  _r90,
  _r90inv,
  getPosedNodeTransform,
} from "../demo/demoPlaybackUtils";
import {
  ShapeRenderer,
  useStaticShape,
} from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import type { TorqueObject } from "../torqueScript";

/** Renders a shape model for a demo entity using the existing shape pipeline. */
export function DemoShapeModel({
  shapeName,
  entityId,
}: {
  shapeName: string;
  entityId: number | string;
}) {
  const torqueObject = useMemo<TorqueObject>(
    () => ({
      _class: "player",
      _className: "Player",
      _id: typeof entityId === "number" ? entityId : 0,
    }),
    [entityId],
  );

  return (
    <ShapeInfoProvider
      object={torqueObject}
      shapeName={shapeName}
      type="StaticShape"
    >
      <ShapeRenderer loadingColor="#00ff88" />
    </ShapeInfoProvider>
  );
}

/**
 * Renders a mounted weapon using the Torque engine's mount system.
 *
 * The weapon's `Mountpoint` node is aligned to the player's `Mount0` node
 * (right hand). Both nodes come from the GLB skeleton in its idle ("Root"
 * animation) pose. The mount transform is conjugated by ShapeRenderer's 90° Y
 * rotation: T_mount = R90 * M0 * MP^(-1) * R90^(-1).
 */
export function DemoWeaponModel({
  shapeName,
  playerShapeName,
}: {
  shapeName: string;
  playerShapeName: string;
}) {
  const playerGltf = useStaticShape(playerShapeName);
  const weaponGltf = useStaticShape(shapeName);

  const mountTransform = useMemo(() => {
    // Get Mount0 from the player's posed (Root animation) skeleton.
    const m0 = getPosedNodeTransform(
      playerGltf.scene,
      playerGltf.animations,
      "Mount0",
    );
    if (!m0) return { position: undefined, quaternion: undefined };

    // Get Mountpoint from weapon (may not be animated).
    const mp = getPosedNodeTransform(
      weaponGltf.scene,
      weaponGltf.animations,
      "Mountpoint",
    );

    // Compute T_mount = R90 * M0 * MP^(-1) * R90^(-1)
    // This conjugates the GLB-space mount transform by ShapeRenderer's 90° Y
    // rotation so the weapon is correctly oriented in entity space.
    let combinedPos: Vector3;
    let combinedQuat: Quaternion;

    if (mp) {
      // MP^(-1)
      const mpInvQuat = mp.quaternion.clone().invert();
      const mpInvPos = mp.position.clone().negate().applyQuaternion(mpInvQuat);

      // M0 * MP^(-1)
      combinedQuat = m0.quaternion.clone().multiply(mpInvQuat);
      combinedPos = mpInvPos
        .clone()
        .applyQuaternion(m0.quaternion)
        .add(m0.position);
    } else {
      combinedPos = m0.position.clone();
      combinedQuat = m0.quaternion.clone();
    }

    // R90 * combined * R90^(-1)
    const mountPos = combinedPos.applyQuaternion(_r90);
    const mountQuat = _r90.clone().multiply(combinedQuat).multiply(_r90inv);

    return { position: mountPos, quaternion: mountQuat };
  }, [playerGltf, weaponGltf]);

  const torqueObject = useMemo<TorqueObject>(
    () => ({
      _class: "weapon",
      _className: "Weapon",
      _id: 0,
    }),
    [],
  );

  return (
    <ShapeInfoProvider object={torqueObject} shapeName={shapeName} type="Item">
      <group
        position={mountTransform.position}
        quaternion={mountTransform.quaternion}
      >
        <ShapeRenderer loadingColor="#4488ff" />
      </group>
    </ShapeInfoProvider>
  );
}
