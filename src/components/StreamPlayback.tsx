import { useRecording } from "./RecordingProvider";
import { StreamingController } from "./StreamingController";

export function StreamPlayback() {
  const recording = useRecording();

  if (!recording) return null;
  return <StreamingController recording={recording} />;
}
