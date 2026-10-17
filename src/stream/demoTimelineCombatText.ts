import type { TimelineEvent } from "../state/demoTimelineStore";

const WEAPONS_PAST_TENSE: Record<string, string> = {
  chaingun: "chaingunned",
  elf: "ELFed",
  explosion: "exploded",
  impact: "ran over",
  plasma: "plasma rifled",
};

export function timelineKillVerb(weapon: string | undefined): string {
  if (!weapon) return "killed";
  const name = weapon.toLowerCase();
  return (
    WEAPONS_PAST_TENSE[name] ?? `${name}${name.endsWith("e") ? "d" : "ed"}`
  );
}

const TURRET_NAMES: Record<string, string> = {
  turret: "base turret",
  "aa turret": "AA turret",
  "elf turret": "ELF turret",
  "clamp turret": "indoor deployable turret",
  "spike turret": "outdoor deployable turret",
  "belly turret": "Havoc belly turret",
};

const PASSIVE_DAMAGE_ACTIONS: Record<string, string> = {
  blaster: "shot by a blaster",
  plasma: "shot by a plasma rifle",
  chaingun: "shot by a chaingun",
  disc: "hit by a disc",
  grenade: "hit by a grenade",
  laser: "shot by a laser rifle",
  elf: "killed by an ELF projector",
  mortar: "hit by a mortar",
  missile: "hit by a missile",
  shocklance: "killed by a shocklance",
  mine: "killed by a mine",
  impact: "run over by a vehicle",
  "shrike blaster": "shot by a Shrike",
  "bomber bomb": "hit by a bomber bomb",
  "tank chaingun": "shot by a tank chaingun",
  "tank mortar": "hit by a tank mortar",
  "satchel charge": "killed by a satchel charge",
  satchelcharge: "killed by a satchel charge",
  "mpb missile": "hit by an MPB missile",
  // The stock DamageTypeText table misspells lightning as "lighting".
  lighting: "struck by lightning",
  lightning: "struck by lightning",
  "nexus camping": "killed for camping at the Nexus",
};

const DAMAGE_ACTIONS: Record<string, string> = {
  ground: "cratered",
  "out of bounds": "died out of bounds",
  lava: "died in lava",
  crash: "died in a vehicle crash",
  explosion: "died in an explosion",
  forcefield: "died in a force field",
  suicide: "suicided",
};

type DeathDetails = Pick<
  TimelineEvent,
  "deathMessage" | "weapon" | "selfKill" | "victimPronoun"
>;

/** Sentence predicate shared by timeline labels and their named tooltips. */
export function timelineDeathAction(
  event: DeathDetails,
  isRecorder = false,
): string {
  const was = isRecorder ? "were" : "was";
  const weapon = event.weapon?.toLowerCase();
  switch (event.deathMessage) {
    case "msgsuicide":
      return "suicided";
    case "msgoobkill":
      return "died out of bounds";
    case "msglavakill":
      return "died in lava";
    case "msglightningkill":
      return `${was} struck by lightning`;
    case "msgcampkill":
      return `${was} killed for camping at the Nexus`;
    case "msgvehiclecrash":
      return "died in a vehicle crash";
    case "msgvehiclespawnkill":
      return weapon === "forcefield"
        ? `${was} caught in a force field`
        : `${was} in a vehicle spawn field`;
  }

  const turret = weapon
    ? (TURRET_NAMES[weapon] ??
      (weapon.endsWith(" turret") ? weapon : undefined))
    : ["msgturretkill", "msgcturretkill", "msgturretselfkill"].includes(
          event.deathMessage ?? "",
        )
      ? "turret"
      : undefined;
  if (turret) {
    const possessive = isRecorder
      ? "your"
      : event.victimPronoun === "him"
        ? "his"
        : event.victimPronoun === "her"
          ? "her"
          : "their";
    const owner =
      event.selfKill || event.deathMessage === "msgturretselfkill"
        ? `${possessive} own`
        : /^[aeiou]/i.test(turret)
          ? "an"
          : "a";
    return `${was} shot by ${owner} ${turret}`;
  }
  if (event.selfKill) {
    const reflexive = isRecorder
      ? "yourself"
      : event.victimPronoun
        ? `${event.victimPronoun}self`
        : "themselves";
    return `${timelineKillVerb(event.weapon)} ${reflexive}`;
  }
  if (weapon && DAMAGE_ACTIONS[weapon]) return DAMAGE_ACTIONS[weapon];
  if (weapon && PASSIVE_DAMAGE_ACTIONS[weapon])
    return `${was} ${PASSIVE_DAMAGE_ACTIONS[weapon]}`;
  if (event.deathMessage === "msgexplosionkill") return "died in an explosion";
  if (event.deathMessage === "msgvehiclekill")
    return `${was} run over by a vehicle`;
  if (event.deathMessage === "msgrogueminekill")
    return `${was} killed by a mine`;
  return weapon && weapon !== "default"
    ? `died from ${event.weapon} damage`
    : "died";
}
