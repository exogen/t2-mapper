import type { TorqueObject } from "./torqueScript/types";
import type { CaseInsensitiveMap } from "./torqueScript/utils";

/**
 * Normalizes a path string, but not as complicated as Node's `path.normalize`.
 * This simply changes all backslashes to `/` (regardless of platform) and
 * collapses any adjacent slashes to a single slash.
 */
export function normalizePath(pathString: string) {
  return pathString.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function formatPing(ms: number): string {
  return `${ms.toLocaleString()} ms`;
}

/** Default team names from serverDefaults.cs. */
export const DEFAULT_TEAM_NAMES: Record<number, string> = {
  1: "Storm",
  2: "Inferno",
  3: "Starwolf",
  4: "Diamond Sword",
  5: "Blood Eagle",
  6: "Phoenix",
};

/**
 * Default flag skin names per team from serverDefaults.cs ($Host::teamSkin).
 * Used by CTFGame::getTeamSkin() as fallback when custom skins are disabled.
 */
export const DEFAULT_FLAG_SKINS: Record<number, string> = {
  1: "base",
  2: "baseb",
  3: "swolf",
  4: "dsword",
  5: "beagle",
  6: "cotp",
};

/**
 * Replicates `GameBase::getGameName()` from gameBase.cs.
 * Combines targetNameTag and targetTypeTag from the datablock into a
 * display name like "Inventory Station", "Large Sensor", "Generator", etc.
 * Tag strings starting with "_" are ignored, matching the engine behavior.
 */
export function getGameName(
  object: TorqueObject,
  datablocks: CaseInsensitiveMap<TorqueObject>,
): string {
  let name = "";

  // TorqueObject stores all fields with lowercase keys.
  const dbName = object.datablock;
  const db = dbName ? datablocks.get(String(dbName)) : undefined;

  // nameTag on the instance overrides targetNameTag from the datablock.
  if (object.nametag != null && String(object.nametag) !== "") {
    name = String(object.nametag);
  } else if (db) {
    const nameTag = db.targetnametag != null ? String(db.targetnametag) : "";
    if (nameTag !== "" && !nameTag.startsWith("_")) {
      name = nameTag;
    }
  }

  // targetTypeTag is always appended from the datablock.
  if (db) {
    const typeTag = db.targettypetag != null ? String(db.targettypetag) : "";
    if (typeTag !== "" && !typeTag.startsWith("_")) {
      // Avoid duplication when nameTag matches typeTag (e.g. nameTag="Flag"
      // with targetTypeTag="Flag" would otherwise produce "Flag Flag").
      if (name !== "" && name.toLowerCase() !== typeTag.toLowerCase()) {
        return formatTaggedStrings(`${name} ${typeTag}`);
      }
      return formatTaggedStrings(typeTag);
    }
  }

  // Fallback for Item-class objects: use pickUpName from the datablock
  // (e.g. "a repair pack" → "Repair Pack").
  if (!name && db) {
    const pickUp = db.pickupname != null ? String(db.pickupname) : "";
    if (pickUp) {
      return titleCasePickUpName(pickUp);
    }
  }

  return formatTaggedStrings(name);
}

/**
 * Replace unresolved tagged string references (`\x01` + numeric ID) with a
 * readable placeholder. These appear in missions saved from a running server
 * where the original text was replaced by its string table ID.
 */
function formatTaggedStrings(s: string): string {
  return s.replace(/\x01(\d+)/g, "<#$1>");
}

/** Strip leading article ("a ", "an ", "some ") and title-case the rest. */
function titleCasePickUpName(raw: string): string {
  const stripped = raw.replace(/^(an?\s+|some\s+)/i, "");
  if (!stripped) return raw;
  return stripped
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
