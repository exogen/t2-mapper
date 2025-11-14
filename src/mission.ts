import parser from "@/generated/mission.cjs";
import { Quaternion, Vector3 } from "three";

const definitionComment = /^ (DisplayName|MissionTypes) = (.+)$/;
const sectionBeginComment = /^--- ([A-Z ]+) BEGIN ---$/;
const sectionEndComment = /^--- ([A-Z ]+) END ---$/;

function parseComment(text) {
  let match;
  match = text.match(sectionBeginComment);
  if (match) {
    return {
      type: "sectionBegin",
      name: match[1],
    };
  }
  match = text.match(sectionEndComment);
  if (match) {
    return {
      type: "sectionEnd",
      name: match[1],
    };
  }
  match = text.match(definitionComment);
  if (match) {
    return {
      type: "definition",
      identifier: match[1],
      value: match[2],
    };
  }
  return null;
}

function parseInstance(instance) {
  return {
    className: instance.className,
    instanceName: instance.instanceName,
    properties: instance.body
      .filter((def) => def.type === "definition")
      .map((def) => {
        switch (def.value.type) {
          case "string":
          case "number":
          case "boolean":
            return {
              target: def.target,
              value: def.value.value,
            };
          case "reference":
            return {
              target: def.target,
              value: def.value,
            };

          default:
            throw new Error(
              `Unhandled value type: ${def.target.name} = ${def.value.type}`
            );
        }
      }),
    children: instance.body
      .filter((def) => def.type === "instance")
      .map((def) => parseInstance(def)),
  };
}

export function parseMissionScript(script) {
  // Clean up the script:
  // - Remove code-like parts of the script so it's easier to parse.
  script = script.replace(
    /(\/\/--- OBJECT WRITE END ---\s+)(?:.|[\r\n])*$/,
    "$1"
  );

  let objectWriteBegin = /(\/\/--- OBJECT WRITE BEGIN ---\s+)/.exec(script);
  const firstSimGroup = /[\r\n]new SimGroup/.exec(script);
  script =
    script.slice(0, objectWriteBegin.index + objectWriteBegin[1].length) +
    script.slice(firstSimGroup.index);

  objectWriteBegin = /(\/\/--- OBJECT WRITE BEGIN ---\s+)/.exec(script);
  const missionStringEnd = /(\/\/--- MISSION STRING END ---\s+)/.exec(script);
  if (missionStringEnd) {
    script =
      script.slice(0, missionStringEnd.index + missionStringEnd[1].length) +
      script.slice(objectWriteBegin.index);
  }

  // console.log(script);
  const doc = parser.parse(script);

  let section = { name: null, definitions: [] };
  const mission: {
    pragma: Record<string, string>;
    sections: Array<{ name: string | null; definitions: any[] }>;
  } = {
    pragma: {},
    sections: [],
  };

  for (const statement of doc) {
    switch (statement.type) {
      case "comment": {
        const parsed = parseComment(statement.text);
        if (parsed) {
          switch (parsed.type) {
            case "definition": {
              if (section.name) {
                section.definitions.push(statement);
              } else {
                mission.pragma[parsed.identifier] = parsed.value;
              }
              break;
            }
            case "sectionEnd": {
              if (parsed.name !== section.name) {
                throw new Error("Ending unmatched section!");
              }
              if (section.name || section.definitions.length) {
                mission.sections.push(section);
              }
              section = { name: null, definitions: [] };
              break;
            }
            case "sectionBegin": {
              if (section.name) {
                throw new Error("Already in a section!");
              }
              if (section.name || section.definitions.length) {
                mission.sections.push(section);
              }
              section = { name: parsed.name, definitions: [] };
              break;
            }
          }
        } else {
          section.definitions.push(statement);
        }
        break;
      }
      default: {
        section.definitions.push(statement);
      }
    }
  }

  if (section.name || section.definitions.length) {
    mission.sections.push(section);
  }

  return {
    displayName: mission.pragma.DisplayName ?? null,
    missionTypes: mission.pragma.MissionTypes?.split(" ") ?? [],
    missionQuote:
      mission.sections
        .find((section) => section.name === "MISSION QUOTE")
        ?.definitions.filter((def) => def.type === "comment")
        .map((def) => def.text)
        .join("\n") ?? null,
    missionString:
      mission.sections
        .find((section) => section.name === "MISSION STRING")
        ?.definitions.filter((def) => def.type === "comment")
        .map((def) => def.text)
        .join("\n") ?? null,
    objects: mission.sections
      .find((section) => section.name === "OBJECT WRITE")
      ?.definitions.filter((def) => def.type === "instance")
      .map((def) => parseInstance(def)),
    globals: mission.sections
      .filter((section) => !section.name)
      .flatMap((section) =>
        section.definitions.filter((def) => def.type === "definition")
      ),
  };
}

export type Mission = ReturnType<typeof parseMissionScript>;
export type ConsoleObject = Mission["objects"][number];

export function* iterObjects(objectList) {
  for (const obj of objectList) {
    yield obj;
    for (const child of iterObjects(obj.children)) {
      yield child;
    }
  }
}

export function getTerrainBlock(mission: Mission): ConsoleObject {
  for (const obj of iterObjects(mission.objects)) {
    if (obj.className === "TerrainBlock") {
      return obj;
    }
  }
  throw new Error("No TerrainBlock found!");
}

export function getTerrainFile(mission: Mission) {
  const terrainBlock = getTerrainBlock(mission);
  return terrainBlock.properties.find(
    (prop) => prop.target.name === "terrainFile"
  ).value;
}

export function getProperty(obj: ConsoleObject, name: string) {
  const property = obj.properties.find((p) => p.target.name === name);
  // console.log({ name, property });
  return property;
}

export function getPosition(obj: ConsoleObject): [number, number, number] {
  const position = getProperty(obj, "position")?.value ?? "0 0 0";
  const [x, z, y] = position.split(" ").map((s) => parseFloat(s));
  return [x, y, z];
}

export function getScale(obj: ConsoleObject): [number, number, number] {
  const scale = getProperty(obj, "scale")?.value ?? "1 1 1";
  const [scaleX, scaleZ, scaleY] = scale.split(" ").map((s) => parseFloat(s));
  return [scaleX, scaleY, scaleZ];
}

export function getRotation(obj: ConsoleObject, isInterior = false) {
  const rotation = getProperty(obj, "rotation")?.value ?? "1 0 0 0";
  const [ax, az, ay, angle] = rotation.split(" ").map((s) => parseFloat(s));

  if (isInterior) {
    // For interiors: Apply coordinate system transformation
    // 1. Convert rotation axis from source coords (ax, az, ay) to Three.js coords
    // 2. Apply -90 Y rotation to align coordinate systems
    const sourceRotation = new Quaternion().setFromAxisAngle(
      new Vector3(az, ay, ax),
      -angle * (Math.PI / 180)
    );
    const coordSystemFix = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.PI / 2
    );
    return coordSystemFix.multiply(sourceRotation);
  } else {
    // For other objects (terrain, etc)
    return new Quaternion().setFromAxisAngle(
      new Vector3(ax, ay, -az),
      angle * (Math.PI / 180)
    );
  }
}
