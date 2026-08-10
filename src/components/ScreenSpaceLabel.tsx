import { useEffect, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import type { Object3D } from "three";
import { anchorPlacement, type ScreenAnchor } from "./screenAnchor";
import { ScreenRectTracker } from "./screenRectTracker";

/**
 * A DOM label positioned against the target object's projected screen-space
 * bounding rectangle — "the lower right of the object as rendered" rather
 * than a fixed world point. The label lives in a portal above the canvas
 * and is repositioned imperatively every frame, so tracking costs no React
 * renders. Hidden while the target is missing, entirely behind the camera,
 * or fully offscreen.
 *
 * Target by `object` when a ref is at hand, or by `objectName` to resolve
 * a scene object (e.g. an entity id) lazily — resolution retries while the
 * model streams in and recovers if the object is replaced.
 *
 * @example
 * <ScreenSpaceLabel objectName={entityId} anchor="bottom-right" offset={[4, 4]}>
 *   <div className={styles.Label}>Storm Flag</div>
 * </ScreenSpaceLabel>
 */
export function ScreenSpaceLabel({
  object,
  objectName,
  anchor = "bottom-right",
  offset,
  children,
}: {
  object?: Object3D | null;
  objectName?: string;
  anchor?: ScreenAnchor;
  offset?: readonly [number, number];
  children: ReactNode;
}) {
  const gl = useThree((state) => state.gl);

  // This component lives inside the r3f reconciler, so DOM children can't
  // be returned (or portaled) directly — they render into their own
  // react-dom root, the same technique drei's Html uses. A fresh container
  // per mount keeps StrictMode's double-invoked effects from racing the
  // deferred unmount of the previous root.
  const elRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<Root | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.top = "0";
    el.style.left = "0";
    el.style.pointerEvents = "none";
    el.style.willChange = "transform";
    el.style.display = "none";
    gl.domElement.parentElement?.appendChild(el);
    const root = createRoot(el);
    elRef.current = el;
    rootRef.current = root;
    return () => {
      elRef.current = null;
      rootRef.current = null;
      // Deferred: React disallows unmounting a root synchronously from
      // inside another root's commit phase.
      setTimeout(() => root.unmount());
      el.remove();
    };
  }, [gl]);

  useEffect(() => {
    rootRef.current?.render(children);
  }, [children]);

  const trackerRef = useRef<ScreenRectTracker | null>(null);
  const lastTransform = useRef("");

  useFrame(({ camera, scene, size }) => {
    const el = elRef.current;
    if (!el) return;
    const tracker = (trackerRef.current ??= new ScreenRectTracker());
    const root = tracker.resolveTarget(object, objectName, scene);
    if (!root) {
      tracker.reset();
      el.style.display = "none";
      return;
    }
    if (!tracker.update(root, scene, camera, size.width, size.height)) {
      el.style.display = "none";
      return;
    }
    const rect = tracker.rect;
    if (
      rect.maxX < 0 ||
      rect.minX > size.width ||
      rect.maxY < 0 ||
      rect.minY > size.height
    ) {
      el.style.display = "none";
      return;
    }

    const placed = anchorPlacement(rect, anchor, offset);
    const transform =
      `translate3d(${placed.x.toFixed(1)}px, ${placed.y.toFixed(1)}px, 0) ` +
      placed.translate;
    if (transform !== lastTransform.current) {
      lastTransform.current = transform;
      el.style.transform = transform;
    }
    el.style.display = "";
  });

  return null;
}
