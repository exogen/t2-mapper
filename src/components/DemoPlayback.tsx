import { useRecording } from "./RecordingProvider";
import { DemoPlaybackController } from "./DemoPlaybackController";

export function DemoPlayback() {
  const recording = useRecording();

  if (!recording) return null;
  return <DemoPlaybackController recording={recording} />;
}
