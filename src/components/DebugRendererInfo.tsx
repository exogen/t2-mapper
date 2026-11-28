import { useEffect, useState } from "react";
import type { GameEngine } from "../engine/gameEngine";
import styles from "./DebugInfoPanel.module.css";
import fieldsetStyles from "./SidebarFieldset.module.css";

const SAMPLE_INTERVAL_MS = 500;

interface RendererSample {
  /** Average CPU time per frame, from its first stage to its render. */
  frameMs: number | null;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  heapMB: number | null;
}

const numberFormat = new Intl.NumberFormat();

/** Chrome's non-standard JS heap size. */
function heapMB(): number | null {
  const memory = (performance as { memory?: { usedJSHeapSize: number } })
    .memory;
  return memory ? memory.usedJSHeapSize / 1e6 : null;
}

export function DebugRendererInfo({ engine }: { engine: GameEngine }) {
  const [renderer, setRenderer] = useState<RendererSample | null>(null);

  useEffect(() => {
    let frameStart: number | null = null;
    let frameMs: number | null = null;
    let frameTime = 0;
    let frames = 0;
    const stopStart = engine.onFrameStart(() => {
      frameStart = performance.now();
    });
    const stopEnd = engine.onFrameEnd(() => {
      // Subscribed mid-frame: this frame's start wasn't seen.
      if (frameStart == null) return;
      frameTime += performance.now() - frameStart;
      frameStart = null;
      frames++;
    });
    const timer = setInterval(() => {
      const info = engine.currentHost?.renderer.info;
      if (frames) frameMs = frameTime / frames;
      setRenderer(
        info
          ? {
              frameMs,
              calls: info.render.calls,
              triangles: info.render.triangles,
              geometries: info.memory.geometries,
              textures: info.memory.textures,
              programs: info.programs?.length ?? 0,
              heapMB: heapMB(),
            }
          : null,
      );
      frameTime = 0;
      frames = 0;
    }, SAMPLE_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      stopStart();
      stopEnd();
    };
  }, [engine]);

  return (
    <fieldset className={`${fieldsetStyles.Fieldset} ${styles.Root}`}>
      <legend>Renderer</legend>
      <dl>
        {renderer && (
          <>
            <dt>CPU per frame</dt>
            <dd>
              {renderer.frameMs != null
                ? `${renderer.frameMs.toFixed(2)} ms`
                : "—"}
            </dd>
            <dt>Draw calls</dt>
            <dd>{numberFormat.format(renderer.calls)}</dd>
            <dt>Triangles</dt>
            <dd>{numberFormat.format(renderer.triangles)}</dd>
            <dt>Geometries</dt>
            <dd>{numberFormat.format(renderer.geometries)}</dd>
            <dt>Textures</dt>
            <dd>{numberFormat.format(renderer.textures)}</dd>
            <dt>Shader programs</dt>
            <dd>{numberFormat.format(renderer.programs)}</dd>
            {renderer.heapMB != null && (
              <>
                <dt>JS heap</dt>
                <dd>{numberFormat.format(Math.round(renderer.heapMB))} MB</dd>
              </>
            )}
          </>
        )}
      </dl>
    </fieldset>
  );
}
