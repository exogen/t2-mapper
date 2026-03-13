"use client";

import {
  useState,
  useEffect,
  useEffectEvent,
  useCallback,
  Suspense,
  useMemo,
} from "react";
import { Canvas, GLProps } from "@react-three/fiber";
import * as THREE from "three";
import { NoToneMapping, SRGBColorSpace, PCFShadowMap } from "three";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrbitControls, Center, Bounds, useBounds } from "@react-three/drei";
import { SettingsProvider, useDebug } from "@/src/components/SettingsProvider";
import { ShapeRenderer, useStaticShape } from "@/src/components/GenericShape";
import { ShapeInfoProvider } from "@/src/components/ShapeInfoProvider";
import { DebugElements } from "@/src/components/DebugElements";
import { TickProvider } from "@/src/components/TickProvider";
import { ShapeSelect } from "@/src/components/ShapeSelect";
import { engineStore, useEngineSelector } from "@/src/state/engineStore";
import {
  getResourceList,
  getResourceMap,
  getResourceKey,
  getSourceAndPath,
} from "@/src/manifest";
import { createParser, useQueryState } from "nuqs";
import { createScriptLoader } from "@/src/torqueScript/scriptLoader.browser";
import picomatch from "picomatch";
import {
  createScriptCache,
  type FileSystemHandler,
  runServer,
  type TorqueObject,
  type TorqueRuntime,
} from "@/src/torqueScript";
import styles from "./page.module.css";
import { ignoreScripts } from "@/src/torqueScript/ignoreScripts";

const queryClient = new QueryClient();
const sceneBg = new THREE.Color(0.1, 0.1, 0.1);

const glSettings: GLProps = {
  toneMapping: NoToneMapping,
  outputColorSpace: SRGBColorSpace,
};

const loadScript = createScriptLoader();
const scriptCache = createScriptCache();
const fileSystem: FileSystemHandler = {
  findFiles: (pattern) => {
    const isMatch = picomatch(pattern, { nocase: true });
    return getResourceList()
      .filter((path) => isMatch(path))
      .map((resourceKey) => {
        const [, actualPath] = getSourceAndPath(resourceKey);
        return actualPath;
      });
  },
  isFile: (resourcePath) => {
    const resourceKeys = getResourceMap();
    const resourceKey = getResourceKey(resourcePath);
    return resourceKeys[resourceKey] != null;
  },
};

const defaultShape = "deploy_inventory.dts";

const parseAsShape = createParser<string>({
  parse: (query: string) => query,
  serialize: (value: string) => value,
  eq: (a, b) => a === b,
}).withDefault(defaultShape);

/**
 * Hook to run the TorqueScript runtime once (hardcoded to SC_Normal/CTF)
 * so deploy animations and other script-driven behaviors work.
 */
function useShapeRuntime(): TorqueRuntime | null {
  const [runtime, setRuntime] = useState<TorqueRuntime | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let isDisposed = false;

    const { runtime, ready } = runServer({
      missionName: "SC_Normal",
      missionType: "CTF",
      runtimeOptions: {
        loadScript,
        fileSystem,
        cache: scriptCache,
        signal: controller.signal,
        ignoreScripts,
      },
    });

    void ready
      .then(() => {
        if (isDisposed || controller.signal.aborted) return;
        engineStore.getState().setRuntime(runtime);
        setRuntime(runtime);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Shape runtime failed:", err);
      });

    // Seed store immediately
    engineStore.getState().setRuntime(runtime);

    const unsubscribe = runtime.subscribeRuntimeEvents((event) => {
      if (event.type !== "batch.flushed") return;
      engineStore.getState().applyRuntimeBatch(event.events, {
        tick: event.tick,
      });
    });

    return () => {
      isDisposed = true;
      controller.abort();
      unsubscribe();
      engineStore.getState().clearRuntime();
      runtime.destroy();
    };
  }, []);

  return runtime;
}

/** Create a minimal TorqueObject for the shape viewer. */
function createFakeObject(
  runtime: TorqueRuntime | null,
  shapeName: string,
): TorqueObject {
  // Try to find a matching datablock for this shape so deploy animations work.
  let datablockName: string | undefined;
  if (runtime) {
    for (const obj of runtime.state.objectsById.values()) {
      if (
        obj.shapeFile &&
        String(obj.shapeFile).toLowerCase() === shapeName.toLowerCase()
      ) {
        datablockName = obj._name;
        break;
      }
    }
  }
  return {
    _id: 99999,
    _class: "StaticShapeData",
    _className: "StaticShape",
    ...(datablockName ? { datablock: datablockName } : {}),
  } as TorqueObject;
}

function FitOnLoad() {
  const bounds = useBounds();
  useEffect(() => {
    bounds.refresh().fit();
  }, [bounds]);
  return null;
}

interface AnimationInfo {
  name: string;
  alias: string | null;
  cyclic: boolean | null;
}

/** Reports available animations (with cyclic and alias info when available). */
function AnimationReporter({
  shapeName,
  onAnimations,
}: {
  shapeName: string;
  onAnimations: (anims: AnimationInfo[]) => void;
}) {
  const gltf = useStaticShape(shapeName);
  const shapeAliases = useEngineSelector((state) =>
    state.runtime.sequenceAliases.get(shapeName.toLowerCase()),
  );
  const anims = useMemo(() => {
    // Collect cyclic info from vis_sequence nodes on the scene
    const visCyclic = new Map<string, boolean>();
    gltf.scene.traverse((node: any) => {
      const ud = node.userData;
      if (ud?.vis_sequence && ud.vis_cyclic != null) {
        visCyclic.set(ud.vis_sequence.toLowerCase(), !!ud.vis_cyclic);
      }
    });
    // Build reverse alias map: clip name -> alias
    let reverseAliases: Map<string, string> | undefined;
    if (shapeAliases) {
      reverseAliases = new Map();
      for (const [alias, clipName] of shapeAliases) {
        reverseAliases.set(clipName, alias);
      }
    }
    return gltf.animations.map((clip) => ({
      name: clip.name,
      alias: reverseAliases?.get(clip.name.toLowerCase()) ?? null,
      cyclic: visCyclic.get(clip.name.toLowerCase()) ?? null,
    }));
  }, [gltf, shapeAliases]);
  const reportAnimations = useEffectEvent(onAnimations);
  useEffect(() => {
    reportAnimations(anims);
  }, [anims]);
  return null;
}

/** Plays the selected animation via the TorqueScript runtime. */
function AnimationPlayer({
  object,
  runtime,
  animation,
}: {
  object: TorqueObject;
  runtime: TorqueRuntime | null;
  animation: string;
}) {
  useEffect(() => {
    if (!runtime || !animation) return;
    // Use nsCall to dispatch directly on the ShapeBase namespace, bypassing
    // class chain resolution (the fake object's _className won't resolve
    // to ShapeBase through the namespace parent chain).
    for (let slot = 0; slot < 4; slot++) {
      runtime.$.nsCall("ShapeBase", "stopThread", object, slot);
    }
    runtime.$.nsCall("ShapeBase", "playThread", object, 0, animation);
    return () => {
      for (let slot = 0; slot < 4; slot++) {
        runtime.$.nsCall("ShapeBase", "stopThread", object, slot);
      }
    };
  }, [runtime, object, animation]);
  return null;
}

function ShapeViewer({
  shapeName,
  runtime,
  onAnimations,
  selectedAnimation,
}: {
  shapeName: string;
  runtime: TorqueRuntime | null;
  onAnimations: (anims: AnimationInfo[]) => void;
  selectedAnimation: string;
}) {
  const object = useMemo(
    () => createFakeObject(runtime, shapeName),
    [runtime, shapeName],
  );

  return (
    <ShapeInfoProvider type="StaticShape" object={object} shapeName={shapeName}>
      <Center>
        <ShapeRenderer />
        <AnimationReporter shapeName={shapeName} onAnimations={onAnimations} />
        <AnimationPlayer
          object={object}
          runtime={runtime}
          animation={selectedAnimation}
        />
        <FitOnLoad />
      </Center>
    </ShapeInfoProvider>
  );
}

function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[50, 80, 30]} intensity={1.2} />
    </>
  );
}

function ShapeInspector() {
  const [currentShape, setCurrentShape] = useQueryState("shape", parseAsShape);
  const runtime = useShapeRuntime();
  const [availableAnimations, setAvailableAnimations] = useState<
    AnimationInfo[]
  >([]);
  const [selectedAnimation, setSelectedAnimation] = useState<string>("");

  const handleAnimations = useCallback((anims: AnimationInfo[]) => {
    setAvailableAnimations(anims);
    setSelectedAnimation("");
  }, []);

  const [showLoading, setShowLoading] = useState(true);
  useEffect(() => {
    if (runtime) {
      const timer = setTimeout(() => setShowLoading(false), 300);
      return () => clearTimeout(timer);
    }
  }, [runtime]);

  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <SettingsProvider>
          <div className={styles.CanvasContainer}>
            {showLoading && (
              <div
                className={styles.LoadingIndicator}
                data-complete={!!runtime}
              >
                <div className={styles.Spinner} />
              </div>
            )}
            <Canvas
              frameloop="always"
              gl={glSettings}
              shadows={{ type: PCFShadowMap }}
              scene={{ background: sceneBg }}
              camera={{ position: [5, 3, 5], fov: 90 }}
            >
              <TickProvider>
                <SceneLighting />
                <Bounds fit clip observe margin={1.5}>
                  <Suspense>
                    <ShapeViewer
                      key={currentShape}
                      shapeName={currentShape}
                      runtime={runtime}
                      onAnimations={handleAnimations}
                      selectedAnimation={selectedAnimation}
                    />
                  </Suspense>
                </Bounds>
                <DebugElements />
                <OrbitControls makeDefault />
              </TickProvider>
            </Canvas>
          </div>
          <ShapeControls
            currentShape={currentShape}
            onChangeShape={setCurrentShape}
            animations={availableAnimations}
            selectedAnimation={selectedAnimation}
            onChangeAnimation={setSelectedAnimation}
          />
        </SettingsProvider>
      </main>
    </QueryClientProvider>
  );
}

function ShapeControls({
  currentShape,
  onChangeShape,
  animations,
  selectedAnimation,
  onChangeAnimation,
}: {
  currentShape: string;
  onChangeShape: (shape: string) => void;
  animations: AnimationInfo[];
  selectedAnimation: string;
  onChangeAnimation: (name: string) => void;
}) {
  const { debugMode, setDebugMode } = useDebug();

  return (
    <div className={styles.Sidebar}>
      <div className={styles.SidebarSection}>
        <ShapeSelect value={currentShape} onChange={onChangeShape} />
      </div>
      <div className={styles.SidebarSection}>
        <div className={styles.CheckboxField}>
          <input
            id="debugInput"
            type="checkbox"
            checked={debugMode}
            onChange={(e) => setDebugMode(e.target.checked)}
          />
          <label htmlFor="debugInput">Debug</label>
        </div>
      </div>
      {animations.length > 0 && (
        <>
          <div className={styles.SidebarSection}>
            <div className={styles.SectionLabel}>Animations</div>
          </div>
          <div className={styles.AnimationList}>
            {animations.map((anim) => (
              <div
                key={anim.name}
                className={styles.AnimationItem}
                data-active={selectedAnimation === anim.name}
                onClick={() =>
                  onChangeAnimation(
                    selectedAnimation === anim.name ? "" : anim.name,
                  )
                }
              >
                <button
                  className={styles.PlayButton}
                  title={`Play ${anim.alias ?? anim.name}`}
                >
                  {selectedAnimation === anim.name ? "\u25A0" : "\u25B6"}
                </button>
                <span className={styles.AnimationName}>
                  {anim.alias ?? anim.name}
                </span>
                {anim.alias && (
                  <span
                    className={styles.ClipName}
                    title={`GLB clip: ${anim.name}`}
                  >
                    {anim.name}
                  </span>
                )}
                {anim.cyclic === true && (
                  <span className={styles.CyclicIcon} title="Cyclic (looping)">
                    {"\u221E"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ShapesPage() {
  return (
    <Suspense>
      <ShapeInspector />
    </Suspense>
  );
}
