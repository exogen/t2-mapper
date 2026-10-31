import { useEffect, useEffectEvent, useRef } from "react";
import { mountEngineCanvas, type EngineCanvas } from "../engine/engineCanvas";
import type { GameEngine } from "../engine/gameEngine";

/**
 * The engine's WebGL canvas, filling its container.
 */
export function ThreeCanvas({
  engine,
  dpr,
  onCreated,
}: {
  engine: GameEngine;
  dpr?: number;
  onCreated?: (engine: GameEngine) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<EngineCanvas | null>(null);
  const handleCreated = useEffectEvent((engine: GameEngine) =>
    onCreated?.(engine),
  );
  const currentDpr = useEffectEvent(() => dpr);
  useEffect(() => {
    const canvas = mountEngineCanvas(engine, containerRef.current!, {
      dpr: currentDpr(),
    });
    canvasRef.current = canvas;
    handleCreated(engine);
    return () => {
      canvasRef.current = null;
      canvas.dispose();
    };
  }, [engine]);
  // A new resolution (an overlay opening, another display) keeps the
  // renderer: rebuilding it would drop its context and every GPU resource.
  useEffect(() => {
    canvasRef.current?.setPixelRatio(dpr);
  }, [dpr]);
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    />
  );
}
