import { createContext, ReactNode, useContext, useMemo } from "react";

export type StaticShapeType = "TSStatic" | "StaticShape" | "Item" | "Turret";

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
  const context = useMemo(() => ({ shapeName, type }), [shapeName, type]);

  return (
    <ShapeInfoContext.Provider value={context}>
      {children}
    </ShapeInfoContext.Provider>
  );
}
