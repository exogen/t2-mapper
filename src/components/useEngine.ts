import { createContext, useContext, useEffect, useEffectEvent } from "react";
import type { GameEngine } from "../engine/gameEngine";
import type { FrameCallback } from "../engine/frameScheduler";
import type { FrameStage } from "../engine/framePriority";

export const EngineContext = createContext<GameEngine | null>(null);

/** The game canvas's engine (see GameView). */
export function useEngine(): GameEngine {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error("useEngine must be used within GameView");
  return engine;
}

/**
 * Run a callback in one of the engine's frame stages. For React components
 * that stay React (URL and UI bridges) but need to act every frame; game
 * systems belong in src/engine instead.
 */
export function useEngineFrame(stage: FrameStage, callback: FrameCallback) {
  const engine = useEngine();
  const handleFrame = useEffectEvent(callback);
  useEffect(() => engine.scheduler.add(stage, handleFrame), [engine, stage]);
}
