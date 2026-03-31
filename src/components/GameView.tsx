import { lazy, memo, Suspense } from "react";
import { type RootState } from "@react-three/fiber";
import { useDataSource } from "../state/gameEntityStore";
import { useRecording } from "./usePlayback";
import { AudioProvider } from "./AudioContext";
import { CamerasProvider } from "./CamerasProvider";
import { InputProducer } from "./InputProducer";
import { SceneLighting } from "./SceneLighting";
import { ThreeCanvas } from "./ThreeCanvas";
import { TickProvider } from "./TickProvider";
import { EntityScene } from "./EntityScene";
import { ObserverCamera } from "./ObserverCamera";
import { AudioEnabled } from "./AudioEnabled";
import { DebugEnabled } from "./DebugEnabled";
import { InputConsumer } from "./InputConsumer";
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
}: {
  dpr?: number;
  onCreated?: (state: RootState) => void;
  missionName: string;
  missionType?: string;
  onLoadingChange?: (isLoading: boolean, progress?: number) => void;
}) {
  const recording = useRecording();
  const dataSource = useDataSource();
  const hasStreamData = dataSource === "demo" || dataSource === "live";

  return (
    <ThreeCanvas dpr={dpr} onCreated={onCreated}>
      <TickProvider>
        <CamerasProvider>
          <ActiveInputBindings />
          <InputProducer />
          <AudioProvider>
            <SceneLighting />
            <Suspense>
              <EntityScene />
            </Suspense>
            <ObserverCamera />
            <AudioEnabled>
              <ChatSoundPlayer />
            </AudioEnabled>
            <DebugEnabled>
              <DebugElements />
            </DebugEnabled>
            {recording ? (
              <Suspense>
                <StreamingController recording={recording} />
              </Suspense>
            ) : null}
            {!hasStreamData ? (
              <Suspense>
                <Mission
                  key={`${missionName}~${missionType}`}
                  name={missionName}
                  missionType={missionType}
                  onLoadingChange={onLoadingChange}
                />
              </Suspense>
            ) : null}
            <CameraTourConsumer />
            <InputConsumer />
          </AudioProvider>
        </CamerasProvider>
      </TickProvider>
    </ThreeCanvas>
  );
});
