import { createContext, type Dispatch, ReactNode, type SetStateAction, useContext, useMemo, useState } from "react";

/**
 * Handle for querying terrain data.
 *
 * TerrainBlock registers this via useEffect, allowing other components
 * to query terrain data without prop drilling.
 */
export interface TerrainHandle {
  /**
   * Query terrain height at world coordinates.
   * Coordinates wrap via `& 255` to support infinite terrain tiling,
   * matching Torque's FluidSupport.cc:
   *   i = (((m_SquareY0+Y) & 255) << 8) + ((m_SquareX0+X) & 255);
   */
  getHeightAt: (worldX: number, worldZ: number) => number;

  /**
   * Check if a point is above terrain at given world coordinates.
   * Used for water masking (matching Torque's fluid reject mask).
   * Coordinates wrap to support infinite terrain tiling.
   */
  isAboveTerrain: (worldX: number, worldZ: number, height: number) => boolean;

  /**
   * Get primary terrain tile bounds in world coordinates.
   * Note: Terrain actually tiles infinitely via coordinate wrapping.
   */
  getBounds: () => {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

type StateSetter<T> = Dispatch<SetStateAction<T>>;

interface TerrainContextValue {
  terrain: TerrainHandle | null;
  setTerrain: StateSetter<TerrainHandle | null>;
}

const TerrainContext = createContext<TerrainContextValue | null>(null);

interface TerrainProviderProps {
  children: ReactNode;
}

/**
 * Provider for terrain query handle.
 *
 * TerrainBlock registers its handle via useEffect on mount, and other
 * components (like WaterBlock) can access it to query terrain heights.
 */
export function TerrainProvider({ children }: TerrainProviderProps) {
  const [terrain, setTerrain] = useState<TerrainHandle | null>(null);
  const context = useMemo(() => ({ terrain, setTerrain }), [terrain]);

  return (
    <TerrainContext.Provider value={context}>
      {children}
    </TerrainContext.Provider>
  );
}

/**
 * Get the terrain handle from context.
 * Returns null if no TerrainBlock has registered yet.
 */
export function useTerrainHandle() {
  const context = useContext(TerrainContext);
  if (!context) {
    throw new Error("useTerrainHandle must be used within a TerrainProvider");
  }
  return context.terrain;
}

/**
 * Get the terrain setter for registration.
 * Used by TerrainBlock to register its handle.
 */
export function useRegisterTerrain() {
  const context = useContext(TerrainContext);
  if (!context) {
    throw new Error("useRegisterTerrain must be used within a TerrainProvider");
  }
  return context.setTerrain;
}
