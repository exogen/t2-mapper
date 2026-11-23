import {
  BlendFunction,
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  LUT3DEffect,
  NoiseEffect,
  ScanlineEffect,
  ShaderPass,
  TiltShiftEffect,
  VignetteEffect,
  VignetteTechnique,
  type Effect,
} from "postprocessing";
import {
  FramebufferTexture,
  HalfFloatType,
  LoadingManager,
  NoBlending,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  type Camera,
  type Data3DTexture,
  type Scene,
  type WebGLRenderer,
} from "three";
import {
  COLOR_GRADE_PATHS,
  GRAPHICS_EFFECT_KEYS,
  type ColorGrade,
  type ColorGradePreset,
  type GraphicsEffect,
} from "../graphicsEffects";
import type {
  GraphicsEffects,
  GraphicsEffectsStore,
} from "../state/graphicsEffectsStore";
import { createLogger } from "../logger";
import { createCrtPhosphorMask } from "./stylizedPostEffects";
import type { ColorGradeLutCache } from "./colorGradeLutCache";
import {
  estimateRenderTargetBytes,
  estimateTextureBytes,
} from "../diagnostics/resourceEstimates";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";

const log = createLogger("GamePostProcessing");
// A grade change shouldn't trigger the mission asset loading indicator.
const lutLoadingManager = new LoadingManager();

async function loadGrade(grade: ColorGradePreset) {
  const path = COLOR_GRADE_PATHS[grade];
  const url = path.startsWith("https://")
    ? path
    : `${import.meta.env.BASE_URL}${path}`;
  const loader = url.endsWith(".CUBE")
    ? new (await import("three/addons/loaders/LUTCubeLoader.js")).LUTCubeLoader(
        lutLoadingManager,
      )
    : url.endsWith(".3dl")
      ? new (await import("three/addons/loaders/LUT3dlLoader.js")).LUT3dlLoader(
          lutLoadingManager,
        )
      : new (
          await import("three/addons/loaders/LUTImageLoader.js")
        ).LUTImageLoader(lutLoadingManager);
  const { texture3D } = await loader.loadAsync(url);
  // The LUT stores sRGB values as raw data. LUT3DEffect does the working-space
  // conversion before sampling, just as the demo grades its sRGB output.
  return texture3D;
}

interface EffectControl {
  effect: Effect;
  setIntensity(value: number): void;
}

function opacityControl(effect: Effect, maxOpacity = 1): EffectControl {
  return {
    effect,
    setIntensity: (value) => effect.blendMode.setOpacity(value * maxOpacity),
  };
}

const createEffect: Record<GraphicsEffect, () => EffectControl> = {
  bloom() {
    const effect = new BloomEffect({
      luminanceThreshold: 0.8,
      luminanceSmoothing: 0.18,
      radius: 0.72,
      levels: 5,
    });
    return {
      effect,
      setIntensity: (value) => {
        effect.intensity = value;
      },
    };
  },
  tiltShift() {
    return opacityControl(
      new TiltShiftEffect({
        blendFunction: BlendFunction.NORMAL,
        focusArea: 0.48,
        feather: 0.28,
        resolutionScale: 0.5,
      }),
    );
  },
  vignette() {
    return opacityControl(
      new VignetteEffect({
        blendFunction: BlendFunction.NORMAL,
        technique: VignetteTechnique.ESKIL,
        offset: 0.9,
        darkness: 1,
      }),
    );
  },
  grain() {
    return opacityControl(
      new NoiseEffect({ blendFunction: BlendFunction.OVERLAY }),
      0.35,
    );
  },
  scanlines() {
    return opacityControl(new ScanlineEffect({ density: 0.75 }), 0.35);
  },
  chromaticAberration() {
    const effect = new ChromaticAberrationEffect({
      radialModulation: true,
      modulationOffset: 0.15,
    });
    return {
      effect,
      setIntensity: (value) => {
        effect.offset.set(0.005 * value, 0.003 * value);
      },
    };
  },
  crtPhosphorMask() {
    return opacityControl(createCrtPhosphorMask());
  },
};

// Effects are owned by the controller so unchanged effects can survive pass
// changes, including Bloom's render targets when a grade is loaded.
class RetainedEffectPass extends EffectPass {
  readonly stages: readonly Effect[];

  constructor(camera: Camera, stages: readonly Effect[]) {
    super(camera, ...stages);
    this.stages = stages;
  }

  override dispose(): void {
    this.setEffects([]);
    super.dispose();
  }
}

export function createGamePostProcessing(
  renderer: WebGLRenderer,
  scene: Scene,
  initialCamera: Camera,
  effectsStore: GraphicsEffectsStore,
  loadGradeTexture: typeof loadGrade = loadGrade,
  lutCache?: ColorGradeLutCache,
) {
  let disposed = false;
  const hdr = renderer.extensions.has("EXT_color_buffer_float");
  const autoClear = renderer.autoClear;
  const composer = new EffectComposer(renderer, {
    depthBuffer: false,
    frameBufferType: hdr ? HalfFloatType : UnsignedByteType,
  });
  // Attaching the composer disables autoClear. Scope that to the composed
  // draw so shadow work and direct renders can still clear as usual.
  renderer.autoClear = autoClear;

  // The game composites sky, fog and effects in display space. Capture that
  // finished frame on the GPU and decode it for the linear postprocessing chain.
  const size = new Vector2();
  renderer.getDrawingBufferSize(size);
  const sourceFrame = { value: new FramebufferTexture(size.x, size.y) };
  const framePass = new ShaderPass(
    new ShaderMaterial({
      uniforms: { sourceFrame },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D sourceFrame;
        varying vec2 vUv;
        void main() {
          gl_FragColor = sRGBTransferEOTF(texture2D(sourceFrame, vUv));
        }
      `,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    }),
  );
  composer.addPass(framePass);

  let camera = initialCamera;
  let previous: GraphicsEffects | undefined;
  let blurPass: RetainedEffectPass | undefined;
  let compositePass: RetainedEffectPass | undefined;
  const active = new Map<GraphicsEffect, EffectControl>();
  let grade: LUT3DEffect | undefined;
  let lut: Data3DTexture | undefined;
  let requestedGrade: ColorGrade = "off";
  let gradeStatus: GraphicsEffects["gradeStatus"] = "idle";
  let gradeRequest = 0;
  const unregisterMetrics = registerMetricSource("postProcessing", () => {
    const capture = estimateTextureBytes(sourceFrame.value);
    const input = estimateRenderTargetBytes(composer.inputBuffer);
    const output = estimateRenderTargetBytes(composer.outputBuffer);
    return {
      captureWidth: sourceFrame.value.image.width,
      captureHeight: sourceFrame.value.image.height,
      estimatedCaptureBytes: capture,
      estimatedComposerBytes:
        input != null && output != null ? input + output : null,
      estimatedCoreTargetBytes:
        capture != null && input != null && output != null
          ? capture + input + output
          : null,
      estimatedLutTextureBytes: lut ? estimateTextureBytes(lut) : 0,
      activeEffects: active.size,
      // Bloom/blur own additional targets. This gauge makes the limited
      // public composer accounting explicit instead of reporting a total.
      effectsWithUncountedTargets:
        Number(active.has("bloom")) + Number(active.has("tiltShift")),
    };
  });

  function publishGradeStatus() {
    if (disposed) return;
    const settings = effectsStore.getState();
    if (
      settings.enabled &&
      settings.colorGrade === requestedGrade &&
      settings.gradeStatus !== gradeStatus
    ) {
      effectsStore.setState({ gradeStatus });
    }
  }

  function requestGrade(selection: ColorGrade) {
    requestedGrade = selection;
    const request = ++gradeRequest;
    lut?.dispose();
    lut = undefined;
    gradeStatus = selection === "off" ? "idle" : "loading";
    if (selection === "off") return;
    lut = lutCache?.restore(selection);
    if (lut) {
      gradeStatus = "idle";
      return;
    }

    void loadGradeTexture(selection).then(
      (loaded) => {
        if (
          disposed ||
          request !== gradeRequest ||
          !effectsStore.getState().enabled ||
          effectsStore.getState().colorGrade !== selection
        ) {
          loaded.dispose();
          return;
        }
        lutCache?.remember(selection, loaded);
        lut = loaded;
        gradeStatus = "idle";
        publishGradeStatus();
      },
      (error: unknown) => {
        if (
          disposed ||
          request !== gradeRequest ||
          !effectsStore.getState().enabled ||
          effectsStore.getState().colorGrade !== selection
        )
          return;
        gradeStatus = "error";
        publishGradeStatus();
        log.warn("Failed to load color grade %s: %o", selection, error);
      },
    );
  }

  function syncPass(
    pass: RetainedEffectPass | undefined,
    effects: Effect[],
    index?: number,
  ): RetainedEffectPass | undefined {
    if (
      pass?.stages.length === effects.length &&
      pass.stages.every((effect, i) => effect === effects[i])
    )
      return pass;
    if (pass) {
      composer.removePass(pass);
      pass.dispose();
    }
    if (!effects.length) return undefined;
    const next = new RetainedEffectPass(camera, effects);
    composer.addPass(next, index);
    return next;
  }

  function update(settings: GraphicsEffects): void {
    // At zero strength, keep an already loaded grade ready for adjustments.
    const nextGrade =
      settings.gradeIntensity > 0 || settings.colorGrade === requestedGrade
        ? settings.colorGrade
        : "off";
    if (
      nextGrade !== requestedGrade ||
      (gradeStatus === "error" && settings.gradeStatus === "loading")
    )
      requestGrade(nextGrade);
    publishGradeStatus();
    const gradeLut = settings.gradeIntensity > 0 ? lut : undefined;
    const gradeChanged = gradeLut !== grade?.lut;
    if (settings === previous && !gradeChanged) return;

    const effects: Effect[] = [];
    for (const key of GRAPHICS_EFFECT_KEYS) {
      const intensity = settings[key] ? settings.intensity[key] : 0;
      let control = active.get(key);
      if (intensity === 0) {
        control?.effect.dispose();
        active.delete(key);
        continue;
      }
      if (!control) {
        control = createEffect[key]();
        active.set(key, control);
      }
      control.setIntensity(intensity);
      if (key !== "tiltShift") effects.push(control.effect);
    }
    if (gradeChanged) {
      grade?.dispose();
      grade = gradeLut
        ? new LUT3DEffect(gradeLut, { blendFunction: BlendFunction.NORMAL })
        : undefined;
    }
    if (grade) {
      grade.blendMode.setOpacity(settings.gradeIntensity);
      // Bloom reads the input highlights before the display-space grade.
      effects.splice(active.has("bloom") ? 1 : 0, 0, grade);
    }
    const tiltShift = active.get("tiltShift")?.effect;
    // Bloom and chromatic aberration sample the pass input, so they need
    // the blurred scene as a texture. Other effects can share the blur pass.
    const separateBlur =
      tiltShift && (active.has("bloom") || active.has("chromaticAberration"));
    if (tiltShift && !separateBlur) effects.unshift(tiltShift);
    blurPass = syncPass(blurPass, separateBlur ? [tiltShift] : [], 1);
    compositePass = syncPass(compositePass, effects);
    previous = settings;
  }

  return {
    render(
      nextCamera: Camera,
      delta: number,
      settings: GraphicsEffects,
    ): boolean {
      if (disposed || !settings.enabled) return false;
      if (nextCamera !== camera) {
        camera = nextCamera;
        composer.setMainCamera(camera);
      }
      update(settings);
      const frame = sourceFrame.value;
      if (!compositePass || !frame.image.width || !frame.image.height)
        return false;
      renderer.render(scene, camera);
      renderer.copyFramebufferToTexture(frame);
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      try {
        composer.render(delta);
      } finally {
        renderer.setRenderTarget(null);
        renderer.autoClear = autoClear;
      }
      return true;
    },
    resize() {
      if (disposed) return;
      renderer.getDrawingBufferSize(size);
      const frame = sourceFrame.value;
      if (frame.image.width === size.x && frame.image.height === size.y) return;
      frame.dispose();
      sourceFrame.value = new FramebufferTexture(size.x, size.y);
      renderer.getSize(size);
      composer.setSize(size.x, size.y);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unregisterMetrics();
      gradeRequest++;
      composer.dispose();
      sourceFrame.value.dispose();
      for (const { effect } of active.values()) effect.dispose();
      active.clear();
      grade?.dispose();
      lut?.dispose();
      grade = undefined;
      lut = undefined;
      const settings = effectsStore.getState();
      if (
        settings.colorGrade === requestedGrade &&
        settings.gradeStatus === "loading"
      )
        effectsStore.setState({ gradeStatus: "idle" });
    },
  };
}
