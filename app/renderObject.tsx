import { ConsoleObject } from "@/src/mission";
import { TerrainBlock } from "./TerrainBlock";
import { WaterBlock } from "./WaterBlock";
import { SimGroup } from "./SimGroup";
import { InteriorInstance } from "./InteriorInstance";
import { Sky } from "./Sky";

const componentMap = {
  SimGroup,
  TerrainBlock,
  WaterBlock,
  InteriorInstance,
  Sky,
};

export function renderObject(object: ConsoleObject, key: string | number) {
  const Component = componentMap[object.className];
  return Component ? <Component key={key} object={object} /> : null;
}
