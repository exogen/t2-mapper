import { Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  ConsoleObject,
  getPosition,
  getProperty,
  getRotation,
  getScale,
} from "../mission";
import { ShapeModel, ShapePlaceholder } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";

const dataBlockToShapeName = {
  AABarrelLarge: "turret_aa_large.dts",
  ELFBarrelLarge: "turret_elf_large.dts",
  MissileBarrelLarge: "turret_missile_large.dts",
  MortarBarrelLarge: "turret_mortar_large.dts",
  PlasmaBarrelLarge: "turret_fusion_large.dts",
  SentryTurret: "turret_sentry.dts",
  TurretBaseLarge: "turret_base_large.dts",
  SentryTurretBarrel: "turret_muzzlepoint.dts",
};

let _caseInsensitiveLookup: Record<string, string>;

function getDataBlockShape(dataBlock: string) {
  if (!_caseInsensitiveLookup) {
    _caseInsensitiveLookup = Object.fromEntries(
      Object.entries(dataBlockToShapeName).map(([key, value]) => {
        return [key.toLowerCase(), value];
      })
    );
  }
  return _caseInsensitiveLookup[dataBlock.toLowerCase()];
}

export function Turret({ object }: { object: ConsoleObject }) {
  const dataBlock = getProperty(object, "dataBlock").value;
  const initialBarrel = getProperty(object, "initialBarrel").value;

  const position = useMemo(() => getPosition(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);

  const shapeName = getDataBlockShape(dataBlock);
  const barrelShapeName = getDataBlockShape(initialBarrel);

  if (!shapeName) {
    console.error(`<Turret> missing shape for dataBlock: ${dataBlock}`);
  }
  if (!barrelShapeName) {
    console.error(
      `<Turret> missing shape for initialBarrel dataBlock: ${initialBarrel}`
    );
  }

  return (
    <ShapeInfoProvider shapeName={shapeName} type="Turret">
      <group position={position} quaternion={q} scale={scale}>
        {shapeName ? (
          <ErrorBoundary fallback={<ShapePlaceholder color="red" />}>
            <Suspense fallback={<ShapePlaceholder color="yellow" />}>
              <ShapeModel />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <ShapePlaceholder color="orange" />
        )}
        <ShapeInfoProvider shapeName={barrelShapeName} type="Turret">
          <group position={[0, 1.5, 0]}>
            {barrelShapeName ? (
              <ErrorBoundary fallback={<ShapePlaceholder color="red" />}>
                <Suspense fallback={<ShapePlaceholder color="yellow" />}>
                  <ShapeModel />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <ShapePlaceholder color="orange" />
            )}
          </group>
        </ShapeInfoProvider>
      </group>
    </ShapeInfoProvider>
  );
}
