import { ConsoleObject } from "../mission";
import { TerrainBlock } from "./TerrainBlock";
import { WaterBlock } from "./WaterBlock";
import { SimGroup } from "./SimGroup";
import { InteriorInstance } from "./InteriorInstance";
import { Sky } from "./Sky";
import { Sun } from "./Sun";
import { TSStatic } from "./TSStatic";
import { StaticShape } from "./StaticShape";
import { Item } from "./Item";

const componentMap = {
  InteriorInstance,
  Item,
  SimGroup,
  Sky,
  StaticShape,
  Sun,
  TerrainBlock,
  TSStatic,
  WaterBlock,
};

export function renderObject(object: ConsoleObject, key: string | number) {
  const Component = componentMap[object.className];
  return Component ? <Component key={key} object={object} /> : null;
}
