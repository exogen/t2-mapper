import { clearInputDeltas } from "../state/inputControls";
import { inputModeStore } from "../state/inputModeStore";
import { setJoystickState } from "../state/joystickState";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { FramePriority } from "./framePriority";
import type { GameEngine } from "./gameEngine";

/** Block camera movement while preserving delayed native observer commands. */
export function suppressCameraMovement(engine: GameEngine): () => void {
  const clearCameraInput = () => {
    const live = liveConnectionStore.getState();
    const mode = inputModeStore.getState().mode;
    const nativeObserver =
      live.role === "player" &&
      live.gameStatus === "connected" &&
      live.liveReady &&
      (mode === "fly" || mode === "follow");
    // A player selection may be acknowledged after a modal reopens. Keep its
    // observer command, without letting movement or other triggers through.
    const commands = nativeObserver
      ? engine.input.frames.flatMap((frame) => {
          const triggers = frame.triggers.map(
            (pressed, index) =>
              pressed && (index === 0 || index === 2 || index === 3),
          );
          return triggers.some(Boolean)
            ? [
                {
                  ...frame,
                  deltaYaw: 0,
                  deltaPitch: 0,
                  x: 0,
                  y: 0,
                  z: 0,
                  triggers,
                },
              ]
            : [];
        })
      : [];
    engine.input.clear();
    for (const command of commands) engine.input.push(command);
  };
  const clearGestures = () => {
    clearInputDeltas();
    setJoystickState("move", { force: 0 });
    setJoystickState("look", { force: 0 });
  };

  clearGestures();
  // Continue sampling contacts to keep their baselines current, but clear
  // gestures before direct pinch zoom and movement before the queue drains.
  const stopGestures = engine.scheduler.add(
    FramePriority.InputGuard,
    clearGestures,
  );
  const stopInput = engine.scheduler.add(
    FramePriority.InputKeyboardMouse,
    () => {
      clearCameraInput();
      clearGestures();
    },
  );
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    stopGestures();
    stopInput();
    clearCameraInput();
    clearInputDeltas();
  };
}
