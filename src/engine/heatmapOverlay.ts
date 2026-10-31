import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { statsStore } from "../state/statsStore";
import { gameEntityStore } from "../state/gameEntityStore";
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
import { combineCleanups } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

/**
 * Rendered above everything except the tour flash (999), with painter's
 * ordering instead of depth so terrain peaks can't clip it.
 */
const HEATMAP_RENDER_ORDER = 900;
const HEATMAP_HEIGHT = 1000;

type HeatmapFrame = ReturnType<typeof computeHeatmapFrame>;

/**
 * Translucent player-position density quad shown in command circuit mode
 * using the match selected by the demo playhead.
 */
export function installHeatmapOverlay(engine: GameEngine): () => void {
  const material = new MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(), material);
  mesh.renderOrder = HEATMAP_RENDER_ORDER;
  mesh.frustumCulled = false;

  // Each derived value is rebuilt only when what it depends on changed.
  let frameKey: unknown[] = [];
  let frame: HeatmapFrame | null = null;
  let levelsKey: unknown[] = [];
  let levels: ReturnType<typeof normalizeDensity> | null = null;
  let textureKey: unknown[] = [];
  let texture: DataTexture | null = null;
  const changed = (previous: unknown[], next: unknown[]) =>
    previous.length !== next.length ||
    next.some((value, i) => !Object.is(value, previous[i]));

  return engine.withHost(({ scene }) => {
    const update = () => {
      const {
        activeMatch: data,
        sceneReady,
        selectedPlayerId,
        heatmapScheme,
      } = statsStore.getState();
      const { dataSource } = gameEntityStore.getState();
      const player = data?.players.find(
        (entry) => entry.id === selectedPlayerId,
      );
      const palette =
        player?.teamId === 1 || player?.teamId === 2 ? player.teamId : "all";

      if (changed(frameKey, (frameKey = [data, selectedPlayerId]))) {
        frame =
          data && selectedPlayerId != null
            ? computeHeatmapFrame(data.positionSamples, selectedPlayerId)
            : null;
        mesh.geometry.dispose();
        mesh.geometry = frame
          ? new PlaneGeometry(frame.width, frame.depth).rotateX(-Math.PI / 2)
          : new PlaneGeometry();
        if (frame)
          mesh.position.set(frame.centerX, HEATMAP_HEIGHT, frame.centerZ);
      }
      if (
        changed(
          levelsKey,
          (levelsKey = [data, dataSource, frame, selectedPlayerId]),
        )
      ) {
        levels =
          data && dataSource === "demo" && selectedPlayerId != null && frame
            ? normalizeDensity(
                rasterizeDensity(data.positionSamples, frame, {
                  playerId: selectedPlayerId,
                }),
              )
            : null;
      }
      let rebuilt = false;
      if (
        changed(textureKey, (textureKey = [levels, palette, heatmapScheme]))
      ) {
        rebuilt = true;
        texture?.dispose();
        texture = null;
        if (levels) {
          const lut = buildLut(
            heatmapScheme === "team"
              ? HEATMAP_PALETTES[palette]
              : HEATMAP_SCHEMES[heatmapScheme],
          );
          texture = new DataTexture(
            colorize(levels, lut),
            HEATMAP_RESOLUTION,
            HEATMAP_RESOLUTION,
            RGBAFormat,
            UnsignedByteType,
          );
          texture.colorSpace = SRGBColorSpace;
          texture.flipY = false;
          texture.magFilter = LinearFilter;
          texture.minFilter = LinearFilter;
          texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
        }
        material.map = texture;
        material.needsUpdate = true;
      }

      const visible =
        commandCircuitStore.getState().active && sceneReady && !!texture;
      if (visible !== (mesh.parent === scene) || rebuilt) {
        if (visible) scene.add(mesh);
        else scene.remove(mesh);
        engine.invalidate();
      }
    };
    update();
    return combineCleanups(
      statsStore.subscribe(update),
      commandCircuitStore.subscribe(update),
      gameEntityStore.subscribe(update),
      () => {
        scene.remove(mesh);
        mesh.geometry.dispose();
        material.dispose();
        texture?.dispose();
      },
    );
  });
}
