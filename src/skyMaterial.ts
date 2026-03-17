import { ShaderMaterial } from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const fragmentShader = /*glsl*/ `
  uniform samplerCube skybox;
  uniform vec3 fogColor;
  uniform bool enableFog;
  uniform mat4 inverseProjectionMatrix;
  uniform mat4 cameraMatrixWorld;
  uniform float cameraHeight;
  uniform float fogVolumeData[12];
  uniform float horizonFogHeight;

  varying vec2 vUv;


  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 viewPos = inverseProjectionMatrix * vec4(ndc, 1.0, 1.0);
    viewPos.xyz /= viewPos.w;
    vec3 direction = normalize((cameraMatrixWorld * vec4(viewPos.xyz, 0.0)).xyz);
    direction = vec3(direction.z, direction.y, -direction.x);
    // Sample skybox - Three.js CubeTexture with SRGBColorSpace auto-converts to linear
    vec4 skyColor = textureCube(skybox, direction);
    vec3 finalColor;

    if (enableFog) {
      // fogColor is passed in linear space (converted in Sky.tsx)

      // Calculate how much fog volume the ray passes through
      // For skybox at "infinite" distance, the relevant height is how much
      // of the volume is above/below camera depending on view direction
      float volumeFogInfluence = 0.0;

      for (int i = 0; i < 3; i++) {
        int offset = i * 4;
        float volVisDist = fogVolumeData[offset + 0];
        float volMinH = fogVolumeData[offset + 1];
        float volMaxH = fogVolumeData[offset + 2];
        float volPct = fogVolumeData[offset + 3];

        if (volVisDist <= 0.0) continue;

        // Check if camera is inside this volume
        if (cameraHeight >= volMinH && cameraHeight <= volMaxH) {
          // Camera is inside the fog volume
          // Looking horizontally or up at shallow angles means ray travels
          // through more fog before exiting the volume
          float heightAboveCamera = volMaxH - cameraHeight;
          float heightBelowCamera = cameraHeight - volMinH;
          float volumeHeight = volMaxH - volMinH;

          // For horizontal rays (direction.y ≈ 0), maximum fog influence
          // For rays going up steeply, less fog (exits volume quickly)
          // For rays going down, more fog (travels through volume below)
          float rayInfluence;
          if (direction.y >= 0.0) {
            // Looking up: influence based on how steep we're looking
            // Shallow angles = long path through fog = high influence
            rayInfluence = 1.0 - smoothstep(0.0, 0.3, direction.y);
          } else {
            // Looking down: always high fog (into the volume)
            rayInfluence = 1.0;
          }

          // Scale by percentage and volume depth factor
          volumeFogInfluence += rayInfluence * volPct;
        }
      }

      // Base fog factor from view direction (for haze at horizon)
      // In Torque, the fog "bans" (bands) are rendered as geometry from
      // height 0 (HORIZON) to height 60 (OFFSET_HEIGHT) on the skybox.
      // The skybox corner is at mSkyBoxPt.x = mRadius / sqrt(3).
      //
      // horizonFogHeight is the direction.y value where the fog band ends:
      //   horizonFogHeight = 60 / sqrt(skyBoxPt.x^2 + 60^2)
      //
      // For Firestorm (visDist=600): mRadius=570, skyBoxPt.x=329, horizonFogHeight≈0.18
      //
      // Torque renders the fog bands as geometry with linear vertex alpha
      // interpolation. We use a squared curve (t^2) to create a gentler
      // falloff at the top of the gradient, matching Tribes 2's appearance.
      float baseFogFactor;
      if (direction.y <= 0.0) {
        // Looking at or below horizon: full fog
        baseFogFactor = 1.0;
      } else if (direction.y >= horizonFogHeight) {
        // Above fog band: no fog
        baseFogFactor = 0.0;
      } else {
        // Within fog band: squared curve for gentler falloff at top
        float t = direction.y / horizonFogHeight;
        baseFogFactor = (1.0 - t) * (1.0 - t);
      }

      // Combine base fog with volume fog influence
      // When inside a volume, increase fog intensity
      float finalFogFactor = min(1.0, baseFogFactor + volumeFogInfluence * 0.5);

      // Mix in linear space (skybox and fogColor are both linear)
      finalColor = mix(skyColor.rgb, fogColor, finalFogFactor);
    } else {
      finalColor = skyColor.rgb;
    }
    gl_FragColor = vec4(finalColor, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createSkyBoxMaterial({ uniforms }: { uniforms: any }) {
  return new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    depthWrite: false,
    depthTest: false,
  });
}
