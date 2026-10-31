import { memo, Suspense, useEffect, useState } from "react";
import { isStreamingSource, useDataSource } from "../state/gameEntityStore";
import { useFeatures } from "./FeaturesProvider";
import { useRecording } from "./usePlayback";
import { ThreeCanvas } from "./ThreeCanvas";
import { FpsMeter } from "./FpsMeter";
import { DemoMomentLoader } from "./DemoMomentLoader";
import { ActiveInputBindings } from "./ActiveInputBindings";
import { EngineContext } from "./useEngine";
import { GameEngine } from "../engine/gameEngine";
import { startEngineSystems } from "../engine/engineSystems";
import { installSpectator } from "../engine/spectatorCamera";
import { installHeatmapOverlay } from "../engine/heatmapOverlay";
import { lazyNamed } from "./lazyNamed";

const Mission = lazyNamed("Mission", () => import("./Mission"));

export const GameView = memo(function GameView({
  dpr,
  onCreated,
  missionName,
  missionType,
  onLoadingChange,
  spectator = false,
}: {
  dpr?: number;
  onCreated?: (engine: GameEngine) => void;
  missionName: string;
  missionType?: string;
  onLoadingChange?: (isLoading: boolean, progress?: number) => void;
  /** Watch mode: everything comes from the live stream — never mount the
   *  TorqueScript Mission bootstrap, and manage the watch recording. */
  spectator?: boolean;
}) {
  const recording = useRecording();
  const features = useFeatures();
  const dataSource = useDataSource();
  const hasStreamData = isStreamingSource(dataSource);
  const [engine] = useState(() => new GameEngine({ jiggle: features.jiggle }));
  useEffect(() => startEngineSystems(engine), [engine]);
  useEffect(
    () => (spectator ? installSpectator(engine) : undefined),
    [engine, spectator],
  );
  useEffect(
    () => (features.stats ? installHeatmapOverlay(engine) : undefined),
    [engine, features.stats],
  );

  return (
    <EngineContext value={engine}>
      <ActiveInputBindings />
      {recording?.source === "demo" ? <DemoMomentLoader /> : null}
      {!hasStreamData && !spectator && missionName ? (
        <Suspense>
          <Mission
            key={`${missionName}~${missionType}`}
            name={missionName}
            missionType={missionType ?? ""}
            onLoadingChange={onLoadingChange}
          />
        </Suspense>
      ) : null}
      <ThreeCanvas engine={engine} dpr={dpr} onCreated={onCreated} />
      <FpsMeter />
    </EngineContext>
  );
});
