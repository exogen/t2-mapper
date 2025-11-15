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

const dataBlockToShapeName = {
  Banner_Honor: "banner_honor.dts",
  Banner_Strength: "banner_strength.dts",
  Banner_Unity: "banner_unity.dts",
  CreativityPad: "station_teleport.dts",
  ExteriorFlagStand: "ext_flagstand.dts",
  FlipFlop: "switch.dts",
  GeneratorLarge: "station_generator_large.dts",
  InteriorFlagStand: "int_flagstand.dts",
  LightMaleHuman_Dead: "light_male_dead.dts",
  LogoProjector: "teamlogo_projector.dts",
  SensorLargePulse: "sensor_pulse_large.dts",
  SensorMediumPulse: "sensor_pulse_medium.dts",
  SolarPanel: "solarpanel.dts",
  StaticShape: "switch.dts",
  StationInventory: "station_inv_human.dts",
  StationVehicle: "vehicle_pad_station.dts",
  StationVehiclePad: "vehicle_pad.dts",
  Teleporter: "nexusbase.dts",
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

export function StaticShape({ object }: { object: ConsoleObject }) {
  const dataBlock = getProperty(object, "dataBlock").value;

  const [z, y, x] = useMemo(() => getPosition(object), [object]);
  const [scaleX, scaleY, scaleZ] = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object, true), [object]);

  const shapeName = getDataBlockShape(dataBlock);

  if (!shapeName) {
    console.error(`<StaticShape> missing shape for dataBlock: ${dataBlock}`);
  }

  return (
    <group
      quaternion={q}
      position={[x - 1024, y, z - 1024]}
      scale={[-scaleX, scaleY, scaleZ]}
    >
      {shapeName ? (
        <ErrorBoundary fallback={<ShapePlaceholder color="red" />}>
          <Suspense fallback={<ShapePlaceholder color="yellow" />}>
            <ShapeModel shapeName={shapeName} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <ShapePlaceholder color="orange" />
      )}
    </group>
  );
}
