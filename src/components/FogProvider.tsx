/**
 * FogProvider - Manages Tribes 2 fog state and provides fog uniforms to materials.
 *
 * Tribes 2 has two fog systems:
 * 1. Distance-based haze: Global fog from fogDistance to visibleDistance with quadratic falloff
 * 2. Height-based volumetric fog: Up to 3 fog volumes with independent height ranges and colors
 *
 * The fog density depends on how much of the view ray passes through each fog volume,
 * which varies based on camera height relative to volume boundaries.
 */
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Color } from "three";
import type { TorqueObject } from "../torqueScript";
import { getFloat, getProperty } from "../mission";

/** Maximum number of fog volumes supported (matches Torque) */
export const MAX_FOG_VOLUMES = 3;
/** Floats per fog volume in shader uniform: [visDist, minH, maxH, percentage] */
const FLOATS_PER_VOLUME = 4;

/**
 * A single fog volume with height boundaries and visibility settings.
 *
 * Note: Per-volume colors are NOT used in Tribes 2 ($specialFog defaults to false).
 * All fog uses the global fogColor regardless of fogVolumeColor values in mission files.
 */
export interface FogVolume {
  /** Distance at which objects are fully obscured within this volume */
  visibleDistance: number;
  /** Bottom height boundary of the fog volume */
  minHeight: number;
  /** Top height boundary of the fog volume */
  maxHeight: number;
  /** Fog density percentage (0-1), can be animated for storm effects */
  percentage: number;
}

/** Complete fog state parsed from a Sky object */
export interface FogState {
  /** Distance at which fog starts (near plane) */
  fogDistance: number;
  /** Distance at which fog is fully opaque (far plane) */
  visibleDistance: number;
  /** Color for distance-based haze */
  fogColor: Color;
  /** Height-based fog volumes (up to 3) */
  fogVolumes: FogVolume[];
  /** Highest point of any fog volume (used for optimization) */
  fogLine: number;
  /** Whether fog is enabled */
  enabled: boolean;
}

/** Fog uniforms to pass to shaders */
export interface FogUniforms {
  /** Distance fog near plane */
  fogNear: number;
  /** Distance fog far plane */
  fogFar: number;
  /** Distance fog color (linear color space) */
  fogColor: Color;
  /** Fog volume data as flat array for shader: [visDist, minH, maxH, percentage] x 3 = 12 floats */
  fogVolumeData: Float32Array;
  /** Current camera Y position */
  cameraHeight: number;
  /** Whether volumetric fog is active */
  hasVolumetricFog: boolean;
}

const FogContext = createContext<FogState | null>(null);
const FogUniformsContext =
  createContext<React.MutableRefObject<FogUniforms> | null>(null);

/**
 * Parse a Tribes 2 color string (space-separated RGB or RGBA values 0-1).
 *
 * Torque (2001) worked in gamma space - colors were specified as they should
 * appear on screen. Three.js expects linear colors (it converts to sRGB on output).
 * We convert sRGB->linear so the final output matches the intended appearance.
 */
function parseColor(colorString: string | undefined): Color {
  if (!colorString) return new Color(0.5, 0.5, 0.5);
  const parts = colorString.split(" ").map((s) => parseFloat(s));
  const [r, g, b] = parts;
  // Convert from sRGB (how Torque specified colors) to linear (what Three.js expects)
  return new Color().setRGB(r, g, b).convertSRGBToLinear();
}

/**
 * Parse a fog volume property string.
 * Format: "visibleDistance minHeight maxHeight"
 *
 * Note: fogVolumeColor is intentionally not parsed - per-volume colors are
 * NOT used in Tribes 2 ($specialFog defaults to false). All fog uses fogColor.
 */
function parseFogVolume(
  volumeStr: string | undefined,
  percentage: number = 1.0,
): FogVolume | null {
  if (!volumeStr) return null;

  const parts = volumeStr.split(" ").map((s) => parseFloat(s));
  if (parts.length < 3) return null;

  const [visibleDistance, minHeight, maxHeight] = parts;

  // Volume is invalid if visibleDistance is 0 or heights are equal
  if (visibleDistance <= 0 || maxHeight <= minHeight) return null;

  return {
    visibleDistance,
    minHeight,
    maxHeight,
    percentage: Math.max(0, Math.min(1, percentage)),
  };
}

/**
 * Parse fog state from a Sky TorqueObject.
 * @param object - The Sky TorqueObject containing fog properties
 * @param highQuality - If true, use high_ fog distance variants when available
 */
export function parseFogState(
  object: TorqueObject,
  highQuality: boolean = true,
): FogState {
  // Distance-based fog parameters
  const fogDistanceBase = getFloat(object, "fogDistance") ?? 0;
  const visibleDistanceBase = getFloat(object, "visibleDistance") ?? 1000;
  const highFogDistance = getFloat(object, "high_fogDistance");
  const highVisibleDistance = getFloat(object, "high_visibleDistance");

  // Use high_ variants if highQuality is enabled and they're available
  const fogDistance =
    highQuality && highFogDistance != null && highFogDistance > 0
      ? highFogDistance
      : fogDistanceBase;
  const visibleDistance =
    highQuality && highVisibleDistance != null && highVisibleDistance > 0
      ? highVisibleDistance
      : visibleDistanceBase;

  const fogColor = parseColor(getProperty(object, "fogColor"));

  // Parse fog volumes (up to 3)
  // Note: fogVolumeColor is intentionally not parsed - see parseFogVolume comment
  const fogVolumes: FogVolume[] = [];

  for (let i = 1; i <= MAX_FOG_VOLUMES; i++) {
    const volume = parseFogVolume(
      getProperty(object, `fogVolume${i}`),
      1.0, // Default percentage, could parse from storm fog state
    );
    if (volume) {
      fogVolumes.push(volume);
    }
  }

  // Calculate fog line (highest point of any fog volume)
  const fogLine = fogVolumes.reduce(
    (max, vol) => Math.max(max, vol.maxHeight),
    0,
  );

  // Fog is enabled if we have valid distance parameters
  const enabled = visibleDistance > fogDistance;

  return {
    fogDistance,
    visibleDistance,
    fogColor,
    fogVolumes,
    fogLine,
    enabled,
  };
}

/**
 * Create initial fog uniforms structure.
 */
function createFogUniforms(): FogUniforms {
  return {
    fogNear: 0,
    fogFar: 1000,
    fogColor: new Color(0.5, 0.5, 0.5),
    fogVolumeData: new Float32Array(MAX_FOG_VOLUMES * FLOATS_PER_VOLUME),
    cameraHeight: 0,
    hasVolumetricFog: false,
  };
}

/**
 * Update fog uniforms from fog state.
 */
function updateFogUniforms(
  uniforms: FogUniforms,
  state: FogState,
  cameraY: number,
): void {
  uniforms.fogNear = state.fogDistance;
  uniforms.fogFar = state.visibleDistance;
  uniforms.fogColor.copy(state.fogColor);
  uniforms.cameraHeight = cameraY;
  uniforms.hasVolumetricFog = state.fogVolumes.length > 0;

  // Pack fog volume data for shader: [visDist, minH, maxH, percentage] x 3
  for (let i = 0; i < MAX_FOG_VOLUMES; i++) {
    const offset = i * FLOATS_PER_VOLUME;
    const vol = state.fogVolumes[i];

    if (vol) {
      uniforms.fogVolumeData[offset + 0] = vol.visibleDistance;
      uniforms.fogVolumeData[offset + 1] = vol.minHeight;
      uniforms.fogVolumeData[offset + 2] = vol.maxHeight;
      uniforms.fogVolumeData[offset + 3] = vol.percentage;
    } else {
      // Mark as inactive with visibleDistance = 0
      uniforms.fogVolumeData[offset + 0] = 0;
      uniforms.fogVolumeData[offset + 1] = 0;
      uniforms.fogVolumeData[offset + 2] = 0;
      uniforms.fogVolumeData[offset + 3] = 0;
    }
  }
}

interface FogProviderProps {
  object: TorqueObject;
  enabled?: boolean;
  children: ReactNode;
}

/**
 * Provides fog state and uniforms to the scene.
 * Updates fog uniforms each frame based on camera position.
 *
 * Note: Shader materials get fog uniforms from globalFogUniforms (updated by Sky).
 * This provider is for React components that need fog state or the FogUniforms object.
 */
export function FogProvider({
  object,
  enabled = true,
  children,
}: FogProviderProps) {
  const fogState = useMemo(() => {
    const state = parseFogState(object);
    state.enabled = state.enabled && enabled;
    return state;
  }, [object, enabled]);

  const uniformsRef = useRef<FogUniforms>(createFogUniforms());

  // Update uniforms each frame with current camera position
  useFrame(({ camera }) => {
    if (fogState.enabled) {
      updateFogUniforms(uniformsRef.current, fogState, camera.position.y);
    }
  });

  // Initial update
  useMemo(() => {
    updateFogUniforms(uniformsRef.current, fogState, 0);
  }, [fogState]);

  return (
    <FogContext.Provider value={fogState}>
      <FogUniformsContext.Provider value={uniformsRef}>
        {children}
      </FogUniformsContext.Provider>
    </FogContext.Provider>
  );
}

/**
 * Hook to access the current fog state.
 */
export function useFogState(): FogState | null {
  return useContext(FogContext);
}

/**
 * Hook to access fog uniforms ref (for shader updates).
 */
export function useFogUniforms(): React.MutableRefObject<FogUniforms> | null {
  return useContext(FogUniformsContext);
}

/**
 * Get the fog color at a given height.
 * Used for skybox and background color blending.
 *
 * Note: Per-volume colors are not used in Tribes 2, so this always
 * returns the global fog color regardless of height.
 */
export function getFogColorAtHeight(state: FogState, _height: number): Color {
  return state.fogColor;
}
