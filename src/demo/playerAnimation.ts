/**
 * Movement animation selection logic replicating Torque's
 * Player::pickActionAnimation() (player.cc:2280).
 */

/** Torque falling threshold: Z velocity below this = falling. */
const FALLING_THRESHOLD = -10;

/** Minimum velocity dot product to count as intentional movement. */
const MOVE_THRESHOLD = 0.1;

export interface MoveAnimationResult {
  /** Engine alias name (e.g. "root", "run", "back", "side", "fall"). */
  animation: string;
  /** 1 for forward playback, -1 for reversed (right strafe). */
  timeScale: number;
}

/**
 * Extract body yaw (Torque rotationZ) from a Three.js quaternion produced by
 * `playerYawToQuaternion()`. That function builds a Y-axis rotation:
 *   qy = sin(-rotZ / 2), qw = cos(-rotZ / 2)
 * So: rotZ = -2 * atan2(qy, qw)
 */
function quaternionToBodyYaw(q: [number, number, number, number]): number {
  return -2 * Math.atan2(q[1], q[3]);
}

/**
 * Pick the movement animation for a player based on their velocity and
 * body orientation, matching Torque's pickActionAnimation().
 *
 * @param velocity Torque world-space velocity [x, y, z], or undefined for idle.
 * @param rotation Three.js quaternion from playerYawToQuaternion().
 */
export function pickMoveAnimation(
  velocity: [number, number, number] | undefined,
  rotation: [number, number, number, number],
): MoveAnimationResult {
  if (!velocity) {
    return { animation: "root", timeScale: 1 };
  }

  const [vx, vy, vz] = velocity;

  // Falling: Torque Z velocity below threshold.
  if (vz < FALLING_THRESHOLD) {
    return { animation: "fall", timeScale: 1 };
  }

  // Convert world velocity to player object space using body yaw.
  const yaw = quaternionToBodyYaw(rotation);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  // Torque object space: localY = forward, localX = right.
  const localX = vx * cosY + vy * sinY;
  const localY = -vx * sinY + vy * cosY;

  // Pick direction with largest dot product.
  const forwardDot = localY;
  const backDot = -localY;
  const leftDot = -localX;
  const rightDot = localX;

  const maxDot = Math.max(forwardDot, backDot, leftDot, rightDot);

  if (maxDot < MOVE_THRESHOLD) {
    return { animation: "root", timeScale: 1 };
  }

  if (maxDot === forwardDot) {
    return { animation: "run", timeScale: 1 };
  }
  if (maxDot === backDot) {
    return { animation: "back", timeScale: 1 };
  }
  if (maxDot === leftDot) {
    return { animation: "side", timeScale: 1 };
  }
  // Right strafe: same Side animation, reversed.
  return { animation: "side", timeScale: -1 };
}
