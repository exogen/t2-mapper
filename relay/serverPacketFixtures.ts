/**
 * Server packets for specs: packed as a Tribes 2 server packs them, or
 * decoded as the parser returns them, plus the relay state they build.
 */
import {
  GhostStateAccumulator,
  NetEventClassFirst,
  createDefaultRegistry,
  createLiveParser,
  passiveObserverProtocolState,
  type PacketData,
  type PacketParser,
  type ParsedData,
} from "t2-demo-parser";
import { BitStreamWriter } from "./BitStreamWriter.js";
import { packNetString, writeString } from "./HuffmanWriter.js";
import { GAME_PROTOCOL_VERSION } from "./shared.js";
import type { WatchCatchupPayload } from "./types.js";
import { buildCatchupPayload } from "./watchCatchup.js";
import {
  type CatchupDataBlockCache,
  deserializeCatchupPayload,
  serializeCatchupPayload,
} from "./watchSerialize.js";
import { WatchStateAccumulator } from "./watchState.js";

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

/**
 * A packet as the parser decodes it, carrying only these events.
 */
export function decodedPacket(...events: ParsedData[]): PacketData {
  return {
    gameState: {},
    ghosts: [],
    events: events.map((parsedData) => ({ classId: 0, parsedData })),
  } as unknown as PacketData;
}

export const remoteCommandEvent = (
  funcName: string,
  ...args: string[]
): ParsedData => ({ type: "RemoteCommandEvent", funcName, args });

export const remoteCommandPacket = (funcName: string, ...args: string[]) =>
  decodedPacket(remoteCommandEvent(funcName, ...args));

/**
 * One `ServerMessage` remote command per message. Each message's first
 * argument is its type (MsgClientJoin, …) and the rest are its fields.
 */
export const serverMessagePacket = (...messages: string[][]) =>
  decodedPacket(
    ...messages.map((args) => remoteCommandEvent("ServerMessage", ...args)),
  );

/**
 * The catch-up payload a watcher joining now receives: built at epoch 1
 * for test:28000, then sent through the wire format unless `viaWire` is
 * false. The parser speaks the game protocol unless one is given.
 */
export function testCatchupPayload({
  watchState = new WatchStateAccumulator(),
  ghostState = new GhostStateAccumulator(),
  packetParser = createLiveParser({ protocolVersion: GAME_PROTOCOL_VERSION })
    .packetParser,
  epoch = 1,
  serverAddress = "test:28000",
  viaWire = true,
  dataBlockCache,
}: {
  watchState?: WatchStateAccumulator;
  ghostState?: GhostStateAccumulator;
  packetParser?: PacketParser;
  epoch?: number;
  serverAddress?: string;
  viaWire?: boolean;
  dataBlockCache?: CatchupDataBlockCache;
} = {}): WatchCatchupPayload {
  const payload = buildCatchupPayload({
    packetParser,
    ghostState,
    watchState,
    epoch,
    serverAddress,
  });
  return viaWire
    ? deserializeCatchupPayload(
        serializeCatchupPayload(payload, dataBlockCache),
      )
    : payload;
}

/**
 * A relay watching a server as a passive observer, with one parser feeding
 * both accumulators. `send` packs its events (numbered in order) into the
 * next server packet, applies it and returns the bytes watchers receive.
 */
export function watchRelaySource() {
  const { packetParser, registry } = createLiveParser({
    protocolVersion: GAME_PROTOCOL_VERSION,
  });
  packetParser.setConnectionProtocolState(
    passiveObserverProtocolState(serverPacket(1)[0]),
  );
  const watchState = new WatchStateAccumulator();
  const ghostState = new GhostStateAccumulator();
  let packets = 0;
  let events = 0;
  return {
    packetParser,
    registry,
    watchState,
    ghostState,
    send(...pending: ((seq: number) => ServerEvent)[]): Uint8Array {
      const packet = serverPacket(++packets, {
        events: pending.map((event) => event(events++)),
      });
      const parsed = packetParser.parsePacket(packet);
      if (parsed.parseFault)
        throw new Error(`Unreadable packet: ${parsed.parseFault.message}`);
      watchState.applyPacket(parsed);
      ghostState.applyPacket(parsed);
      return packet;
    },
    payload: () => testCatchupPayload({ packetParser, ghostState, watchState }),
  };
}
