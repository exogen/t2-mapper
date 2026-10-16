/**
 * Server packets for specs, packed as a Tribes 2 server packs them.
 */
import { NetEventClassFirst, createDefaultRegistry } from "t2-demo-parser";
import { BitStreamWriter } from "./BitStreamWriter.js";
import { packNetString, writeString } from "./HuffmanWriter.js";

export const CONNECT_SEQUENCE = 0x0badf00d;

const registry = createDefaultRegistry();

/**
 * A guaranteed event: its sequence number, class and payload.
 */
export interface ServerEvent {
  seq: number;
  className: string;
  write: (bs: BitStreamWriter) => void;
}

export function writeF32(bs: BitStreamWriter, value: number): void {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  bs.writeU32(view.getUint32(0, true));
}

export const netString = (
  seq: number,
  id: number,
  value: string,
): ServerEvent => ({
  seq,
  className: "NetStringEvent",
  write(bs) {
    bs.writeInt(id, 10);
    bs.writeFlag(true);
    writeString(bs, value, true);
  },
});

/**
 * commandToClient with a tagged function name, as the server packs it.
 */
export const command = (
  seq: number,
  tag: number,
  ...args: string[]
): ServerEvent => ({
  seq,
  className: "RemoteCommandEvent",
  write(bs) {
    bs.writeInt(1 + args.length, 5);
    bs.writeInt(2, 2);
    bs.writeInt(tag, 10);
    for (const arg of args) packNetString(bs, arg, true);
  },
});

export const gravityEvent = (seq: number, gravity: number): ServerEvent => ({
  seq,
  className: "GravityEvent",
  write: (bs) => writeF32(bs, gravity),
});

/**
 * Ghost 0 as an observer camera, from an initial update that sets nothing.
 */
export const cameraGhost = (seq: number): ServerEvent => ({
  seq,
  className: "GhostAlwaysObjectEvent",
  write(bs) {
    bs.writeInt(0, 10);
    bs.writeFlag(true); // object data
    bs.writeInt(registry.getGhostClassId("Camera")!, 7);
    // Datablock, target, ShapeBase masks, controlled, camera payload.
    for (let i = 0; i < 5; i++) bs.writeFlag(false);
  },
});

/**
 * A ghost as our own player, from an initial update that sets nothing.
 */
export const playerGhost = (seq: number, ghost = 0): ServerEvent => ({
  seq,
  className: "GhostAlwaysObjectEvent",
  write(bs) {
    bs.writeInt(ghost, 10);
    bs.writeFlag(true); // object data
    bs.writeInt(registry.getGhostClassId("Player")!, 7);
    // Datablock, target, ShapeBase masks, impact, action, arm action.
    for (let i = 0; i < 6; i++) bs.writeFlag(false);
    bs.writeFlag(true); // controlled by this connection
  },
});

/**
 * Our player as the server sends it: on foot with 60 energy, still unless
 * `velocity` says otherwise, as ghost 0 unless `ghost` does.
 */
export interface PlayerState {
  ghost?: number;
  position: readonly number[];
  velocity?: readonly number[];
}

/**
 * A server data packet: dnet header, no rate info, the client half of
 * GameConnection::readPacket (FUN_005fb9f0) — the move ack, then the
 * control object when `camera` (ghost 0 at the origin, looking at `pitch`)
 * or `player` is set, or a compression point (the origin unless given)
 * when `compressionPoint` is — guaranteed events, no ghosts.
 * `ackMask` bit k reports our packet `ack - k` delivered (all of them by
 * default).
 */
export function serverPacket(
  seq: number,
  opts: {
    ack?: number;
    ackMask?: number;
    lastMoveAck?: number;
    camera?: boolean | { pitch: number };
    player?: PlayerState;
    compressionPoint?: boolean | readonly number[];
    events?: ServerEvent[];
  } = {},
): Uint8Array {
  const bs = new BitStreamWriter(1500);
  bs.writeFlag(true);
  bs.writeInt(CONNECT_SEQUENCE & 1, 1);
  bs.writeInt(seq & 0x1ff, 9);
  const ack = opts.ack ?? 0;
  bs.writeInt(ack & 0x1ff, 9);
  bs.writeInt(0, 2); // DataPacket
  const ackMask = opts.ackMask ?? (ack ? (1 << Math.min(ack, 8)) - 1 : 0);
  bs.writeInt(ackMask ? 1 : 0, 3);
  if (ackMask) bs.writeInt(ackMask, 8);
  bs.writeFlag(false); // rate info
  bs.writeFlag(false);
  bs.writeU32(opts.lastMoveAck ?? 0);
  for (let i = 0; i < 5; i++) bs.writeFlag(false); // damage flash … jammed
  bs.writeFlag(!!(opts.camera || opts.player || opts.compressionPoint));
  if (opts.camera) {
    bs.writeFlag(true); // the control object's packet data
    bs.writeInt(0, 10);
    // Energy, recharge rate, position, pitch, yaw, then the camera mode.
    for (let i = 0; i < 5; i++) writeF32(bs, 0);
    writeF32(bs, opts.camera === true ? 0 : opts.camera.pitch);
    writeF32(bs, 0);
    bs.writeInt(0, 3);
  } else if (opts.player) {
    const { ghost = 0, position, velocity = [0, 0, 0] } = opts.player;
    bs.writeFlag(true); // the control object's packet data
    bs.writeInt(ghost, 10);
    writeF32(bs, 60); // energy
    writeF32(bs, 0.256); // recharge rate
    bs.writeInt(1, 3); // state
    bs.writeFlag(false); // recovering
    bs.writeFlag(false); // jump delay
    bs.writeFlag(true); // on foot
    for (const value of [...position, ...velocity]) writeF32(bs, value);
    bs.writeInt(0, 4); // ticks since a jump surface
    for (let i = 0; i < 3; i++) writeF32(bs, 0); // head, rotation
    bs.writeFlag(false); // no object of its own
    bs.writeFlag(false); // disableMove
    bs.writeFlag(false); // pilot
  } else if (opts.compressionPoint) {
    bs.writeFlag(false); // no control object: a compression point
    const point =
      opts.compressionPoint === true ? [0, 0, 0] : opts.compressionPoint;
    for (const value of point) writeF32(bs, value);
  }
  bs.writeFlag(false); // target visibility
  bs.writeFlag(false); // fov
  bs.writeFlag(false); // no unguaranteed events
  for (const event of opts.events ?? []) {
    bs.writeFlag(true);
    bs.writeFlag(false); // explicit sequence number
    bs.writeInt(event.seq & 0x7f, 7);
    bs.writeInt(
      registry.getEventClassId(event.className)! - NetEventClassFirst,
      6,
    );
    event.write(bs);
  }
  bs.writeFlag(false);
  bs.writeFlag(false); // no ghosts
  return bs.getBuffer();
}
