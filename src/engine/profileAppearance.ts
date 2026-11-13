import type { T2ProfileView } from "../../relay/accountTypes";
import type { DTSImageOffset } from "../dts/dtsMount";
import { getUrlForPath } from "../loaders";
import { getImageMountOffset } from "../stream/imageMount";
import type { Expression } from "../torqueScript/ast";
import { parse } from "../torqueScript/parser";

export type ProfileAppearanceInput = Pick<
  T2ProfileView,
  "bodyType" | "skin" | "armor" | "pack" | "weapon"
>;

export interface ProfileImageAppearance {
  shapeName: string;
  mountPoint: number;
  mountOffset?: DTSImageOffset;
  emap: boolean;
  /** The image's resting state sequence, when it has one. */
  sequence?: string;
  /** Completed before the resting state, which can retain this pose. */
  activationSequence?: string;
}

export interface ProfileAppearance {
  shapeName: string;
  sequences: string[];
  emap: boolean;
  armAction: string;
  images: ProfileImageAppearance[];
}

/** Script locations only: poses, offsets and mount points come from the game. */
const IMAGE_SCRIPTS: Record<string, string> = {
  weapon_disc: "weapons/disc.cs",
  weapon_chaingun: "weapons/chaingun.cs",
  weapon_energy: "weapons/blaster.cs",
  weapon_plasma: "weapons/plasma.cs",
  weapon_grenade_launcher: "weapons/grenadeLauncher.cs",
  weapon_sniper: "weapons/sniperRifle.cs",
  weapon_elf: "weapons/ELFGun.cs",
  weapon_mortar: "weapons/mortar.cs",
  weapon_missile: "weapons/missileLauncher.cs",
  weapon_shocklance: "weapons/shockLance.cs",
  weapon_targeting: "weapons/targetingLaser.cs",
  weapon_repair: "packs/repairpack.cs",
  pack_upgrade_energy: "packs/energypack.cs",
  pack_upgrade_repair: "packs/repairpack.cs",
  pack_upgrade_shield: "packs/shieldpack.cs",
  pack_upgrade_cloaking: "packs/cloakingpack.cs",
  pack_upgrade_sensorjammer: "packs/sensorjammerpack.cs",
  pack_upgrade_ammo: "packs/ammopack.cs",
  pack_upgrade_satchel: "packs/satchelCharge.cs",
  pack_deploy_sensor_motion: "deployables.cs",
  pack_deploy_sensor_pulse: "deployables.cs",
  pack_deploy_inventory: "deployables.cs",
  pack_deploy_turreto: "deployables.cs",
  pack_deploy_turreti: "deployables.cs",
  pack_barrel_elf: "packs/ELFbarrelPack.cs",
  pack_barrel_mortar: "packs/mortarBarrelPack.cs",
  pack_barrel_fusion: "packs/plasmabarrelPack.cs",
  pack_barrel_aa: "packs/aabarrelPack.cs",
  pack_barrel_missile: "packs/missilebarrelPack.cs",
};

type Literal = string | number | boolean;
interface ProfileDataBlock {
  className: string;
  fields: Record<string, Literal>;
}

const scripts = new Map<string, Promise<ProfileDataBlock[]>>();

function literal(expression: Expression): Literal | undefined {
  switch (expression.type) {
    case "StringLiteral":
    case "NumberLiteral":
    case "BooleanLiteral":
      return expression.value;
    case "Identifier":
      return expression.name;
    case "UnaryExpression": {
      const value = literal(expression.argument);
      if (typeof value === "number" && expression.operator === "-")
        return -value;
      return undefined;
    }
    default:
      return undefined;
  }
}

/** Read declarations without executing functions, schedules, or script execs. */
async function loadDataBlocks(path: string): Promise<ProfileDataBlock[]> {
  let pending = scripts.get(path);
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch(getUrlForPath(`scripts/${path}`), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`Could not load profile appearance script: ${path}`);
    const ast = parse(await response.text(), { filename: path });
    const named = new Map<string, ProfileDataBlock>();
    for (const statement of ast.body) {
      if (statement.type !== "DatablockDeclaration") continue;
      const fields: Record<string, Literal> = {
        ...named.get(statement.parent?.name.toLowerCase() ?? "")?.fields,
      };
      for (const assignment of statement.body) {
        if (assignment.type !== "Assignment") continue;
        const target = assignment.target;
        let key: string | undefined;
        if (target.type === "Identifier") key = target.name;
        else if (
          target.object.type === "Identifier" &&
          !Array.isArray(target.index)
        ) {
          const index = literal(target.index);
          if (index !== undefined) key = `${target.object.name}[${index}]`;
        }
        const value = literal(assignment.value);
        if (key !== undefined && value !== undefined)
          fields[key.toLowerCase()] = value;
      }
      named.set(statement.instanceName?.name.toLowerCase() ?? "", {
        className: statement.className.name.toLowerCase(),
        fields,
      });
    }
    return [...named.values()];
  })();
  scripts.set(path, pending);
  void pending.catch(() => {
    if (scripts.get(path) === pending) scripts.delete(path);
  });
  return pending;
}

function shapeId(shape: string): string {
  return shape
    .toLowerCase()
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/\.dts$/, "");
}

/** Heavy human women use the same shape as heavy human men. */
export function profileArmorShape(
  profile: Pick<T2ProfileView, "armor" | "bodyType">,
): string {
  const armor = profile.armor?.toLowerCase() ?? "light";
  if (!["light", "medium", "heavy"].includes(armor))
    return `${shapeId(armor)}.dts`;
  if (profile.bodyType === "bioderm") return `bioderm_${armor}.dts`;
  const gender = armor === "heavy" ? "male" : (profile.bodyType ?? "male");
  return `${armor}_${gender}.dts`;
}

function findShape(
  blocks: ProfileDataBlock[],
  className: string,
  shape: string,
): ProfileDataBlock | undefined {
  return blocks.find(
    (block) =>
      block.className === className &&
      typeof block.fields.shapefile === "string" &&
      shapeId(block.fields.shapefile) === shapeId(shape),
  );
}

async function imageAppearance(
  shape: string,
  defaultMount: number,
): Promise<{ image: ProfileImageAppearance; armAction?: string }> {
  const stem = shapeId(shape);
  const path = IMAGE_SCRIPTS[stem];
  const fields = path
    ? findShape(
        await loadDataBlocks(path).catch(() => []),
        "shapebaseimagedata",
        stem,
      )?.fields
    : undefined;
  // Unknown mod shapes still use their authored grip and the ordinary slot.
  const state = Object.entries(fields ?? {}).find(
    ([key, value]) =>
      /^statename\[\d+\]$/.test(key) &&
      typeof value === "string" &&
      /^(ready|idle|default)$/i.test(value),
  );
  const sequence = state
    ? fields?.[state[0].replace("statename", "statesequence")]
    : undefined;
  // Weapons start in Activate, or Preactivate before their loaded transition.
  // Packs that start Idle must not run the later, trigger-driven Activate state.
  const initialState = fields?.["statename[0]"];
  const activate =
    typeof initialState === "string" &&
    /^(activate|preactivate)$/i.test(initialState)
      ? Object.entries(fields ?? {}).find(
          ([key, value]) =>
            /^statename\[\d+\]$/.test(key) &&
            typeof value === "string" &&
            value.toLowerCase() === "activate",
        )
      : undefined;
  const activationSequence = activate
    ? fields?.[activate[0].replace("statename", "statesequence")]
    : undefined;
  return {
    image: {
      shapeName: `${stem}.dts`,
      mountPoint:
        typeof fields?.mountpoint === "number"
          ? fields.mountpoint
          : defaultMount,
      mountOffset: getImageMountOffset(fields),
      emap: fields?.emap === true,
      sequence: typeof sequence === "string" ? sequence : undefined,
      activationSequence:
        typeof activationSequence === "string" ? activationSequence : undefined,
    },
    armAction:
      typeof fields?.armthread === "string"
        ? fields.armthread.toLowerCase()
        : undefined,
  };
}

/** Resolve profile identifiers with the same stock datablocks the game uses. */
export async function resolveProfileAppearance(
  profile: ProfileAppearanceInput,
): Promise<ProfileAppearance> {
  const shapeName = profileArmorShape(profile);
  const stock =
    /^(?:(?:light|medium)_(?:male|female)|heavy_male|bioderm_(?:light|medium|heavy))\.dts$/.test(
      shapeName,
    );
  const [players, constructors, weapon, pack] = await Promise.all([
    loadDataBlocks("player.cs"),
    stock ? loadDataBlocks(`${shapeId(shapeName)}.cs`) : Promise.resolve([]),
    profile.weapon ? imageAppearance(profile.weapon, 0) : undefined,
    profile.pack ? imageAppearance(profile.pack, 1) : undefined,
  ]);
  const constructor = constructors.find(
    (block) =>
      block.className === "tsshapeconstructor" &&
      typeof block.fields.baseshape === "string" &&
      shapeId(block.fields.baseshape) === shapeId(shapeName),
  );
  const sequences = Object.entries(constructor?.fields ?? {})
    .filter(
      ([key, value]) => /^sequence\d+$/.test(key) && typeof value === "string",
    )
    .sort(([a], [b]) => Number(a.slice(8)) - Number(b.slice(8)))
    .map(([, value]) => value as string);
  return {
    shapeName,
    sequences,
    emap: findShape(players, "playerdata", shapeName)?.fields.emap === true,
    armAction: weapon?.armAction ?? "look",
    images: [weapon?.image, pack?.image].filter(
      (image): image is ProfileImageAppearance => image !== undefined,
    ),
  };
}
