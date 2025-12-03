import type { TorqueObject } from "../torqueScript";
import { TerrainBlock } from "./TerrainBlock";
import { WaterBlock } from "./WaterBlock";
import { SimGroup } from "./SimGroup";
import { InteriorInstance } from "./InteriorInstance";
import { Sky } from "./Sky";
import { Sun } from "./Sun";
import { TSStatic } from "./TSStatic";
import { StaticShape } from "./StaticShape";
import { Item } from "./Item";
import { Turret } from "./Turret";
import { AudioEmitter } from "./AudioEmitter";
import { WayPoint } from "./WayPoint";
import { Camera } from "./Camera";
import { ForceFieldBare } from "./ForceFieldBare";

const componentMap = {
  AudioEmitter,
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
  return Component ? <Component key={key} object={object} /> : null;
}
