import fs from "node:fs/promises";
import { iterObjects, parseMissionScript } from "@/src/mission";
import { parseArgs } from "node:util";
import { basename } from "node:path";

/**
 * For all missions, log all the property values matching the given filters.
 *
 * --types, -t: Comma-separatated list of object class names.
 * --properties, -p: Comma-separated list of property names.
 * --values: Whether to log ONLY the values (and not mission and class name).
 *
 * Example:
 *
 * tsx scripts/mission-properties.ts -t TerrainBlock -p position
 */
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    types: {
      type: "string",
      short: "t",
    },
    properties: {
      type: "string",
      short: "p",
    },
    values: {
      type: "boolean",
    },
  },
});

const typeList =
  !values.types || values.types === "*"
    ? null
    : new Set(values.types.split(","));

const propertyList =
  !values.properties || values.properties === "*"
    ? null
    : new Set(values.properties.split(","));

async function run({
  typeList,
  propertyList,
  valuesOnly,
}: {
  typeList: Set<string> | null;
  propertyList: Set<string> | null;
  valuesOnly: boolean;
}) {
  for await (const inFile of fs.glob("docs/base/**/*.mis")) {
    const baseName = basename(inFile);
    const missionScript = await fs.readFile(inFile, "utf8");
    const mission = parseMissionScript(missionScript);
    for (const consoleObject of iterObjects(mission.objects)) {
      if (!typeList || typeList.has(consoleObject.className)) {
        for (const property of consoleObject.properties) {
          if (!propertyList || propertyList.has(property.target.name)) {
            if (valuesOnly) {
              console.log(property.value);
            } else {
              console.log(
                `${baseName} > ${consoleObject.className} > ${property.target.name} = ${property.value}`,
              );
            }
          }
        }
      }
    }
  }
}

run({ typeList, propertyList, valuesOnly: values.values });
