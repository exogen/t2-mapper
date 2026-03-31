var e={directional:1,ambient:1.5};function t(t){t.uniforms.shapeDirectionalFactor={value:e.directional},t.uniforms.shapeAmbientFactor={value:e.ambient},t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>
uniform float shapeDirectionalFactor;
uniform float shapeAmbientFactor;
`),t.fragmentShader=t.fragmentShader.replace(`#include <lights_fragment_end>`,`#include <lights_fragment_end>
  // Apply shape-specific lighting multipliers
  reflectedLight.directDiffuse *= shapeDirectionalFactor;
  reflectedLight.indirectDiffuse *= shapeAmbientFactor;
`)}var n={shapeEnvMap:{value:null},shapeEnvMapActive:{value:!1},shapeEnvMapDebugUV:{value:!1}};function r(e){n.shapeEnvMap.value=e,n.shapeEnvMapActive.value=!0}function i(){n.shapeEnvMap.value=null,n.shapeEnvMapActive.value=!1}function a(e,t){e.uniforms.shapeEnvMap=n.shapeEnvMap,e.uniforms.shapeEnvMapActive=n.shapeEnvMapActive,e.uniforms.shapeEnvMapDebugUV=n.shapeEnvMapDebugUV,e.uniforms.shapeReflectionAmount={value:t},e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
uniform sampler2D shapeEnvMap;
uniform bool shapeEnvMapActive;
uniform float shapeReflectionAmount;
uniform bool shapeEnvMapDebugUV;
varying vec2 vShapeSphereUV;
`),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec2 vShapeSphereUV;
`),e.vertexShader=e.vertexShader.replace(`#include <fog_vertex>`,`#include <fog_vertex>
{
  vec3 _eyePos = (modelViewMatrix * vec4(transformed, 1.0)).xyz;
  #ifdef FLAT_SHADED
    vec3 _eyeN = vec3(0.0, 0.0, 1.0);
  #else
    vec3 _eyeN = normalize(normalMatrix * normal);
  #endif
  vec3 _eyeU = normalize(_eyePos);
  vec3 _r = reflect(_eyeU, _eyeN);
  float _m = 2.0 * sqrt(_r.x * _r.x + _r.z * _r.z + (_r.y + 1.0) * (_r.y + 1.0));
  vShapeSphereUV = vec2(_r.x, -_r.z) / _m + 0.5;
}
`),e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,`// Tribes 2 sphere-map environment reflections (GL_INTERPOLATE)
if (shapeEnvMapActive && shapeReflectionAmount > 0.0) {
  if (shapeEnvMapDebugUV) {
    outgoingLight = vec3(vShapeSphereUV, 0.0);
  } else {
    vec3 _envColor = texture2D(shapeEnvMap, vShapeSphereUV).rgb;
    #ifdef USE_MAP
      float _baseAlpha = texture2D(map, vMapUv).a;
    #else
      float _baseAlpha = 1.0;
    #endif
    float _factor = _baseAlpha * shapeReflectionAmount;
    // Torque blends in sRGB space (fixed-function pipeline, no gamma).
    // Convert outgoingLight to sRGB, mix with sRGB env map, convert back.
    vec3 _baseSRGB = pow(max(outgoingLight, 0.0), vec3(1.0 / 2.2));
    outgoingLight = pow(mix(_baseSRGB, _envColor, _factor), vec3(2.2));
  }
}
#include <opaque_fragment>`)}export{n as a,r as i,t as n,i as r,a as t};