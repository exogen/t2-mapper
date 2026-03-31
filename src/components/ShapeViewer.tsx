import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import {
  AnimationMixer,
  AnimationAction,
  LoopRepeat,
  NoToneMapping,
  SRGBColorSpace,
} from "three";
import { useFrame } from "@react-three/fiber";
import { shapeToUrl } from "../loaders";
import { getResourceList, getSourceAndPath } from "../manifest";
import styles from "./ShapeViewer.module.css";

// ── Shape list ──

interface ShapeItem {
  resourceKey: string;
  displayName: string;
  shapeName: string;
  source: string;
}

const allShapes: ShapeItem[] = getResourceList()
  .filter((key) => key.startsWith("shapes/") && key.endsWith(".dts"))
  .map((resourceKey) => {
    const [sourcePath, actualPath] = getSourceAndPath(resourceKey);
    const fileName = actualPath.split("/").pop() ?? actualPath;
    return {
      resourceKey,
      displayName: fileName,
      shapeName: fileName,
      source: sourcePath,
    };
  })
  .sort((a, b) => a.displayName.localeCompare(b.displayName));

// ── Shape model with animation controls ──

function ShapeScene({
  shapeName,
  activeAnimation,
  animationSpeed,
  onAnimationsLoaded,
}: {
  shapeName: string;
  activeAnimation: string | null;
  animationSpeed: number;
  onAnimationsLoaded: (names: string[], seqNames: string[] | null) => void;
}) {
  const url = shapeToUrl(shapeName);
  const gltf = useGLTF(url);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionRef = useRef<AnimationAction | null>(null);

  // Report animations to parent
  useEffect(() => {
    const glbNames = gltf.animations.map((a) => a.name);
    const rawSeqNames = gltf.scene.userData?.dts_sequence_names;
    let seqNames: string[] | null = null;
    if (typeof rawSeqNames === "string") {
      try {
        seqNames = JSON.parse(rawSeqNames);
      } catch {
        /* ignore */
      }
    }
    onAnimationsLoaded(glbNames, seqNames);
  }, [gltf, onAnimationsLoaded]);

  // Create mixer
  useEffect(() => {
    const mixer = new AnimationMixer(gltf.scene);
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [gltf.scene]);

  // Play selected animation
  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    // Stop previous
    if (actionRef.current) {
      actionRef.current.stop();
      actionRef.current = null;
    }

    if (!activeAnimation) return;

    const clip = gltf.animations.find(
      (a) => a.name.toLowerCase() === activeAnimation.toLowerCase(),
    );
    if (!clip) return;

    const action = mixer.clipAction(clip);
    action.setLoop(LoopRepeat, Infinity);
    action.reset().play();
    actionRef.current = action;

    return () => {
      action.stop();
      actionRef.current = null;
    };
  }, [gltf.animations, activeAnimation]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta * animationSpeed);
  });

  return (
    <>
      <primitive object={gltf.scene} rotation={[0, Math.PI / 2, 0]} />
    </>
  );
}

// ── Main viewer ──

export function ShapeViewer() {
  const [selectedShape, setSelectedShape] = useState(
    allShapes[0]?.shapeName ?? "",
  );
  const [filter, setFilter] = useState("");
  const [animations, setAnimations] = useState<string[]>([]);
  const [seqNames, setSeqNames] = useState<string[] | null>(null);
  const [activeAnimation, setActiveAnimation] = useState<string | null>(null);
  const [animationSpeed, setAnimationSpeed] = useState(1);

  const filtered = useMemo(() => {
    if (!filter) return allShapes;
    const lower = filter.toLowerCase();
    return allShapes.filter((s) => s.displayName.toLowerCase().includes(lower));
  }, [filter]);

  const handleAnimationsLoaded = useMemo(
    () => (names: string[], seq: string[] | null) => {
      setAnimations(names);
      setSeqNames(seq);
      setActiveAnimation(null);
    },
    [],
  );

  return (
    <div className={styles.Root}>
      <div className={styles.Sidebar}>
        <h2 className={styles.Title}>Shape Viewer</h2>
        <input
          className={styles.Search}
          type="text"
          placeholder="Filter shapes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className={styles.ShapeList}>
          {filtered.map((shape) => (
            <button
              key={shape.resourceKey}
              type="button"
              className={styles.ShapeItem}
              data-active={shape.shapeName === selectedShape}
              onClick={() => setSelectedShape(shape.shapeName)}
            >
              {shape.displayName}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.Main}>
        <div className={styles.CanvasWrap}>
          <Canvas
            gl={{
              toneMapping: NoToneMapping,
              outputColorSpace: SRGBColorSpace,
            }}
            camera={{ position: [8, 6, 8], fov: 50 }}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 10, 5]} intensity={0.8} />
            <gridHelper args={[50, 50, "#444", "#333"]} />
            <OrbitControls />
            <Suspense fallback={null}>
              {selectedShape && (
                <ShapeScene
                  key={selectedShape}
                  shapeName={selectedShape}
                  activeAnimation={activeAnimation}
                  animationSpeed={animationSpeed}
                  onAnimationsLoaded={handleAnimationsLoaded}
                />
              )}
            </Suspense>
          </Canvas>
        </div>
        <div className={styles.AnimPanel}>
          <h3 className={styles.AnimTitle}>Animations ({animations.length})</h3>
          {seqNames && (
            <p className={styles.AnimNote}>
              DTS sequence order: {seqNames.join(", ")}
            </p>
          )}
          <div className={styles.SpeedControl}>
            <label>
              Speed: {animationSpeed.toFixed(1)}x
              <input
                type="range"
                min={0}
                max={4}
                step={0.1}
                value={animationSpeed}
                onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
              />
            </label>
          </div>
          <div className={styles.AnimList}>
            <button
              type="button"
              className={styles.AnimItem}
              data-active={activeAnimation === null}
              onClick={() => setActiveAnimation(null)}
            >
              (none)
            </button>
            {animations.map((name, i) => {
              const dtsIndex = seqNames
                ? seqNames.findIndex(
                    (s) => s.toLowerCase() === name.toLowerCase(),
                  )
                : i;
              return (
                <button
                  key={name}
                  type="button"
                  className={styles.AnimItem}
                  data-active={
                    activeAnimation?.toLowerCase() === name.toLowerCase()
                  }
                  onClick={() => setActiveAnimation(name)}
                >
                  <span className={styles.AnimName}>{name}</span>
                  {dtsIndex >= 0 && (
                    <span className={styles.AnimIndex}>seq {dtsIndex}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
