import { useKeyboardControls } from "@react-three/drei";
import { Controls } from "./ObserverControls";
import { useDemoRecording } from "./DemoProvider";

export function KeyboardOverlay() {
  const recording = useDemoRecording();
  const forward = useKeyboardControls<Controls>((s) => s.forward);
  const backward = useKeyboardControls<Controls>((s) => s.backward);
  const left = useKeyboardControls<Controls>((s) => s.left);
  const right = useKeyboardControls<Controls>((s) => s.right);
  const up = useKeyboardControls<Controls>((s) => s.up);
  const down = useKeyboardControls<Controls>((s) => s.down);
  const lookUp = useKeyboardControls<Controls>((s) => s.lookUp);
  const lookDown = useKeyboardControls<Controls>((s) => s.lookDown);
  const lookLeft = useKeyboardControls<Controls>((s) => s.lookLeft);
  const lookRight = useKeyboardControls<Controls>((s) => s.lookRight);

  if (recording) return null;

  return (
    <div className="KeyboardOverlay">
      <div className="KeyboardOverlay-column">
        <div className="KeyboardOverlay-row">
          <div className="KeyboardOverlay-spacer" />
          <div className="KeyboardOverlay-key" data-pressed={forward}>
            W
          </div>
          <div className="KeyboardOverlay-spacer" />
        </div>
        <div className="KeyboardOverlay-row">
          <div className="KeyboardOverlay-key" data-pressed={left}>
            A
          </div>
          <div className="KeyboardOverlay-key" data-pressed={backward}>
            S
          </div>
          <div className="KeyboardOverlay-key" data-pressed={right}>
            D
          </div>
        </div>
      </div>
      <div className="KeyboardOverlay-column">
        <div className="KeyboardOverlay-row">
          <div className="KeyboardOverlay-key" data-pressed={up}>
            <span className="KeyboardOverlay-arrow">&uarr;</span> Space
          </div>
        </div>
        <div className="KeyboardOverlay-row">
          <div className="KeyboardOverlay-key" data-pressed={down}>
            <span className="KeyboardOverlay-arrow">&darr;</span> Shift
          </div>
        </div>
      </div>
      <div className="KeyboardOverlay-column">
        <div className="KeyboardOverlay-row">
          <div className="KeyboardOverlay-spacer" />
          <div className="KeyboardOverlay-key" data-pressed={lookUp}>
            &uarr;
          </div>
          <div className="KeyboardOverlay-spacer" />
        </div>
        <div className="KeyboardOverlay-row">
          <div className="KeyboardOverlay-key" data-pressed={lookLeft}>
            &larr;
          </div>
          <div className="KeyboardOverlay-key" data-pressed={lookDown}>
            &darr;
          </div>
          <div className="KeyboardOverlay-key" data-pressed={lookRight}>
            &rarr;
          </div>
        </div>
      </div>
    </div>
  );
}
