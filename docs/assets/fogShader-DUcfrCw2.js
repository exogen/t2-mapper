import{v as e}from"./events-9ce18a08.esm-ByOytsPo.js";import{$r as t,$t as n,Hn as r,Ja as i,Qi as a,Rn as o,Wi as s,ft as c,ja as l}from"./three.core-DtjtRha-.js";var u=new n;u.setOptions({premultiplyAlpha:`none`});var d=new Map,f=new Map;function p(e,t,n){let r=d.get(e);if(r){if(r.image)t?.(r);else if(t||n){let r=f.get(e)??[];r.push({onLoad:t,onError:n}),f.set(e,r)}return r}let i=new l;return i.flipY=!1,d.set(e,i),u.load(e,n=>{i.image=n,i.needsUpdate=!0,t?.(i);let r=f.get(e);f.delete(e);for(let e of r??[])e.onLoad?.(i)},void 0,()=>{d.delete(e),n?.(e);let t=f.get(e);f.delete(e);for(let n of t??[])n.onError?.(e)}),i}function m(e,t){let n=new l;return n.flipY=!1,n.source=p(e,e=>{n.source=e.source,n.needsUpdate=!0},t).source,n}function h(e){return new Promise((t,n)=>{p(e,t,e=>n(Error(`Failed to load texture: ${e}`)))})}function g(e,t={}){let{repeat:n=[1,1],disableMipmaps:i=!1,anisotropy:c,noColorSpace:l=!1}=t;return e.wrapS=e.wrapT=s,l||(e.colorSpace=a),e.repeat.set(...n),e.flipY=!1,e.anisotropy=c??1,i?(e.generateMipmaps=!1,e.minFilter=o):(e.generateMipmaps=!0,e.minFilter=r),e.magFilter=o,e.image&&(e.needsUpdate=!0),e}function _(e,n=256){let r=[];for(let a=0;a<e.length;a+=3){let l=e[a],u=e[a+1],d=e[a+2],f=n*n,p=new Uint8Array(f*4);for(let e=0;e<f;e++)p[e*4]=l[e],p[e*4+1]=u?u[e]:0,p[e*4+2]=d?d[e]:0,p[e*4+3]=255;let m=new c(p,n,n,t,i);m.colorSpace=``,m.wrapS=m.wrapT=s,m.generateMipmaps=!1,m.minFilter=o,m.magFilter=o,m.needsUpdate=!0,r.push(m)}return r}var v=`
#ifdef USE_FOG
  // Check fog enabled uniform - allows toggling without shader recompilation
  #ifdef USE_VOLUMETRIC_FOG
  if (!fogEnabled) {
    // Skip all fog calculations when disabled
  } else {
  #endif

  // Scale distance for fog calculations — makes everything appear closer/further
  // for fog purposes without changing actual geometry positions.
  float dist = vFogDepth / fogDistanceScale;

  // Discard fragments at or beyond visible distance - matches Torque's behavior
  // where objects beyond visibleDistance are not rendered at all.
  // This prevents fully-fogged geometry from showing as silhouettes against
  // the sky's fog-to-sky gradient.
  if (dist >= fogFar) {
    discard;
  }

  // Step 1: Calculate distance-based haze (quadratic falloff)
  // Since we discard at fogFar, haze never reaches 1.0 here
  float haze = 0.0;
  if (dist > fogNear) {
    float fogScale = 1.0 / (fogFar - fogNear);
    float distFactor = (dist - fogNear) * fogScale - 1.0;
    haze = 1.0 - distFactor * distFactor;
  }

  // Step 2: Calculate fog volume contributions
  // Note: Per-volume colors are NOT used in Tribes 2 ($specialFog defaults to false)
  // All fog uses the global fogColor - see Tribes2_Fog_System.md for details
  float volumeFog = 0.0;

  #ifdef USE_VOLUMETRIC_FOG
  {
    #ifdef USE_FOG_WORLD_POSITION
      float fragmentHeight = vFogWorldPosition.y;
    #else
      float fragmentHeight = cameraHeight;
    #endif

    // Tribes2.exe never evaluates volume fog at the exact fragment
    // height: terrain fog is sampled from a 64-row fog texture whose
    // rows are fixed world heights spanning the terrain's height range,
    // bilinearly interpolated (SceneGraph::buildFogTexture, 0x569fc0).
    // Evaluate the fog at the two nearest row heights and blend — exact
    // per-pixel evaluation produces razor-sharp volume boundaries (and
    // a pop when the camera crosses one) that the real engine never
    // shows. Row step 0 (no terrain) falls back to exact evaluation,
    // matching the engine (no fog texture without a terrain).
    float rowT = 0.0;
    float sampleH0 = fragmentHeight;
    float sampleH1 = fragmentHeight;
    if (fogRowStep > 0.0) {
      float rowF = (fragmentHeight - fogRowBase) / fogRowStep;
      float row0 = floor(rowF);
      rowT = rowF - row0;
      sampleH0 = fogRowBase + row0 * fogRowStep;
      sampleH1 = sampleH0 + fogRowStep;
    }

    float fogSamples[2];
    for (int s = 0; s < 2; s++) {
      float sampleHeight = (s == 0) ? sampleH0 : sampleH1;
      float sampleFog = 0.0;
      float deltaY = sampleHeight - cameraHeight;
      float absDeltaY = abs(deltaY);

      if (absDeltaY > 0.01) {
        // Non-horizontal ray: ray-march through fog volumes
        for (int i = 0; i < 3; i++) {
          // [factor, minH, maxH, 0]; factor is Torque's
          // percentage / (visDist * smVisibleDistanceMod), precomputed
          // CPU-side in packFogVolumeData. 0 = inactive volume.
          vec4 vol = fogVolumeData[i];
          if (vol.x <= 0.0) continue;

          // Find ray intersection with this volume's height range
          float rayMinY = min(cameraHeight, sampleHeight);
          float rayMaxY = max(cameraHeight, sampleHeight);

          if (rayMinY < vol.z && rayMaxY > vol.y) {
            float intersectMin = max(rayMinY, vol.y);
            float intersectMax = min(rayMaxY, vol.z);
            float intersectHeight = intersectMax - intersectMin;

            // Distance traveled through this volume (similar triangles):
            // subDist / dist = intersectHeight / absDeltaY
            float subDist = dist * (intersectHeight / absDeltaY);
            sampleFog += subDist * vol.x;
          }
        }
      } else {
        // Near-horizontal ray: if camera is inside a volume, apply full
        // fog for that volume (the engine's partial-band case)
        for (int i = 0; i < 3; i++) {
          vec4 vol = fogVolumeData[i];
          if (vol.x <= 0.0) continue;

          if (cameraHeight >= vol.y && cameraHeight <= vol.z) {
            sampleFog += dist * vol.x;
          }
        }
      }
      // The engine clamps each texel's alpha BEFORE bilinear filtering;
      // mixing raw oversaturated samples would skew blends toward opaque
      // near dense volumes, sharpening boundaries the engine keeps soft.
      fogSamples[s] = min(sampleFog, 1.0);
    }
    volumeFog = mix(fogSamples[0], fogSamples[1], rowT);
  }
  #endif

  // Step 3: Combine haze and volume fog
  // Torque's clamping: if (bandPct + hazePct > 1) hazePct = 1 - bandPct
  // This gives fog volumes priority over haze
  float volPct = min(volumeFog, 1.0);
  float hazePct = haze;
  if (volPct + hazePct > 1.0) {
    hazePct = 1.0 - volPct;
  }
  float fogFactor = hazePct + volPct;

  #ifdef FOG_ADDITIVE
  // An additive surface cannot mix toward the fog colour — that would ADD
  // fog. The engine disables the fog texture stage for Additive/Subtractive
  // materials and scales their alpha by 1 - fog instead (tsMesh.cc; the
  // flare spikes do the same with 1 - haze, FUN_0063e2e0), so they fade out.
  gl_FragColor.rgb *= 1.0 - fogFactor;
  #else
  // Apply fog using global fogColor (per-volume colors not used in Tribes 2)
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif

  #ifdef USE_VOLUMETRIC_FOG
  } // end fogEnabled check
  #endif
#endif
`;function y(){e.fog_pars_fragment=`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif

  // Custom volumetric fog uniforms (only defined when USE_VOLUMETRIC_FOG is set)
  // Per volume: [factor, minH, maxH, 0] (see packFogVolumeData)
  #ifdef USE_VOLUMETRIC_FOG
    uniform vec4 fogVolumeData[3];
    uniform float cameraHeight;
    uniform float fogRowBase;
    uniform float fogRowStep;
  #endif

  #ifdef USE_FOG_WORLD_POSITION
    varying vec3 vFogWorldPosition;
  #endif

  // Fog distance scale — multiplies all distance-based fog calculations.
  // 1.0 = normal, >1 = less fog. Set by camera tour for distant orbits.
  #ifdef HAS_FOG_DISTANCE_SCALE
    uniform float fogDistanceScale;
  #else
    #define fogDistanceScale 1.0
  #endif

#endif
`,e.fog_fragment=v,e.fog_pars_vertex=`
#ifdef USE_FOG
  varying float vFogDepth;
  #ifdef USE_FOG_WORLD_POSITION
    varying vec3 vFogWorldPosition;
  #endif
#endif
`,e.fog_vertex=`
#ifdef USE_FOG
  // Use Euclidean distance from camera, not view-space z-depth
  // This ensures fog doesn't change when rotating the camera
  vFogDepth = length(mvPosition.xyz);
  #ifdef USE_FOG_WORLD_POSITION
    vec4 _fogPos2 = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      _fogPos2 = instanceMatrix * _fogPos2;
    #endif
    vFogWorldPosition = (modelMatrix * _fogPos2).xyz;
  #endif
#endif
`}function b(e,t){e.uniforms.fogVolumeData=t.fogVolumeData,e.uniforms.cameraHeight=t.cameraHeight,e.uniforms.fogEnabled=t.fogEnabled,e.uniforms.fogDistanceScale=t.fogDistanceScale,e.uniforms.fogRowBase=t.fogRowBase,e.uniforms.fogRowStep=t.fogRowStep}function x(e,t,n={}){b(e,t),n.additive&&(e.fragmentShader=`#define FOG_ADDITIVE\n${e.fragmentShader}`),e.vertexShader=e.vertexShader.replace(`#include <fog_pars_vertex>`,`#include <fog_pars_vertex>
#ifdef USE_FOG
  #define USE_FOG_WORLD_POSITION
  #define USE_VOLUMETRIC_FOG
  varying vec3 vFogWorldPosition;
#endif`),e.vertexShader=e.vertexShader.replace(`#include <fog_vertex>`,`#include <fog_vertex>
#ifdef USE_FOG
  vec4 _fogPos3 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    _fogPos3 = instanceMatrix * _fogPos3;
  #endif
  vFogWorldPosition = (modelMatrix * _fogPos3).xyz;
#endif`),e.fragmentShader=e.fragmentShader.replace(`#include <fog_pars_fragment>`,`#define HAS_FOG_DISTANCE_SCALE
#include <fog_pars_fragment>
#ifdef USE_FOG
  #define USE_VOLUMETRIC_FOG
  uniform vec4 fogVolumeData[3];
  uniform float cameraHeight;
  uniform float fogRowBase;
  uniform float fogRowStep;
  uniform bool fogEnabled;
  #define USE_FOG_WORLD_POSITION
  varying vec3 vFogWorldPosition;
#endif`),e.fragmentShader=e.fragmentShader.replace(`#include <fog_fragment>`,v)}function S(e,t,n={}){e.vertexShader=e.vertexShader.replace(`#include <fog_vertex>`,`vec3 transformed = vec3(0.0);
#include <fog_vertex>`),x(e,t,n)}export{p as a,_ as c,y as i,g as l,x as n,h as o,S as r,m as s,v as t};