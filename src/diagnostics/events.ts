/** Shared simulation/transport code can emit events without importing the DOM,
 * renderer, or recorder. The browser installs a sink only while recording. */
type Details = Record<string, string | number | boolean | null>;
type Sink = (name: string, details?: Details) => void;
let sink: Sink | undefined;

export function installDiagnosticEventSink(next: Sink): () => void {
  sink = next;
  return () => {
    if (sink === next) sink = undefined;
  };
}

export function emitDiagnosticEvent(name: string, details?: Details): void {
  sink?.(name, details);
}
