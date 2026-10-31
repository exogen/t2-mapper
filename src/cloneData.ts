/**
 * structuredClone for plain data, with arrays rebuilt so arrays of numbers
 * keep unboxed (double) elements.
 *
 * V8 deserializes every cloned array with generic, boxed elements. When one
 * reaches a three.js helper that also reads matrix elements (Vector3's
 * fromArray, say), optimized code converts those matrices to generic
 * elements too, and from there every matrix it touches: matrix math then
 * allocates a heap number per element write.
 */
export function cloneData<T>(value: T): T {
  return repack(structuredClone(value), new Map()) as T;
}

const same = (item: unknown) => item;
const isObject = (item: unknown): item is object =>
  typeof item === "object" && item !== null;

function repack(value: unknown, seen: Map<object, unknown>): unknown {
  if (typeof value !== "object" || value === null) return value;
  const known = seen.get(value);
  if (known !== undefined) return known;
  if (Array.isArray(value)) {
    // Array.from with a map function gives the copy the narrowest elements
    // kind for its values. Only arrays holding objects are walked here: a
    // JS access site that sees both double and generic arrays makes
    // optimized code convert the double ones to generic.
    const array = Array.from(value, same);
    seen.set(value, array);
    if (value.some(isObject))
      for (let i = 0; i < array.length; i++)
        if (isObject(array[i])) array[i] = repack(array[i], seen);
    return array;
  }
  seen.set(value, value);
  if (value instanceof Map) {
    for (const [key, item] of value) value.set(key, repack(item, seen));
  } else if (value instanceof Set) {
    const items = [...value];
    value.clear();
    for (const item of items) value.add(repack(item, seen));
  } else if (Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    for (const key in record) record[key] = repack(record[key], seen);
  }
  return value;
}
