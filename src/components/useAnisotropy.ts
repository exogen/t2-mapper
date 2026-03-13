import { useThree } from "@react-three/fiber";

export function useAnisotropy(): number {
  return useThree((s) => s.gl.capabilities.getMaxAnisotropy());
}
