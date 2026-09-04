import { describe, expect, it } from "vitest";
import { NO_ACTION_ANIM, stepActionAnim } from "./playerAnimation";

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
    expect(command).toEqual({ kind: "start", index: PDA });
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
    expect(again.command).toEqual({ kind: "start", index: PDA });
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
