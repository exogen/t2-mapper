import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { parse } from "@/src/torqueScript";
import type * as AST from "@/src/torqueScript/ast";

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
const { values } = parseArgs({
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

function getClassName(node: AST.Identifier | AST.Expression): string | null {
  if (node.type === "Identifier") {
    return node.name;
  }
  return null;
}

function getPropertyName(
  target: AST.Identifier | AST.IndexExpression,
): string | null {
  if (target.type === "Identifier") {
    return target.name;
  }
  // IndexExpression like foo[0] - get the base name
  if (
    target.type === "IndexExpression" &&
    target.object.type === "Identifier"
  ) {
    return target.object.name;
  }
  return null;
}

function expressionToString(expr: AST.Expression): string {
  switch (expr.type) {
    case "StringLiteral":
      return expr.value;
    case "NumberLiteral":
      return String(expr.value);
    case "BooleanLiteral":
      return String(expr.value);
    case "Identifier":
      return expr.name;
    case "Variable":
      return `${expr.scope === "global" ? "$" : "%"}${expr.name}`;
    case "BinaryExpression":
      return `${expressionToString(expr.left)} ${expr.operator} ${expressionToString(expr.right)}`;
    case "UnaryExpression":
      return `${expr.operator}${expressionToString(expr.argument)}`;
    default:
      return `[${expr.type}]`;
  }
}

interface ObjectInfo {
  className: string;
  properties: Array<{ name: string; value: string }>;
  children: ObjectInfo[];
}

function extractObject(node: AST.ObjectDeclaration): ObjectInfo | null {
  const className = getClassName(node.className);
  if (!className) return null;

  const properties: Array<{ name: string; value: string }> = [];
  const children: ObjectInfo[] = [];

  for (const item of node.body) {
    if (item.type === "Assignment") {
      const name = getPropertyName(item.target);
      if (name) {
        properties.push({
          name,
          value: expressionToString(item.value),
        });
      }
    } else if (item.type === "ObjectDeclaration") {
      const child = extractObject(item);
      if (child) {
        children.push(child);
      }
    }
  }

  return { className, properties, children };
}

function* walkObjects(ast: AST.Program): Generator<ObjectInfo> {
  function* walkStatements(statements: AST.Statement[]): Generator<ObjectInfo> {
    for (const stmt of statements) {
      if (stmt.type === "ObjectDeclaration") {
        const obj = extractObject(stmt);
        if (obj) {
          yield obj;
          yield* walkObjectTree(obj.children);
        }
      } else if (stmt.type === "ExpressionStatement") {
        // Check if expression is an ObjectDeclaration
        if (stmt.expression.type === "ObjectDeclaration") {
          const obj = extractObject(stmt.expression);
          if (obj) {
            yield obj;
            yield* walkObjectTree(obj.children);
          }
        }
      }
    }
  }

  function* walkObjectTree(objects: ObjectInfo[]): Generator<ObjectInfo> {
    for (const obj of objects) {
      yield obj;
      yield* walkObjectTree(obj.children);
    }
  }

  yield* walkStatements(ast.body);
}

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
    const baseName = path.basename(inFile);
    const missionScript = await fs.readFile(inFile, "utf8");

    let ast: AST.Program;
    try {
      ast = parse(missionScript);
    } catch (err) {
      console.error(`Failed to parse ${baseName}:`, err);
      continue;
    }

    for (const obj of walkObjects(ast)) {
      if (!typeList || typeList.has(obj.className)) {
        for (const property of obj.properties) {
          if (!propertyList || propertyList.has(property.name)) {
            if (valuesOnly) {
              console.log(property.value);
            } else {
              console.log(
                `${baseName} > ${obj.className} > ${property.name} = ${property.value}`,
              );
            }
          }
        }
      }
    }
  }
}

run({ typeList, propertyList, valuesOnly: values.values });
