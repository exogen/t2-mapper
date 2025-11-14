import { ConsoleObject } from "@/src/mission";

export function WaterBlock({ object }: { object: ConsoleObject }) {
  return (
    <mesh>
      <boxGeometry />
      <meshStandardMaterial color="blue" transparent opacity={0.5} />
    </mesh>
  );
}
