/**
 * Frame stages, in the order they run: the engine's FrameScheduler runs
 * its systems stage by stage, and within a stage in the order they were
 * added. A single shared stage made the order depend on load timing (a
 * lazily loaded system's camera write landing after the director's, a
 * shape subscribing whenever its model happened to load); naming the
 * order fixes it.
 *
 * The order follows what each step reads:
 *
 * 0. queued shadow atlases consume the previous frame's complete pose,
 *    before interpolation or bone queries start changing world transforms;
 * 1. playback advances the demo clock and interpolates entity transforms;
 *    debris and projectiles are posed from the same frame;
 * 2. shapes animate their skeletons on those transforms (eye nodes are
 *    read from that pose);
 * 3. camera *selection* settles who is followed and in which mode;
 * 4. the director picks the shot and writes its orbit parameters;
 * 5. the stream applies the resulting pose (recorded, orbit, first person);
 * 6. tour, input and the command circuit override it in turn. Input runs
 *    as a pipeline: a modal guard clears gestures before input is sampled
 *    (touch first, then keyboard and mouse,
 *    whose handler clears the raw deltas), then drained (local input poses
 *    the camera here, live input is staged), then the 32 ms ticks turn
 *    staged live input into moves, and only then does the live prediction
 *    pose the camera — so every tick of a slow frame sees that frame's input;
 * 7. projection follows the selected camera mode and recorded FOV;
 * 8. the watchdog inspects the final pose.
 *
 * Everything else stays at the default 0 and therefore reads the camera
 * after the ladder has finished with it: fog, terrain tiling, labels,
 * billboards and particle systems.
 */
export const FramePriority = {
  /** Queued shadow atlas draws, before any next-frame pose mutations. */
  ShadowAtlas: -70,
  /** Demo clock, tick processing, entity interpolation, snapshot publish. */
  StreamPlayback: -60,
  /** Cosmetic debris: its simulation steps and its bodies are posed. */
  Debris: -52,
  /** The projectile pool syncs with the store and poses its visuals. */
  ProjectilePose: -51,
  /** Shape mixers: body, mounted images, turret aim, vehicle jets. */
  ShapeAnimation: -50,
  /** Follow target and camera mode resolution (no pose writes). */
  CameraSelect: -40,
  /** The auto-director's shot: orbit parameters and its own poses. */
  CameraDirector: -35,
  /** The stream's pose: recorded view, orbit follow, first person. */
  CameraStream: -30,
  /** Map tour animation. */
  CameraTour: -25,
  /** Modal input guards, before touch can apply direct pinch zoom. */
  InputGuard: -24.5,
  /**
   * Touch sticks and drag-look sample this frame's input — ahead of the
   * keyboard and mouse handler, which clears every raw input delta (touch
   * drags included) once it has read its own.
   */
  InputTouch: -24,
  /**
   * Keyboard and mouse sample this frame's input, then clear the raw deltas.
   */
  InputKeyboardMouse: -23,
  /**
   * Input drain: free-fly and orbit from local input; live input staged
   * for the ticks.
   */
  CameraInput: -22,
  /**
   * 32 ms ticks (TickClock): live moves collect the staged input.
   */
  Tick: -21,
  /**
   * The live prediction's pose: server reconciliation and interpolateTick.
   */
  CameraLive: -20,
  /** The command circuit's orthographic rig. */
  CameraCommandCircuit: -15,
  /** Perspective FOV, after all camera-mode changes for this frame. */
  CameraProjection: -12,
  /** Reads the finished pose to detect discontinuities. */
  CameraWatchdog: -10,
  /**
   * Clock-synced audio (the commentary track) follows the frame's demo
   * time, ahead of the mix in PostCamera reading whether it's on air.
   */
  AudioSync: -5,
  /**
   * Everything that reads the finished camera: fog, terrain tiling,
   * labels, billboards and particle systems.
   */
  PostCamera: 0,
} as const;

export type FrameStage = (typeof FramePriority)[keyof typeof FramePriority];
