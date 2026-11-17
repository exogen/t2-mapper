import { parse, type TorqueObject } from "./torqueScript";
import type * as AST from "./torqueScript/ast";
import { normalizedMissionTypes } from "./missionType";
export {
  lookupMissionType,
  normalizeMissionType,
  normalizedMissionTypes,
} from "./missionType";

// Patterns for extracting metadata from comments
const definitionComment =
  /^[ \t]*(DisplayName|MissionTypes|BriefingWAV|Bitmap|PlanetName)[ \t]*=[ \t]*(.+)$/i;
const sectionBeginComment = /^[ \t]*-+[ \t]*([A-Z ]+)[ \t]+BEGIN[ \t]*-+$/i;
const sectionEndComment = /^[ \t]*-+[ \t]*([A-Z ]+)[ \t]+END[ \t]*-+$/i;

interface CommentSection {
  name: string | null;
  comments: string[];
}

function parseCommentMarker(text: string) {
  let match;
  match = text.match(sectionBeginComment);
  if (match) {
    return { type: "sectionBegin" as const, name: match[1] };
  }
  match = text.match(sectionEndComment);
  if (match) {
    return { type: "sectionEnd" as const, name: match[1] };
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

function extractCommentMetadata(ast: AST.Program): {
  pragma: Record<string, string>;
  sections: CommentSection[];
} {
  const pragma: Record<string, string> = {};
  const sections: CommentSection[] = [];
  let currentSection: CommentSection = { name: null, comments: [] };

  // Walk through all items looking for comments
  function processItems(items: (AST.Statement | AST.Comment)[]) {
    for (const item of items) {
      if (item.type === "Comment") {
        const marker = parseCommentMarker(item.value);
        if (marker) {
          switch (marker.type) {
            case "definition":
              if (currentSection.name === null) {
                // Top-level definitions are pragma (normalize key to lowercase)
                pragma[marker.identifier.toLowerCase()] = marker.value;
              } else {
                currentSection.comments.push(item.value);
              }
              break;
            case "sectionBegin":
              // Save current section if it has content
              if (
                currentSection.name !== null ||
                currentSection.comments.length > 0
              ) {
                sections.push(currentSection);
              }
              // Normalize section name to uppercase for consistent lookups
              currentSection = {
                name: marker.name!.toUpperCase(),
                comments: [],
              };
              break;
            case "sectionEnd":
              if (currentSection.name !== null) {
                sections.push(currentSection);
              }
              currentSection = { name: null, comments: [] };
              break;
          }
        } else {
          // Regular comment
          currentSection.comments.push(item.value);
        }
      }
    }
  }

  processItems(ast.body as (AST.Statement | AST.Comment)[]);

  // Don't forget the last section
  if (currentSection.name !== null || currentSection.comments.length > 0) {
    sections.push(currentSection);
  }

  return { pragma, sections };
}

export function parseMissionScript(script: string): ParsedMission {
  // Parse the script to AST
  const ast = parse(script);

  // Extract comment metadata (pragma, sections) from AST
  const { pragma, sections } = extractCommentMetadata(ast);

  // Helper to extract section content
  function getSection(name: string): string | null {
    return (
      sections
        .find((s) => s.name === name)
        ?.comments.map((c) => c.trimStart())
        .join("\n") ?? null
    );
  }

  return {
    displayName: pragma.displayname ?? null,
    missionTypes:
      pragma.missiontypes
        ?.split(/\s+/)
        .filter(Boolean)
        .map(
          (name) =>
            (normalizedMissionTypes as Record<string, string>)[
              name.toLowerCase()
            ] ?? name,
        ) ?? [],
    missionBriefing: getSection("MISSION BRIEFING"),
    briefingWav: pragma.briefingwav ?? null,
    bitmap: pragma.bitmap ?? null,
    planetName: pragma.planetname ?? null,
    missionBlurb: getSection("MISSION BLURB"),
    missionQuote: getSection("MISSION QUOTE"),
    missionString: getSection("MISSION STRING"),
    execScriptPaths: ast.execScriptPaths,
    hasDynamicExec: ast.hasDynamicExec,
    ast,
  };
}

export interface ParsedMission {
  displayName: string | null;
  missionTypes: string[];
  missionBriefing: string | null;
  briefingWav: string | null;
  bitmap: string | null;
  planetName: string | null;
  missionBlurb: string | null;
  missionQuote: string | null;
  missionString: string | null;
  execScriptPaths: string[];
  hasDynamicExec: boolean;
  ast: AST.Program;
}

export function getProperty(obj: TorqueObject | undefined, name: string): any {
  if (!obj) return undefined;
  return obj[name.toLowerCase()];
}

export function getPosition(obj: TorqueObject): [number, number, number] {
  const position = obj.position ?? "0 0 0";
  const [x, y, z] = position.split(" ").map((s: string) => parseFloat(s));
  return [y || 0, z || 0, x || 0];
}

export function getScale(obj: TorqueObject): [number, number, number] {
  const scale = obj.scale ?? "1 1 1";
  const [sx, sy, sz] = scale.split(" ").map((s: string) => parseFloat(s));
  return [sy || 0, sz || 0, sx || 0];
}
