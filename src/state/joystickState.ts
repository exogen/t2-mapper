export interface JoystickState {
  angle: number;
  force: number;
}

/**
 * The on-screen touch sticks, written by the joystick UI and read by the
 * touch input producer every frame.
 */
export const joystickState: {
  move: JoystickState;
  look: JoystickState;
} = {
  move: { angle: 0, force: 0 },
  look: { angle: 0, force: 0 },
};

export function setJoystickState(
  stick: "move" | "look",
  { angle, force }: Partial<JoystickState>,
): void {
  if (angle != null) joystickState[stick].angle = angle;
  if (force != null) joystickState[stick].force = force;
}
