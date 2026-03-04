import { useDemoRecording } from "./DemoProvider";
import { StreamingDemoPlayback } from "./DemoPlaybackStreaming";

export function DemoPlayback() {
  const recording = useDemoRecording();

  if (!recording) return null;
  return <StreamingDemoPlayback recording={recording} />;
}
