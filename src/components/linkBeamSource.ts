/**
 * Where a beam leaves its shooter, shared by the ELF/repair link beams
 * and the shocklance: the mounted weapon's Muzzlepoint node
 * (getRenderMuzzlePoint) and the direction the shooter aims
 * (getRenderMuzzleVector).
 */
import { Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import { gameEntityStore } from "../state/gameEntityStore";
import {
  MAX_PITCH,
  threeForwardHeading,
  yawPitchToQuaternion,
} from "../stream/streamHelpers";

/** Fallback muzzle height above the source's origin, used only when
 *  no Muzzlepoint node resolves (weapon not mounted/loaded yet). */
export const LINK_MUZZLE_LIFT = 1.4;
/** How often to re-search a source's subtree for its muzzle node —
 *  weapons swap on mount changes, so the cache is short-lived. */
const MUZZLE_CACHE_SEC = 1;
/** PlayerData::maxLookAngle — 1.5 rad in every Tribes 2 armor. */
const LINK_MAX_LOOK_ANGLE = 1.5;

const _aimQuat = new Quaternion();

/**
 * The engine starts link beams at getRenderMuzzlePoint(sourceSlot) — the
 * mounted weapon's Muzzlepoint node, animated with the player (vtable
 * +0x190 in FUN_0064cff0/FUN_00645fc0). Our mounted weapon shapes portal
 * into the player's subtree, so the same node is reachable by name;
 * cached briefly since weapons swap.
 */
const _muzzleCache = new WeakMap<
  object,
  { node: { getWorldPosition(v: Vector3): Vector3 } | null; checkedAt: number }
>();
export function muzzleWorldPosition(
  source: { traverse(cb: (o: unknown) => void): void },
  nowSec: number,
  out: Vector3,
): boolean {
  let entry = _muzzleCache.get(source);
  if (
    !entry ||
    nowSec - entry.checkedAt > MUZZLE_CACHE_SEC ||
    nowSec < entry.checkedAt
  ) {
    let found: { getWorldPosition(v: Vector3): Vector3 } | null = null;
    source.traverse((o) => {
      const name = (o as { name?: string }).name;
      if (!found && name && name.toLowerCase().includes("muzzlepoint")) {
        found = o as { getWorldPosition(v: Vector3): Vector3 };
      }
    });
    entry = { node: found, checkedAt: nowSec };
    _muzzleCache.set(source, entry);
  }
  if (!entry.node) return false;
  entry.node.getWorldPosition(out);
  return true;
}

/**
 * The shooter's aim (getRenderMuzzleVector) in Three world space,
 * rebuilt exactly the way the verified first-person camera is: body yaw
 * plus replicated head yaw/pitch through yawPitchToQuaternion, forward
 * = -Z.
 */
export function sourceAimDirection(
  sourceId: string | undefined,
  source: Object3D,
  out: Vector3,
): Vector3 {
  const srcEntity = sourceId
    ? gameEntityStore.getState().streamEntities.get(sourceId)
    : undefined;
  const headPitch =
    srcEntity && "headPitch" in srcEntity
      ? ((srcEntity.headPitch as number | undefined) ?? 0)
      : 0;
  const headYaw =
    srcEntity && "headYaw" in srcEntity
      ? ((srcEntity.headYaw as number | undefined) ?? 0)
      : 0;
  const bodyYaw = threeForwardHeading(source.quaternion);
  const pitch = Math.max(
    -MAX_PITCH,
    Math.min(MAX_PITCH, headPitch * LINK_MAX_LOOK_ANGLE),
  );
  const [rx, ry, rz, rw] = yawPitchToQuaternion(
    bodyYaw + headYaw * LINK_MAX_LOOK_ANGLE,
    pitch,
  );
  _aimQuat.set(rx, ry, rz, rw);
  return out.set(0, 0, -1).applyQuaternion(_aimQuat);
}
