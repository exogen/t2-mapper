import { useEffect, useMemo } from "react";
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { useStats } from "../state/statsStore";
import { useDataSource } from "../state/gameEntityStore";
import { computeHeatmapFrame } from "../stats/heatmapFrame";
import {
  HEATMAP_RESOLUTION,
  normalizeDensity,
  rasterizeDensity,
} from "../stats/rasterize";
import {
  buildLut,
  colorize,
  HEATMAP_PALETTES,
  HEATMAP_SCHEMES,
} from "../stats/colormap";

/**
 * Rendered above everything except the tour flash (999), with painter's
 * ordering instead of depth so terrain peaks can't clip it.
 */
const HEATMAP_RENDER_ORDER = 900;
const HEATMAP_HEIGHT = 1000;

/**
 * Translucent player-position density quad shown in command circuit mode
 * using the match selected by the demo playhead.
 */
export function HeatmapOverlay() {
  const active = useCommandCircuit((s) => s.active);
  const data = useStats((s) => s.activeMatch);
  const sceneReady = useStats((s) => s.sceneReady);
  const selectedPlayerId = useStats((s) => s.selectedPlayerId);
  const dataSource = useDataSource();
  const heatmapScheme = useStats((s) => s.heatmapScheme);
  const player = data?.players.find((entry) => entry.id === selectedPlayerId);
  const palette =
    player?.teamId === 1 || player?.teamId === 2 ? player.teamId : "all";

  const frame = useMemo(
    () =>
      data && selectedPlayerId != null
        ? computeHeatmapFrame(data.positionSamples, selectedPlayerId)
        : null,
    [data, selectedPlayerId],
  );

  const levels = useMemo(() => {
    if (!data || dataSource !== "demo" || selectedPlayerId == null || !frame)
      return null;
    const density = rasterizeDensity(data.positionSamples, frame, {
      playerId: selectedPlayerId,
    });
    return normalizeDensity(density);
  }, [data, dataSource, frame, selectedPlayerId]);

  const texture = useMemo(() => {
    if (!levels) return null;
    const lut = buildLut(
      heatmapScheme === "team"
        ? HEATMAP_PALETTES[palette]
        : HEATMAP_SCHEMES[heatmapScheme],
    );
    const rgba = colorize(levels, lut);
    const tex = new DataTexture(
      rgba,
      HEATMAP_RESOLUTION,
      HEATMAP_RESOLUTION,
      RGBAFormat,
      UnsignedByteType,
    );
    tex.colorSpace = SRGBColorSpace;
    tex.flipY = false;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }, [levels, palette, heatmapScheme]);

  useEffect(() => () => texture?.dispose(), [texture]);

  const geometry = useMemo(
    () =>
      frame
        ? new PlaneGeometry(frame.width, frame.depth).rotateX(-Math.PI / 2)
        : null,
    [frame],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!active || !sceneReady || !texture || !geometry || !frame) return null;

  return (
    <mesh
      position={[frame.centerX, HEATMAP_HEIGHT, frame.centerZ]}
      geometry={geometry}
      renderOrder={HEATMAP_RENDER_ORDER}
      frustumCulled={false}
    >
      <meshBasicMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}
