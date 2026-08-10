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
import { statsStore, useStats } from "../state/statsStore";
import {
  gameEntityStore,
  useMissionName,
  useSceneMissionArea,
} from "../state/gameEntityStore";
import { computeCommandCircuitFrame } from "./commandCircuitFrame";
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
import { checkAnchors, type FlagPosition } from "../stats/anchorCheck";
import { createLogger } from "../logger";

const log = createLogger("HeatmapOverlay");

/**
 * Rendered above everything except the tour flash (999), with painter's
 * ordering instead of depth so terrain peaks can't clip it.
 */
const HEATMAP_RENDER_ORDER = 900;
const HEATMAP_HEIGHT = 1000;

function collectFlags(): FlagPosition[] {
  const flags: FlagPosition[] = [];
  for (const entity of gameEntityStore.getState().missionEntities.values()) {
    if (entity.hidden || entity.debugHidden) continue;
    if (
      entity.renderType === "Shape" &&
      entity.dataBlock?.toLowerCase() === "flag" &&
      entity.teamId != null &&
      entity.position
    ) {
      flags.push({
        teamId: entity.teamId,
        x: entity.position[0],
        z: entity.position[2],
      });
    }
  }
  return flags;
}

/**
 * Translucent player-position density quad shown in command circuit mode
 * when heatmap data for the current mission is loaded.
 */
export function HeatmapOverlay() {
  const active = useCommandCircuit((s) => s.active);
  const data = useStats((s) => s.data);
  const heatmapVisible = useStats((s) => s.heatmapVisible);
  const heatmapTeamFilter = useStats((s) => s.heatmapTeamFilter);
  const heatmapScheme = useStats((s) => s.heatmapScheme);
  const missionArea = useSceneMissionArea();
  // The entity store's mission name is set only once the mission has
  // actually loaded — gating on it (rather than the URL param, which
  // updates before loading) means the anchor check below always sees the
  // real flag entities, and the overlay never renders over a stale mission.
  const loadedMissionName = useMissionName();

  const missionMatches =
    data !== null &&
    loadedMissionName !== null &&
    data.missionName.toLowerCase() === loadedMissionName.toLowerCase();

  // Sanity-check the data's flag anchors against the loaded mission.
  useEffect(() => {
    if (!data || !missionMatches) return;
    const flags = collectFlags();
    if (flags.length === 0 && (data.anchors.storm || data.anchors.inferno)) {
      log.warn("No flag entities found to verify heatmap anchors against");
    }
    statsStore.getState().setAnchorWarning(checkAnchors(data.anchors, flags));
  }, [data, missionMatches]);

  const frame = useMemo(
    () => computeCommandCircuitFrame(missionArea),
    [missionArea],
  );

  const texture = useMemo(() => {
    if (!data || !missionMatches) return null;
    const density = rasterizeDensity(data.positionSamples, frame, {
      teamFilter: heatmapTeamFilter,
    });
    const levels = normalizeDensity(density);
    const lut = buildLut(
      heatmapScheme === "team"
        ? HEATMAP_PALETTES[heatmapTeamFilter]
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
  }, [data, missionMatches, frame, heatmapTeamFilter, heatmapScheme]);

  useEffect(() => () => texture?.dispose(), [texture]);

  const geometry = useMemo(
    () => new PlaneGeometry(frame.width, frame.depth).rotateX(-Math.PI / 2),
    [frame],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  if (!active || !heatmapVisible || !texture) return null;

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
