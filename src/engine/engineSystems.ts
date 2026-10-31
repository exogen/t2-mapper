import { engineStore } from "../state/engineStore";
import { installAudio } from "./audioSystem";
import { installCameraRig } from "./cameraRig";
import { installCameraTour } from "./cameraTour";
import { installCameraWatchdog } from "./cameraWatchdog";
import { installChatSounds } from "./chatSounds";
import { installProjectiles } from "./projectiles";
import { installStreamEffects } from "./streamEffects";
import { installDebugElements } from "./debugElements";
import { installCommandCircuit } from "./commandCircuit";
import { installCommandCircuitTourCallout } from "./commandCircuitTourCallout";
import { installCommentaryAudio } from "./commentaryAudio";
import { installDTSRendering } from "./dtsRendering";
import { installEntityViews } from "./entityViews";
import { installLabelOverlay } from "./labelOverlay";
import { installInputConsumer } from "./inputConsumer";
import { installKeyboardMouseInput } from "./keyboardMouseInput";
import { installLightPool } from "./lightPool";
import { installMissionCameras } from "./missionCameras";
import { installSceneLighting } from "./sceneLighting";
import { installShadowPool } from "./shadowPool";
import { installTouchInput } from "./touchInput";
import { installUnderwaterFilter } from "./underwaterFilter";
import { installWorldLabels } from "./worldLabel";
import { settingsStore } from "../state/settingsStore";
import { installDirectorCamera } from "./directorCamera";
import { installDemoCameraSelection } from "./demoCameraSelection";
import { combineCleanups, reaction } from "./storeReaction";
import type { GameEngine } from "./gameEngine";
import type { StreamRecording } from "../stream/types";

/** The current recording's playback, for as long as it's current. */
function startPlaybackSession(
  engine: GameEngine,
  recording: StreamRecording,
): () => void {
  let session: { dispose(): void } | null = null;
  let stopped = false;
  // Loaded on demand: map mode never streams.
  void import("./streamPlayback").then(({ StreamPlaybackSession }) => {
    if (!stopped) session = new StreamPlaybackSession(engine, recording);
  });
  return () => {
    stopped = true;
    session?.dispose();
  };
}

/** Systems that run only while a demo is playing. */
function startDemoSystems(engine: GameEngine): () => void {
  return combineCleanups(
    installDemoCameraSelection(engine),
    installDirectorCamera(engine),
    installCameraWatchdog(engine),
    reaction(
      settingsStore,
      (state) => state.audioEnabled,
      (enabled) => (enabled ? installCommentaryAudio(engine) : undefined),
    ),
  );
}

/**
 * Every engine system, and the state that switches each on and off.
 * Returns a function that stops them all.
 */
export function startEngineSystems(engine: GameEngine): () => void {
  return combineCleanups(
    // First: everything else reads the cameras.
    installCameraRig(engine),
    installEntityViews(engine),
    installProjectiles(engine),
    installWorldLabels(engine),
    installSceneLighting(engine),
    // Render hooks run in this order: lights, then shadows, then the DTS
    // draw pool (which wraps them once it loads).
    installLightPool(engine),
    reaction(
      settingsStore,
      (state) => state.shadowsEnabled,
      (enabled) => (enabled ? installShadowPool(engine) : undefined),
    ),
    installDTSRendering(engine),
    installUnderwaterFilter(engine),
    // Paints after the scene has rendered.
    installLabelOverlay(engine),
    installAudio(engine),
    installMissionCameras(engine),
    // Input: producers report frames, the consumer drains them.
    installTouchInput(engine),
    installKeyboardMouseInput(engine),
    installInputConsumer(engine),
    installCameraTour(engine),
    installCommandCircuit(engine),
    installCommandCircuitTourCallout(engine),
    installChatSounds(),
    reaction(
      engineStore,
      (state) => state.playback.recording,
      (recording) =>
        recording ? startPlaybackSession(engine, recording) : undefined,
    ),
    installStreamEffects(engine),
    installDebugElements(engine),
    reaction(
      engineStore,
      (state) => state.playback.recording?.source === "demo",
      (isDemo) => (isDemo ? startDemoSystems(engine) : undefined),
    ),
  );
}
