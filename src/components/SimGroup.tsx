import { ConsoleObject } from "../mission";
import { renderObject } from "./renderObject";

export function SimGroup({ object }: { object: ConsoleObject }) {
  return object.children.map((child, i) => renderObject(child, i));
}
