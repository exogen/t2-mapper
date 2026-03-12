import { useEffect, useState } from "react";
import type nipplejs from "nipplejs";
import { useControls } from "./SettingsProvider";
import { useJoystick } from "./JoystickContext";
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

export function TouchJoystick() {
  const { touchMode } = useControls();
  const [moveZone, setMoveZone] = useState<HTMLDivElement>(null);
  const [lookZone, setLookZone] = useState<HTMLDivElement>(null);
  const { moveState, lookState, setMoveState, setLookState } = useJoystick();

  // Move joystick
  useEffect(() => {
    if (!moveZone) return;

    let manager: nipplejs.JoystickManager | null = null;
    let cancelled = false;

    import("nipplejs").then((mod) => {
      if (cancelled) return;
      manager = mod.default.create({
        zone: moveZone,
        mode: "static",
        position: { left: "70px", bottom: "70px" },
        size: 120,
        restOpacity: 0.9,
      });

      applyNippleStyles(moveZone);

      manager.on("move", (_event, data) => {
        setMoveState({
          angle: data.angle.radian,
          force: Math.min(1, data.force),
        });
      });

      manager.on("end", () => {
        setMoveState({ force: 0 });
      });
    });

    return () => {
      cancelled = true;
      manager?.destroy();
    };
  }, [moveState, moveZone, setMoveState]);

  // Look joystick (dual stick mode only)
  useEffect(() => {
    if (!lookZone) return;

    let manager: nipplejs.JoystickManager | null = null;
    let cancelled = false;

    import("nipplejs").then((mod) => {
      if (cancelled) return;
      manager = mod.default.create({
        zone: lookZone,
        mode: "static",
        position: { right: "70px", bottom: "70px" },
        size: 120,
        restOpacity: 0.9,
      });

      applyNippleStyles(lookZone);

      manager.on("move", (_event, data) => {
        setLookState({
          angle: data.angle.radian,
          force: Math.min(1, data.force),
        });
      });

      manager.on("end", () => {
        setLookState({ force: 0 });
      });
    });

    return () => {
      cancelled = true;
      manager?.destroy();
    };
  }, [lookState, lookZone, setLookState]);

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
