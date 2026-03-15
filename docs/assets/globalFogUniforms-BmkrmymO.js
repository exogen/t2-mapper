import{o as e}from"./react-three-fiber.esm-IOIyqSDz.js";import{Bt as t,Dt as n,Et as r,G as i,K as a,Lt as o,M as s,S as c,Tt as l,t as u}from"./three.module-BCXZgYUA.js";var d=new s,f=new Map;function p(e,t){let n=f.get(e);if(n)return t&&n.image&&t(n),n;let r=new o;return r.flipY=!1,f.set(e,r),d.load(e,e=>{r.image=e,r.needsUpdate=!0,t?.(r)}),r}function m(e){let t=f.get(e);return t?t.image?Promise.resolve(t):new Promise(e=>{let n=()=>{t.image?e(t):setTimeout(n,16)};n()}):new Promise((t,n)=>{let r=new o;r.flipY=!1,f.set(e,r),d.load(e,e=>{r.image=e,r.needsUpdate=!0,t(r)},void 0,n)})}function h(e,t={}){let{repeat:o=[1,1],disableMipmaps:s=!1,anisotropy:c}=t;return e.wrapS=e.wrapT=r,e.colorSpace=n,e.repeat.set(...o),e.flipY=!1,e.anisotropy=c??1,s?(e.generateMipmaps=!1,e.minFilter=i):(e.generateMipmaps=!0,e.minFilter=a),e.magFilter=i,e.needsUpdate=!0,e}function g(e){let n=new c(e,256,256,l,t);return n.colorSpace=``,n.wrapS=n.wrapT=r,n.generateMipmaps=!1,n.minFilter=i,n.magFilter=i,n.needsUpdate=!0,n}function _(){return e(v)}function v(e){return e.gl.capabilities.getMaxAnisotropy()}var y=`
#ifdef USE_FOG
  // Check fog enabled uniform - allows toggling without shader recompilation
  #ifdef USE_VOLUMETRIC_FOG
  if (!fogEnabled) {
    // Skip all fog calculations when disabled
  } else {
  #endif

  float dist = vFogDepth;

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
`;function b(){u.fog_pars_fragment=`
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
#endif
`,u.fog_fragment=y,u.fog_pars_vertex=`
#ifdef USE_FOG
  varying float vFogDepth;
  #ifdef USE_FOG_WORLD_POSITION
    varying vec3 vFogWorldPosition;
  #endif
#endif
`,u.fog_vertex=`
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
`}function x(e,t){e.uniforms.fogVolumeData=t.fogVolumeData,e.uniforms.cameraHeight=t.cameraHeight,e.uniforms.fogEnabled=t.fogEnabled}function S(e,t){x(e,t),e.vertexShader=e.vertexShader.replace(`#include <fog_pars_vertex>`,`#include <fog_pars_vertex>
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
#endif`),e.fragmentShader=e.fragmentShader.replace(`#include <fog_pars_fragment>`,`#include <fog_pars_fragment>
#ifdef USE_FOG
  #define USE_VOLUMETRIC_FOG
  uniform float fogVolumeData[12];
  uniform float cameraHeight;
  uniform bool fogEnabled;
  #define USE_FOG_WORLD_POSITION
  varying vec3 vFogWorldPosition;
#endif`),e.fragmentShader=e.fragmentShader.replace(`#include <fog_fragment>`,y)}var C=3,w=4,T={fogVolumeData:{value:new Float32Array(C*w)},cameraHeight:{value:0},fogEnabled:{value:!0}};function E(e,t,n=!0){T.cameraHeight.value=e,T.fogVolumeData.value.set(t),T.fogEnabled.value=n}function D(){T.cameraHeight.value=0,T.fogVolumeData.value.fill(0),T.fogEnabled.value=!0}function O(e){let t=new Float32Array(C*w);for(let n=0;n<C;n++){let r=n*w,i=e[n];i&&(t[r+0]=i.visibleDistance,t[r+1]=i.minHeight,t[r+2]=i.maxHeight,t[r+3]=i.percentage)}return t}export{y as a,_ as c,g as d,h as f,E as i,p as l,O as n,S as o,D as r,b as s,T as t,m as u};