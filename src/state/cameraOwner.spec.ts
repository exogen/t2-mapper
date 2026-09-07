import { describe, expect, it, afterEach } from "vitest";
import { cameraTourStore } from "./cameraTourStore";
import { commandCircuitStore } from "./commandCircuitStore";
import { demoDirectorStore } from "./demoDirectorStore";
import { resolveCameraOwner } from "./cameraOwner";

function set(tour: boolean, directing: boolean, commandCircuit: boolean) {
  cameraTourStore.setState({
    animation: tour ? ({} as never) : null,
  });
  demoDirectorStore.setState({ status: directing ? "playing" : "idle" });
  commandCircuitStore.setState({ active: commandCircuit });
}

afterEach(() => set(false, false, false));

describe("resolveCameraOwner", () => {
  it("gives the camera to local input when nothing else claims it", () => {
    set(false, false, false);
    expect(resolveCameraOwner()).toBe("input");
  });

  it("ranks tour over the director over the command circuit", () => {
    set(true, true, true);
    expect(resolveCameraOwner()).toBe("tour");
    set(false, true, true);
    expect(resolveCameraOwner()).toBe("director");
    set(false, false, true);
    expect(resolveCameraOwner()).toBe("commandCircuit");
  });
});
