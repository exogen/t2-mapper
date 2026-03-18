import { CatmullRomCurve3 } from "three";
import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { TourTarget } from "../components/mapTourCategories";

export interface TourAnimation {
  targets: TourTarget[];
  /** Category name when this is a multi-target tour, for UI matching. */
  categoryName: string | null;
  currentIndex: number;
  phase: "traveling" | "orbiting";
  elapsed: number;
  phaseDuration: number;
  /** Built by the consumer on first frame of each travel phase. */
  curve: CatmullRomCurve3 | null;
  /** Captured by the consumer on animation start. */
  startPos: [number, number, number] | null;
  startQuat: [number, number, number, number] | null;
  /** Resolved orbit center (bounding box center) for the current target. */
  orbitCenter: [number, number, number] | null;
  /** Resolved orbit radius based on bounding box size. */
  orbitRadius: number | null;
  /** Orbit start angle in radians, set when entering orbit phase. */
  orbitStartAngle: number;
}

export interface CameraTourState {
  animation: TourAnimation | null;
  flyTo(target: TourTarget): void;
  startTour(targets: TourTarget[], categoryName: string): void;
  /** Advance to the next target in a tour (notifies subscribers). */
  advanceTarget(): void;
  cancel(): void;
}

function makeAnimation(
  targets: TourTarget[],
  categoryName: string | null = null,
): TourAnimation {
  return {
    targets,
    categoryName,
    currentIndex: 0,
    phase: "traveling",
    elapsed: 0,
    phaseDuration: 0,
    curve: null,
    startPos: null,
    startQuat: null,
    orbitCenter: null,
    orbitRadius: null,
    orbitStartAngle: 0,
  };
}

export const cameraTourStore = createStore<CameraTourState>((set) => ({
  animation: null,
  flyTo(target) {
    set({ animation: makeAnimation([target]) });
  },
  startTour(targets, categoryName) {
    if (targets.length === 0) return;
    set({ animation: makeAnimation(targets, categoryName) });
  },
  advanceTarget() {
    set((state) => {
      if (!state.animation) return state;
      return {
        animation: {
          ...state.animation,
          currentIndex: state.animation.currentIndex + 1,
          phase: "traveling" as const,
          elapsed: 0,
          curve: null,
          startPos: null,
          startQuat: null,
          orbitCenter: null,
          orbitRadius: null,
          orbitStartAngle: 0,
        },
      };
    });
  },
  cancel() {
    set({ animation: null });
  },
}));

export function useCameraTour<T>(
  selector: (state: CameraTourState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(cameraTourStore, selector, equality);
}
