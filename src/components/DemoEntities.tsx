import { Component, memo, Suspense } from "react";
import type { ErrorInfo, MutableRefObject, ReactNode } from "react";
import { entityTypeColor } from "../demo/demoPlaybackUtils";
import { FloatingLabel } from "./FloatingLabel";
import { useDebug } from "./SettingsProvider";
import { DemoPlayerModel } from "./DemoPlayerModel";
import { DemoShapeModel, DemoWeaponModel, DemoExplosionShape } from "./DemoShapeModel";
import { DemoSpriteProjectile, DemoTracerProjectile } from "./DemoProjectiles";
import { PlayerNameplate } from "./PlayerNameplate";
import { FlagMarker } from "./FlagMarker";
import { useEngineSelector } from "../state";
import type { DemoEntity, DemoStreamingPlayback } from "../demo/types";

/**
 * Renders a non-camera demo entity.
 * The group name must match the entity ID so the AnimationMixer can target it.
 * Player entities use DemoPlayerModel for skeletal animation; others use
 * DemoShapeModel.
 */
export const DemoEntityGroup = memo(function DemoEntityGroup({
  entity,
  timeRef,
  playback,
}: {
  entity: DemoEntity;
  timeRef: MutableRefObject<number>;
  playback?: DemoStreamingPlayback;
}) {
  const debug = useDebug();
  const debugMode = debug?.debugMode ?? false;
  const controlPlayerGhostId = useEngineSelector(
    (state) => state.playback.streamSnapshot?.controlPlayerGhostId,
  );
  const name = String(entity.id);

  if (entity.visual?.kind === "tracer") {
    return (
      <group name={name}>
        <group name="model" userData={{ demoVisualKind: "tracer" }}>
          <Suspense fallback={null}>
            <DemoTracerProjectile entity={entity} visual={entity.visual} />
          </Suspense>
          {debugMode ? <DemoMissingShapeLabel entity={entity} /> : null}
        </group>
      </group>
    );
  }

  if (entity.visual?.kind === "sprite") {
    return (
      <group name={name}>
        <group name="model" userData={{ demoVisualKind: "sprite" }}>
          <Suspense fallback={null}>
            <DemoSpriteProjectile visual={entity.visual} />
          </Suspense>
          {debugMode ? <DemoMissingShapeLabel entity={entity} /> : null}
        </group>
      </group>
    );
  }

  if (!entity.dataBlock) {
    const isFlag = ((entity.targetRenderFlags ?? 0) & 0x2) !== 0;
    return (
      <group name={name}>
        <group name="model">
          <mesh>
            <sphereGeometry args={[0.3, 6, 4]} />
            <meshBasicMaterial color={entityTypeColor(entity.type)} wireframe />
          </mesh>
          {debugMode ? <DemoMissingShapeLabel entity={entity} /> : null}
        </group>
        {isFlag && (
          <Suspense fallback={null}>
            <FlagMarker entity={entity} timeRef={timeRef} />
          </Suspense>
        )}
      </group>
    );
  }

  const fallback = (
    <mesh>
      <sphereGeometry args={[0.5, 8, 6]} />
      <meshBasicMaterial color={entityTypeColor(entity.type)} wireframe />
    </mesh>
  );

  // Player entities use skeleton-preserving DemoPlayerModel for animation.
  if (entity.type === "Player") {
    const isControlPlayer = entity.id === controlPlayerGhostId;
    const hasFlag = ((entity.targetRenderFlags ?? 0) & 0x2) !== 0;
    return (
      <group name={name}>
        <group name="model">
          <ShapeErrorBoundary fallback={fallback}>
            <Suspense fallback={fallback}>
              <DemoPlayerModel entity={entity} timeRef={timeRef} />
            </Suspense>
          </ShapeErrorBoundary>
          {!isControlPlayer && (
            <Suspense fallback={null}>
              <PlayerNameplate entity={entity} timeRef={timeRef} />
            </Suspense>
          )}
          {hasFlag && (
            <Suspense fallback={null}>
              <FlagMarker entity={entity} timeRef={timeRef} />
            </Suspense>
          )}
        </group>
      </group>
    );
  }

  // Explosion entities with DTS shapes use a specialized renderer
  // that handles faceViewer, size keyframes, and fade-out.
  if (entity.type === "Explosion" && entity.dataBlock && playback) {
    return (
      <group name={name}>
        <group name="model">
          <ShapeErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <DemoExplosionShape entity={entity as any} playback={playback} />
            </Suspense>
          </ShapeErrorBoundary>
        </group>
      </group>
    );
  }

  const isFlag = ((entity.targetRenderFlags ?? 0) & 0x2) !== 0;

  return (
    <group name={name}>
      <group name="model">
        <ShapeErrorBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <DemoShapeModel shapeName={entity.dataBlock} entityId={entity.id} threads={entity.threads} />
          </Suspense>
        </ShapeErrorBoundary>
      </group>
      {entity.weaponShape && (
        <group name="weapon">
          <ShapeErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <DemoWeaponModel
                shapeName={entity.weaponShape}
                playerShapeName={entity.dataBlock}
              />
            </Suspense>
          </ShapeErrorBoundary>
        </group>
      )}
      {isFlag && (
        <Suspense fallback={null}>
          <FlagMarker entity={entity} timeRef={timeRef} />
        </Suspense>
      )}
    </group>
  );
});

export function DemoMissingShapeLabel({ entity }: { entity: DemoEntity }) {
  const id = String(entity.id);
  const bits: string[] = [];
  bits.push(`${id} (${entity.type})`);
  if (entity.className) bits.push(`class ${entity.className}`);
  if (typeof entity.ghostIndex === "number") bits.push(`ghost ${entity.ghostIndex}`);
  if (typeof entity.dataBlockId === "number") bits.push(`db ${entity.dataBlockId}`);
  bits.push(
    entity.shapeHint
      ? `shapeHint ${entity.shapeHint}`
      : "shapeHint <none resolved>",
  );
  return <FloatingLabel color="#ff6688">{bits.join(" | ")}</FloatingLabel>;
}

/** Error boundary that renders a fallback when shape loading fails. */
export class ShapeErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      "[demo] Shape load failed:",
      error.message,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
