import { createContext, ReactNode, useContext, useMemo } from "react";

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

const ShapeInfoContext = createContext(null);

export function useShapeInfo() {
  return useContext(ShapeInfoContext);
}

export function ShapeInfoProvider({
  children,
  shapeName,
  type,
}: {
  children: ReactNode;
  shapeName: string;
  type: StaticShapeType;
}) {
  const isOrganic = useMemo(() => isOrganicShape(shapeName), [shapeName]);
  const context = useMemo(
    () => ({ shapeName, type, isOrganic }),
    [shapeName, type, isOrganic],
  );

  return (
    <ShapeInfoContext.Provider value={context}>
      {children}
    </ShapeInfoContext.Provider>
  );
}
