import { Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  ConsoleObject,
  getPosition,
  getProperty,
  getRotation,
  getScale,
} from "../mission";
import { DebugPlaceholder, ShapeModel, ShapePlaceholder } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";

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
      }),
    );
  }
  return _caseInsensitiveLookup[dataBlock.toLowerCase()];
}

export function StaticShape({ object }: { object: ConsoleObject }) {
  const dataBlock = getProperty(object, "dataBlock").value;

  const position = useMemo(() => getPosition(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);

  const shapeName = getDataBlockShape(dataBlock);

  if (!shapeName) {
    console.error(`<StaticShape> missing shape for dataBlock: ${dataBlock}`);
  }

  return (
    <ShapeInfoProvider shapeName={shapeName} type="StaticShape">
      <group position={position} quaternion={q} scale={scale}>
        {shapeName ? (
          <ErrorBoundary fallback={<DebugPlaceholder color="red" />}>
            <Suspense fallback={<ShapePlaceholder color="yellow" />}>
              <ShapeModel />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <DebugPlaceholder color="orange" />
        )}
      </group>
    </ShapeInfoProvider>
  );
}
