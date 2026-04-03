import{C as e,Dt as t,Ht as n,J as r,Ot as i,P as a,kt as o,q as s,t as c,zt as l}from"./three.module-DeDv86YO.js";var u=`
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

    float deltaY = fragmentHeight - cameraHeight;
    float absDeltaY = abs(deltaY);

    // Determine if we're going up (positive) or down (negative)
    if (absDeltaY > 0.01) {
      // Non-horizontal ray: ray-march through fog volumes
      for (int i = 0; i < 3; i++) {
        int offset = i * 4;
        float volVisDist = fogVolumeData[offset + 0];
        float volMinH = fogVolumeData[offset + 1];
        float volMaxH = fogVolumeData[offset + 2];
        float volPct = fogVolumeData[offset + 3];

        // Skip inactive volumes (visibleDistance = 0)
        if (volVisDist <= 0.0) continue;

        // Calculate fog factor for this volume
        // From Torque: factor = (1 / (volumeVisDist * visFactor)) * percentage
        // where visFactor is smVisibleDistanceMod (a user quality pref, default 1.0)
        // Since we don't have quality settings, we use visFactor = 1.0
        float factor = (1.0 / volVisDist) * volPct;

        // Find ray intersection with this volume's height range
        float rayMinY = min(cameraHeight, fragmentHeight);
        float rayMaxY = max(cameraHeight, fragmentHeight);

        // Check if ray intersects volume height range
        if (rayMinY < volMaxH && rayMaxY > volMinH) {
          float intersectMin = max(rayMinY, volMinH);
          float intersectMax = min(rayMaxY, volMaxH);
          float intersectHeight = intersectMax - intersectMin;

          // Calculate distance traveled through this volume using similar triangles:
          // subDist / dist = intersectHeight / absDeltaY
          float subDist = dist * (intersectHeight / absDeltaY);

          // Accumulate fog: fog += subDist * factor
          volumeFog += subDist * factor;
        }
      }
    } else {
      // Near-horizontal ray: if camera is inside a volume, apply full fog for that volume
      for (int i = 0; i < 3; i++) {
        int offset = i * 4;
        float volVisDist = fogVolumeData[offset + 0];
        float volMinH = fogVolumeData[offset + 1];
        float volMaxH = fogVolumeData[offset + 2];
        float volPct = fogVolumeData[offset + 3];

        if (volVisDist <= 0.0) continue;

        // If camera is inside this volume, apply fog for full distance
        if (cameraHeight >= volMinH && cameraHeight <= volMaxH) {
          float factor = (1.0 / volVisDist) * volPct;
          volumeFog += dist * factor;
        }
      }
    }
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

  // Apply fog using global fogColor (per-volume colors not used in Tribes 2)
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);

  #ifdef USE_VOLUMETRIC_FOG
  } // end fogEnabled check
  #endif
#endif
`;function d(){c.fog_pars_fragment=`
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
  // Format: [visDist, minH, maxH, percentage] x 3 volumes = 12 floats
  #ifdef USE_VOLUMETRIC_FOG
    uniform float fogVolumeData[12];
    uniform float cameraHeight;
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
`,c.fog_fragment=u,c.fog_pars_vertex=`
#ifdef USE_FOG
  varying float vFogDepth;
  #ifdef USE_FOG_WORLD_POSITION
    varying vec3 vFogWorldPosition;
  #endif
#endif
`,c.fog_vertex=`
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
`}function f(e,t){e.uniforms.fogVolumeData=t.fogVolumeData,e.uniforms.cameraHeight=t.cameraHeight,e.uniforms.fogEnabled=t.fogEnabled,e.uniforms.fogDistanceScale=t.fogDistanceScale}function p(e,t){f(e,t),e.vertexShader=e.vertexShader.replace(`#include <fog_pars_vertex>`,`#include <fog_pars_vertex>
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
  uniform float fogVolumeData[12];
  uniform float cameraHeight;
  uniform bool fogEnabled;
  #define USE_FOG_WORLD_POSITION
  varying vec3 vFogWorldPosition;
#endif`),e.fragmentShader=e.fragmentShader.replace(`#include <fog_fragment>`,u)}var m=3,h=4,g={fogVolumeData:{value:new Float32Array(m*h)},cameraHeight:{value:0},fogEnabled:{value:!0},fogDistanceScale:{value:1}};function _(e,t,n=!0){g.cameraHeight.value=e,g.fogVolumeData.value.set(t),g.fogEnabled.value=n}function v(){g.cameraHeight.value=0,g.fogVolumeData.value.fill(0),g.fogEnabled.value=!0,g.fogDistanceScale.value=1}function y(e){let t=new Float32Array(m*h);for(let n=0;n<m;n++){let r=n*h,i=e[n];i&&(t[r+0]=i.visibleDistance,t[r+1]=i.minHeight,t[r+2]=i.maxHeight,t[r+3]=i.percentage)}return t}var b=new a;b.setOptions({premultiplyAlpha:`none`});var x=new Map;function S(e,t,n){let r=x.get(e);if(r)return t&&r.image&&t(r),r;let i=new l;return i.flipY=!1,x.set(e,i),b.load(e,e=>{i.image=e,i.needsUpdate=!0,t?.(i)},void 0,()=>{x.delete(e),n?.(e)}),i}function C(e){let t=x.get(e);return t?t.image?Promise.resolve(t):new Promise(e=>{let n=()=>{t.image?e(t):setTimeout(n,16)};n()}):new Promise((t,n)=>{let r=new l;r.flipY=!1,x.set(e,r),b.load(e,e=>{r.image=e,r.needsUpdate=!0,t(r)},void 0,n)})}function w(e,t={}){let{repeat:n=[1,1],disableMipmaps:a=!1,anisotropy:c,noColorSpace:l=!1}=t;return e.wrapS=e.wrapT=i,l||(e.colorSpace=o),e.repeat.set(...n),e.flipY=!1,e.anisotropy=c??1,a?(e.generateMipmaps=!1,e.minFilter=s):(e.generateMipmaps=!0,e.minFilter=r),e.magFilter=s,e.needsUpdate=!0,e}function T(r){let a=new e(r,256,256,t,n);return a.colorSpace=``,a.wrapS=a.wrapT=i,a.generateMipmaps=!1,a.minFilter=s,a.magFilter=s,a.needsUpdate=!0,a}export{g as a,_ as c,d,w as i,u as l,C as n,y as o,T as r,v as s,S as t,p as u};