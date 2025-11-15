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
  AmmoPack: "pack_upgrade_ammo.dts",
  ChaingunAmmo: "ammo_chaingun.dts",
  CloakingPack: "pack_upgrade_cloaking.dts",
  DiscAmmo: "ammo_disc.dts",
  ELFGun: "weapon_elf.dts",
  EnergyPack: "pack_upgrade_energy.dts",
  Flag: "flag.dts",
  GrenadeLauncher: "weapon_grenade_launcher.dts",
  GrenadeLauncherAmmo: "ammo_grenade.dts",
  InventoryDeployable: "pack_deploy_inventory.dts",
  Plasma: "weapon_plasma.dts",
  PlasmaAmmo: "ammo_plasma.dts",
  RepairKit: "repair_kit.dts",
  RepairPack: "pack_upgrade_repair.dts",
  RepairPatch: "repair_patch.dts",
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
      })
    );
  }
  return _caseInsensitiveLookup[dataBlock.toLowerCase()];
}

export function Item({ object }: { object: ConsoleObject }) {
  const dataBlock = getProperty(object, "dataBlock").value;

  const [z, y, x] = useMemo(() => getPosition(object), [object]);
  const [scaleX, scaleY, scaleZ] = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object, true), [object]);

  const shapeName = getDataBlockShape(dataBlock);

  if (!shapeName) {
    console.error(`<Item> missing shape for dataBlock: ${dataBlock}`);
  }

  return (
    <group
      quaternion={q}
      position={[x - 1024, y, z - 1024]}
      scale={[-scaleX, scaleY, -scaleZ]}
    >
      {shapeName ? (
        <ErrorBoundary fallback={<ShapePlaceholder color="red" />}>
          <Suspense fallback={<ShapePlaceholder color="pink" />}>
            <ShapeModel shapeName={shapeName} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <ShapePlaceholder color="orange" />
      )}
    </group>
  );
}
