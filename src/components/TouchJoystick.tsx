import { useEffect, useState } from "react";
import { create } from "nipplejs";
import { useControls } from "./SettingsProvider";
import { useJoystick, type JoystickState } from "./JoystickContext";
import styles from "./TouchJoystick.module.css";

/** Apply styles to nipplejs-generated `.back` and `.front` elements imperatively. */
function applyNippleStyles(zone: HTMLElement) {
  const back = zone.querySelector<HTMLElement>(".back");
  if (back) {
    back.style.background = "rgba(3, 79, 76, 0.6)";
    back.style.border = "1px solid rgba(0, 219, 223, 0.5)";
    back.style.boxShadow = "inset 0 0 10px rgba(0, 0, 0, 0.7)";
  }
  const front = zone.querySelector<HTMLElement>(".front");
  if (front) {
    front.style.background =
      "radial-gradient(circle at 50% 50%, rgba(23, 247, 198, 0.9) 0%, rgba(9, 184, 170, 0.95) 100%)";
    front.style.border = "2px solid rgba(255, 255, 255, 0.4)";
    front.style.boxShadow =
      "0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 1px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -1px 2px rgba(0, 0, 0, 0.3)";
  }
}

function useTouchStick(
  zone: HTMLDivElement | null,
  side: "left" | "right",
  setState: (state: Partial<JoystickState>) => void,
) {
  useEffect(() => {
    if (!zone) return;

    const manager = create({
      zone,
      mode: "static",
      position: { [side]: "70px", bottom: "70px" },
      size: 120,
      restOpacity: 0.9,
      dynamicPage: true,
    });

    applyNippleStyles(zone);

    manager.on("move", ({ data }) => {
      setState({
        angle: data.angle.radian,
        force: Math.min(1, data.force),
      });
    });

    manager.on("end", () => {
      setState({ force: 0 });
    });

    const reset = () => {
      // nipplejs 1.0.4 destroy() leaves pressure timers running on held sticks.
      for (const joystick of manager.actives.values()) joystick.end();
      setState({ force: 0 });
    };
    const onVisibilityChange = () => {
      if (document.hidden) reset();
    };

    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reset();
      manager.destroy();
    };
  }, [zone, side, setState]);
}

export function TouchJoystick() {
  const { touchMode } = useControls();
  const [moveZone, setMoveZone] = useState<HTMLDivElement | null>(null);
  const [lookZone, setLookZone] = useState<HTMLDivElement | null>(null);
  const { setMoveState, setLookState } = useJoystick();

  useTouchStick(moveZone, "left", setMoveState);
  useTouchStick(lookZone, "right", setLookState);

  const blurActiveElement = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  return (
    <>
      <div
        ref={setMoveZone}
        key={touchMode}
        className={touchMode === "dualStick" ? styles.Left : styles.Joystick}
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={blurActiveElement}
      />
      {touchMode === "dualStick" ? (
        <div
          ref={setLookZone}
          className={styles.Right}
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={blurActiveElement}
        />
      ) : null}
    </>
  );
}
