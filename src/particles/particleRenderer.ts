import {
  AdditiveBlending,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LinearMipmapNearestFilter,
  NoColorSpace,
  NormalBlending,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  Texture,
  Uint16BufferAttribute,
  UnsignedByteType,
} from "three";
import { textureToUrl } from "../loaders";
import { loadTexture } from "../textureUtils";
import { setupEffectTexture } from "../stream/playbackUtils";
import { particleVertexShader, particleFragmentShader } from "./shaders";
import type { EmitterInstance } from "./ParticleSystem";
export interface ParticleBuffers {
  emitter: EmitterInstance;
  geometry: BufferGeometry;
  uploadedRevision?: number;
}
export const MAX_PARTICLES_PER_EMITTER = 256;
const QUAD_CORNERS = new Float32Array([
  -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
]);

// ── Texture cache ──

const _textureCache = new Map<string, Texture>();
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
  if (cached) return cached;
  try {
    const url = textureToUrl(textureName);
    // Share decoded pixels, not sampler/color-space settings with other effects.
    const tex = new Texture();
    setupParticleTexture(tex);
    const source = loadTexture(url, (loaded) => {
      tex.source = loaded.source;
      tex.needsUpdate = true;
      particleTexturesReady.add(tex);
    });
    tex.source = source.source;
    _textureCache.set(textureName, tex);
    return tex;
  } catch {
    return _placeholderTexture;
  }
}

// ── Geometry builder ──

export function createParticleGeometry(
  maxParticles: number,
  interpolate = false,
): BufferGeometry {
  const geo = new BufferGeometry();
  const vertCount = maxParticles * 4;
  const indexCount = maxParticles * 6;

  // Per-vertex quad corner offsets.
  const corners = new Float32Array(vertCount * 2);
  for (let i = 0; i < maxParticles; i++) {
    corners.set(QUAD_CORNERS, i * 8);
  }

  // Index buffer.
  const indices = new Uint16Array(indexCount);
  for (let i = 0; i < maxParticles; i++) {
    const vBase = i * 4;
    const iBase = i * 6;
    indices[iBase] = vBase;
    indices[iBase + 1] = vBase + 1;
    indices[iBase + 2] = vBase + 2;
    indices[iBase + 3] = vBase;
    indices[iBase + 4] = vBase + 2;
    indices[iBase + 5] = vBase + 3;
  }

  // Per-particle attributes (4 verts share the same value).
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 4);
  const sizes = new Float32Array(vertCount);
  const spins = new Float32Array(vertCount);
  const orientDirs = new Float32Array(vertCount * 3);

  geo.setIndex(new Uint16BufferAttribute(indices, 1));
  geo.setAttribute("quadCorner", new Float32BufferAttribute(corners, 2));
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("particleColor", new Float32BufferAttribute(colors, 4));
  geo.setAttribute("particleSize", new Float32BufferAttribute(sizes, 1));
  geo.setAttribute("particleSpin", new Float32BufferAttribute(spins, 1));
  geo.setAttribute("orientDir", new Float32BufferAttribute(orientDirs, 3));
  if (interpolate) {
    geo.setAttribute(
      "particleVelocity",
      new Float32BufferAttribute(new Float32Array(vertCount * 3), 3),
    );
    geo.setAttribute(
      "particleAcceleration",
      new Float32BufferAttribute(new Float32Array(vertCount * 3), 3),
    );
    geo.setAttribute(
      "particleSpinRate",
      new Float32BufferAttribute(new Float32Array(vertCount), 1),
    );
  }

  for (const [name, attribute] of Object.entries(geo.attributes)) {
    if (name !== "quadCorner")
      (attribute as Float32BufferAttribute).setUsage(DynamicDrawUsage);
  }
  geo.setDrawRange(0, 0);
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
  const posAttr = geo.getAttribute("position") as Float32BufferAttribute;
  const colorAttr = geo.getAttribute("particleColor") as Float32BufferAttribute;
  const sizeAttr = geo.getAttribute("particleSize") as Float32BufferAttribute;
  const spinAttr = geo.getAttribute("particleSpin") as Float32BufferAttribute;
  const orientAttr = geo.getAttribute("orientDir") as Float32BufferAttribute;
  const velocity = geo.getAttribute("particleVelocity") as
    Float32BufferAttribute | undefined;
  const acceleration = geo.getAttribute("particleAcceleration") as
    Float32BufferAttribute | undefined;
  const spinRate = geo.getAttribute("particleSpinRate") as
    Float32BufferAttribute | undefined;

  const posArr = posAttr.array as Float32Array;
  const colArr = colorAttr.array as Float32Array;
  const sizeArr = sizeAttr.array as Float32Array;
  const spinArr = spinAttr.array as Float32Array;
  const orientArr = orientAttr.array as Float32Array;

  const count = Math.min(particles.length, active.emitter.maxParticles);
  const useVelocity = active.emitter.data.orientOnVelocity;

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
    const lr = p.r;
    const lg = p.g;
    const lb = p.b;
    const la = p.a;

    // Write the same values to all 4 vertices of the quad.
    for (let v = 0; v < 4; v++) {
      const vi = i * 4 + v;
      const pi = vi * 3;
      posArr[pi] = tx;
      posArr[pi + 1] = ty;
      posArr[pi + 2] = tz;

      const ci = vi * 4;
      colArr[ci] = lr;
      colArr[ci + 1] = lg;
      colArr[ci + 2] = lb;
      colArr[ci + 3] = la;

      const oi = vi * 3;
      orientArr[oi] = odx;
      orientArr[oi + 1] = ody;
      orientArr[oi + 2] = odz;

      sizeArr[vi] = p.size;
      spinArr[vi] = p.currentSpin;
      if (velocity && acceleration && spinRate) {
        const data = active.emitter.data.particles;
        velocity.setXYZ(vi, p.vel[1], p.vel[2], p.vel[0]);
        acceleration.setXYZ(
          vi,
          p.acc[1] - p.vel[1] * data.dragCoefficient,
          p.acc[2] -
            p.vel[2] * data.dragCoefficient +
            active.emitter.worldGravity * data.gravityCoefficient,
          p.acc[0] - p.vel[0] * data.dragCoefficient,
        );
        spinRate.setX(vi, (p.spinSpeed * Math.PI) / 180);
      }
    }
  }

  // drawRange excludes dead quads, so only live particles need buffer writes.
  const quads = count;
  setPrefixUpdateRange(posAttr, quads * 4 * 3);
  setPrefixUpdateRange(colorAttr, quads * 4 * 4);
  setPrefixUpdateRange(sizeAttr, quads * 4);
  setPrefixUpdateRange(spinAttr, quads * 4);
  setPrefixUpdateRange(orientAttr, quads * 4 * 3);
  if (velocity && acceleration && spinRate) {
    setPrefixUpdateRange(velocity, quads * 12);
    setPrefixUpdateRange(acceleration, quads * 12);
    setPrefixUpdateRange(spinRate, quads * 4);
  }

  geo.setDrawRange(0, count * 6);
}

/** Mark only the first `floatCount` floats of the attribute for upload. */
function setPrefixUpdateRange(
  attr: Float32BufferAttribute,
  floatCount: number,
): void {
  attr.clearUpdateRanges();
  if (floatCount > 0) {
    attr.addUpdateRange(0, floatCount);
    attr.needsUpdate = true;
  }
}
