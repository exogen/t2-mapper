export const particleVertexShader = /* glsl */ `
// 'position' is auto-declared by Three.js for ShaderMaterial.
attribute vec4 particleColor;
attribute float particleSize;
attribute float particleSpin;
attribute vec2 quadCorner; // (-0.5,-0.5) to (0.5,0.5)

varying vec2 vUv;
varying vec4 vColor;

void main() {
  vUv = quadCorner + 0.5; // [0,1] range
  vColor = particleColor;

  // Transform particle center to view space for billboarding.
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
`;

export const particleFragmentShader = /* glsl */ `
uniform sampler2D particleTexture;
uniform bool hasTexture;

varying vec2 vUv;
varying vec4 vColor;

void main() {
  if (hasTexture) {
    vec4 texColor = texture2D(particleTexture, vUv);
    gl_FragColor = texColor * vColor;
  } else {
    gl_FragColor = vColor;
  }
}
`;
