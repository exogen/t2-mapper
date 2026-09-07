import { describe, expect, it } from "vitest";
import {
  actionStartPosition,
  NO_ACTION_ANIM,
  stepActionAnim,
} from "./playerAnimation";

describe("stepActionAnim", () => {
  const PDA = 18;

  it("plays a wired action once and returns to movement when it ends", () => {
    // The D_e_V_i_L, Dangerous Crossing LT at 81s: idle PDA arrives,
    // the server never sends the root action that ends it.
    let { state, command } = stepActionAnim(NO_ACTION_ANIM, {
      actionAnim: PDA,
      actionSeq: 1,
      actionAtEnd: false,
      actionHoldAtEnd: false,
    });
    expect(command).toEqual({ kind: "start", index: PDA, position: 0 });
    // Still playing: nothing new.
    ({ state, command } = stepActionAnim(
      state,
      { actionAnim: PDA, actionSeq: 1 },
      false,
    ));
    expect(command.kind).toBe("none");
    // The clip finishes: back to movement, and it stays that way while
    // the entity keeps reporting the same action.
    ({ state, command } = stepActionAnim(
      state,
      { actionAnim: PDA, actionSeq: 1 },
      true,
    ));
    expect(command).toEqual({ kind: "revert", index: PDA });
    ({ state, command } = stepActionAnim(
      state,
      { actionAnim: PDA, actionSeq: 1 },
      true,
    ));
    expect(command.kind).toBe("none");
    expect(state.ended).toBe(true);
  });

  it("restarts the same action when the server sends it again", () => {
    let { state } = stepActionAnim(NO_ACTION_ANIM, {
      actionAnim: PDA,
      actionSeq: 1,
    });
    ({ state } = stepActionAnim(
      state,
      { actionAnim: PDA, actionSeq: 1 },
      true,
    ));
    const again = stepActionAnim(state, { actionAnim: PDA, actionSeq: 2 });
    expect(again.command).toEqual({ kind: "start", index: PDA, position: 0 });
  });

  it("holds a hold-at-end action on its last frame", () => {
    let { state, command } = stepActionAnim(NO_ACTION_ANIM, {
      actionAnim: 29,
      actionSeq: 1,
      actionHoldAtEnd: true,
    });
    expect(command.kind).toBe("start");
    ({ state, command } = stepActionAnim(
      state,
      { actionAnim: 29, actionSeq: 1, actionHoldAtEnd: true },
      true,
    ));
    expect(command).toEqual({ kind: "hold", index: 29 });
    expect(state.ended).toBe(false);
  });

  it("skips an action that was already over when it arrived", () => {
    const { state, command } = stepActionAnim(NO_ACTION_ANIM, {
      actionAnim: PDA,
      actionSeq: 3,
      actionAtEnd: true,
      actionHoldAtEnd: false,
    });
    expect(command.kind).toBe("none");
    expect(state.ended).toBe(true);
  });

  it("stops a running action when the entity's action is cleared", () => {
    let { state } = stepActionAnim(NO_ACTION_ANIM, {
      actionAnim: PDA,
      actionSeq: 1,
    });
    ({ state } = stepActionAnim(
      state,
      { actionAnim: PDA, actionSeq: 1 },
      false,
    ));
    const cleared = stepActionAnim(state, {}, false);
    expect(cleared.command).toEqual({ kind: "revert", index: PDA });
    expect(cleared.state).toEqual(NO_ACTION_ANIM);
  });
});

describe("actionStartPosition", () => {
  it("advances the packed position by the time since the update", () => {
    expect(
      actionStartPosition(
        { actionAnimPos: 0.25, actionTimeSec: 100 },
        100.5,
        2,
      ),
    ).toBeCloseTo(0.5);
  });

  it("saturates once the clip would have run out", () => {
    expect(actionStartPosition({ actionTimeSec: 100 }, 130, 2)).toBe(1);
  });

  it("is the packed position without an arrival time", () => {
    expect(actionStartPosition({ actionAnimPos: 0.4 }, 500, 2)).toBe(0.4);
  });
});

describe("stepActionAnim late starts", () => {
  const DEATH = 18;

  it("skips a stale action a late model would otherwise replay", () => {
    // |HP| on the Raindance flag, 115 s after his last death action was
    // recorded: a seek mounts the model and must not play the death.
    const { state, command } = stepActionAnim(
      NO_ACTION_ANIM,
      { actionAnim: DEATH, actionSeq: 2, actionAtEnd: false },
      false,
      1,
    );
    expect(command.kind).toBe("none");
    expect(state).toEqual({ index: DEATH, seq: 2, ended: true });
  });

  it("starts part-way when the update was mid-clip", () => {
    const { command } = stepActionAnim(
      NO_ACTION_ANIM,
      { actionAnim: DEATH, actionSeq: 1, actionAtEnd: false },
      false,
      0.6,
    );
    expect(command).toEqual({ kind: "start", index: DEATH, position: 0.6 });
  });

  it("lands a held action on its last frame when it is long over", () => {
    const { command } = stepActionAnim(
      NO_ACTION_ANIM,
      { actionAnim: DEATH, actionSeq: 1, actionHoldAtEnd: true },
      false,
      1,
    );
    expect(command).toEqual({ kind: "start", index: DEATH, position: 1 });
  });
});

describe("stepActionAnim while mounted", () => {
  const sitting = { actionAnim: 16, actionSeq: 1, actionAtEnd: true };

  it("parks a finished unheld pose instead of reverting to movement", () => {
    // The bomber's bombardier gets setActionThread(mountPose) without hold.
    const first = stepActionAnim(NO_ACTION_ANIM, sitting, false, 0, true);
    expect(first.command).toEqual({ kind: "start", index: 16, position: 1 });
    const next = stepActionAnim(first.state, sitting, true, 0, true);
    expect(next.command).toEqual({ kind: "hold", index: 16 });
    expect(next.state.ended).toBe(false);
  });

  it("still reverts once unmounted", () => {
    const first = stepActionAnim(NO_ACTION_ANIM, sitting, false, 0, true);
    const next = stepActionAnim(first.state, sitting, true, 0, false);
    expect(next.command).toEqual({ kind: "revert", index: 16 });
  });
});
