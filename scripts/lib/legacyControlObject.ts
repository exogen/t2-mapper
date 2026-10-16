/**
 * The control object in recordings whose server never ticked it, rewritten
 * as the server would have sent it had it ticked the object with the
 * neutral moves the upgrade gives the connection. Relays before 2026-10-12
 * sent no moves, and a ShapeBase control object ticks only through queued
 * moves (advanceObjects, FUN_00602720), so the server kept the state its
 * scripts set. Tribes2.exe playback ticks its control object with every
 * recorded move and snaps it to each packet's state (readPacket,
 * FUN_005fb9f0, replays the unacknowledged moves on top), so wherever a
 * tick changes that state the view shakes:
 *
 * - A Camera's pitch past the clamp of Camera::processTick (FUN_005cbc80).
 *   Orbit modes need nothing more: interpolateTick (FUN_005cc120) renders
 *   them from the target and never reads the stale position.
 * - A Player's velocity: a hit sets it and only a tick spends it, so a
 *   frozen player keeps it for good. It is zeroed, which leaves the player
 *   where the recording's other players saw it.
 * - A Player state the client already has: the packet carries only the
 *   compression point, as the server writes it to a client whose
 *   prediction agrees (writePacket, FUN_005fc4e0), and the client keeps
 *   predicting. A player frozen above the ground settles onto it instead
 *   of being pulled back up at every packet.
 */
import {
  BitStream,
  BlockTypePacket,
  DemoParser,
  type CameraPacketData,
  type PacketData,
  type PlayerPacketData,
} from "t2-demo-parser";
import { BitStreamWriter } from "../../relay/BitStreamWriter.js";
import { writeBits } from "../../relay/protocol.js";

/**
 * Camera::processTick compares the pitch to 1.3962, the doubles at
 * 0x0079acf0 and 0x0079acf8, and stores the F32 bits 0x3fb2b6ae past it
 * (or their negation). readPacketData stores the server's pitch as it
 * comes.
 */
const CAMERA_PITCH_LIMIT = 1.3962;
const CAMERA_MAX_PITCH_BITS = 0x3fb2b6ae;
const CAMERA_MIN_PITCH_BITS = 0xbfb2b6ae;

/**
 * Where a control object's packet data sits in a packet.
 */
export type ControlObjectLayout =
  | {
      kind: "camera";
      /**
       * The pitch F32, after ShapeBase's energy and recharge rate and the
       * position.
       */
      pitchAt: number;
    }
  | {
      kind: "player";
      ghostIndex: number;
      /**
       * The flag that selects the control object's state over a bare
       * compression point (readPacket, FUN_005fb9f0), then its ghost index.
       */
      fullStateAt: number;
      /**
       * Player::readPacketData's bits (FUN_005dab20).
       */
      stateAt: number;
      stateEnd: number;
      /**
       * Three F32s each. The position is also the compression point.
       */
      positionAt: number;
      velocityAt: number;
      /**
       * Where the packet's ghost section ends.
       */
      contentEnd: number;
    };

const f32 = new DataView(new ArrayBuffer(4));

export function f32FromBits(bits: number): number {
  f32.setUint32(0, bits);
  return f32.getFloat32(0);
}

export function readU32At(data: Uint8Array, at: number): number {
  return new BitStream(data, at).readInt(32) >>> 0;
}

/**
 * The pitch, as F32 bits, that a camera tick leaves of `bits`.
 */
export function tickedCameraPitch(bits: number): number {
  const pitch = f32FromBits(bits);
  if (pitch > CAMERA_PITCH_LIMIT) return CAMERA_MAX_PITCH_BITS;
  if (pitch < -CAMERA_PITCH_LIMIT) return CAMERA_MIN_PITCH_BITS;
  return bits;
}

/**
 * Whether three F32s at `at` hold anything but zero.
 */
export function hasVelocity(data: Uint8Array, at: number): boolean {
  for (let i = 0; i < 3; i++)
    if (f32FromBits(readU32At(data, at + i * 32)) !== 0) return true;
  return false;
}

/**
 * Bits `from` to `to` of `data`, packed from bit 0.
 */
export function readBitRange(
  data: Uint8Array,
  from: number,
  to: number,
): Uint8Array {
  const writer = new BitStreamWriter((to - from + 7) >> 3);
  copyBits(writer, data, from, to);
  return writer.getBuffer();
}

function copyBits(
  writer: BitStreamWriter,
  data: Uint8Array,
  from: number,
  to: number,
): void {
  const bs = new BitStream(data, from);
  for (let at = from; at < to; at += 32) {
    const count = Math.min(32, to - at);
    writer.writeInt(bs.readInt(count), count);
  }
}

function sameF32(data: Uint8Array, at: number, value: number | undefined) {
  return (
    value !== undefined && Object.is(f32FromBits(readU32At(data, at)), value)
  );
}

/**
 * Where the parser's ghost section ends: after the last ghost and the flag
 * that ends the list, or after the flags of an empty section.
 */
function ghostSectionEnd(packet: PacketData, data: Uint8Array): number {
  const start = packet.ghostSectionStart!;
  const last = packet.ghosts.at(-1);
  if (last) return last.updateBitsEnd + 1;
  return new BitStream(data, start).readFlag() ? start + 5 : start + 1;
}

/**
 * The layout of a packet's control object, when the parser read its full
 * state as a Camera's, or as a Player's on foot with no object of its own
 * (anything else is left as it is). Each offset is checked against what
 * the parser read.
 */
export function controlObjectLayout(
  packet: PacketData,
  data: Uint8Array,
): ControlObjectLayout | undefined {
  const {
    controlObjectGhostIndex: ghostIndex,
    controlObjectData,
    controlObjectDataStart: stateAt,
    controlObjectDataEnd: stateEnd,
  } = packet.gameState;
  if (
    ghostIndex === undefined ||
    stateAt === undefined ||
    stateEnd === undefined ||
    !controlObjectData ||
    packet.parseFault
  )
    return undefined;
  const camera = controlObjectData as CameraPacketData;
  if (camera.cameraMode !== undefined) {
    const pitchAt = stateAt + 5 * 32;
    if (!sameF32(data, pitchAt, camera.rotX))
      throw new Error(`No camera pitch at bit ${pitchAt}`);
    return { kind: "camera", pitchAt };
  }
  const player = controlObjectData as PlayerPacketData;
  if (player.actionState === undefined || player.headX === undefined)
    return undefined;
  const bs = new BitStream(data, stateAt);
  bs.readInt(32); // energy
  bs.readInt(32); // recharge rate
  bs.readInt(3); // state
  if (bs.readFlag()) bs.readInt(7); // recover ticks
  if (bs.readFlag()) bs.readInt(7); // jump delay
  // Mounted: no position, and no compression point to keep.
  if (!bs.readFlag()) return undefined;
  const positionAt = bs.getCurPos();
  const velocityAt = positionAt + 3 * 32;
  bs.setCurPos(velocityAt + 3 * 32 + 4 + 3 * 32);
  // A piloted object's own state follows.
  if (bs.readFlag()) return undefined;
  const fullStateAt = stateAt - 11;
  const header = new BitStream(data, fullStateAt - 1);
  const axes = ["x", "y", "z"] as const;
  if (
    bs.getCurPos() + 2 !== stateEnd ||
    !header.readFlag() ||
    !header.readFlag() ||
    header.readInt(10) !== ghostIndex ||
    !axes.every(
      (axis, i) =>
        sameF32(data, positionAt + i * 32, player.position?.[axis]) &&
        sameF32(data, velocityAt + i * 32, player.velocity?.[axis]),
    )
  )
    throw new Error(`No player state at bit ${stateAt}`);
  const contentEnd = ghostSectionEnd(packet, data);
  if (contentEnd > data.length * 8 || contentEnd <= data.length * 8 - 8)
    throw new Error(`Packet content ends at bit ${contentEnd}`);
  return {
    kind: "player",
    ghostIndex,
    fullStateAt,
    stateAt,
    stateEnd,
    positionAt,
    velocityAt,
    contentEnd,
  };
}

/**
 * Each packet's control object layout, by block index.
 */
export async function controlObjectLayouts(
  bytes: Uint8Array,
): Promise<Map<number, ControlObjectLayout>> {
  const parser = new DemoParser(bytes);
  await parser.load();
  const layouts = new Map<number, ControlObjectLayout>();
  for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
    const parsed = block.type === BlockTypePacket ? block.parsed : undefined;
    if (!parsed || !("events" in parsed)) continue;
    try {
      const layout = controlObjectLayout(parsed, block.data);
      if (layout) layouts.set(block.index, layout);
    } catch (error) {
      throw new Error(`Block ${block.index}: ${String(error)}`);
    }
  }
  return layouts;
}

/**
 * What ticking did to one packet's control object.
 */
export interface TickedControlObject {
  data: Uint8Array;
  clampedPitch: boolean;
  zeroedVelocity: boolean;
  omittedState: boolean;
}

/**
 * Rewrites the dispatched packets of a recording whose server never ticked
 * its control object, in order.
 */
export class LegacyControlObject {
  /**
   * The player state the client last received in full.
   */
  private lastState?: { ghostIndex: number; bits: Uint8Array };

  /**
   * Rewrite `data`, a dispatched packet whose control object has `layout`
   * (none when the packet holds no control object state). The camera's
   * pitch and the player's velocity change in place; a player state the
   * client already has leaves only its position, as the compression point.
   */
  tick(
    data: Uint8Array,
    layout: ControlObjectLayout | undefined,
  ): TickedControlObject {
    const ticked = {
      data,
      clampedPitch: false,
      zeroedVelocity: false,
      omittedState: false,
    };
    if (layout?.kind !== "player") {
      this.lastState = undefined;
      if (layout?.kind === "camera") {
        const pitch = readU32At(data, layout.pitchAt);
        const clamped = tickedCameraPitch(pitch);
        if (clamped !== pitch) {
          writeBits(data, layout.pitchAt, clamped, 32);
          ticked.clampedPitch = true;
        }
      }
      return ticked;
    }
    if (hasVelocity(data, layout.velocityAt)) {
      for (let i = 0; i < 3; i++)
        writeBits(data, layout.velocityAt + i * 32, 0, 32);
      ticked.zeroedVelocity = true;
    }
    const bits = readBitRange(data, layout.stateAt, layout.stateEnd);
    const last = this.lastState;
    if (
      last?.ghostIndex === layout.ghostIndex &&
      Buffer.compare(last.bits, bits) === 0
    ) {
      ticked.data = omitPlayerState(data, layout);
      ticked.omittedState = true;
    } else {
      this.lastState = { ghostIndex: layout.ghostIndex, bits };
    }
    return ticked;
  }
}

/**
 * The packet with its control object's state replaced by the compression
 * point it set, the player's position.
 */
function omitPlayerState(
  data: Uint8Array,
  layout: Extract<ControlObjectLayout, { kind: "player" }>,
): Uint8Array {
  const writer = new BitStreamWriter(data.length);
  copyBits(writer, data, 0, layout.fullStateAt);
  writer.writeFlag(false);
  copyBits(writer, data, layout.positionAt, layout.positionAt + 3 * 32);
  copyBits(writer, data, layout.stateEnd, layout.contentEnd);
  return writer.getBuffer();
}
