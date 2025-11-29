import { Quaternion, Vector3 } from "three";
import { useThree } from "@react-three/fiber";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface CameraEntry {
  id: string;
  position: Vector3;
  rotation: Quaternion;
}

interface CamerasContextValue {
  registerCamera: (camera: any) => void;
  unregisterCamera: (camera: any) => void;
  nextCamera: () => void;
  setCameraIndex: (index: number) => void;
  cameraCount: number;
}

const CamerasContext = createContext<CamerasContextValue | null>(null);

export function useCameras() {
  const context = useContext(CamerasContext);
  if (!context) {
    throw new Error("useCameras must be used within CamerasProvider");
  }
  return context;
}

export function CamerasProvider({ children }: { children: ReactNode }) {
  const { camera } = useThree();
  const [cameraIndex, setCameraIndex] = useState(0);
  const [cameraMap, setCameraMap] = useState<Record<string, CameraEntry>>({});

  const registerCamera = useCallback((camera: CameraEntry) => {
    setCameraMap((prevCameraMap) => ({
      ...prevCameraMap,
      [camera.id]: camera,
    }));
  }, []);

  const unregisterCamera = useCallback((camera: CameraEntry) => {
    setCameraMap((prevCameraMap) => {
      const { [camera.id]: removedCamera, ...remainingCameras } = prevCameraMap;
      return remainingCameras;
    });
  }, []);

  const cameraCount = Object.keys(cameraMap).length;

  const nextCamera = useCallback(() => {
    setCameraIndex((prev) => {
      if (cameraCount === 0) {
        return 0;
      }
      return (prev + 1) % cameraCount;
    });
  }, [cameraCount]);

  const setCamera = useCallback(
    (index: number) => {
      if (index >= 0 && index < cameraCount) {
        setCameraIndex(index);
      }
    },
    [cameraCount],
  );

  useEffect(() => {
    const cameraCount = Object.keys(cameraMap).length;
    if (cameraIndex < cameraCount) {
      const cameraId = Object.keys(cameraMap)[cameraIndex];
      const cameraInfo = cameraMap[cameraId];
      camera.position.copy(cameraInfo.position);
      // Apply coordinate system correction for Torque3D to Three.js
      const correction = new Quaternion().setFromAxisAngle(
        new Vector3(0, 1, 0),
        -Math.PI / 2,
      );
      camera.quaternion.copy(cameraInfo.rotation).multiply(correction);
    }
  }, [cameraIndex, cameraMap, camera]);

  const context: CamerasContextValue = useMemo(
    () => ({
      registerCamera,
      unregisterCamera,
      nextCamera,
      setCameraIndex: setCamera,
      cameraCount,
    }),
    [registerCamera, unregisterCamera, nextCamera, setCamera, cameraCount],
  );

  return (
    <CamerasContext.Provider value={context}>
      {children}
    </CamerasContext.Provider>
  );
}
