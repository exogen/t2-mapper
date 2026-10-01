/** Portable graph encoding: checkpoints share data and contain Maps and undefined. */
type Value =
  null | boolean | string | number | { ref: number } | { special: string };
type Node = { type: string; value: unknown };
interface Graph {
  root: Value;
  nodes: Node[];
}

export function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export function encodeCheckpoint(value: unknown): string {
  const nodes: Node[] = [];
  const seen = new Map<object, number>();
  function encode(value: unknown): Value {
    if (value === undefined) return { special: "undefined" };
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) || Object.is(value, -0))
    )
      return { special: String(value === 0 ? "-0" : value) };
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      typeof value === "number"
    )
      return value;
    if (typeof value !== "object")
      throw new Error("Unsupported checkpoint value");
    const previous = seen.get(value);
    if (previous !== undefined) return { ref: previous };
    const ref = nodes.length;
    seen.set(value, ref);
    const node: Node = { type: "object", value: null };
    nodes.push(node);
    if (value instanceof Map) {
      node.type = "map";
      node.value = [...value].map(([key, item]) => [encode(key), encode(item)]);
    } else if (value instanceof Set) {
      node.type = "set";
      node.value = [...value].map(encode);
    } else if (Array.isArray(value)) {
      node.type = "array";
      node.value = Array.from(value, encode);
    } else if (ArrayBuffer.isView(value)) {
      node.type = value.constructor.name;
      node.value = bytesToBase64(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      );
    } else if (value instanceof ArrayBuffer) {
      node.type = "ArrayBuffer";
      node.value = bytesToBase64(new Uint8Array(value));
    } else {
      node.value = Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, encode(item)]),
      );
    }
    return { ref };
  }
  return JSON.stringify({ root: encode(value), nodes } satisfies Graph);
}

export function decodeCheckpoint(text: string): unknown {
  const graph = JSON.parse(text) as Graph;
  if (!Array.isArray(graph.nodes)) throw new Error("Invalid checkpoint graph");
  const typed = {
    Uint8Array,
    Uint8ClampedArray,
    Int8Array,
    Uint16Array,
    Int16Array,
    Uint32Array,
    Int32Array,
    Float32Array,
    Float64Array,
  };
  const objects = graph.nodes.map((node) => {
    switch (node.type) {
      case "object":
        return {};
      case "array":
        return [];
      case "map":
        return new Map();
      case "set":
        return new Set();
      case "ArrayBuffer":
        return base64ToBytes(node.value as string).buffer;
      default: {
        if (!Object.hasOwn(typed, node.type))
          throw new Error("Invalid checkpoint node type");
        const Constructor = typed[node.type as keyof typeof typed];
        return new Constructor(base64ToBytes(node.value as string).buffer);
      }
    }
  });
  function decode(value: Value): unknown {
    if (value === null || typeof value !== "object") return value;
    if ("ref" in value) {
      if (
        !Number.isSafeInteger(value.ref) ||
        value.ref < 0 ||
        value.ref >= objects.length
      )
        throw new Error("Invalid checkpoint reference");
      return objects[value.ref];
    }
    switch (value.special) {
      case "undefined":
        return undefined;
      case "NaN":
        return NaN;
      case "Infinity":
        return Infinity;
      case "-Infinity":
        return -Infinity;
      case "-0":
        return -0;
      default:
        throw new Error("Invalid checkpoint value");
    }
  }
  graph.nodes.forEach((node, i) => {
    const object = objects[i];
    if (object instanceof Map)
      for (const [key, value] of node.value as [Value, Value][])
        object.set(decode(key), decode(value));
    else if (object instanceof Set)
      for (const value of node.value as Value[]) object.add(decode(value));
    else if (Array.isArray(object))
      for (const value of node.value as Value[]) object.push(decode(value));
    else if (node.type === "object")
      for (const [key, value] of Object.entries(
        node.value as Record<string, Value>,
      )) {
        Object.defineProperty(object, key, {
          value: decode(value),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
  });
  return decode(graph.root);
}

export async function decodeCompressedCheckpoint(
  base64: string,
): Promise<unknown> {
  const stream = new Blob([base64ToBytes(base64)])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return decodeCheckpoint(await new Response(stream).text());
}
