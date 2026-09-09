import { createContext, ReactNode, useContext, useMemo } from "react";
import { TorqueObject } from "../torqueScript";

export type StaticShapeType = "TSStatic" | "StaticShape" | "Item" | "Turret";

interface ShapeInfoContextValue {
  object?: TorqueObject;
  shapeName: string;
  type: StaticShapeType;
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
  const context = useMemo(
    () => ({
      object,
      shapeName,
      type,
    }),
    [object, shapeName, type],
  );

  return (
    <ShapeInfoContext.Provider value={context}>
      {children}
    </ShapeInfoContext.Provider>
  );
}
