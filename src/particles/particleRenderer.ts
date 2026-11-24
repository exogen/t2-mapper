import {
  AdditiveBlending,
  BufferAttribute,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearMipmapNearestFilter,
  NoColorSpace,
  NormalBlending,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  Texture,
  UnsignedByteType,
} from "three";
import { textureToUrl } from "../loaders";
import { loadBitmapTexture } from "../assets/bitmapTextures";
import { setupEffectTexture } from "../stream/playbackUtils";
import { markTextureSamplerUpdate } from "../textureUtils";
import { particleVertexShader, particleFragmentShader } from "./shaders";
import type { EmitterInstance } from "./ParticleSystem";
export interface ParticleBuffers {
  emitter: EmitterInstance;
  geometry: InstancedBufferGeometry;
  uploadedRevision?: number;
}
export const MAX_PARTICLES_PER_EMITTER = 256;
const QUAD_CORNERS = new Float32Array([
  -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
]);
const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);

// ── Texture cache ──

interface ParticleTextureEntry {
  texture: Texture;
  retryAfter?: number;
}

const PARTICLE_TEXTURE_RETRY_MS = 5_000;
const _textureCache = new Map<string, ParticleTextureEntry>();
/** Set of textures whose image data has finished loading. */
export const particleTexturesReady = new Set<Texture>();

/** 1×1 white placeholder so particles are visible before async textures load. */
const _placeholderTexture = new DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
  RGBAFormat,
  UnsignedByteType,
);
_placeholderTexture.needsUpdate = true;

/**
 * ParticleData::preload loads its texture as type 4 (TextureManager
 * FUN_0044bbf0 / FUN_0044b730): mip levels are extruded and the GL filters
 * are GL_LINEAR_MIPMAP_NEAREST / GL_LINEAR with GL_REPEAT wrap, so a small
 * or distant particle samples an averaged blob rather than its full-res
 * peak. Colour space stays raw: the engine modulates 8-bit texels by the
 * datablock colour with no gamma handling.
 */
function setupParticleTexture(tex: Texture): void {
  setupEffectTexture(tex, NoColorSpace);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapNearestFilter;
}

export function getParticleTexture(textureName: string): Texture {
  if (!textureName) return _placeholderTexture;
  const cached = _textureCache.get(textureName);
  if (
    cached &&
    (cached.retryAfter === undefined || performance.now() < cached.retryAfter)
  )
    return cached.texture;
  try {
    const url = textureToUrl(textureName);
    // Share decoded pixels, not sampler/color-space settings with other effects.
    const tex = cached?.texture ?? new Texture();
    const entry: ParticleTextureEntry = cached ?? { texture: tex };
    if (!cached) setupParticleTexture(tex);
    entry.retryAfter = undefined;
    const source = loadBitmapTexture(
      url,
      (loaded) => {
        tex.source = loaded.source;
        markTextureSamplerUpdate(tex);
        particleTexturesReady.add(tex);
      },
      () => {
        entry.retryAfter = performance.now() + PARTICLE_TEXTURE_RETRY_MS;
      },
    );
    tex.source = source.source;
    _textureCache.set(textureName, entry);
    return tex;
  } catch {
    if (cached) {
      cached.retryAfter = performance.now() + PARTICLE_TEXTURE_RETRY_MS;
      return cached.texture;
    }
    return _placeholderTexture;
  }
}

// ── Geometry builder ──

function particleAttribute(capacity: number, itemSize: number) {
  return new InstancedBufferAttribute(
    new Float32Array(capacity * itemSize),
    itemSize,
  ).setUsage(DynamicDrawUsage);
}

export function createParticleGeometry(
  maxParticles: number,
  interpolate = false,
): InstancedBufferGeometry {
  const geo = new InstancedBufferGeometry();
  // Share the immutable quad arrays. Each wrapper owns its own GPU buffer,
  // since Three.js deletes a geometry's attributes when it is disposed.
  geo.setIndex(new BufferAttribute(QUAD_INDICES, 1));
  geo.setAttribute("quadCorner", new BufferAttribute(QUAD_CORNERS, 2));
  // Three.js reads position when computing the depth for transparent sorting.
  geo.setAttribute("position", particleAttribute(maxParticles, 3));
  geo.setAttribute("particleColor", particleAttribute(maxParticles, 4));
  geo.setAttribute("particleSize", particleAttribute(maxParticles, 1));
  geo.setAttribute("particleSpin", particleAttribute(maxParticles, 1));
  geo.setAttribute("orientDir", particleAttribute(maxParticles, 3));
  if (interpolate) {
    geo.setAttribute("particleVelocity", particleAttribute(maxParticles, 3));
    geo.setAttribute(
      "particleAcceleration",
      particleAttribute(maxParticles, 3),
    );
    geo.setAttribute("particleSpinRate", particleAttribute(maxParticles, 1));
  }

  geo.instanceCount = 0;
  return geo;
}

export function createParticleMaterial(
  texture: Texture,
  useInvAlpha: boolean,
  orientParticles = false,
  interpolate = false,
): ShaderMaterial {
  // Use the placeholder until the real texture's image data is ready.
  const ready = particleTexturesReady.has(texture);
  return new ShaderMaterial({
    defines: interpolate ? { INTERPOLATE_PARTICLES: 1 } : {},
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    uniforms: {
      particleTexture: { value: ready ? texture : _placeholderTexture },
      hasTexture: { value: true },
      debugOpacity: { value: 1.0 },
      uOrientParticles: { value: orientParticles },
      renderDelta: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    blending: useInvAlpha ? NormalBlending : AdditiveBlending,
  });
}

// ── Update GPU buffers from particle state ──

export function syncBuffers(active: ParticleBuffers): void {
  if (active.uploadedRevision === active.emitter.revision) return;
  active.uploadedRevision = active.emitter.revision;
  const particles = active.emitter.particles;
  const geo = active.geometry;
  const posAttr = geo.getAttribute("position") as BufferAttribute;
  const colorAttr = geo.getAttribute("particleColor") as BufferAttribute;
  const sizeAttr = geo.getAttribute("particleSize") as BufferAttribute;
  const spinAttr = geo.getAttribute("particleSpin") as BufferAttribute;
  const orientAttr = geo.getAttribute("orientDir") as BufferAttribute;
  const velocity = geo.getAttribute("particleVelocity") as
    BufferAttribute | undefined;
  const acceleration = geo.getAttribute("particleAcceleration") as
    BufferAttribute | undefined;
  const spinRate = geo.getAttribute("particleSpinRate") as
    BufferAttribute | undefined;

  const posArr = posAttr.array as Float32Array;
  const colArr = colorAttr.array as Float32Array;
  const sizeArr = sizeAttr.array as Float32Array;
  const spinArr = spinAttr.array as Float32Array;
  const orientArr = orientAttr.array as Float32Array;

  const count = Math.min(particles.length, posAttr.count);
  const useVelocity = active.emitter.data.orientOnVelocity;
  const data = active.emitter.data.particles;

  for (let i = 0; i < count; i++) {
    const p = particles[i];

    // Swizzle Torque [x,y,z] → Three.js [y,z,x].
    const tx = p.pos[1];
    const ty = p.pos[2];
    const tz = p.pos[0];

    // Orient direction: use velocity or initial orientDir, swizzled.
    const dir = useVelocity ? p.vel : p.orientDir;
    const odx = dir[1];
    const ody = dir[2];
    const odz = dir[0];

    // Pass particle colors as-is (sRGB / gamma space). ShaderMaterial does
    // not get automatic linear→sRGB output encoding, so linearizing here
    // would darken colors without compensation — matching V12's direct
    // gamma-space rendering.
    const ci = i * 4;
    colArr[ci] = p.r;
    colArr[ci + 1] = p.g;
    colArr[ci + 2] = p.b;
    colArr[ci + 3] = p.a;

    const pi = i * 3;
    posArr[pi] = tx;
    posArr[pi + 1] = ty;
    posArr[pi + 2] = tz;
    orientArr[pi] = odx;
    orientArr[pi + 1] = ody;
    orientArr[pi + 2] = odz;

    sizeArr[i] = p.size;
    spinArr[i] = p.currentSpin;
    if (velocity && acceleration && spinRate) {
      velocity.setXYZ(i, p.vel[1], p.vel[2], p.vel[0]);
      acceleration.setXYZ(
        i,
        p.acc[1] - p.vel[1] * data.dragCoefficient,
        p.acc[2] -
          p.vel[2] * data.dragCoefficient +
          active.emitter.worldGravity * data.gravityCoefficient,
        p.acc[0] - p.vel[0] * data.dragCoefficient,
      );
      spinRate.setX(i, (p.spinSpeed * Math.PI) / 180);
    }
  }

  setPrefixUpdateRange(posAttr, count);
  setPrefixUpdateRange(colorAttr, count);
  setPrefixUpdateRange(sizeAttr, count);
  setPrefixUpdateRange(spinAttr, count);
  setPrefixUpdateRange(orientAttr, count);
  if (velocity && acceleration && spinRate) {
    setPrefixUpdateRange(velocity, count);
    setPrefixUpdateRange(acceleration, count);
    setPrefixUpdateRange(spinRate, count);
  }

  geo.instanceCount = count;
}

/** Mark only the live instances for upload. */
function setPrefixUpdateRange(attr: BufferAttribute, count: number): void {
  attr.clearUpdateRanges();
  if (count > 0) {
    attr.addUpdateRange(0, count * attr.itemSize);
    attr.needsUpdate = true;
  }
}
