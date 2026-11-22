import { decodeFlagEvent } from "../../relay/serverMessageDecode";
import { resolveCameraOwner } from "../state/cameraOwner";
import { settingsStore } from "../state/settingsStore";
import {
  cancelFlagFollowHold,
  isHoldingFlagFollow,
  streamPlaybackStore,
} from "../state/streamPlaybackStore";
import { exitToFreeFly, resolveFlagEntityId } from "../state/watchFollow";
import type { ServerMessageEvent, StreamSnapshot } from "../stream/types";

const RETURN_HOLD_SEC = 2;

function returnsFlag(event: ServerMessageEvent, slot: number): boolean {
  switch (event.msgType) {
    case "MsgCTFFlagReturned":
    case "MsgCTFFlagCapped":
      // Both events reset the followed flag to its stand.
      return (
        decodeFlagEvent(event.msgType, event.args, (value) => value)?.teamId ===
        slot
      );
    case "MsgRabbitFlagReturned":
    case "MsgFlagReturned":
      return slot === 1;
    default:
      return false;
  }
}

function hasNewReturn(
  events: readonly ServerMessageEvent[],
  previousId: number,
  slot: number,
): boolean {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.id <= previousId) return false;
    if (returnsFlag(event, slot)) return true;
  }
  return false;
}

/** Respond to a return before camera selection sees the flag's new position. */
export class FlagReturnFollow {
  private lastEventId = 0;
  private seekNonce: number | undefined;
  private worldGeneration: number | undefined;
  private hold: {
    slot: number;
    owner: "input" | "commandCircuit";
    resumeAtSec: number;
  } | null = null;
  private readyToResume = false;

  update(
    snapshot: Pick<StreamSnapshot, "serverEvents">,
    timeSec: number,
    seekNonce: number,
    worldGeneration: number | undefined,
    seeking: boolean,
  ): void {
    this.readyToResume = false;
    const state = streamPlaybackStore.getState();
    const { followFlagSlot: slot } = state;
    const events = snapshot.serverEvents;
    const previousEventId = this.lastEventId;
    const continuous =
      !seeking &&
      this.seekNonce === seekNonce &&
      this.worldGeneration === worldGeneration;
    const owner = slot === null ? null : resolveCameraOwner();
    const manual = owner === "input" || owner === "commandCircuit";
    const behavior = settingsStore.getState().flagReturnCamera;

    this.lastEventId = events.at(-1)?.id ?? 0;
    this.seekNonce = seekNonce;
    this.worldGeneration = worldGeneration;

    const hold = this.hold;
    if (hold && slot === hold.slot && isHoldingFlagFollow(state)) {
      if (!continuous || owner !== hold.owner || behavior !== "delay") {
        cancelFlagFollowHold();
        this.hold = null;
        return;
      }
      if (hasNewReturn(events, previousEventId, slot))
        hold.resumeAtSec = timeSec + RETURN_HOLD_SEC;
      this.readyToResume = timeSec >= hold.resumeAtSec;
      return;
    }
    this.hold = null;

    if (
      slot === null ||
      !manual ||
      !continuous ||
      state.followEntityId === null ||
      state.projectileFollow?.kind === "tracking" ||
      behavior === "followHome" ||
      !hasNewReturn(events, previousEventId, slot)
    )
      return;
    if (behavior === "delay") {
      this.hold = { slot, owner, resumeAtSec: timeSec + RETURN_HOLD_SEC };
      streamPlaybackStore.setState({
        projectileFollow: null,
        followEntityId: null,
        cameraMode: "freeFly",
      });
    } else {
      exitToFreeFly();
    }
  }

  /** Resume after manual camera input for the frame has had a chance to cancel. */
  resume(): void {
    if (!this.readyToResume || !this.hold) return;
    const { slot, owner } = this.hold;
    this.readyToResume = false;
    this.hold = null;
    const state = streamPlaybackStore.getState();
    if (state.followFlagSlot !== slot || !isHoldingFlagFollow(state)) return;
    const target =
      resolveCameraOwner() === owner &&
      settingsStore.getState().flagReturnCamera === "delay"
        ? resolveFlagEntityId(slot)
        : null;
    if (target === null) {
      cancelFlagFollowHold();
      return;
    }
    streamPlaybackStore.setState({
      followEntityId: target,
      cameraMode: "orbitOverride",
    });
  }
}
