import { Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { DebugPlaceholder, ShapeModel, ShapePlaceholder } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import { useSimGroup } from "./SimGroup";
import { FloatingLabel } from "./FloatingLabel";

const dataBlockToShapeName = {
  AmmoPack: "pack_upgrade_ammo.dts",
  Beacon: "beacon.dts",
  Chaingun: "weapon_chaingun.dts",
  ChaingunAmmo: "ammo_chaingun.dts",
  CloakingPack: "pack_upgrade_cloaking.dts",
  ConcussionGrenade: "grenade.dts",
  DiscAmmo: "ammo_disc.dts",
  ELFGun: "weapon_elf.dts",
  EnergyPack: "pack_upgrade_energy.dts",
  Flag: "flag.dts",
  FlareGrenade: "grenade.dts",
  Grenade: "grenade.dts",
  GrenadeLauncher: "weapon_grenade_launcher.dts",
  GrenadeLauncherAmmo: "ammo_grenade.dts",
  InventoryDeployable: "pack_deploy_inventory.dts",
  Mine: "ammo_mine.dts",
  MotionSensorDeployable: "pack_deploy_sensor_motion.dts",
  Plasma: "weapon_plasma.dts",
  PlasmaAmmo: "ammo_plasma.dts",
  PulseSensorDeployable: "pack_deploy_sensor_pulse.dts",
  RepairKit: "repair_kit.dts",
  RepairPack: "pack_upgrade_repair.dts",
  RepairPatch: "repair_patch.dts",
  SatchelCharge: "pack_upgrade_satchel.dts",
  SensorJammerPack: "pack_upgrade_sensorjammer.dts",
  ShieldPack: "pack_upgrade_shield.dts",
  ShockLance: "weapon_shocklance.dts",
  SniperRifle: "weapon_sniper.dts",
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

const TEAM_NAMES = {
  1: "Storm",
  2: "Inferno",
};

export function Item({ object }: { object: TorqueObject }) {
  const simGroup = useSimGroup();
  const dataBlock = getProperty(object, "dataBlock") ?? "";

  const position = useMemo(() => getPosition(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);

  const shapeName = getDataBlockShape(dataBlock);

  if (!shapeName) {
    console.error(`<Item> missing shape for dataBlock: ${dataBlock}`);
  }

  const isFlag = dataBlock?.toLowerCase() === "flag";
  const team = simGroup?.team ?? null;
  const teamName = team > 0 ? TEAM_NAMES[team] : null;
  const label = isFlag && teamName ? `${teamName} Flag` : null;

  return (
    <ShapeInfoProvider shapeName={shapeName} type="Item">
      <group position={position} quaternion={q} scale={scale}>
        {shapeName ? (
          <ErrorBoundary fallback={<DebugPlaceholder color="red" />}>
            <Suspense fallback={<ShapePlaceholder color="pink" />}>
              <ShapeModel />
              {label ? (
                <FloatingLabel opacity={0.6}>{label}</FloatingLabel>
              ) : null}
            </Suspense>
          </ErrorBoundary>
        ) : (
          <DebugPlaceholder color="orange" />
        )}
      </group>
    </ShapeInfoProvider>
  );
}
