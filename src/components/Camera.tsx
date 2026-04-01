import { useEffect, useId, useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import { useCameras } from "./CamerasProvider";
import type { CameraEntity } from "../state/gameEntityTypes";
import { useIsDebugTourTarget } from "../state/cameraTourStore";
import { DebugMarker } from "./DebugBounds";

export function Camera({ entity }: { entity: CameraEntity }) {
  const { registerCamera, unregisterCamera } = useCameras();
  const id = useId();

  const dataBlock = entity.cameraDataBlock;
  const position = useMemo(
    () => (entity.position ? new Vector3(...entity.position) : new Vector3()),
    [entity.position],
  );
  const rotation = useMemo(
    () =>
      entity.rotation ? new Quaternion(...entity.rotation) : new Quaternion(),
    [entity.rotation],
  );

  useEffect(() => {
    if (dataBlock === "Observer") {
      const camera = { id, position, rotation };
      registerCamera(camera);
      return () => {
        unregisterCamera(camera);
      };
    }
  }, [id, dataBlock, registerCamera, unregisterCamera, position, rotation]);

  // Maps can define preset observer camera locations. You should be able to jump
  // to an observer camera position and then fly around from that starting point
  // But, we wouldn't want the user to take control of the actual camera's
  // position, because then if you want to cycle back through them again, the
  // "fixed" camera location has moved. There are multiple approaches to fixing
  // this: make Camera render an actual PerspectiveCamera, switch it when cycling,
  // but clone a new "flying" camera when the user moves. The other is to not
  // have multiple cameras at all, but rather update the default camera with
  // new position information when cycling. This uses the latter approach.
  const isTarget = useIsDebugTourTarget(entity.id);
  return isTarget ? <DebugMarker radius={1.5} /> : null;
}
