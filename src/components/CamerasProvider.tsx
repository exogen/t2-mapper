import { Quaternion, Vector3 } from "three";
import { useThree } from "@react-three/fiber";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  const [cameraIndex, setCameraIndex] = useState(-1);
  const [cameraMap, setCameraMap] = useState<Record<string, CameraEntry>>({});
  const [initialViewState, setInitialViewState] = useState(() => ({
    initialized: false,
    position: null,
    quarternion: null,
  }));

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

  const setCamera = useCallback(
    (index: number) => {
      if (index >= 0 && index < cameraCount) {
        setCameraIndex(index);
        const cameraId = Object.keys(cameraMap)[index];
        const cameraInfo = cameraMap[cameraId];
        camera.position.copy(cameraInfo.position);
        // Apply coordinate system correction for Torque3D to Three.js
        const correction = new Quaternion().setFromAxisAngle(
          new Vector3(0, 1, 0),
          -Math.PI / 2,
        );
        camera.quaternion.copy(cameraInfo.rotation).multiply(correction);
      }
    },
    [camera, cameraCount, cameraMap],
  );

  const nextCamera = useCallback(() => {
    setCamera(cameraCount ? (cameraIndex + 1) % cameraCount : -1);
  }, [cameraCount, cameraIndex, setCamera]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#c")) {
        const [positionString, quarternionString] = hash.slice(2).split("~");
        const position = positionString.split(",").map((s) => parseFloat(s));
        const quarternion = quarternionString
          .split(",")
          .map((s) => parseFloat(s));
        setInitialViewState({
          initialized: true,
          position: new Vector3(...position),
          quarternion: new Quaternion(...quarternion),
        });
      } else {
        setInitialViewState({
          initialized: true,
          position: null,
          quarternion: null,
        });
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (initialViewState.initialized && initialViewState.position) {
      camera.position.copy(initialViewState.position);
      if (initialViewState.quarternion) {
        camera.quaternion.copy(initialViewState.quarternion);
      }
    }
  }, [camera, initialViewState]);

  useEffect(() => {
    if (!initialViewState.initialized || initialViewState.position) return;
    if (cameraCount > 0 && cameraIndex === -1) {
      setCamera(0);
    }
  }, [cameraCount, setCamera, cameraIndex, initialViewState]);

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

  if (cameraCount === 0 && cameraIndex !== -1) {
    setCameraIndex(-1);
  }

  return (
    <CamerasContext.Provider value={context}>
      {children}
    </CamerasContext.Provider>
  );
}
