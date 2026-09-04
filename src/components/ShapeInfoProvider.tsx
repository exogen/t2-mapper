import { createContext, ReactNode, useContext, useMemo } from "react";
import { TorqueObject } from "../torqueScript";
import { isOrganicShape } from "../organicShapes";

export type StaticShapeType = "TSStatic" | "StaticShape" | "Item" | "Turret";

// isOrganicShape moved to ../organicShapes so Node-side code (the
// collider policy) can use it without importing a React component.

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
