import { Vector3 } from "three";
import type {
  MoveData,
  PlayerDataBlock,
  PlayerGhostData,
  PlayerPacketData,
} from "t2-demo-parser";
import { PlayerCollision } from "../collision/playerCollision";
import { waterLevelAt } from "../collision/waterLevel";

// Retail constants: 0x79c140 (TickSec), 0x79b400/404/408 (warp/prediction).
// TickMs is 32; retail physics nevertheless uses 1/32, not TickMs / 1000.
export const PLAYER_TICK_SEC = 1 / 32;
export const MAX_PREDICTION_TICKS = 30;
const MIN_WARP_TICKS = 0.5;
const MAX_WARP_TICKS = 3;
const MOVE_STATE = 1,
  RECOVER_STATE = 2;
export interface PlayerMove {
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  freeLook?: boolean;
  trigger?: boolean[];
}

/** Move::unclamp: packed ghost input has different fields from demo moves. */
export function unclampMove(move: MoveData): PlayerMove {
  return {
    x: move.px / 16 - 1,
    y: move.py / 16 - 1,
    z: move.pz / 16 - 1,
    yaw: ((move.pyaw << 16) >> 16) * ((2 * Math.PI) / 65536),
    pitch: ((move.ppitch << 16) >> 16) * ((2 * Math.PI) / 65536),
    roll: ((move.proll << 16) >> 16) * ((2 * Math.PI) / 65536),
    freeLook: move.freeLook,
    trigger: move.trigger,
  };
}
const nullMove: PlayerMove = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  freeLook: false,
  trigger: [],
};
const twoPi = 2 * Math.PI;
function angleDifference(a: number, b: number): number {
  return ((((a - b + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

/** Immutable render delta, equivalent to Player::StateDelta's backstep vectors. */
export interface PlayerRenderDelta {
  posVec: [number, number, number];
  rot: number;
  rotVec: number;
  head: [number, number];
  headVec: [number, number];
  maxLookAngle: number;
}

/** Client Player::processTick, updateMove, updatePos and unpackUpdate.
 * Retail references: 0x5d1d70, 0x5d2d60, 0x5d7220, 0x5db2d0.
 * This state belongs to one ghost lifetime, independently of its DTS instance. */
export class PlayerPrediction {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly posVec = new Vector3();
  readonly size: Vector3;
  yaw = 0;
  rotVec = 0;
  headPitch = 0;
  headYaw = 0;
  private headPitchVec = 0;
  private headYawVec = 0;
  energy = 0;
  jetting = false;
  falling = false;
  damageState = 0;
  mounted = false;
  /** A controlling client in third person can turn its head with freeLook. */
  allowFreelook = false;
  disableMove = false;
  predictionCount = 0;
  warpTicks = 0;
  actionState = MOVE_STATE;
  recoverTicks = 0;
  jumpDelay = 0;
  jumpSurfaceLastContact = 0;
  private readonly warpOffset = new Vector3();
  private rotOffset = 0;
  private readonly jumpSurfaceNormal = new Vector3(0, 0, 1);
  private move: PlayerMove = nullMove;
  private readonly collision: PlayerCollision;
  private readonly contactNormal = new Vector3();
  private readonly acceleration = new Vector3();
  private readonly moveVec = new Vector3();
  private readonly requested = new Vector3();
  private readonly scratch = new Vector3();
  private readonly initial = new Vector3();
  private readonly firstNormal = new Vector3();
  private readonly travel = new Vector3();
  private initialized = false;

  data: PlayerDataBlock;

  get hasPosition(): boolean {
    return this.initialized;
  }

  constructor(
    data: PlayerDataBlock,
    collideWithField?: (id: string) => boolean,
  ) {
    this.data = data;
    this.collision = new PlayerCollision(collideWithField);
    const box = data.boxSize;
    this.size = new Vector3(box?.x ?? 1, box?.y ?? 1, box?.z ?? 2);
    this.energy = data.maxEnergy ?? 0;
  }

  /** Armor changes preserve the player's current simulation state. */
  setDataBlock(data: PlayerDataBlock): void {
    this.data = data;
    if (data.boxSize) this.size.copy(data.boxSize);
    this.energy = Math.min(this.energy, data.maxEnergy ?? 0);
  }

  /** Packet values are authoritative. allowWarp=false is a teleport, not a lerp. */
  unpackUpdate(update: PlayerGhostData, initial = false): void {
    if (typeof update.energy === "number")
      this.energy = update.energy * (this.data.maxEnergy ?? 0);
    if (!update.position) return;
    const oldSpeed = this.velocity.length();
    this.predictionCount = MAX_PREDICTION_TICKS;
    if (update.velocity) this.velocity.copy(update.velocity);
    if (update.move) this.move = unclampMove(update.move);
    this.actionState = update.actionState ?? this.actionState;
    this.recoverTicks = update.recoverTicks ?? this.recoverTicks;
    this.headPitch =
      (update.headX ?? 0) * (this.data.maxLookAngle ?? Math.PI / 2);
    this.headYaw =
      (update.headZ ?? 0) * (this.data.maxLookAngle ?? Math.PI / 2);
    this.falling = update.moveFlag0 ?? this.falling;
    this.jetting = update.moveFlag1 ?? this.jetting;
    const yaw = update.rotationZ ?? this.yaw;
    this.headPitchVec = this.headYawVec = 0;
    this.warpTicks = 0;
    if (this.initialized && !initial && update.allowWarp) {
      this.warpOffset.copy(update.position).sub(this.position);
      const distancePerTick =
        (oldSpeed + this.velocity.length()) * 0.5 * PLAYER_TICK_SEC;
      const ticks =
        distancePerTick > 0.00001
          ? this.warpOffset.length() / distancePerTick
          : MAX_WARP_TICKS;
      if (ticks > MIN_WARP_TICKS) {
        this.warpTicks = Math.min(
          MAX_WARP_TICKS,
          Math.max(1, Math.floor(ticks + 0.5)),
        );
        this.warpOffset.divideScalar(this.warpTicks);
        this.rotOffset = angleDifference(yaw, this.yaw) / this.warpTicks;
        return;
      }
    }
    this.initialized = true;
    this.position.copy(update.position);
    this.yaw = yaw;
    this.posVec.set(0, 0, 0);
    this.rotVec = 0;
  }

  /** Control sync uses full precision packet data rather than the ghost MoveMask. */
  readPacketData(update: PlayerPacketData): void {
    this.unpackUpdate({
      ...update,
      headX: undefined,
      headZ: undefined,
      allowWarp: false,
    });
    if (update.headX != null) this.headPitch = update.headX;
    if (update.headZ != null) this.headYaw = update.headZ;
    if (update.energyLevel != null) this.energy = update.energyLevel;
    if (update.jumpDelay != null) this.jumpDelay = update.jumpDelay;
    if (update.jumpSurfaceLastContact != null)
      this.jumpSurfaceLastContact = update.jumpSurfaceLastContact;
    this.disableMove = update.disableMove ?? false;
  }

  processTick(gravity: number, move?: PlayerMove, rechargeRate = 0): void {
    this.posVec.set(0, 0, 0);
    this.rotVec = 0;
    this.headPitchVec = this.headYawVec = 0;
    if (!this.initialized || this.mounted) return;
    if (this.warpTicks > 0) {
      this.warpTicks--;
      this.position.add(this.warpOffset);
      this.yaw += this.rotOffset;
      this.posVec.copy(this.warpOffset).negate();
      this.rotVec = -this.rotOffset;
      return;
    }
    if (!move && this.predictionCount-- <= 0) return;
    if (move) this.move = move;
    this.energy = Math.min(
      this.data.maxEnergy ?? 0,
      this.energy + rechargeRate,
    );
    if (
      this.actionState === RECOVER_STATE &&
      (this.recoverTicks-- === 0 || this.velocity.lengthSq() > 1.69)
    )
      this.actionState = MOVE_STATE;
    this.initial.copy(this.position);
    this.travel.copy(this.velocity).multiplyScalar(PLAYER_TICK_SEC);
    this.collision.prepare(
      this.position,
      this.size,
      this.travel,
      this.data.maxStepHeight ?? 0,
    );
    this.updateMove(gravity);
    this.updatePos();
    this.posVec.copy(this.initial).sub(this.position);
  }

  private updateMove(gravity: number): void {
    const d = this.data,
      move = this.move,
      dt = PLAYER_TICK_SEC,
      mass = d.mass || 1;
    if (!this.damageState) {
      const oldYaw = this.yaw;
      const oldHeadPitch = this.headPitch,
        oldHeadYaw = this.headYaw;
      const pitch = angleDifference(move.pitch ?? 0, 0),
        yaw = angleDifference(move.yaw ?? 0, 0);
      this.headPitch = Math.max(
        d.minLookAngle ?? -Math.PI / 2,
        Math.min(d.maxLookAngle ?? Math.PI / 2, this.headPitch + pitch),
      );
      if (move.freeLook && this.allowFreelook) {
        const limit = d.maxFreelookAngle ?? Math.PI / 2;
        this.headYaw = Math.max(-limit, Math.min(limit, this.headYaw + yaw));
      } else {
        this.yaw = (((this.yaw + yaw) % twoPi) + twoPi) % twoPi;
        this.headYaw *= 0.5;
      }
      this.rotVec = angleDifference(oldYaw, this.yaw);
      this.headPitchVec = oldHeadPitch - this.headPitch;
      this.headYawVec = oldHeadYaw - this.headYaw;
    }
    const surface = waterLevelAt(this.position.x, this.position.y);
    const coverage =
      surface == null
        ? 0
        : Math.max(0, Math.min(1, (surface - this.position.z) / this.size.z));
    const underwater = coverage >= 0.9;
    const drag = coverage >= 0.1 ? (d.drag ?? 0) * 15 * coverage : 0;
    const buoyancy = coverage >= 0.1 ? coverage / (d.density || 1) : 0;
    const moving =
      this.actionState === MOVE_STATE && !this.damageState && !this.disableMove;
    const x = moving ? (move.x ?? 0) : 0,
      y = moving ? (move.y ?? 0) : 0;
    const sin = Math.sin(this.yaw),
      cos = Math.cos(this.yaw);
    this.moveVec.set(cos * x + sin * y, -sin * x + cos * y, 0);
    const forward = underwater
      ? d.maxUnderwaterForwardSpeed
      : d.maxForwardSpeed;
    const backward = underwater
      ? d.maxUnderwaterBackwardSpeed
      : d.maxBackwardSpeed;
    const side = underwater ? d.maxUnderwaterSideSpeed : d.maxSideSpeed;
    const moveSpeed = Math.max(
      (y > 0 ? (forward ?? 0) : (backward ?? 0)) * Math.abs(y),
      (side ?? 0) * Math.abs(x),
    );
    this.acceleration.set(0, 0, gravity * dt);
    const contacted = this.collision.findContact(
      this.position,
      this.size,
      this.contactNormal,
    );
    const run =
      contacted &&
      this.contactNormal.z >
        Math.cos(((d.runSurfaceAngle ?? 0) * Math.PI) / 180);
    const jump =
      contacted &&
      this.contactNormal.z >
        Math.cos(((d.jumpSurfaceAngle ?? 0) * Math.PI) / 180);
    if (jump) this.jumpSurfaceNormal.copy(this.contactNormal);
    if (run) {
      const into = -this.acceleration.dot(this.contactNormal);
      if (into > 0)
        this.acceleration.addScaledVector(this.contactNormal, into + 0.002);
      if (this.acceleration.length() < 0.0001) this.acceleration.set(0, 0, 0);
      this.requested.copy(this.moveVec);
      if (this.energy < (d.minRunEnergy ?? 0)) this.requested.set(0, 0, 0);
      else this.energy -= d.runEnergyDrain ?? 0;
      if (this.requested.lengthSq() > 0) {
        this.scratch.set(this.requested.y, -this.requested.x, 0).normalize();
        this.travel
          .copy(this.contactNormal)
          .addScaledVector(this.scratch, -this.scratch.dot(this.contactNormal));
        this.requested.addScaledVector(
          this.travel,
          -this.requested.dot(this.travel),
        );
        this.requested.normalize().multiplyScalar(moveSpeed);
      }
      this.scratch.copy(this.velocity).add(this.acceleration);
      // Retail's ski branch (renderFirstPerson, MoveState, jump held) keeps
      // existing speed along the requested direction; no-input skiing coasts.
      if (
        d.renderFirstPerson &&
        this.actionState !== RECOVER_STATE &&
        move.trigger?.[2]
      ) {
        if (this.requested.lengthSq() === 0) this.requested.copy(this.scratch);
        else {
          const speed = this.requested.length();
          this.travel.copy(this.requested).divideScalar(speed);
          this.requested
            .copy(this.travel)
            .multiplyScalar(Math.max(speed, this.scratch.dot(this.travel)));
        }
      }
      this.requested.sub(this.scratch);
      const maxAcc =
        ((d.runForce ?? 0) / mass) *
        dt *
        (this.actionState === RECOVER_STATE
          ? (d.recoverRunForceScale ?? 1)
          : 1);
      this.requested.clampLength(0, maxAcc);
      this.acceleration.add(this.requested);
    }
    this.jetting =
      moving && !!move.trigger?.[3] && this.energy >= (d.minJetEnergy ?? 0);
    if (this.jetting) {
      this.energy -= underwater
        ? (d.underwaterJetEnergyDrain ?? 0)
        : (d.jetEnergyDrain ?? 0);
      const force = underwater
        ? (d.underwaterJetForce ?? 0)
        : (d.jetForce ?? 0);
      this.requested.set(0, 0, force);
      if (this.moveVec.lengthSq() > 0 && this.jumpSurfaceLastContact >= 8) {
        this.travel.copy(this.moveVec).normalize();
        const speed = this.velocity.dot(this.travel),
          max = d.maxJetForwardSpeed ?? 0;
        const fraction = Math.min(
          d.maxJetHorizontalPercentage ?? 0,
          speed <= 0 ? 1 : speed > max ? 0 : 1 - speed / max,
        );
        this.requested.copy(this.travel).multiplyScalar(force * fraction);
        this.requested.z = force * (1 - fraction);
      }
      if (drag !== 0 && coverage > 0.25 && (d.underwaterJetForce ?? 0) !== 0)
        this.requested.z *=
          ((d.jetForce ?? 0) / d.underwaterJetForce!) *
          (d.underwaterVertJetFactor ?? 0);
      this.acceleration.addScaledVector(this.requested, dt / mass);
    }
    if (
      move.trigger?.[2] &&
      moving &&
      !this.jumpDelay &&
      this.energy >= (d.minJumpEnergy ?? 0) &&
      this.jumpSurfaceLastContact < 8 &&
      this.velocity.z <= (d.maxJumpSpeed ?? 0)
    ) {
      const min = d.minJumpSpeed ?? 0,
        max = d.maxJumpSpeed ?? 0;
      const scale =
        this.velocity.z <= min ? 1 : 1 - (this.velocity.z - min) / (max - min);
      this.requested.copy(this.moveVec).normalize();
      const dot = this.requested.dot(this.jumpSurfaceNormal),
        impulse = (d.jumpForce ?? 0) / mass;
      if (dot > 0)
        this.acceleration.addScaledVector(this.requested, impulse * dot);
      this.acceleration.z += this.jumpSurfaceNormal.z * impulse * scale;
      this.jumpDelay = d.jumpDelay ?? 0;
      this.energy -= d.jumpEnergyDrain ?? 0;
      this.jumpSurfaceLastContact = 8;
    } else
      this.jumpSurfaceLastContact = jump ? 0 : this.jumpSurfaceLastContact + 1;
    if (this.jumpDelay > 0) this.jumpDelay--;
    this.velocity.add(this.acceleration);
    const horizontal = Math.hypot(this.velocity.x, this.velocity.y),
      resistance = d.horizResistSpeed ?? Infinity;
    if (horizontal > resistance) {
      let cap = Math.min(horizontal, d.horizMaxSpeed ?? Infinity);
      cap -= (d.horizResistFactor ?? 0) * dt * (cap - resistance);
      this.velocity.x *= cap / horizontal;
      this.velocity.y *= cap / horizontal;
    }
    if (this.velocity.z > (d.upResistSpeed ?? Infinity)) {
      this.velocity.z = Math.min(this.velocity.z, d.upMaxSpeed ?? Infinity);
      this.velocity.z -=
        (d.upResistFactor ?? 0) * dt * (this.velocity.z - d.upResistSpeed!);
    }
    if (buoyancy && (buoyancy > 1 || this.velocity.lengthSq() > 0.0001 || !run))
      this.velocity.z -= buoyancy * gravity * dt;
    this.velocity.multiplyScalar(1 - drag * dt);
    if (this.disableMove) this.velocity.x = this.velocity.y = 0;
    this.falling = !run && this.velocity.z < -10;
    this.energy = Math.max(0, this.energy);
  }

  private updatePos(): void {
    let time = PLAYER_TICK_SEC,
      maxStep = this.data.maxStepHeight ?? 0;
    for (let retry = 0; retry < 5; retry++) {
      const speed = this.velocity.length();
      if (speed === 0) return;
      this.travel.copy(this.velocity).multiplyScalar(time);
      if (!this.collision.sweep(this.position, this.size, this.travel)) {
        this.position.add(this.travel);
        return;
      }
      const dt = time * this.collision.hitTime;
      this.position.addScaledVector(
        this.velocity,
        dt - Math.min(0.01 / speed, dt),
      );
      time -= dt;
      this.falling = false;
      const normal = this.collision.hitNormal;
      if (
        this.collision.hitHeight <
          this.position.z + (this.data.maxStepHeight ?? 0) &&
        Math.abs(normal.z) < 0.173
      ) {
        this.travel.copy(this.velocity).multiplyScalar(time);
        const rise = this.collision.stepHeight(
          this.position,
          this.size,
          this.travel,
          maxStep,
        );
        if (rise > 0) {
          this.position.z += rise;
          maxStep -= rise;
          continue;
        }
      }
      const into = -this.velocity.dot(normal),
        minImpact = this.data.minImpactSpeed ?? Infinity;
      if (
        into > minImpact &&
        !this.damageState &&
        this.actionState !== RECOVER_STATE
      ) {
        this.actionState = RECOVER_STATE;
        const value = into - minImpact,
          range = minImpact * 0.9,
          delay = this.data.recoverDelay ?? 0;
        this.recoverTicks =
          value < range ? 1 + Math.floor((delay * value) / range) : delay;
      }
      this.scratch.copy(normal).multiplyScalar(into + 0.01);
      this.velocity.add(this.scratch);
      if (retry === 0) this.firstNormal.copy(normal);
      else if (
        retry === 1 &&
        this.scratch.dot(this.firstNormal) < 0 &&
        normal.dot(this.firstNormal) < 0
      ) {
        this.scratch.crossVectors(normal, this.firstNormal);
        if (this.scratch.lengthSq() > 0) {
          this.scratch
            .normalize()
            .multiplyScalar(
              this.velocity.length() *
                (this.scratch.dot(this.velocity) < 0 ? -1 : 1),
            );
          this.velocity.copy(this.scratch);
        }
      }
    }
    this.position.copy(this.initial);
    this.velocity.set(0, 0, 0);
  }

  renderDelta(): PlayerRenderDelta {
    return {
      posVec: this.posVec.toArray(),
      rot: this.yaw,
      rotVec: this.rotVec,
      head: [this.headPitch, this.headYaw],
      headVec: [this.headPitchVec, this.headYawVec],
      maxLookAngle: this.data.maxLookAngle ?? Math.PI / 2,
    };
  }
}
