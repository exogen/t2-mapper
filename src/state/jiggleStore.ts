import { create } from "zustand";
import type { PlayerBodyType } from "../player/playerBodyType";

const MIN_CHEST_SIZE = 0.7;
const MAX_CHEST_SIZE = 3;
export const MAX_CHEST_SIZE_PERCENT = 500;

/** Keep the original mesh at 100%, with the old 70–300% physical limits. */
export function chestSizeFromPercent(percent: number): number {
  const clamped = Math.max(0, Math.min(MAX_CHEST_SIZE_PERCENT, percent));
  return clamped <= 100
    ? MIN_CHEST_SIZE + (clamped / 100) * (1 - MIN_CHEST_SIZE)
    : 1 +
        ((clamped - 100) / (MAX_CHEST_SIZE_PERCENT - 100)) *
          (MAX_CHEST_SIZE - 1);
}

export function chestSizeToPercent(size: number): number {
  return Math.round(
    size <= 1
      ? ((size - MIN_CHEST_SIZE) / (1 - MIN_CHEST_SIZE)) * 100
      : 100 +
          ((size - 1) / (MAX_CHEST_SIZE - 1)) * (MAX_CHEST_SIZE_PERCENT - 100),
  );
}

/**
 * In-memory controls, reset to defaults on every page load. Never persist these
 * values or include them in user preferences. The URL flag only enables the UI
 * and physics; it does not store any control values.
 */
export const useJiggle = create<{
  sizes: Record<PlayerBodyType, number>;
  firmness: number;
  setSize(bodyType: PlayerBodyType, size: number): void;
  setFirmness(firmness: number): void;
}>((set) => ({
  sizes: { male: 1, female: 1, bioderm: 1 },
  firmness: 0,
  setSize: (bodyType, size) => {
    if (Number.isFinite(size))
      set((state) => ({
        sizes: {
          ...state.sizes,
          [bodyType]: Math.max(MIN_CHEST_SIZE, Math.min(MAX_CHEST_SIZE, size)),
        },
      }));
  },
  setFirmness: (firmness) => {
    if (Number.isFinite(firmness))
      set({
        firmness: Math.max(0, Math.min(100, Math.round(firmness / 10) * 10)),
      });
  },
}));
