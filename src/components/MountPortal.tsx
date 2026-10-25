import { Fragment, type ReactNode } from "react";
import type { Object3D } from "three";
import { createPortal } from "@react-three/fiber";
import { getMountNode } from "../sceneNodes";

/**
 * Render `children` under one of a shape's mount nodes, the way a
 * mounted image or object follows the owner's mountPoint node.
 *
 * r3f's Portal seeds a new container's store from the previous render,
 * so a portal whose container changes in place attaches its children to
 * the old one. A rebuilt owner model (an armor change swaps the player
 * shape; Tribes2.exe keeps every mounted image across onNewDataBlock)
 * must remount its mounts into the new nodes, so each node gets its own
 * portal.
 */
export function MountPortal({
  root,
  mountPoint,
  children,
}: {
  root: Object3D;
  mountPoint: number;
  children: ReactNode;
}) {
  const node = getMountNode(root, mountPoint);
  return <Fragment key={node.uuid}>{createPortal(children, node)}</Fragment>;
}
