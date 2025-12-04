import { lazy, Suspense } from "react";
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

// Not every map will have force fields.
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

export function renderObject(object: TorqueObject, key?: string | number) {
  const Component = componentMap[object._className];
  return Component ? (
    <Suspense key={key}>
      <Component object={object} />
    </Suspense>
  ) : null;
}
