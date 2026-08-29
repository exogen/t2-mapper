import { lazy, memo, Suspense } from "react";
import { type RootState } from "@react-three/fiber";
import { isStreamingSource, useDataSource } from "../state/gameEntityStore";
import { useRecording } from "./usePlayback";
import { AudioProvider } from "./AudioContext";
import { CamerasProvider } from "./CamerasProvider";
import { InputProducer } from "./InputProducer";
import { SceneLighting } from "./SceneLighting";
import { LightPool } from "./LightPool";
import { ThreeCanvas } from "./ThreeCanvas";
import { TickProvider } from "./TickProvider";
import { EntityScene } from "./EntityScene";
import { ObserverCamera } from "./ObserverCamera";
import { CommandCircuitCamera } from "./CommandCircuitCamera";
import { HeatmapOverlay } from "./HeatmapOverlay";
import { UnderwaterFilter } from "./UnderwaterFilter";
import { AudioEnabled } from "./AudioEnabled";
import { DebugEnabled } from "./DebugEnabled";
import { FpsMeter } from "./FpsMeter";
import { InputConsumer } from "./InputConsumer";
import { LabelOverlay } from "./LabelOverlay";
import { SpectatorController } from "./SpectatorController";
import { DemoCameraController } from "./DemoCameraController";
import { CommentaryAudio } from "./CommentaryAudio";
import { DirectorController } from "./DirectorController";
import { CameraDebugWatchdog } from "./CameraDebugWatchdog";
import { CameraTourConsumer } from "./CameraTourConsumer";
import { ActiveInputBindings } from "./ActiveInputBindings";

function createLazy(
  name: string,
  loader: () => Promise<{
    [name]: React.ComponentType<any>;
  }>,
) {
  return lazy(() => loader().then((mod) => ({ default: mod[name] })));
}

const StreamingController = createLazy(
  "StreamingController",
  () => import("@/src/components/StreamingController"),
);
const DebugElements = createLazy(
  "DebugElements",
  () => import("@/src/components/DebugElements"),
);
const Mission = createLazy("Mission", () => import("@/src/components/Mission"));
const ChatSoundPlayer = createLazy(
  "ChatSoundPlayer",
  () => import("@/src/components/ChatSoundPlayer"),
);

export const GameView = memo(function GameView({
  dpr,
  onCreated,
  missionName,
  missionType,
  onLoadingChange,
  spectator = false,
}: {
  dpr?: number;
  onCreated?: (state: RootState) => void;
  missionName: string;
  missionType?: string;
  onLoadingChange?: (isLoading: boolean, progress?: number) => void;
  /** Watch mode: everything comes from the live stream — never mount the
   *  TorqueScript Mission bootstrap, and manage the watch recording. */
  spectator?: boolean;
}) {
  const recording = useRecording();
  const dataSource = useDataSource();
  const hasStreamData = isStreamingSource(dataSource);

  return (
    <ThreeCanvas dpr={dpr} onCreated={onCreated}>
      <TickProvider>
        <CamerasProvider>
          <ActiveInputBindings />
          <InputProducer />
          <AudioProvider>
            <SceneLighting />
            <LightPool />
            <Suspense>
              <EntityScene />
            </Suspense>
            <ObserverCamera />
            <CommandCircuitCamera />
            <HeatmapOverlay />
            <UnderwaterFilter />
            <AudioEnabled>
              <ChatSoundPlayer />
            </AudioEnabled>
            <DebugEnabled>
              <DebugElements />
            </DebugEnabled>
            <FpsMeter />
            {recording ? (
              <Suspense>
                <StreamingController recording={recording} />
              </Suspense>
            ) : null}
            {!hasStreamData && !spectator && missionName ? (
              <Suspense>
                <Mission
                  key={`${missionName}~${missionType}`}
                  name={missionName}
                  missionType={missionType}
                  onLoadingChange={onLoadingChange}
                />
              </Suspense>
            ) : null}
            {spectator ? <SpectatorController /> : null}
            {recording?.source === "demo" ? (
              <>
                <DemoCameraController />
                <DirectorController />
                <CameraDebugWatchdog />
                <AudioEnabled>
                  <CommentaryAudio />
                </AudioEnabled>
              </>
            ) : null}
            <CameraTourConsumer />
            <InputConsumer />
            <LabelOverlay />
          </AudioProvider>
        </CamerasProvider>
      </TickProvider>
    </ThreeCanvas>
  );
});
