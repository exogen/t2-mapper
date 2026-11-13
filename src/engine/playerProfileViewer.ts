import {
  Color,
  Group,
  LoopOnce,
  LoopRepeat,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  Spherical,
  SRGBColorSpace,
  Timer,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { createDtsDamageThreads } from "../dts/dtsDamage";
import { getDTSImageMountTransform } from "../dts/dtsMount";
import {
  setDTSRenderSettings,
  type DTSModel,
  type DTSShape,
} from "../dts/dtsModel";
import { observeShapeMeshes } from "../dts/dtsScene";
import { readDtsSequences } from "../dts/dtsSequences";
import { holdDtsAction } from "../dts/dtsThread";
import { EFFECT_LIGHT_COUNT } from "../effectLightUniforms";
import {
  buildActionAnimMap,
  getPlayerAnimationActions,
} from "../stream/playerActionMap";
import { flushTransformChanges } from "../transformChanges";
import { createPlayerPresentation } from "./playerPresentation";
import { installProfileCanvasClick } from "./profileCanvasClick";
import { createProfileGestureAnimations } from "./profileGestureAnimations";
import { loadSkinManifest, resolvePlayerSkinUrl } from "./playerSkins";
import {
  resolveProfileAppearance,
  type ProfileAppearanceInput,
  type ProfileImageAppearance,
} from "./profileAppearance";
import { loadShape } from "./shapeCache";
import { createShapeInstance } from "./shapeInstance";
import { MountPoints } from "./shapeMountPoints";

/** Character size in the profile canvas; larger values zoom in. */
const PROFILE_MODEL_ZOOM = 0.6;

/** Keep the game's material pipeline, with local studio lighting. Shader
 * uniform objects are replaced per instance, never written to the game scene. */
function studioMaterials(scene: DTSShape): () => void {
  const uniforms = {
    shapeLightMode: { value: 0 },
    shapeSunAmbient: { value: new Color(0.65, 0.65, 0.65) },
    shapeSunColor: { value: new Color(1, 1, 1) },
    shapeSunViewDir: { value: new Vector3(-0.4, 0.6, 1).normalize() },
    effectLightRadius: { value: new Float32Array(EFFECT_LIGHT_COUNT) },
    shapeEnvMapActive: { value: false },
    fogEnabled: { value: false },
  };
  const processed = new WeakSet<Material>();
  return observeShapeMeshes(scene, (mesh) => {
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      if (processed.has(material)) continue;
      processed.add(material);
      const compile = material.onBeforeCompile;
      const programKey = material.customProgramCacheKey();
      material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
      };
      material.customProgramCacheKey = () => `${programKey}:profile-studio`;
    }
  });
}

/** A mounted image uses the same native grip correction and animated mount
 * nodes as live/demo playback, without their sounds, colliders or effects. */
function mountProfileImage(
  model: DTSModel,
  image: ProfileImageAppearance,
  mounts: MountPoints,
  anisotropy: number,
) {
  const instance = createShapeInstance({
    model,
    shapeName: image.shapeName,
    anisotropy,
    emap: image.emap,
  });
  const { scene } = instance;
  const stopMaterials = studioMaterials(scene);
  const root = new Group();
  root.userData.imageMount = true;
  root.matrixAutoUpdate = false;
  root.matrix.copy(getDTSImageMountTransform(model.data, image.mountOffset));
  root.add(scene);
  const detach = mounts.attach(image.mountPoint, root);
  const mixer = new DTSAnimationMixer(scene);
  const cyclic = readDtsSequences(model.scene, model.animations).cyclic;
  const activation = model.animations.find(
    (clip) =>
      clip.name.toLowerCase() === image.activationSequence?.toLowerCase(),
  );
  if (activation) {
    const action = mixer.clipAction(activation);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    holdDtsAction(action, 1);
  }
  mixer.update(0);
  // Ready replaces the image's activation thread, retaining its last pose
  // when there is no replacement sequence.
  if (activation && image.sequence) mixer.stopAllAction();
  // ShapeBase starts its ambient thread; an image's ready/default state
  // supplies the same visible sequence that it has while being held.
  for (const name of new Set(["ambient", image.sequence?.toLowerCase()])) {
    const clip = model.animations.find(
      (clip) => clip.name.toLowerCase() === name,
    );
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    const loop = cyclic.has(clip.name.toLowerCase());
    action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.play();
  }
  mixer.update(0);
  return {
    update: (delta: number) => mixer.update(delta),
    dispose() {
      detach();
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      stopMaterials();
      instance.dispose();
    },
  };
}

/** An isolated, small player portrait. Loading may finish after dispose;
 * only cached source assets survive that cancellation. */
export function mountPlayerProfileViewer(
  container: HTMLElement,
  profile: ProfileAppearanceInput,
): { dispose(): void } {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return { dispose() {} };
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0, 0);
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.01, 100);
  camera.zoom = PROFILE_MODEL_ZOOM;
  const controls = new OrbitControls(camera, canvas);
  // Vertical swipes scroll the page; horizontal drags still orbit the model.
  canvas.style.touchAction = "pan-y";
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.rotateSpeed = 0.65;
  controls.minPolarAngle = Math.PI * 0.2;
  controls.maxPolarAngle = Math.PI * 0.75;
  controls.minDistance = 6;
  controls.maxDistance = 6;
  controls.mouseButtons.MIDDLE = null;
  controls.mouseButtons.RIGHT = null;
  controls.target.set(0, 1.25, 0);
  camera.position
    .set(1, 0.5, -0.65)
    .normalize()
    .multiplyScalar(6)
    .add(controls.target);
  controls.update();
  controls.saveState();
  // OrbitControls suppresses context menus whenever enabled. Temporarily
  // suspend only that handler, then restore before the event bubbles out.
  const contextMenuEnabled = new WeakMap<Event, boolean>();
  function suspendContextMenuControls(event: MouseEvent) {
    contextMenuEnabled.set(event, controls.enabled);
    controls.enabled = false;
  }
  function restoreContextMenuControls(event: MouseEvent) {
    controls.enabled = contextMenuEnabled.get(event) ?? controls.enabled;
    contextMenuEnabled.delete(event);
  }
  canvas.addEventListener("contextmenu", suspendContextMenuControls, true);
  canvas.addEventListener("contextmenu", restoreContextMenuControls);
  const timer = new Timer();
  timer.connect(document);
  const cleanups: (() => void)[] = [];
  const updates: ((delta: number) => unknown)[] = [];
  let playGesture: (() => void) | undefined;
  cleanups.push(installProfileCanvasClick(canvas, () => playGesture?.()));
  let disposed = false;
  let ready = false;
  let visible = true;
  let raf = 0;

  function resizeCanvas() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height);
    setDTSRenderSettings(camera, height * renderer.getPixelRatio());
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function schedule() {
    if (!disposed && ready && visible && !document.hidden && !raf)
      raf = requestAnimationFrame(frame);
  }
  function frame() {
    raf = 0;
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.1);
    for (const update of updates) update(delta);
    controls.update();
    flushTransformChanges(scene);
    renderer.render(scene, camera);
    schedule();
  }
  function visibility() {
    if (document.hidden || !visible) {
      cancelAnimationFrame(raf);
      raf = 0;
      // Offscreen time does not fast-forward the portrait's animation.
      timer.reset();
    } else {
      timer.reset();
      schedule();
    }
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      if (!event.repeat) playGesture?.();
    } else if (event.key === "Home") controls.reset();
    else {
      const spherical = new Spherical().setFromVector3(
        camera.position.clone().sub(controls.target),
      );
      const step = Math.PI / 12;
      if (event.key === "ArrowLeft") spherical.theta -= step;
      else if (event.key === "ArrowRight") spherical.theta += step;
      else if (event.key === "ArrowUp") spherical.phi -= step;
      else if (event.key === "ArrowDown") spherical.phi += step;
      else return;
      spherical.phi = Math.max(
        controls.minPolarAngle,
        Math.min(controls.maxPolarAngle, spherical.phi),
      );
      camera.position
        .copy(controls.target)
        .add(new Vector3().setFromSpherical(spherical));
      controls.update();
    }
    event.preventDefault();
    event.stopPropagation();
  }
  function assistiveClick(event: MouseEvent) {
    if (event.target === container && event.detail === 0 && event.button === 0)
      playGesture?.();
  }
  container.addEventListener("keydown", keydown);
  container.addEventListener("click", assistiveClick);
  document.addEventListener("visibilitychange", visibility);
  const resize = new ResizeObserver(resizeCanvas);
  resize.observe(container);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visibility();
  });
  intersection.observe(container);
  resizeCanvas();

  async function load() {
    const appearance = await resolveProfileAppearance(profile);
    if (disposed) return;
    // Remote skin discovery must not delay the base armor or its attachments.
    const skinManifest = loadSkinManifest();
    const model = await loadShape(appearance.shapeName);
    if (disposed) return;
    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    const mounts = new MountPoints();
    let skinUrl = resolvePlayerSkinUrl(
      appearance.shapeName,
      profile.skin ?? undefined,
    );
    let updatePlayer: (delta: number) => void;
    let disposePlayer: (() => void) | undefined;
    function buildPlayer() {
      disposePlayer?.();
      const player = createPlayerPresentation({
        model,
        anisotropy,
        emap: appearance.emap,
        skinUrl,
      });
      const stopMaterials = studioMaterials(player.scene);
      scene.add(player.root);
      mounts.setScene(player.scene);
      const actions = getPlayerAnimationActions(
        model.animations,
        player.mixer,
        buildActionAnimMap(
          appearance.sequences,
          appearance.shapeName.toLowerCase().replace(/\.dts$/, "") + "_",
          model.animations,
        ),
      );
      const gestures = createProfileGestureAnimations({
        actions,
        mixer: player.mixer,
        armAction: appearance.armAction,
      });
      playGesture = gestures.playRandom;
      const damage = createDtsDamageThreads(
        player.mixer,
        model.animations,
        "Player",
      );
      damage?.update();
      player.mixer.update(0);
      updatePlayer = (delta) => {
        player.mixer.update(delta);
        gestures.update();
      };
      disposePlayer = () => {
        flushTransformChanges(scene);
        mounts.setScene(null);
        playGesture = undefined;
        gestures.dispose();
        damage?.dispose();
        stopMaterials();
        player.root.removeFromParent();
        player.dispose();
      };
    }
    buildPlayer();
    cleanups.push(() => disposePlayer?.());
    updates.push((delta) => updatePlayer(delta));
    ready = true;
    schedule();
    void skinManifest
      .then(() => {
        if (disposed) return;
        const nextSkinUrl = resolvePlayerSkinUrl(
          appearance.shapeName,
          profile.skin ?? undefined,
        );
        if (nextSkinUrl !== skinUrl) {
          skinUrl = nextSkinUrl;
          buildPlayer();
        }
      })
      .catch(reportLoadError);
    // A missing mod image must not prevent the armor or other image showing.
    await Promise.allSettled(
      appearance.images.map(async (image) => {
        const imageModel = await loadShape(image.shapeName);
        if (disposed) return;
        const mounted = mountProfileImage(
          imageModel,
          image,
          mounts,
          anisotropy,
        );
        cleanups.push(() => mounted.dispose());
        updates.push(mounted.update);
      }),
    );
  }
  function reportLoadError(error: unknown) {
    if (!disposed) console.warn("Could not load profile character", error);
  }
  void load().catch(reportLoadError);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      container.removeEventListener("keydown", keydown);
      container.removeEventListener("click", assistiveClick);
      canvas.removeEventListener(
        "contextmenu",
        suspendContextMenuControls,
        true,
      );
      canvas.removeEventListener("contextmenu", restoreContextMenuControls);
      controls.dispose();
      timer.dispose();
      // Images detach before the player's shared scene clone is released.
      flushTransformChanges(scene);
      for (const cleanup of cleanups.reverse()) cleanup();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
