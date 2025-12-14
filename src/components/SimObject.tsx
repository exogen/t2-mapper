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

export function SimObject({ object }: { object: TorqueObject }) {
  const { missionType } = useMission();
  // FIXME: In theory we could make sure TorqueScript is calling `hide()`
  // based on the mission type already, which is built-in behavior, then just
  // make sure we respect the hidden/visible state here. For now do it this way.
  const shouldShowObject = useMemo(() => {
    const missionTypesList = new Set(
      (getProperty(object, "missionTypesList") ?? "")
        .toLowerCase()
        .split(/s+/)
        .filter(Boolean),
    );
    return (
      !missionTypesList.size || missionTypesList.has(missionType.toLowerCase())
    );
  }, [object, missionType]);

  const Component = componentMap[object._className];
  return shouldShowObject && Component ? (
    <Suspense>
      <Component object={object} />
    </Suspense>
  ) : null;
}
