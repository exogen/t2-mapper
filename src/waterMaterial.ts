import { ShaderMaterial, Texture, DoubleSide, Color } from "three";

/**
 * Tribes 2 WaterBlock shader material
 *
 * Based on analysis of the Torque V12 engine fluid rendering code.
 * The original engine renders water in multiple passes:
 * - Phase 1a: Base texture rotated 30°
 * - Phase 1b: Base texture rotated 60° with drift animation
 * - Phase 3: Environment/specular map with reflection UVs
 * - Fog: Integrated with Three.js scene fog (original used custom fog overlay)
 *
 * Key animation parameters from the engine:
 * - Wave motion: sin(X*0.05 + time) + sin(Y*0.05 + time)
 * - Base texture tiles at 1/48 world units
 * - Drift cycle time: 8 seconds
 * - Drift rate: 0.02 linear, 0.03 cosine amplitude
 * - Cross-fade swing: (A1+A2)*0.15 + 0.5 where A1/A2 are time-modulated
 */

const vertexShader = /* glsl */ `
  #include <fog_pars_vertex>

  uniform float uTime;
  uniform float uWaveMagnitude;

  varying vec3 vWorldPosition;
  varying vec3 vViewVector;
  varying float vDistance;

  // Wave function matching Tribes 2 engine
  // Z = surfaceZ + (sin(X*0.05 + time) + sin(Y*0.05 + time)) * waveFactor
  // waveFactor = waveAmplitude * 0.25
  // Note: Using xz for Three.js Y-up (Torque uses XY with Z-up)
  float getWaveHeight(vec3 worldPos) {
    float waveFactor = uWaveMagnitude * 0.25;
    return (sin(worldPos.x * 0.05 + uTime) + sin(worldPos.z * 0.05 + uTime)) * waveFactor;
  }

  void main() {
    // Get world position for wave calculation
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;

    // Apply wave displacement to Y (vertical axis in Three.js)
    vec3 displaced = position;
    displaced.y += getWaveHeight(worldPos.xyz);

    // Calculate view vector for environment mapping
    vViewVector = cameraPosition - worldPos.xyz;
    vDistance = length(vViewVector);

    vec4 mvPosition = viewMatrix * modelMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <fog_pars_fragment>

  uniform float uTime;
  uniform float uOpacity;
  uniform float uEnvMapIntensity;
  uniform sampler2D uBaseTexture;
  uniform sampler2D uEnvMapTexture;

  varying vec3 vWorldPosition;
  varying vec3 vViewVector;
  varying float vDistance;

  #define TWO_PI 6.283185307179586

  // Constants from Tribes 2 engine
  #define BASE_DRIFT_CYCLE_TIME 8.0
  #define BASE_DRIFT_RATE 0.02
  #define BASE_DRIFT_SCALAR 0.03
  #define TEXTURE_SCALE (1.0 / 48.0)

  // Environment map UV wobble constants
  #define Q1 150.0
  #define Q2 2.0
  #define Q3 0.01

  // Rotate UV coordinates
  vec2 rotateUV(vec2 uv, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(
      uv.x * c - uv.y * s,
      uv.x * s + uv.y * c
    );
  }

  void main() {
    // Calculate base texture UVs using world position (1/48 tiling)
    // Note: In Three.js Y-up coordinates, the water surface is on the XZ plane
    // Torque uses Z-up where the surface is XY, so we use xz here
    vec2 baseUV = vWorldPosition.xz * TEXTURE_SCALE;

    // Phase (time in radians for drift cycle)
    float phase = mod(uTime * (TWO_PI / BASE_DRIFT_CYCLE_TIME), TWO_PI);

    // Base texture drift
    float baseDriftX = uTime * BASE_DRIFT_RATE;
    float baseDriftY = cos(phase) * BASE_DRIFT_SCALAR;

    // === Phase 1a: First base texture pass (rotated 30 degrees) ===
    vec2 uv1a = rotateUV(baseUV, radians(30.0));

    // === Phase 1b: Second base texture pass (rotated 60 degrees total, with drift) ===
    // OpenGL matrix order: glRotatef(60) then glTranslatef(drift) means
    // the transform is R60 * T, so when applied to UV: R60 * (UV + drift)
    // Translation is applied first, then rotation.
    vec2 uv1b = rotateUV(baseUV + vec2(baseDriftX, baseDriftY), radians(60.0));

    // Calculate cross-fade swing value
    // From engine: A1 = cos((X/Q1 + time/Q2) * 6.0), A2 = sin((Y/Q1 + time/Q2) * 6.28)
    // Using xz for Three.js Y-up coordinate system
    float A1 = cos(((vWorldPosition.x / Q1) + (uTime / Q2)) * 6.0);
    float A2 = sin(((vWorldPosition.z / Q1) + (uTime / Q2)) * TWO_PI);
    float swing = (A1 + A2) * 0.15 + 0.5;

    // Cross-fade alpha calculation from engine
    // alpha1a = ((1-swing) * opacity) / (1 - (swing * opacity))
    // alpha1b = swing * opacity
    float alpha1a = ((1.0 - swing) * uOpacity) / max(1.0 - (swing * uOpacity), 0.001);
    float alpha1b = swing * uOpacity;

    // Sample base texture for both passes
    vec4 texColor1a = texture2D(uBaseTexture, uv1a);
    vec4 texColor1b = texture2D(uBaseTexture, uv1b);

    // Simulate multi-pass alpha accumulation (screen blend formula)
    // Pass 1a: framebuffer = tex1a * alpha1a + bg * (1 - alpha1a)
    // Pass 1b: framebuffer = tex1b * alpha1b + prev * (1 - alpha1b)
    // Combined alpha = 1 - (1 - alpha1a) * (1 - alpha1b)
    float combinedAlpha = 1.0 - (1.0 - alpha1a) * (1.0 - alpha1b);

    // Combined color (premultiplied then divided by combined alpha)
    // color = tex1b * alpha1b + tex1a * alpha1a * (1 - alpha1b)
    vec3 baseColor = (texColor1a.rgb * alpha1a * (1.0 - alpha1b) + texColor1b.rgb * alpha1b) / max(combinedAlpha, 0.001);

    // === Phase 3: Environment map / specular ===
    // Reflection UV calculation from engine (fluidQuadTree.cc lines 910-962)
    // Engine uses eye-to-point vector (point - eye), unnormalized.
    // vViewVector is camera - worldPos (point-to-eye), so we negate it.
    // Torque Z-up maps XY to UV; Three.js Y-up maps XZ to UV.
    vec3 reflectVec = -vViewVector;
    reflectVec.y = abs(reflectVec.y);  // Y is vertical in Three.js (was Z in Torque)
    if (reflectVec.y < 0.001) reflectVec.y = 0.001;

    vec2 envUV;
    if (vDistance < 0.001) {
      envUV = vec2(0.0);
    } else {
      // Standard UV reflection mapping with adjustment to reduce edge emphasis
      float value = (vDistance - reflectVec.y) / (vDistance * vDistance);
      envUV.x = reflectVec.x * value;
      envUV.y = reflectVec.z * value;  // Z maps to V in Three.js Y-up
    }

    // Convert from [-1,1] to [0,1]
    envUV = envUV * 0.5 + 0.5;

    // Add time-based wobble to environment map
    envUV.x += A1 * Q3;
    envUV.y += A2 * Q3;

    vec4 envColor = texture2D(uEnvMapTexture, envUV);

    // Blend environment map additively (GL_SRC_ALPHA, GL_ONE in original engine)
    // Engine uses GL_MODULATE with color (1,1,1,envMapIntensity), so texture alpha
    // is multiplied with intensity before additive blend.
    vec3 finalColor = baseColor + envColor.rgb * envColor.a * uEnvMapIntensity;

    gl_FragColor = vec4(finalColor, combinedAlpha);

    // Apply scene fog (integrated with Three.js fog system)
    #include <fog_fragment>
  }
`;

export function createWaterMaterial(options?: {
  opacity?: number;
  waveMagnitude?: number;
  envMapIntensity?: number;
  baseTexture?: Texture | null;
  envMapTexture?: Texture | null;
}): ShaderMaterial {
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: options?.opacity ?? 0.75 },
      uWaveMagnitude: { value: options?.waveMagnitude ?? 1.0 },
      uEnvMapIntensity: { value: options?.envMapIntensity ?? 1.0 },
      uBaseTexture: { value: options?.baseTexture ?? null },
      uEnvMapTexture: { value: options?.envMapTexture ?? null },
      // Fog uniforms (Three.js populates these from scene fog when fog: true)
      fogColor: { value: new Color() },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    side: DoubleSide,
    // NOTE: Engine uses glDepthMask(GL_FALSE) for water, but we use depthWrite: true
    // so that force fields (which render after water with depthWrite: false) are
    // correctly occluded per-pixel when underwater.
    depthWrite: true,
    fog: true,
  });

  return material;
}
