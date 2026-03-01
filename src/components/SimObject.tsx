import { lazy, Suspense, useMemo } from "react";
import type { TorqueObject } from "../torqueScript";
import { TerrainBlock } from "./TerrainBlock";
import { SimGroup } from "./SimGroup";
import { InteriorInstance } from "./InteriorInstance";
import { Sky } from "./Sky";
import { Sun } from "./Sun";
import { TSStatic } from "./TSStatic";
import { StaticShape } from "./StaticShape";
import { Item } from "./Item";
import { Turret } from "./Turret";
import { WayPoint } from "./WayPoint";
import { Camera } from "./Camera";
import { useSettings } from "./SettingsProvider";
import { useMission } from "./MissionContext";
import { getProperty } from "../mission";
import { useEngineSelector, useRuntimeObjectById } from "../state";

const AudioEmitter = lazy(() =>
  import("./AudioEmitter").then((mod) => ({ default: mod.AudioEmitter })),
);

function ConditionalAudioEmitter(props) {
  const { audioEnabled } = useSettings();
  return audioEnabled ? <AudioEmitter {...props} /> : null;
}

// Not every map will have force fields.
const ForceFieldBare = lazy(() =>
  import("./ForceFieldBare").then((mod) => ({ default: mod.ForceFieldBare })),
);

// Not every map will have water.
const WaterBlock = lazy(() =>
  import("./WaterBlock").then((mod) => ({ default: mod.WaterBlock })),
);

const componentMap = {
  AudioEmitter: ConditionalAudioEmitter,
  Camera,
  ForceFieldBare,
  InteriorInstance,
  Item,
  SimGroup,
  Sky,
  StaticShape,
  Sun,
  TerrainBlock,
  TSStatic,
  Turret,
  WaterBlock,
  WayPoint,
};

/**
 * During demo playback, these mission-authored classes are rendered from demo
 * ghosts instead of the mission runtime scene tree.
 */
const demoGhostAuthoritativeClasses = new Set([
  "ForceFieldBare",
  "Item",
  "StaticShape",
  "Turret",
]);

interface SimObjectProps {
  object?: TorqueObject;
  objectId?: number;
}

export function SimObject({ object, objectId }: SimObjectProps) {
  const liveObject = useRuntimeObjectById(objectId ?? object?._id);
  const resolvedObject = liveObject ?? object;
  const { missionType } = useMission();
  const isDemoPlaybackActive = useEngineSelector(
    (state) => state.playback.recording != null,
  );

  // FIXME: In theory we could make sure TorqueScript is calling `hide()`
  // based on the mission type already, which is built-in behavior, then just
  // make sure we respect the hidden/visible state here. For now do it this way.
  const shouldShowObject = useMemo(() => {
    if (!resolvedObject) {
      return false;
    }
    const missionTypesList = new Set(
      (getProperty(resolvedObject, "missionTypesList") ?? "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    );
    return (
      !missionTypesList.size || missionTypesList.has(missionType.toLowerCase())
    );
  }, [resolvedObject, missionType]);

  if (!resolvedObject) {
    return null;
  }

  const Component = componentMap[resolvedObject._className];
  const isSuppressedByDemoAuthority =
    isDemoPlaybackActive &&
    demoGhostAuthoritativeClasses.has(resolvedObject._className);
  return shouldShowObject && Component ? (
    <Suspense>
      {!isSuppressedByDemoAuthority && <Component object={resolvedObject} />}
    </Suspense>
  ) : null;
}
