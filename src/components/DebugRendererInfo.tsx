import { useEffect, useState } from "react";
import type { GameEngine } from "../engine/gameEngine";
import styles from "./DebugInfoPanel.module.css";

const SAMPLE_INTERVAL_MS = 500;

interface RendererSample {
  /** Average CPU time per frame, from its first stage to its render. */
  frameMs: number;
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

/**
 * The renderer's per-frame work and GPU resources in the debug panel,
 * sampled twice a second: draw calls and triangles across every pass of
 * the last frame, live geometries, textures and shader programs, and the
 * engine's average CPU time per frame.
 */
export function DebugRendererInfo({ engine }: { engine: GameEngine }) {
  const [sample, setSample] = useState<RendererSample | null>(null);

  useEffect(() => {
    let frameStart = 0;
    let frameTime = 0;
    let frames = 0;
    let lastSample = performance.now();
    const stopStart = engine.onFrameStart(() => {
      frameStart = performance.now();
    });
    const stopEnd = engine.onFrameEnd(() => {
      // Subscribed mid-frame: this frame's start wasn't seen.
      if (!frameStart) return;
      const now = performance.now();
      frameTime += now - frameStart;
      frames++;
      if (now - lastSample < SAMPLE_INTERVAL_MS) return;
      const info = engine.currentHost?.renderer.info;
      if (info) {
        setSample({
          frameMs: frameTime / frames,
          calls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs?.length ?? 0,
          heapMB: heapMB(),
        });
      }
      frameTime = 0;
      frames = 0;
      lastSample = now;
    });
    return () => {
      stopStart();
      stopEnd();
    };
  }, [engine]);

  if (!sample) return null;

  return (
    <fieldset className={styles.Root}>
      <legend>Renderer</legend>
      <dl>
        <dt>CPU per frame</dt>
        <dd>{sample.frameMs.toFixed(2)} ms</dd>
        <dt>Draw calls</dt>
        <dd>{numberFormat.format(sample.calls)}</dd>
        <dt>Triangles</dt>
        <dd>{numberFormat.format(sample.triangles)}</dd>
        <dt>Geometries</dt>
        <dd>{numberFormat.format(sample.geometries)}</dd>
        <dt>Textures</dt>
        <dd>{numberFormat.format(sample.textures)}</dd>
        <dt>Shader programs</dt>
        <dd>{numberFormat.format(sample.programs)}</dd>
        {sample.heapMB != null && (
          <>
            <dt>JS heap</dt>
            <dd>{numberFormat.format(Math.round(sample.heapMB))} MB</dd>
          </>
        )}
      </dl>
    </fieldset>
  );
}
