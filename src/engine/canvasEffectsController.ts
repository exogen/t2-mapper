import type { Camera, Scene, WebGLRenderer } from "three";
import { createLogger } from "../logger";
import {
  hasSelectedGraphicsEffects,
  hasVisibleGraphicsEffects,
  type GraphicsEffects,
  type GraphicsEffectsStore,
} from "../state/graphicsEffectsStore";
import { ColorGradeLutCache } from "./colorGradeLutCache";
import { EffectPipelineOwner } from "./effectPipelineOwner";
import { GRAPHICS_EFFECT_KEYS } from "../graphicsEffects";
import { runOwnedCleanups } from "./runOwnedCleanups";

type EffectsModule = Pick<
  typeof import("./gamePostProcessing"),
  "createGamePostProcessing"
>;
type EffectsPipeline = ReturnType<EffectsModule["createGamePostProcessing"]>;

const log = createLogger("CanvasEffects");

/** Status/first-frame publications do not change the requested image. */
function sameSelection(a: GraphicsEffects | undefined, b: GraphicsEffects) {
  if (a === b) return true;
  if (
    !a ||
    a.enabled !== b.enabled ||
    a.colorGrade !== b.colorGrade ||
    a.gradeIntensity !== b.gradeIntensity
  )
    return false;
  for (const key of GRAPHICS_EFFECT_KEYS)
    if (a[key] !== b[key] || a.intensity[key] !== b.intensity[key])
      return false;
  return true;
}

/** Canvas-lifetime effects selection and CPU LUT ownership. GPU pipelines are
 * lazy and shorter-lived: OFF and store switches release them, including when
 * a store changes synchronously from inside a composition. */
export class CanvasEffectsController {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly invalidate: () => void;
  private readonly loadModule: () => Promise<EffectsModule>;
  private readonly pipeline = new EffectPipelineOwner<EffectsPipeline>();
  private readonly lutCache = new ColorGradeLutCache();
  private camera?: Camera;
  private store?: GraphicsEffectsStore;
  private settings?: GraphicsEffects;
  private unsubscribe?: () => void;
  private module?: EffectsModule;
  private loading = false;
  private visible = false;
  private disposed = false;
  private bindingVersion = 0;
  private selectionVersion = 0;

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    invalidate: () => void,
    loadModule: () => Promise<EffectsModule> = () =>
      import("./gamePostProcessing"),
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.invalidate = invalidate;
    this.loadModule = loadModule;
  }

  /** Binding policy (clip versus page settings) belongs to the caller. */
  setStore(store: GraphicsEffectsStore): void {
    if (this.disposed || store === this.store) return;
    const version = ++this.bindingVersion;
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    this.store = undefined;
    this.settings = undefined;
    this.visible = false;
    unsubscribe?.();
    this.lutCache.clear();
    // Disposal can publish a grade status and synchronously select a new owner.
    this.pipeline.release();
    if (this.disposed || version !== this.bindingVersion) return;
    this.store = store;
    this.unsubscribe = store.subscribe((settings) => {
      if (this.store === store && version === this.bindingVersion)
        this.sync(settings);
    });
    this.sync(store.getState());
  }

  render(camera: Camera, delta: number): boolean {
    const store = this.store;
    const settings = this.settings;
    if (this.disposed || !store || !settings) return false;
    this.camera = camera;
    const pipeline =
      this.module && (this.visible || this.pipeline.current)
        ? this.pipeline.beginRender(this.createPipeline)
        : undefined;
    let composed = false;
    try {
      composed = pipeline?.render(camera, delta, settings) ?? false;
    } finally {
      if (pipeline) this.pipeline.endRender();
    }
    // A synchronous store switch during rendering must not acknowledge a new
    // clip's first frame using the previous owner's completed composition.
    const current = this.settings;
    if (
      this.store === store &&
      sameSelection(current, settings) &&
      current?.awaitingFirstFrame &&
      (current.gradeStatus === "error" ||
        (composed && current.gradeStatus === "idle"))
    )
      store.setState({ awaitingFirstFrame: false });
    return composed;
  }

  resize(): void {
    this.pipeline.current?.resize();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bindingVersion++;
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    this.store = undefined;
    this.settings = undefined;
    this.camera = undefined;
    runOwnedCleanups([
      unsubscribe,
      () => this.pipeline.dispose(),
      () => this.lutCache.dispose(),
    ]);
  }

  // One stable factory avoids introducing closures into every rendered frame.
  private readonly createPipeline = () =>
    this.module!.createGamePostProcessing(
      this.renderer,
      this.scene,
      this.camera!,
      this.store!,
      undefined,
      this.lutCache,
    );

  private sync(settings: GraphicsEffects): void {
    const store = this.store;
    if (this.disposed || !store) return;
    if (!sameSelection(this.settings, settings)) this.selectionVersion++;
    if (settings.colorGrade !== this.settings?.colorGrade)
      this.lutCache.clear();
    this.settings = settings;
    this.visible = settings.enabled && hasVisibleGraphicsEffects(settings);
    this.pipeline.setActive(
      settings.enabled && hasSelectedGraphicsEffects(settings),
    );
    if (this.disposed || this.store !== store || this.settings !== settings)
      return;
    if (!settings.enabled && settings.awaitingFirstFrame)
      store.setState({ awaitingFirstFrame: false });
    if (this.disposed || this.store !== store || this.settings !== settings)
      return;
    if (this.visible && !this.module && !this.loading) {
      this.loading = true;
      void this.loadModule().then(
        (module) => {
          if (this.disposed) return;
          this.module = module;
          this.invalidate();
        },
        (error: unknown) => {
          if (this.disposed) return;
          log.error("Post-processing failed to load: %o", error);
          const current = this.settings!;
          const failedStore = this.store;
          const failedSelection = this.selectionVersion;
          const hasGrade =
            current.enabled &&
            current.colorGrade !== "off" &&
            current.gradeIntensity > 0;
          if (current.enabled && (hasGrade || current.awaitingFirstFrame))
            this.store!.setState({
              awaitingFirstFrame: false,
              ...(hasGrade && { gradeStatus: "error" }),
            });
          this.loading = false;
          // An error observer may synchronously request another selection while
          // loading is still true. Retry that intent, but not our own status
          // publication (which would loop on a rejected module import).
          if (
            !this.disposed &&
            this.settings &&
            (this.store !== failedStore ||
              this.selectionVersion !== failedSelection)
          )
            this.sync(this.settings);
        },
      );
    }
    this.invalidate();
  }
}
