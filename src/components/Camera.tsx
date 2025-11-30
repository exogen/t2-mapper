import { useEffect, useId, useMemo } from "react";
import { useCameras } from "./CamerasProvider";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation } from "../mission";
import { Vector3 } from "three";

export function Camera({ object }: { object: TorqueObject }) {
  const { registerCamera, unregisterCamera } = useCameras();
  const id = useId();

  const dataBlock = getProperty(object, "dataBlock");
  const position = useMemo(() => getPosition(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);

  useEffect(() => {
    if (dataBlock === "Observer") {
      const camera = { id, position: new Vector3(...position), rotation: q };
      registerCamera(camera);
      return () => {
        unregisterCamera(camera);
      };
    }
  }, [id, dataBlock, registerCamera, unregisterCamera, position, q]);

  // Maps can define preset observer camera locations. You should be able to jump
  // to an observer camera position and then fly around from that starting point
  // But, we wouldn't want the user to take control of the actual camera's
  // position, because then if you want to cycle back through them again, the
  // "fixed" camera location has moved. There are multiple approaches to fixing
  // this: make Camera render an actual PerspectiveCamera, switch it when cycling,
  // but clone a new "flying" camera when the user moves. The other is to not
  // have multiple cameras at all, but rather update the default camera with
  // new position information when cycling. This uses the latter approach.
  return null;
}
