export const particleVertexShader = /* glsl */ `
// 'position' is auto-declared by Three.js for ShaderMaterial.
attribute vec4 particleColor;
attribute float particleSize;
attribute float particleSpin;
attribute vec2 quadCorner; // (-0.5,-0.5) to (0.5,0.5)
attribute vec3 orientDir;

uniform bool uOrientParticles;
// cameraPosition is a built-in Three.js uniform.

varying vec2 vUv;
varying vec4 vColor;

void main() {
  vUv = quadCorner + 0.5; // [0,1] range
  vColor = particleColor;

  if (uOrientParticles) {
    if (length(orientDir) < 0.0001) {
      // V12: don't render oriented particles with zero velocity.
      gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }
    // V12 oriented particle: quad aligned along direction, facing camera.
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 dir = normalize(orientDir);
    vec3 dirFromCam = worldPos - cameraPosition;
    vec3 crossDir = normalize(cross(dirFromCam, dir));

    // V12 maps U along dir (velocity) — match by using quadCorner.x for dir.
    vec3 offset = dir * quadCorner.x + crossDir * quadCorner.y;
    worldPos += offset * particleSize;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  } else {
    // Standard camera-facing billboard.
    vec3 viewPos = (modelViewMatrix * vec4(position, 1.0)).xyz;

    // Apply spin rotation to quad corner.
    float c = cos(particleSpin);
    float s = sin(particleSpin);
    vec2 rotated = vec2(
      c * quadCorner.x - s * quadCorner.y,
      s * quadCorner.x + c * quadCorner.y
    );

    // Offset in view space (camera-facing billboard).
    viewPos.xy += rotated * particleSize;

    gl_Position = projectionMatrix * vec4(viewPos, 1.0);
  }
}
`;

export const particleFragmentShader = /* glsl */ `
uniform sampler2D particleTexture;
uniform bool hasTexture;
uniform float debugOpacity;

varying vec2 vUv;
varying vec4 vColor;

void main() {
  if (hasTexture) {
    vec4 texColor = texture2D(particleTexture, vUv);
    gl_FragColor = texColor * vColor;
  } else {
    gl_FragColor = vColor;
  }
  gl_FragColor.a *= debugOpacity;
}
`;
