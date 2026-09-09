import type { Camera, Group } from "three";
import type { ProjectileEntity } from "../../state/projectileEntities";

/** A reusable visual. The stream owns entity lifetime and motion. */
export interface ProjectileView<E extends ProjectileEntity = ProjectileEntity> {
  root: Group;
  reset(entity: E): void;
  animate?(entity: E, delta: number): void;
  update(entity: E, camera: Camera, delta: number): void;
  release(): void;
  dispose(): void;
}
export type ProjectileFactory = () => ProjectileView;
