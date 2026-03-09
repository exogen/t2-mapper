import { createContext, ReactNode, useContext, useMemo } from "react";
import { TorqueObject } from "../torqueScript";

export type StaticShapeType = "TSStatic" | "StaticShape" | "Item" | "Turret";

/**
 * Detect organic/vegetation shapes that use alpha for transparency.
 * These need special handling for materials and shadows.
 *
 * Pattern matches:
 * - borg/xorg/porg/dorg: Tribes 2 organic environment types
 * - plant/tree/bush/fern/vine/grass/leaf/flower: common vegetation names
 */
const ORGANIC_PATTERN =
  /borg|xorg|porg|dorg|plant|tree|bush|fern|vine|grass|leaf|flower|frond|palm|foliage/i;

export function isOrganicShape(shapeName: string): boolean {
  return ORGANIC_PATTERN.test(shapeName);
}

interface ShapeInfoContextValue {
  object?: TorqueObject;
  shapeName: string;
  type: StaticShapeType;
  isOrganic: boolean;
}

const ShapeInfoContext = createContext<ShapeInfoContextValue | null>(null);

export function useShapeInfo(): ShapeInfoContextValue {
  const context = useContext(ShapeInfoContext);
  if (!context) {
    throw new Error("useShapeInfo must be used within ShapeInfoProvider");
  }
  return context;
}

export function ShapeInfoProvider({
  children,
  object,
  shapeName,
  type,
}: {
  object?: TorqueObject;
  children: ReactNode;
  shapeName: string;
  type: StaticShapeType;
}) {
  const isOrganic = useMemo(() => isOrganicShape(shapeName), [shapeName]);

  const context = useMemo(
    () => ({
      object,
      shapeName,
      type,
      isOrganic,
    }),
    [object, shapeName, type, isOrganic],
  );

  return (
    <ShapeInfoContext.Provider value={context}>
      {children}
    </ShapeInfoContext.Provider>
  );
}
