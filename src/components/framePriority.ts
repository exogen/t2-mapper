/**
 * Frame-callback order for everything that feeds or writes the camera.
 *
 * r3f runs `useFrame` subscribers from the lowest priority to the
 * highest and, within one priority, in subscription (mount) order.
 * Leaving these at the default 0 made the order depend on mount timing:
 * `StreamingController` is lazily imported, so its camera write landed
 * after the director's and the tour's, and the shapes inside
 * `EntityScene`'s Suspense boundary subscribed whenever their GLB
 * happened to load. Naming the order fixes it.
 *
 * Every value must stay ≤ 0. r3f switches to manual rendering as soon as
 * ANY subscriber has a positive priority (`internal.priority` is
 * incremented only for `priority > 0`, and the frame renders only while
 * it is 0), so a positive value here would blank the canvas.
 *
 * The order follows what each step reads:
 *
 * 1. playback advances the demo clock and interpolates entity transforms;
 * 2. shapes animate their skeletons on those transforms;
 * 3. the eye node's animated position is published from that pose;
 * 4. camera *selection* settles who is followed and in which mode;
 * 5. the director picks the shot and writes its orbit parameters;
 * 6. the stream applies the resulting pose (recorded, orbit, first person);
 * 7. tour, local input and the command circuit override it in turn;
 * 8. the watchdog inspects the final pose.
 *
 * Everything else stays at the default 0 and therefore reads the camera
 * after the ladder has finished with it: fog, terrain tiling, labels,
 * billboards and particle systems.
 */
export const FramePriority = {
  /** Demo clock, tick processing, entity interpolation, snapshot publish. */
  StreamPlayback: -60,
  /** Shape mixers: body, mounted images, turret aim, vehicle jets. */
  ShapeAnimation: -50,
  /** Animated eye node → eyePositions, read by the first-person camera. */
  EyePosition: -45,
  /** Follow target and camera mode resolution (no pose writes). */
  CameraSelect: -40,
  /** The auto-director's shot: orbit parameters and its own poses. */
  CameraDirector: -35,
  /** The stream's pose: recorded view, orbit follow, first person. */
  CameraStream: -30,
  /** Map tour animation. */
  CameraTour: -25,
  /** Free-fly and orbit from local input. */
  CameraInput: -20,
  /** The command circuit's orthographic rig. */
  CameraCommandCircuit: -15,
  /** Reads the finished pose to detect discontinuities. */
  CameraWatchdog: -10,
} as const;
