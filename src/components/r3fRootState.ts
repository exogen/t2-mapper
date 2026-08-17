import type { RootState } from "@react-three/fiber";

/**
 * Resolve the root store's state from a (possibly portaled) useFrame state.
 * R3F portal stores snapshot the root state when the portal is created and
 * never pick up later root-store changes (such as makeDefault camera
 * switches), and their `scene` is the portal container rather than the real
 * scene — so anything projecting world positions into screen space must
 * read the root store directly.
 */
export function resolveRootState(state: RootState): RootState {
  let rootState = state;
  while (rootState.previousRoot) {
    rootState = rootState.previousRoot.getState();
  }
  return rootState;
}
