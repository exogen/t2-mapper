import type { Texture } from "three";
import { markTextureSamplerUpdate } from "../textureUtils";

type BitmapSource = Texture["source"];

interface Registration {
  source: BitmapSource;
  texture: WeakRef<Texture>;
  dispose: () => void;
}

// A cached model may retain a failed Source, but must not keep dead view
// samplers alive. Normal disposal unlinks immediately; weak ownership also
// permits garbage collection when a caller omits explicit texture disposal.
const sources = new WeakMap<BitmapSource, Set<Registration>>();
const textures = new WeakMap<Texture, Registration>();

function release(registration: Registration): void {
  const texture = registration.texture.deref();
  texture?.removeEventListener("dispose", registration.dispose);
  if (texture && textures.get(texture) === registration)
    textures.delete(texture);
  const group = sources.get(registration.source);
  group?.delete(registration);
  if (!group?.size) sources.delete(registration.source);
}

/** Track only failed independent samplers, until recovery or disposal. */
export function observeFailedBitmapTexture(texture: Texture): void {
  const previous = textures.get(texture);
  if (previous) release(previous);
  if (texture.image) return;
  const source = texture.source;
  let group = sources.get(source);
  if (!group) sources.set(source, (group = new Set()));
  // Bound stale registration metadata across repeated failed spawns, without
  // requiring a finalizer or keeping their textures alive until another retry.
  if (group.size % 64 === 0)
    for (const registration of group)
      if (!registration.texture.deref()) release(registration);
  const registration: Registration = {
    source,
    texture: new WeakRef(texture),
    dispose: () => release(registration),
  };
  // Pruning may have removed the previous last registration's map entry.
  sources.set(source, group);
  group.add(registration);
  textures.set(texture, registration);
  texture.addEventListener("dispose", registration.dispose);
}

/** Repair a known failed model Source without a URL registry or scene walk.
 * Updating Source.data alone is insufficient: empty view samplers still have
 * texture.version === 0 and Three will not upload them. */
export function repairBitmapSource(
  source: BitmapSource,
  loaded: Texture,
): void {
  source.data = loaded.image;
  source.needsUpdate = true;
  const group = sources.get(source);
  if (!group) return;
  for (const registration of group) {
    const texture = registration.texture.deref();
    release(registration);
    // Preserve samplers retargeted to a skin/fallback since the failed load.
    if (!texture || texture.source !== source) continue;
    texture.source = loaded.source;
    markTextureSamplerUpdate(texture);
  }
}
