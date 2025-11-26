import { useEffect, useId, useMemo, useRef } from "react";
import { PerspectiveCamera } from "@react-three/drei";
import { useCameras } from "./CamerasProvider";
import { useSettings } from "./SettingsProvider";
import {
  ConsoleObject,
  getPosition,
  getProperty,
  getRotation,
} from "../mission";
import { Quaternion, Vector3 } from "three";

export function Camera({ object }: { object: ConsoleObject }) {
  const { fov } = useSettings();
  const { registerCamera, unregisterCamera } = useCameras();
  const id = useId();

  const dataBlock = getProperty(object, "dataBlock").value;
  const [x, y, z] = useMemo(() => getPosition(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);

  useEffect(() => {
    if (dataBlock === "Observer") {
      const camera = { id, position: new Vector3(x, y, z), rotation: q };
      registerCamera(camera);
      return () => {
        unregisterCamera(camera);
      };
    }
  }, [id, dataBlock, registerCamera, unregisterCamera, x, y, z, q]);

  // Maps can define preset observer camera locations. You should be able to jump
  // to an observer camera position and then fly around from that starting point
  //  But, we wouldn't want the user to take control of the actual camera's
  // position, because then if you want to cycle back through them again, the
  // "fixed" camera location has moved. There are two approaches for fixing this:
  // make Camera render an actual PerspectiveCamera, switch it when cycling,
  // but clone a new "flying" camera when the user moves. The other is to not have
  // multiple cameras at all, but rather update the one camera with fixed position
  // information when cycling. This uses the latter approach.
  return null;
}
