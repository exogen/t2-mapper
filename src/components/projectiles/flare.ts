import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  UniformsLib,
  UniformsUtils,
} from "three";
import type { Texture } from "three";
import type { DTSModel } from "../../dts/dtsModel";
import type { FlareEntity } from "../../state/gameEntityTypes";
import { effectDeltaSec, effectNow } from "../../state/engineStore";
import { createEffectShape } from "../../effectShape";
import { FlareSpikes, VERTS_PER_SPIKE } from "../../particles/flareSpikes";
import { injectCustomFog } from "../../fogShader";
import { globalFogUniforms } from "../../globalFogUniforms";
import { additiveSpriteBeforeCompile } from "../../shapeMaterial";
import { effectMesh, disposeGeometry } from "./geometry";
import { projectileLight } from "./light";
import type { ProjectileView } from "./types";
// ── LinearFlareProjectile (plasma bolt) ──
//
// Binary-verified render (LinearFlareProjectile::renderObject
// FUN_0063e2e0): the projectile's DTS, then `numFlares` spikes drawn
// additively in the object's frame with flareModTexture (a streak, bright
// at its base); a bolt without a DTS gets two additive flareBaseTexture
// (the soft ball) billboards instead. Colours go through untouched: the
// engine multiplies sRGB vertex colours by sRGB texels and adds them to
// the framebuffer, so the spike shader skips three.js colour management
// the way the particle shaders do.

// The fog includes are the anchors injectCustomFog rewrites; the engine
// scales spike brightness by 1 - haze (FUN_0063e2e0), which is the chunk's
// additive mode.
const spikeVertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec3 spikeColor;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vColor = spikeColor;
    vec3 transformed = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const spikeFragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(map, vUv);
    // GL_MODULATE with glBlendFunc(GL_ONE, GL_ONE): alpha plays no part.
    gl_FragColor = vec4(vColor * t.rgb, 1.0);
    #include <fog_fragment>
  }
`;

const spikeBeforeCompile = (shader: {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}) => injectCustomFog(shader, globalFogUniforms, { additive: true });

export function createFlareView(
  visual: FlareEntity["visual"],
  textures: { base?: Texture; mod?: Texture },
  model: DTSModel | undefined,
  anisotropy: number,
): ProjectileView<FlareEntity> {
  const root = new Group(),
    effects = new Group(),
    shapeGroup = new Group();
  root.add(effects, shapeGroup);
  let start = effectNow();
  const shape = model
    ? createEffectShape(model, visual.shapeName, { anisotropy })
    : null;
  if (shape) {
    shapeGroup.scale.set(
      visual.shapeScale[1],
      visual.shapeScale[2],
      visual.shapeScale[0],
    );
    const flip = new Group();
    flip.rotation.y = Math.PI;
    flip.add(shape.scene);
    shapeGroup.add(flip);
  } else if (visual.modTexture && textures.base) {
    const color = new Color().setRGB(
      Math.sqrt(visual.color.r),
      Math.sqrt(visual.color.g),
      Math.sqrt(visual.color.b),
      SRGBColorSpace,
    );
    for (const [size, tint] of [
      [1.2 * visual.shapeScale[0], color],
      [0.6 * visual.shapeScale[0], new Color()],
    ] as const) {
      const material = new SpriteMaterial({
        map: textures.base,
        color: tint,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      material.onBeforeCompile = additiveSpriteBeforeCompile;
      const sprite = new Sprite(material);
      sprite.scale.set(size, size, 1);
      effects.add(sprite);
    }
  }
  let spikes: FlareSpikes | undefined;
  let geometry: BufferGeometry | undefined;
  const color: [number, number, number] = [
    visual.color.r,
    visual.color.g,
    visual.color.b,
  ];
  if (visual.baseTexture && visual.numFlares > 0) {
    spikes = new FlareSpikes(visual.numFlares, visual.sizes);
    geometry = new BufferGeometry();
    for (const [name, size] of [
      ["position", 3],
      ["uv", 2],
      ["spikeColor", 3],
    ] as const)
      geometry.setAttribute(
        name,
        new BufferAttribute(
          new Float32Array(visual.numFlares * VERTS_PER_SPIKE * size),
          size,
        ).setUsage(DynamicDrawUsage),
      );
    const material = new ShaderMaterial({
      vertexShader: spikeVertexShader,
      fragmentShader: spikeFragmentShader,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        { map: { value: textures.mod } },
      ]),
      fog: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    material.onBeforeCompile = spikeBeforeCompile;
    effects.add(effectMesh(geometry, material));
  }
  const light = projectileLight(root, visual.light);
  return {
    root,
    reset() {
      start = effectNow();
      shape?.reset();
      light.acquire();
      if (spikes) spikes = new FlareSpikes(visual.numFlares, visual.sizes);
    },
    release: light.release,
    dispose() {
      light.release();
      shape?.dispose();
      disposeGeometry(effects);
    },
    update(entity, camera, delta) {
      if (shape) {
        if (visual.faceViewer) shapeGroup.lookAt(camera.position);
        shape.setTime((effectNow() - start) / 1000);
      }
      if (spikes && geometry) {
        spikes.advance(effectDeltaSec(delta));
        const pos = geometry.getAttribute("position") as BufferAttribute,
          uv = geometry.getAttribute("uv") as BufferAttribute,
          col = geometry.getAttribute("spikeColor") as BufferAttribute;
        const count = spikes.writeGeometry(
          pos.array as Float32Array,
          uv.array as Float32Array,
          col.array as Float32Array,
          color,
        );
        pos.needsUpdate = true;
        uv.needsUpdate = true;
        col.needsUpdate = true;
        geometry.setDrawRange(0, count);
      }
    },
  };
}
