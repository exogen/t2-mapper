/** TargetInfoEvent string fields: omitted = unchanged, 0x400 = empty. */
export function updateTargetString(
  netStrings: ReadonlyMap<number, string>,
  values: Map<number, string>,
  pending: Map<number, number>,
  targetId: number,
  tag: number | undefined,
): void {
  if (tag == null) return;
  pending.delete(targetId);
  const value = tag === 0x400 ? "" : netStrings.get(tag);
  if (value != null) values.set(targetId, value);
  else {
    values.delete(targetId);
    pending.set(targetId, tag);
  }
}

export function resolvePendingTargetStrings(
  values: Map<number, string>,
  pending: Map<number, number>,
  id: number,
  value: string,
  onResolved?: (targetId: number) => void,
): void {
  for (const [targetId, tag] of pending) {
    if (tag !== id) continue;
    pending.delete(targetId);
    values.set(targetId, value);
    onResolved?.(targetId);
  }
}
