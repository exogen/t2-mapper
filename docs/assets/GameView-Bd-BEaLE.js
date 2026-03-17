const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PlayerModel-BineeFDG.js","assets/chunk-DECur_0Z.js","assets/mission-CIAFVbLs.js","assets/logger-CC5j_O4o.js","assets/GenericShape-DEe0lV3n.js","assets/Texture-CU0yYVq9.js","assets/react-three-fiber.esm-BccVk4IG.js","assets/jsx-runtime-BpGWiA-R.js","assets/three.module-BRbuBcDx.js","assets/traditional-ec-lUAFC.js","assets/useBaseQuery-CLI88XCu.js","assets/index-DdUJFsoW.js","assets/preload-helper-CnJ98jGT.js","assets/streamHelpers-CgcDlqe5.js","assets/KeyboardControls-CJjZbu2D.js","assets/engineStore-CXPwEu5b.js","assets/SettingsProvider-Dg81XAbP.js","assets/manifest-NjKKupeg.js","assets/iconBase-BCRUFbxq.js","assets/scene-OlUAvaR5.js","assets/index-CsY-wl6F.css","assets/FloatingLabel-D-I32Rd3.js","assets/Html-Bo-w-xqP.js","assets/extends-Cu_B6L18.js","assets/FloatingLabel-DfptgH-Y.css","assets/globalFogUniforms-BV3x5ZpT.js","assets/loaders-rPPwBkLs.js","assets/AudioContext-Bb-fZu5u.js","assets/AudioEmitter-sxlstebu.js","assets/DebugSuspense-B3kNcNBI.js","assets/ShapeErrorBoundary-D99rpxiY.js","assets/streamPlaybackStore-_jj5RFzm.js","assets/ShapeModel-3SYyPV6E.js","assets/Projectiles-D0An0RFF.js","assets/ForceFieldBare-C0llo30b.js","assets/WaterBlock--pJmCke8.js","assets/StreamingController-DwumtOn9.js","assets/gameEntityTypes-n-ppAY7z.js","assets/DebugElements-Dcs_BtFn.js","assets/DebugElements-BP0b5jan.css","assets/Mission-zQsAVgl1.js","assets/useQuery-qcd9fgq8.js","assets/misToScene-Zfobyc2r.js","assets/ChatSoundPlayer-D0YoWdbd.js"])))=>i.map(i=>d[i]);
import{r as e}from"./chunk-DECur_0Z.js";import{n as t,r as n,t as r}from"./jsx-runtime-BpGWiA-R.js";import{a as i,i as a,o,t as s}from"./react-three-fiber.esm-BccVk4IG.js";import{a as c,i as l}from"./SettingsProvider-Dg81XAbP.js";import{t as u}from"./useQuery-qcd9fgq8.js";import{C as d,D as f,E as p,T as m,d as h,n as g,r as _,t as v,u as y,w as b,x}from"./GenericShape-DEe0lV3n.js";import{t as S}from"./logger-CC5j_O4o.js";import"./traditional-ec-lUAFC.js";import{t as C,x as w}from"./streamHelpers-CgcDlqe5.js";import{Bt as T,C as E,D,Dt as O,Et as k,G as A,Ht as j,O as M,S as N,T as P,Tt as F,Vt as I,Wt as L,_ as R,ct as ee,f as te,h as ne,j as re,k as ie,kt as ae,m as oe,tt as se,x as ce,xt as z,y as B}from"./three.module-BRbuBcDx.js";import{n as V,r as le,t as H}from"./scene-OlUAvaR5.js";import"./mission-CIAFVbLs.js";import{a as ue,i as U}from"./engineStore-CXPwEu5b.js";import{t as W}from"./preload-helper-CnJ98jGT.js";import{t as de}from"./extends-Cu_B6L18.js";import{t as fe}from"./Html-Bo-w-xqP.js";import{t as pe}from"./Texture-CU0yYVq9.js";import{_ as me,a as he,b as ge,f as _e,h as ve,i as ye,m as be,n as xe,t as Se,v as Ce,y as we}from"./index-DdUJFsoW.js";import{f as Te,o as Ee,p as G,s as De,t as Oe,u as ke}from"./loaders-rPPwBkLs.js";import{t as Ae}from"./AudioContext-Bb-fZu5u.js";import{t as je}from"./FloatingLabel-D-I32Rd3.js";import{t as Me}from"./DebugSuspense-B3kNcNBI.js";import{t as Ne}from"./gameEntityTypes-n-ppAY7z.js";import{n as Pe}from"./streamPlaybackStore-_jj5RFzm.js";import{c as Fe,d as Ie,f as Le,i as Re,n as ze,o as Be,r as Ve,s as He,t as Ue}from"./globalFogUniforms-BV3x5ZpT.js";import{t as We}from"./ShapeErrorBoundary-D99rpxiY.js";var K=e(n());function Ge(e,t,n){let r=o(e=>e.size),i=o(e=>e.viewport),a=typeof e==`number`?e:r.width*i.dpr,s=typeof t==`number`?t:r.height*i.dpr,c=(typeof e==`number`?n:e)||{},{samples:l=0,depth:u,...d}=c,f=u??c.depthBuffer,p=K.useMemo(()=>{let e=new L(a,s,{minFilter:A,magFilter:A,type:re,...d});return f&&(e.depthTexture=new E(a,s,M)),e.samples=l,e},[]);return K.useLayoutEffect(()=>{p.setSize(a,s),l&&(p.samples=l)},[l,p,a,s]),K.useEffect(()=>()=>p.dispose(),[]),p}var Ke=e=>typeof e==`function`,qe=K.forwardRef(({envMap:e,resolution:t=256,frames:n=1/0,makeDefault:r,children:i,...s},c)=>{let l=o(({set:e})=>e),u=o(({camera:e})=>e),d=o(({size:e})=>e),f=K.useRef(null);K.useImperativeHandle(c,()=>f.current,[]);let p=K.useRef(null),m=Ge(t);K.useLayoutEffect(()=>{s.manual||(f.current.aspect=d.width/d.height)},[d,s]),K.useLayoutEffect(()=>{f.current.updateProjectionMatrix()});let h=0,g=null,_=Ke(i);return a(t=>{_&&(n===1/0||h<n)&&(p.current.visible=!1,t.gl.setRenderTarget(m),g=t.scene.background,e&&(t.scene.background=e),t.gl.render(t.scene,f.current),t.scene.background=g,t.gl.setRenderTarget(null),p.current.visible=!0,h++)}),K.useLayoutEffect(()=>{if(r){let e=u;return l(()=>({camera:f.current})),()=>l(()=>({camera:e}))}},[f,r,l]),K.createElement(K.Fragment,null,K.createElement(`perspectiveCamera`,de({ref:f},s),!_&&i),K.createElement(`group`,{ref:p},_&&i(m.texture)))});function Je(e,{path:t}){let[n]=i(ce,[e],e=>e.setPath(t));return n}Je.preload=(e,{path:t})=>i.preload(ce,[e],e=>e.setPath(t));var q=t(),Ye={sunLightPointsDown:{value:!0}};function Xe(e){Ye.sunLightPointsDown.value=e}var J=r(),Ze=S(`SceneLighting`);function Qe(){let e=(0,q.c)(6),t=ge(),n,r;if(e[0]===t?(n=e[1],r=e[2]):(n=()=>{t?Ze.debug(`sunData: dir=(%s, %s, %s) color=(%s, %s, %s) ambient=(%s, %s, %s)`,t.direction.x.toFixed(3),t.direction.y.toFixed(3),t.direction.z.toFixed(3),t.color.r.toFixed(3),t.color.g.toFixed(3),t.color.b.toFixed(3),t.ambient.r.toFixed(3),t.ambient.g.toFixed(3),t.ambient.b.toFixed(3)):Ze.debug(`No sunData — using fallback ambient #888`)},r=[t],e[0]=t,e[1]=n,e[2]=r),(0,K.useEffect)(n,r),!t){let t;return e[3]===Symbol.for(`react.memo_cache_sentinel`)?(t=(0,J.jsx)(`ambientLight`,{color:`#888888`,intensity:1}),e[3]=t):t=e[3],t}let i;return e[4]===t?i=e[5]:(i=(0,J.jsx)($e,{sunData:t}),e[4]=t,e[5]=i),i}function $e(e){let t=(0,q.c)(29),{sunData:n}=e,r;t[0]===n.direction?r=t[1]:(r=le(n.direction),t[0]=n.direction,t[1]=r);let[i,a,o]=r,s=Math.sqrt(i*i+a*a+o*o),c=i/s,l=a/s,u=o/s,d;t[2]!==c||t[3]!==l||t[4]!==u?(d=new j(c,l,u),t[2]=c,t[3]=l,t[4]=u,t[5]=d):d=t[5];let f=d,p=-f.x*5e3,m=-f.y*5e3,h=-f.z*5e3,g;t[6]!==p||t[7]!==m||t[8]!==h?(g=new j(p,m,h),t[6]=p,t[7]=m,t[8]=h,t[9]=g):g=t[9];let _=g,v;t[10]!==n.color.b||t[11]!==n.color.g||t[12]!==n.color.r?(v=new B(n.color.r,n.color.g,n.color.b),t[10]=n.color.b,t[11]=n.color.g,t[12]=n.color.r,t[13]=v):v=t[13];let y=v,b;t[14]!==n.ambient.b||t[15]!==n.ambient.g||t[16]!==n.ambient.r?(b=new B(n.ambient.r,n.ambient.g,n.ambient.b),t[14]=n.ambient.b,t[15]=n.ambient.g,t[16]=n.ambient.r,t[17]=b):b=t[17];let x=b,S=f.y<0,C,w;t[18]===S?(C=t[19],w=t[20]):(C=()=>{Xe(S)},w=[S],t[18]=S,t[19]=C,t[20]=w),(0,K.useEffect)(C,w);let T;t[21]!==y||t[22]!==_?(T=(0,J.jsx)(`directionalLight`,{position:_,color:y,intensity:1,castShadow:!0,"shadow-mapSize-width":8192,"shadow-mapSize-height":8192,"shadow-camera-left":-4096,"shadow-camera-right":4096,"shadow-camera-top":4096,"shadow-camera-bottom":-4096,"shadow-camera-near":100,"shadow-camera-far":12e3,"shadow-bias":-1e-5,"shadow-normalBias":.4,"shadow-radius":2}),t[21]=y,t[22]=_,t[23]=T):T=t[23];let E;t[24]===x?E=t[25]:(E=(0,J.jsx)(`ambientLight`,{color:x,intensity:1}),t[24]=x,t[25]=E);let D;return t[26]!==T||t[27]!==E?(D=(0,J.jsxs)(J.Fragment,{children:[T,E]}),t[26]=T,t[27]=E,t[28]=D):D=t[28],D}function et(){let e=(0,q.c)(4),{fpsLimit:t}=c(),n=o(tt),r,i;return e[0]!==t||e[1]!==n?(r=()=>{if(t==null)return;let e=1e3/t,r=0,i;function a(t){i=requestAnimationFrame(a),t-r>=e&&(r=t-(t-r)%e,n())}return i=requestAnimationFrame(a),()=>cancelAnimationFrame(i)},i=[t,n],e[0]=t,e[1]=n,e[2]=r,e[3]=i):(r=e[2],i=e[3]),(0,K.useEffect)(r,i),t}function tt(e){return e.invalidate}function nt(){return et(),null}var rt={toneMapping:0,outputColorSpace:O};function it(e){let t=(0,q.c)(11),{children:n,renderOnDemand:r,dpr:i,onCreated:a}=e,o=r===void 0?!1:r,{renderOnDemand:u}=l(),d=o||u,{fpsLimit:f}=c(),p=f!=null&&!d,m=d||p?`demand`:`always`,h;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(h={type:1},t[0]=h):h=t[0];let g;t[1]===n?g=t[2]:(g=(0,J.jsx)(K.Suspense,{children:n}),t[1]=n,t[2]=g);let _;t[3]===p?_=t[4]:(_=p?(0,J.jsx)(nt,{}):null,t[3]=p,t[4]=_);let v;return t[5]!==i||t[6]!==a||t[7]!==m||t[8]!==g||t[9]!==_?(v=(0,J.jsxs)(s,{frameloop:m,dpr:i,gl:rt,shadows:h,onCreated:a,children:[g,_]}),t[5]=i,t[6]=a,t[7]=m,t[8]=g,t[9]=_,t[10]=v):v=t[10],v}function at(e){let t=(0,q.c)(12),{entity:n}=e,{registerCamera:r,unregisterCamera:i}=he(),a=(0,K.useId)(),o=n.cameraDataBlock,s;t[0]===n.position?s=t[1]:(s=n.position?new j(...n.position):new j,t[0]=n.position,t[1]=s);let c=s,l;t[2]===n.rotation?l=t[3]:(l=n.rotation?new z(...n.rotation):new z,t[2]=n.rotation,t[3]=l);let u=l,d,f;return t[4]!==o||t[5]!==a||t[6]!==c||t[7]!==r||t[8]!==u||t[9]!==i?(d=()=>{if(o===`Observer`){let e={id:a,position:c,rotation:u};return r(e),()=>{i(e)}}},f=[a,o,r,i,c,u],t[4]=o,t[5]=a,t[6]=c,t[7]=r,t[8]=u,t[9]=i,t[10]=d,t[11]=f):(d=t[10],f=t[11]),(0,K.useEffect)(d,f),null}function ot(e){let t=(0,q.c)(3),{entity:n}=e,r;return t[0]!==n.label||t[1]!==n.position?(r=n.label?(0,J.jsx)(je,{position:n.position,opacity:.6,children:n.label}):null,t[0]=n.label,t[1]=n.position,t[2]=r):r=t[2],r}function st(e){let t=new Float32Array(e.length);for(let n=0;n<e.length;n++)t[n]=e[n]/65535;return t}var ct=256,lt=512,ut=64,dt=150,ft=`
vec3 terrainLinearToSRGB(vec3 linear) {
  vec3 higher = pow(linear, vec3(1.0/2.4)) * 1.055 - 0.055;
  vec3 lower = linear * 12.92;
  return mix(lower, higher, step(vec3(0.0031308), linear));
}

vec3 terrainSRGBToLinear(vec3 srgb) {
  vec3 higher = pow((srgb + 0.055) / 1.055, vec3(2.4));
  vec3 lower = srgb / 12.92;
  return mix(lower, higher, step(vec3(0.04045), srgb));
}

// Debug grid overlay using screen-space derivatives for sharp, anti-aliased lines
// Returns 1.0 on grid lines, 0.0 elsewhere
float terrainDebugGrid(vec2 uv, float gridSize, float lineWidth) {
  vec2 scaledUV = uv * gridSize;
  vec2 grid = abs(fract(scaledUV - 0.5) - 0.5) / fwidth(scaledUV);
  float line = min(grid.x, grid.y);
  return 1.0 - min(line / lineWidth, 1.0);
}
`;function pt({shader:e,baseTextures:t,alphaTextures:n,visibilityMask:r,tiling:i,detailTexture:a=null,lightmap:o=null}){e.uniforms.sunLightPointsDown=Ye.sunLightPointsDown;let s=t.length;if(t.forEach((t,n)=>{e.uniforms[`albedo${n}`]={value:t}}),n.forEach((t,n)=>{e.uniforms[`mask${n}`]={value:t}}),r&&(e.uniforms.visibilityMask={value:r}),t.forEach((t,n)=>{e.uniforms[`tiling${n}`]={value:i[n]??32}}),o&&(e.uniforms.terrainLightmap={value:o}),a&&(e.uniforms.detailTexture={value:a},e.uniforms.detailTiling={value:ut},e.uniforms.detailFadeDistance={value:dt},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vTerrainWorldPos;`),e.vertexShader=e.vertexShader.replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
vec4 _terrainPos = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  _terrainPos = instanceMatrix * _terrainPos;
#endif
vTerrainWorldPos = (modelMatrix * _terrainPos).xyz;`)),e.fragmentShader=`
uniform sampler2D albedo0;
uniform sampler2D albedo1;
uniform sampler2D albedo2;
uniform sampler2D albedo3;
uniform sampler2D albedo4;
uniform sampler2D albedo5;
uniform sampler2D mask0;
uniform sampler2D mask1;
uniform sampler2D mask2;
uniform sampler2D mask3;
uniform sampler2D mask4;
uniform sampler2D mask5;
uniform float tiling0;
uniform float tiling1;
uniform float tiling2;
uniform float tiling3;
uniform float tiling4;
uniform float tiling5;
${r?`uniform sampler2D visibilityMask;`:``}
${o?`uniform sampler2D terrainLightmap;`:``}
uniform bool sunLightPointsDown;
${a?`uniform sampler2D detailTexture;
uniform float detailTiling;
uniform float detailFadeDistance;
varying vec3 vTerrainWorldPos;`:``}

${ft}

// Global variable to store shadow factor from RE_Direct for use in output calculation
float terrainShadowFactor = 1.0;
`+e.fragmentShader,r){let t=`#include <clipping_planes_fragment>`;e.fragmentShader=e.fragmentShader.replace(t,`${t}
  // Early discard for invisible areas (before fog/lighting)
  float visibility = texture2D(visibilityMask, vMapUv).r;
  if (visibility < 0.5) {
    discard;
  }
  `)}e.fragmentShader=e.fragmentShader.replace(`#include <map_fragment>`,`
  // Sample base albedo layers (sRGB textures auto-decoded to linear by Three.js)
  vec2 baseUv = vMapUv;
  vec3 c0 = texture2D(albedo0, baseUv * vec2(tiling0)).rgb;
  ${s>1?`vec3 c1 = texture2D(albedo1, baseUv * vec2(tiling1)).rgb;`:``}
  ${s>2?`vec3 c2 = texture2D(albedo2, baseUv * vec2(tiling2)).rgb;`:``}
  ${s>3?`vec3 c3 = texture2D(albedo3, baseUv * vec2(tiling3)).rgb;`:``}
  ${s>4?`vec3 c4 = texture2D(albedo4, baseUv * vec2(tiling4)).rgb;`:``}
  ${s>5?`vec3 c5 = texture2D(albedo5, baseUv * vec2(tiling5)).rgb;`:``}

  // Sample alpha masks for all layers (use R channel)
  // Add +0.5 texel offset: Torque samples alpha at grid corners (integer indices),
  // but GPU linear filtering samples at texel centers. This offset aligns them.
  vec2 alphaUv = baseUv + vec2(0.5 / ${ct}.0);
  float a0 = texture2D(mask0, alphaUv).r;
  ${s>1?`float a1 = texture2D(mask1, alphaUv).r;`:``}
  ${s>2?`float a2 = texture2D(mask2, alphaUv).r;`:``}
  ${s>3?`float a3 = texture2D(mask3, alphaUv).r;`:``}
  ${s>4?`float a4 = texture2D(mask4, alphaUv).r;`:``}
  ${s>5?`float a5 = texture2D(mask5, alphaUv).r;`:``}

  // Torque-style additive weighted blending (blender.cc):
  // result = tex0 * alpha0 + tex1 * alpha1 + tex2 * alpha2 + ...
  // Each layer's alpha map defines its contribution weight.
  vec3 blended = c0 * a0;
  ${s>1?`blended += c1 * a1;`:``}
  ${s>2?`blended += c2 * a2;`:``}
  ${s>3?`blended += c3 * a3;`:``}
  ${s>4?`blended += c4 * a4;`:``}
  ${s>5?`blended += c5 * a5;`:``}

  // Assign to diffuseColor before lighting
  vec3 textureColor = blended;

  ${a?`// Detail texture blending (Torque-style multiplicative blend)
  // Sample detail texture at high frequency tiling
  vec3 detailColor = texture2D(detailTexture, baseUv * detailTiling).rgb;

  // Calculate distance-based fade factor using world positions
  // Torque: distFactor = (zeroDetailDistance - distance) / zeroDetailDistance
  float distToCamera = distance(vTerrainWorldPos, cameraPosition);
  float detailFade = clamp(1.0 - distToCamera / detailFadeDistance, 0.0, 1.0);

  // Torque blending: dst * lerp(1.0, detailTexel, fadeFactor)
  // Detail textures are authored with bright values (~0.8 mean), not 0.5 gray
  // Direct multiplication adds subtle darkening for surface detail
  textureColor *= mix(vec3(1.0), detailColor, detailFade);`:``}

  // Store blended texture in diffuseColor (still in linear space here)
  // We'll convert to sRGB in the output calculation
  diffuseColor.rgb = textureColor;
`),o&&(e.fragmentShader=e.fragmentShader.replace(`#include <lights_lambert_pars_fragment>`,`#include <lights_lambert_pars_fragment>

// Override RE_Direct to extract shadow factor for Torque-style gamma-space lighting
#undef RE_Direct
void RE_Direct_TerrainShadow( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  // Torque lighting (terrLighting.cc): if light points up, terrain gets only ambient
  // This prevents shadow acne from light hitting terrain backfaces
  if (!sunLightPointsDown) {
    terrainShadowFactor = 0.0;
    return;
  }
  // directLight.color = sunColor * shadowFactor (shadow already applied by Three.js)
  // Extract shadow factor by comparing to original sun color
  #if ( NUM_DIR_LIGHTS > 0 )
    vec3 originalSunColor = directionalLights[0].color;
    float sunMax = max(max(originalSunColor.r, originalSunColor.g), originalSunColor.b);
    float shadowedMax = max(max(directLight.color.r, directLight.color.g), directLight.color.b);
    terrainShadowFactor = clamp(shadowedMax / max(sunMax, 0.001), 0.0, 1.0);
  #endif
  // Don't add to reflectedLight - we'll compute lighting in gamma space at output
}
#define RE_Direct RE_Direct_TerrainShadow

`),e.fragmentShader=e.fragmentShader.replace(`#include <lights_fragment_begin>`,`#include <lights_fragment_begin>
// Clear indirect diffuse - we'll compute ambient in gamma space
#if defined( RE_IndirectDiffuse )
  irradiance = vec3(0.0);
#endif
`),e.fragmentShader=e.fragmentShader.replace(`#include <lights_fragment_end>`,`#include <lights_fragment_end>
  // Clear Three.js lighting - we compute everything in gamma space
  reflectedLight.directDiffuse = vec3(0.0);
  reflectedLight.indirectDiffuse = vec3(0.0);
`)),e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,`// Torque-style terrain lighting: output = clamp(lighting × texture, 0, 1) in sRGB space
{
  // Get texture in sRGB space (undo Three.js linear decode)
  vec3 textureSRGB = terrainLinearToSRGB(diffuseColor.rgb);

  ${o?`
  // Sample terrain lightmap for smooth NdotL
  vec2 lightmapUv = vMapUv + vec2(0.5 / ${lt}.0);
  float lightmapNdotL = texture2D(terrainLightmap, lightmapUv).r;

  // Get sun and ambient colors from Three.js lights (these ARE sRGB values from mission file)
  // Three.js interprets them as linear, but the numerical values are preserved
  #if ( NUM_DIR_LIGHTS > 0 )
    vec3 sunColorSRGB = directionalLights[0].color;
  #else
    vec3 sunColorSRGB = vec3(0.7);
  #endif
  vec3 ambientColorSRGB = ambientLightColor;

  // Torque formula (terrLighting.cc:471-483):
  // lighting = ambient + NdotL * shadowFactor * sunColor
  // Clamp lighting to [0,1] before multiplying by texture
  vec3 lightingSRGB = clamp(ambientColorSRGB + lightmapNdotL * terrainShadowFactor * sunColorSRGB, 0.0, 1.0);
  `:`
  // No lightmap - use simple ambient lighting
  vec3 lightingSRGB = ambientLightColor;
  `}

  // Torque formula: output = clamp(lighting × texture, 0, 1) in sRGB/gamma space
  vec3 resultSRGB = clamp(lightingSRGB * textureSRGB, 0.0, 1.0);

  // Convert back to linear for Three.js output pipeline
  outgoingLight = terrainSRGBToLinear(resultSRGB) + totalEmissiveRadiance;
}
#include <opaque_fragment>`),e.fragmentShader=e.fragmentShader.replace(`#include <tonemapping_fragment>`,`#if DEBUG_MODE
  // Debug mode: overlay green grid matching terrain grid squares (256x256)
  float gridIntensity = terrainDebugGrid(vMapUv, 256.0, 1.5);
  vec3 gridColor = vec3(0.0, 0.8, 0.4); // Green
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gridColor, gridIntensity * 0.1);
#endif

#include <tonemapping_fragment>`)}var mt={0:32,1:32,2:32,3:32,4:32,5:32},ht=(0,K.memo)(function({displacementMap:e,visibilityMask:t,textureNames:n,alphaTextures:r,detailTextureName:i,lightmap:a}){let{debugMode:o}=l(),s=Fe(),c=pe(n.map(e=>Te(e)),e=>{e.forEach(e=>Le(e,{anisotropy:s}))}),u=i?G(i):null,d=pe(u??Oe,e=>{Le(e,{anisotropy:s})}),f=(0,K.useCallback)(e=>{pt({shader:e,baseTextures:c,alphaTextures:r,visibilityMask:t,tiling:mt,detailTexture:u?d:null,lightmap:a}),Be(e,Ue)},[c,r,t,d,u,a]),p=(0,K.useMemo)(()=>[n.join(`,`),u??`none`,a?a.id:`nolm`,c.map(e=>e.id).join(`,`)].join(`|`),[n,u,a,c]),m=(0,K.useRef)(null);return(0,K.useEffect)(()=>{let e=m.current;e&&(e.defines??={},e.defines.DEBUG_MODE=o?1:0,e.needsUpdate=!0)},[o]),(0,K.useEffect)(()=>{let e=m.current;e&&(e.customProgramCacheKey=()=>p,e.needsUpdate=!0)},[p]),(0,J.jsx)(`meshLambertMaterial`,{ref:m,map:e,depthWrite:!0,side:0,defines:{DEBUG_MODE:o?1:0},onBeforeCompile:f},`${u?`detail`:`nodetail`}-${a?`lightmap`:`nolightmap`}`)}),gt=(0,K.memo)(function(e){let t=(0,q.c)(8),{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s}=e,c;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(c=(0,J.jsx)(`meshLambertMaterial`,{color:`rgb(0, 109, 56)`,wireframe:!0}),t[0]=c):c=t[0];let l;return t[1]!==a||t[2]!==o||t[3]!==n||t[4]!==s||t[5]!==i||t[6]!==r?(l=(0,J.jsx)(K.Suspense,{fallback:c,children:(0,J.jsx)(ht,{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s})}),t[1]=a,t[2]=o,t[3]=n,t[4]=s,t[5]=i,t[6]=r,t[7]=l):l=t[7],l}),_t=(0,K.memo)(function(e){let t=(0,q.c)(15),{tileX:n,tileZ:r,blockSize:i,basePosition:a,textureNames:o,geometry:s,displacementMap:c,visibilityMask:l,alphaTextures:u,detailTextureName:d,lightmap:f,visible:p}=e,m=p===void 0?!0:p,h=i/2,g=a.x+n*i+h,_=a.z+r*i+h,v;t[0]!==g||t[1]!==_?(v=[g,0,_],t[0]=g,t[1]=_,t[2]=v):v=t[2];let y=v,b;t[3]!==u||t[4]!==d||t[5]!==c||t[6]!==f||t[7]!==o||t[8]!==l?(b=(0,J.jsx)(gt,{displacementMap:c,visibilityMask:l,textureNames:o,alphaTextures:u,detailTextureName:d,lightmap:f}),t[3]=u,t[4]=d,t[5]=c,t[6]=f,t[7]=o,t[8]=l,t[9]=b):b=t[9];let x;return t[10]!==s||t[11]!==y||t[12]!==b||t[13]!==m?(x=(0,J.jsx)(`mesh`,{position:y,geometry:s,castShadow:!0,receiveShadow:!0,visible:m,children:b}),t[10]=s,t[11]=y,t[12]=b,t[13]=m,t[14]=x):x=t[14],x}),vt=S(`TerrainBlock`),yt=8,bt=600,Y=256,X=512,Z=2048;function xt(e,t){let n=new ne,r=(t+1)*(t+1),i=new Float32Array(r*3),a=new Float32Array(r*3),o=new Float32Array(r*2),s=t*t*6,c=new Uint32Array(s),l=0,u=e/t;for(let n=0;n<=t;n++)for(let r=0;r<=t;r++){let s=n*(t+1)+r;i[s*3]=r*u-e/2,i[s*3+1]=e/2-n*u,i[s*3+2]=0,a[s*3]=0,a[s*3+1]=0,a[s*3+2]=1,o[s*2]=r/t,o[s*2+1]=1-n/t}for(let e=0;e<t;e++)for(let n=0;n<t;n++){let r=e*(t+1)+n,i=r+1,a=(e+1)*(t+1)+n,o=a+1;(n^e)&1?(c[l++]=r,c[l++]=a,c[l++]=i,c[l++]=i,c[l++]=a,c[l++]=o):(c[l++]=r,c[l++]=a,c[l++]=o,c[l++]=r,c[l++]=o,c[l++]=i)}return n.setIndex(new oe(c,1)),n.setAttribute(`position`,new D(i,3)),n.setAttribute(`normal`,new D(a,3)),n.setAttribute(`uv`,new D(o,2)),n.rotateX(-Math.PI/2),n.rotateY(-Math.PI/2),n}function St(e,t,n){let r=e.attributes.position,i=e.attributes.uv,a=e.attributes.normal,o=r.array,s=i.array,c=a.array,l=r.count,u=(e,n)=>(e=Math.max(0,Math.min(Y-1,e)),n=Math.max(0,Math.min(Y-1,n)),t[n*Y+e]/65535*Z),d=(e,n)=>{e=Math.max(0,Math.min(Y-1,e)),n=Math.max(0,Math.min(Y-1,n));let r=Math.floor(e),i=Math.floor(n),a=Math.min(r+1,Y-1),o=Math.min(i+1,Y-1),s=e-r,c=n-i,l=t[i*Y+r]/65535*Z,u=t[i*Y+a]/65535*Z,d=t[o*Y+r]/65535*Z,f=t[o*Y+a]/65535*Z,p=l*(1-s)+u*s,m=d*(1-s)+f*s;return p*(1-c)+m*c};for(let e=0;e<l;e++){let t=s[e*2],r=s[e*2+1],i=u(Math.floor(t*Y)&Y-1,Math.floor(r*Y)&Y-1);o[e*3+1]=i;let a=t*(Y-1),l=r*(Y-1),f=d(a-1,l),p=d(a+1,l),m=d(a,l+1),h=d(a,l-1),g=(p-f)/2,_=(m-h)/2,v=n,y=g,b=Math.sqrt(_*_+v*v+y*y);b>0?(_/=b,v/=b,y/=b):(_=0,v=1,y=0),c[e*3]=_,c[e*3+1]=v,c[e*3+2]=y}r.needsUpdate=!0,a.needsUpdate=!0}function Ct(e,t,n,r,i,a){let o=r.z/i,s=r.x/i,c=r.y,l=Math.sqrt(o*o+s*s);if(l<1e-4)return 1;let u=.5/l,d=o*u,f=s*u,p=c*u,m=e,h=t,g=n+.1,_=Y*3;for(let e=0;e<_;e++){if(m+=d,h+=f,g+=p,m<0||m>=Y||h<0||h>=Y||g>Z)return 1;let e=a(m,h);if(g<e)return 0}return 1}function wt(e,t,n){let r=(t,n)=>{let r=Math.max(0,Math.min(Y-1,t)),i=Math.max(0,Math.min(Y-1,n)),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,Y-1),c=Math.min(o+1,Y-1),l=r-a,u=i-o,d=e[o*Y+a]/65535,f=e[o*Y+s]/65535,p=e[c*Y+a]/65535,m=e[c*Y+s]/65535,h=d*(1-l)+f*l,g=p*(1-l)+m*l;return(h*(1-u)+g*u)*Z},i=new j(-t.x,-t.y,-t.z).normalize(),a=new Uint8Array(X*X),o=.5;for(let e=0;e<X;e++)for(let t=0;t<X;t++){let s=t/2+.25,c=e/2+.25,l=r(s,c),u=r(s-o,c),d=r(s+o,c),f=r(s,c-o),p=r(s,c+o),m=(d-u)/(2*o),h=-((p-f)/(2*o)),g=n,_=-m,v=Math.sqrt(h*h+g*g+_*_),y=Math.max(0,h/v*i.x+g/v*i.y+_/v*i.z),b=1;y>0&&(b=Ct(s,c,l,i,n,r)),a[e*X+t]=Math.floor(y*b*255)}let s=new N(a,X,X,F,T);return s.colorSpace=``,s.generateMipmaps=!0,s.wrapS=R,s.wrapT=R,s.magFilter=A,s.minFilter=A,s.needsUpdate=!0,s}function Tt(e){let t=(0,q.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`terrain`,e],queryFn:()=>(vt.debug(`Loading terrain: %s`,e),ke(e))},t[0]=e,t[1]=n);let r=u(n),i,a;return t[2]!==r.data||t[3]!==r.error||t[4]!==r.status||t[5]!==e?(i=()=>{vt.debug(`Query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (data ready)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=r.data,t[3]=r.error,t[4]=r.status,t[5]=e,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,K.useEffect)(i,a),r}function Et(){let e=we();return e&&e.visibleDistance>0?e.visibleDistance:bt}function Dt(e){let t=new Uint8Array(Y*Y);t.fill(255);for(let n of e){let e=n&255,r=n>>8&255,i=n>>16,a=r*Y;for(let n=0;n<i;n++){let r=a+e+n;r<t.length&&(t[r]=0)}}let n=new N(t,Y,Y,F,T);return n.colorSpace=``,n.wrapS=n.wrapT=R,n.magFilter=ee,n.minFilter=ee,n.needsUpdate=!0,n}var Ot=(0,K.memo)(function(e){let t=(0,q.c)(62),{scene:n}=e,r=n.terrFileName,i=n.squareSize||yt,s=n.detailTextureName||void 0,c=i*256,l=Et(),u=o(kt),d=-i*(Y/2),f;t[0]===d?f=t[1]:(f={x:d,z:d},t[0]=d,t[1]=f);let p=f,m;t[2]===n.emptySquareRuns?m=t[3]:(m=n.emptySquareRuns??[],t[2]=n.emptySquareRuns,t[3]=m);let h=m,{data:g}=Tt(r),_;bb0:{if(!g){_=null;break bb0}let e=i*256,n;t[4]!==e||t[5]!==i||t[6]!==g.heightMap?(n=xt(e,Y),St(n,g.heightMap,i),t[4]=e,t[5]=i,t[6]=g.heightMap,t[7]=n):n=t[7],_=n}let v=_,y,b;t[8]!==i||t[9]!==g?(y=()=>{if(g)return g.heightMap,At},b=[g,i],t[8]=i,t[9]=g,t[10]=y,t[11]=b):(y=t[10],b=t[11]),(0,K.useEffect)(y,b);let x=ge(),S;bb1:{if(!x){let e;t[12]===Symbol.for(`react.memo_cache_sentinel`)?(e=new j(.57735,-.57735,.57735),t[12]=e):e=t[12],S=e;break bb1}let e;t[13]===x.direction?e=t[14]:(e=le(x.direction),t[13]=x.direction,t[14]=e);let[n,r,i]=e,a=Math.sqrt(n*n+r*r+i*i),o=n/a,s=r/a,c=i/a,l;t[15]!==c||t[16]!==o||t[17]!==s?(l=new j(o,s,c),t[15]=c,t[16]=o,t[17]=s,t[18]=l):l=t[18],S=l}let C=S,w;bb2:{if(!g){w=null;break bb2}let e;t[19]!==i||t[20]!==C||t[21]!==g.heightMap?(e=wt(g.heightMap,C,i),t[19]=i,t[20]=C,t[21]=g.heightMap,t[22]=e):e=t[22],w=e}let T=w,E;bb3:{if(!g){E=null;break bb3}let e;t[23]===g.heightMap?e=t[24]:(e=new N(st(g.heightMap),Y,Y,F,M),e.colorSpace=``,e.generateMipmaps=!1,e.wrapS=k,e.wrapT=k,e.needsUpdate=!0,t[23]=g.heightMap,t[24]=e),E=e}let D=E,O;t[25]===h?O=t[26]:(O=Dt(h),t[25]=h,t[26]=O);let A=O,P;t[27]===Symbol.for(`react.memo_cache_sentinel`)?(P=Dt([]),t[27]=P):P=t[27];let I=P,L;bb4:{if(!g){L=null;break bb4}let e;t[28]===g.alphaMaps?e=t[29]:(e=g.alphaMaps.map(jt),t[28]=g.alphaMaps,t[29]=e),L=e}let R=L,ee=2*Math.ceil(l/c)+1,te=ee*ee-1,ne=(0,K.useRef)(null),re;t[30]===Symbol.for(`react.memo_cache_sentinel`)?(re=new se,t[30]=re):re=t[30];let ie=re,ae;t[31]===Symbol.for(`react.memo_cache_sentinel`)?(ae={xStart:1/0,xEnd:-1/0,zStart:1/0,zEnd:-1/0},t[31]=ae):ae=t[31];let oe=(0,K.useRef)(ae),ce=(0,K.useRef)(null),z;if(t[32]!==p||t[33]!==c||t[34]!==u||t[35]!==l?(z=()=>{let e=ne.current;if(!e)return;let t=u.position.x-p.x,n=u.position.z-p.z,r=Math.floor((t-l)/c),i=Math.ceil((t+l)/c),a=Math.floor((n-l)/c),o=Math.ceil((n+l)/c),s=oe.current;if(e===ce.current&&r===s.xStart&&i===s.xEnd&&a===s.zStart&&o===s.zEnd)return;ce.current=e,s.xStart=r,s.xEnd=i,s.zStart=a,s.zEnd=o;let d=c/2,f=0;for(let t=r;t<i;t++)for(let n=a;n<o;n++)t===0&&n===0||(ie.makeTranslation(p.x+t*c+d,0,p.z+n*c+d),e.setMatrixAt(f,ie),f++);e.count=f,e.instanceMatrix.needsUpdate=!0},t[32]=p,t[33]=c,t[34]=u,t[35]=l,t[36]=z):z=t[36],a(z),!g||!v||!D||!R)return vt.debug(`Not ready: terrain=%s geometry=%s displacement=%s alpha=%s`,!!g,!!v,!!D,!!R),null;let B=T??void 0,V;t[37]!==p||t[38]!==c||t[39]!==s||t[40]!==A||t[41]!==R||t[42]!==D||t[43]!==v||t[44]!==B||t[45]!==g.textureNames?(V=(0,J.jsx)(_t,{tileX:0,tileZ:0,blockSize:c,basePosition:p,textureNames:g.textureNames,geometry:v,displacementMap:D,visibilityMask:A,alphaTextures:R,detailTextureName:s,lightmap:B}),t[37]=p,t[38]=c,t[39]=s,t[40]=A,t[41]=R,t[42]=D,t[43]=v,t[44]=B,t[45]=g.textureNames,t[46]=V):V=t[46];let H;t[47]!==te||t[48]!==v?(H=[v,void 0,te],t[47]=te,t[48]=v,t[49]=H):H=t[49];let ue=T??void 0,U;t[50]!==s||t[51]!==R||t[52]!==D||t[53]!==ue||t[54]!==g.textureNames?(U=(0,J.jsx)(gt,{displacementMap:D,visibilityMask:I,textureNames:g.textureNames,alphaTextures:R,detailTextureName:s,lightmap:ue}),t[50]=s,t[51]=R,t[52]=D,t[53]=ue,t[54]=g.textureNames,t[55]=U):U=t[55];let W;t[56]!==H||t[57]!==U?(W=(0,J.jsx)(`instancedMesh`,{ref:ne,args:H,castShadow:!0,receiveShadow:!0,frustumCulled:!1,children:U}),t[56]=H,t[57]=U,t[58]=W):W=t[58];let de;return t[59]!==V||t[60]!==W?(de=(0,J.jsxs)(J.Fragment,{children:[V,W]}),t[59]=V,t[60]=W,t[61]=de):de=t[61],de});function kt(e){return e.camera}function At(){}function jt(e){return Ie(e)}var Mt=`
vec3 interiorLinearToSRGB(vec3 linear) {
  vec3 higher = pow(linear, vec3(1.0/2.4)) * 1.055 - 0.055;
  vec3 lower = linear * 12.92;
  return mix(lower, higher, step(vec3(0.0031308), linear));
}

vec3 interiorSRGBToLinear(vec3 srgb) {
  vec3 higher = pow((srgb + 0.055) / 1.055, vec3(2.4));
  vec3 lower = srgb / 12.92;
  return mix(lower, higher, step(vec3(0.04045), srgb));
}

// Debug grid overlay function using screen-space derivatives for sharp, anti-aliased lines
// Returns 1.0 on grid lines, 0.0 elsewhere
float debugGrid(vec2 uv, float gridSize, float lineWidth) {
  vec2 scaledUV = uv * gridSize;
  vec2 grid = abs(fract(scaledUV - 0.5) - 0.5) / fwidth(scaledUV);
  float line = min(grid.x, grid.y);
  return 1.0 - min(line / lineWidth, 1.0);
}
`;function Nt(e,t){let n=t.surfaceOutsideVisible??!1;e.uniforms.useSceneLighting={value:n},e.uniforms.interiorDebugColor={value:n?new j(0,.4,1):new j(1,.2,0)},e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
${Mt}
uniform bool useSceneLighting;
uniform vec3 interiorDebugColor;
`),e.fragmentShader=e.fragmentShader.replace(`#include <lights_fragment_maps>`,`// Lightmap handled in custom output calculation
#ifdef USE_LIGHTMAP
  vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
#endif`),e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,`// Torque-style lighting: output = clamp(lighting × texture, 0, 1) in sRGB space
// Get texture in sRGB space (undo Three.js linear decode)
vec3 textureSRGB = interiorLinearToSRGB(diffuseColor.rgb);

// Compute lighting in sRGB space
vec3 lightingSRGB = vec3(0.0);

if (useSceneLighting) {
  // Three.js computed: reflectedLight = lighting × texture_linear / PI
  // Extract pure lighting: lighting = reflectedLight × PI / texture_linear
  vec3 totalLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  vec3 safeTexLinear = max(diffuseColor.rgb, vec3(0.001));
  vec3 extractedLighting = totalLight * PI / safeTexLinear;
  // NOTE: extractedLighting is ALREADY sRGB values because mission sun/ambient colors
  // are sRGB values (Torque used them directly in gamma space). Three.js treats them
  // as linear but the numerical values are the same. DO NOT convert to sRGB here!
  // IMPORTANT: Torque clamps scene lighting to [0,1] BEFORE adding to lightmap
  // (sceneLighting.cc line 1785: tmp.clamp())
  lightingSRGB = clamp(extractedLighting, 0.0, 1.0);
}

// Add lightmap contribution (for BOTH outside and inside surfaces)
// In Torque, scene lighting is ADDED to lightmaps for outside surfaces at mission load
// (stored in .ml files). Inside surfaces only have base lightmap. Both need lightmap here.
#ifdef USE_LIGHTMAP
  // Lightmap is stored as linear in Three.js (decoded from sRGB texture), convert back
  lightingSRGB += interiorLinearToSRGB(lightMapTexel.rgb);
#endif
// Torque clamps the sum to [0,1] per channel (sceneLighting.cc lines 1817-1827)
lightingSRGB = clamp(lightingSRGB, 0.0, 1.0);

// Torque formula: output = clamp(lighting × texture, 0, 1) in sRGB/gamma space
vec3 resultSRGB = clamp(lightingSRGB * textureSRGB, 0.0, 1.0);

// Convert back to linear for Three.js output pipeline
vec3 resultLinear = interiorSRGBToLinear(resultSRGB);

// Reassign outgoingLight before opaque_fragment consumes it
outgoingLight = resultLinear + totalEmissiveRadiance;

#include <opaque_fragment>`),e.fragmentShader=e.fragmentShader.replace(`#include <tonemapping_fragment>`,`// Debug mode: overlay colored grid on top of normal rendering
// Blue grid = SurfaceOutsideVisible (receives scene ambient light)
// Red grid = inside surface (no scene ambient light)
#if DEBUG_MODE && defined(USE_MAP)
  // gridSize=4 creates 4x4 grid per UV tile, lineWidth=1.5 is ~1.5 pixels wide
  float gridIntensity = debugGrid(vMapUv, 4.0, 1.5);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, interiorDebugColor, gridIntensity * 0.1);
#endif

#include <tonemapping_fragment>`)}var Pt=S(`InteriorInstance`);function Ft(e){let t=(0,q.c)(2),n;return t[0]===e?n=t[1]:(n=Ee(e),t[0]=e,t[1]=n),f(n)}function It({materialName:e,material:t,lightMap:n}){let r=l()?.debugMode??!1,i=Fe(),a=pe(G(e),e=>Le(e,{anisotropy:i})),o=new Set(t?.userData?.flag_names??[]).has(`SelfIlluminating`),s=new Set(t?.userData?.surface_flag_names??[]).has(`SurfaceOutsideVisible`),c=(0,K.useCallback)(e=>{Be(e,Ue),Nt(e,{surfaceOutsideVisible:s})},[s]),u=(0,K.useRef)(null),d=(0,K.useRef)(null);(0,K.useEffect)(()=>{let e=u.current??d.current;e&&(e.defines??={},e.defines.DEBUG_MODE=r?1:0,e.needsUpdate=!0)},[r]);let f={DEBUG_MODE:r?1:0},p=`${s}`;return o?(0,J.jsx)(`meshBasicMaterial`,{ref:u,map:a,toneMapped:!1,defines:f,onBeforeCompile:c},p):(0,J.jsx)(`meshLambertMaterial`,{ref:d,map:a,lightMap:n,toneMapped:!1,defines:f,onBeforeCompile:c},p)}function Lt(e){if(!e)return null;let t=e.emissiveMap;return t&&(t.colorSpace=O),t??null}function Rt(e){let t=(0,q.c)(13),{node:n}=e,r;bb0:{if(!n.material){let e;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[0]=e):e=t[0],r=e;break bb0}if(Array.isArray(n.material)){let e;t[1]===n.material?e=t[2]:(e=n.material.map(zt),t[1]=n.material,t[2]=e),r=e;break bb0}let e;t[3]===n.material?e=t[4]:(e=Lt(n.material),t[3]=n.material,t[4]=e);let i;t[5]===e?i=t[6]:(i=[e],t[5]=e,t[6]=i),r=i}let i=r,a;t[7]!==i||t[8]!==n.material?(a=n.material?(0,J.jsx)(Me,{name:`InteriorTexture:${Array.isArray(n.material)?n.material[0]?.userData?.resource_path:n.material?.userData?.resource_path??`?`}`,fallback:(0,J.jsx)(`meshStandardMaterial`,{color:`yellow`,wireframe:!0}),children:Array.isArray(n.material)?n.material.map((e,t)=>(0,J.jsx)(It,{materialName:e.userData.resource_path,material:e,lightMap:i[t]},t)):(0,J.jsx)(It,{materialName:n.material.userData.resource_path,material:n.material,lightMap:i[0]})}):null,t[7]=i,t[8]=n.material,t[9]=a):a=t[9];let o;return t[10]!==n.geometry||t[11]!==a?(o=(0,J.jsx)(`mesh`,{geometry:n.geometry,castShadow:!0,receiveShadow:!0,children:a}),t[10]=n.geometry,t[11]=a,t[12]=o):o=t[12],o}function zt(e){return Lt(e)}var Bt=(0,K.memo)(function(e){let t=(0,q.c)(10),{interiorFile:n,ghostIndex:r}=e,{nodes:i}=Ft(n),a=l()?.debugMode??!1,o;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(o=[0,-Math.PI/2,0],t[0]=o):o=t[0];let s;t[1]===i?s=t[2]:(s=Object.entries(i).filter(Wt).map(Gt),t[1]=i,t[2]=s);let c;t[3]!==a||t[4]!==r||t[5]!==n?(c=a?(0,J.jsxs)(je,{children:[r,`: `,n]}):null,t[3]=a,t[4]=r,t[5]=n,t[6]=c):c=t[6];let u;return t[7]!==s||t[8]!==c?(u=(0,J.jsxs)(`group`,{rotation:o,children:[s,c]}),t[7]=s,t[8]=c,t[9]=u):u=t[9],u});function Vt(e){let t=(0,q.c)(9),{color:n,label:r}=e,i;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(i=(0,J.jsx)(`boxGeometry`,{args:[10,10,10]}),t[0]=i):i=t[0];let a;t[1]===n?a=t[2]:(a=(0,J.jsx)(`meshStandardMaterial`,{color:n,wireframe:!0}),t[1]=n,t[2]=a);let o;t[3]!==n||t[4]!==r?(o=r?(0,J.jsx)(je,{color:n,children:r}):null,t[3]=n,t[4]=r,t[5]=o):o=t[5];let s;return t[6]!==a||t[7]!==o?(s=(0,J.jsxs)(`mesh`,{children:[i,a,o]}),t[6]=a,t[7]=o,t[8]=s):s=t[8],s}function Ht(e){let t=(0,q.c)(3),{label:n}=e,r=l()?.debugMode??!1,i;return t[0]!==r||t[1]!==n?(i=r?(0,J.jsx)(Vt,{color:`red`,label:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}var Ut=(0,K.memo)(function(e){let t=(0,q.c)(26),{scene:n}=e,r;t[0]===n.transform.position?r=t[1]:(r=le(n.transform.position),t[0]=n.transform.position,t[1]=r);let i=r,a;t[2]===n.transform?a=t[3]:(a=H(n.transform),t[2]=n.transform,t[3]=a);let o=a,s;t[4]===n.scale?s=t[5]:(s=V(n.scale),t[4]=n.scale,t[5]=s);let c=s,l=`${n.ghostIndex}: ${n.interiorFile}`,u;t[6]===l?u=t[7]:(u=(0,J.jsx)(Ht,{label:l}),t[6]=l,t[7]=u);let f;t[8]===n.interiorFile?f=t[9]:(f=e=>{Pt.error(`Failed to load %s: %s`,n.interiorFile,e.message)},t[8]=n.interiorFile,t[9]=f);let p=`InteriorModel:${n.interiorFile}`,m;t[10]===Symbol.for(`react.memo_cache_sentinel`)?(m=(0,J.jsx)(Vt,{color:`orange`}),t[10]=m):m=t[10];let h;t[11]!==n.ghostIndex||t[12]!==n.interiorFile?(h=(0,J.jsx)(Bt,{interiorFile:n.interiorFile,ghostIndex:n.ghostIndex}),t[11]=n.ghostIndex,t[12]=n.interiorFile,t[13]=h):h=t[13];let g;t[14]!==p||t[15]!==h?(g=(0,J.jsx)(Me,{name:p,fallback:m,children:h}),t[14]=p,t[15]=h,t[16]=g):g=t[16];let _;t[17]!==g||t[18]!==u||t[19]!==f?(_=(0,J.jsx)(d,{fallback:u,onError:f,children:g}),t[17]=g,t[18]=u,t[19]=f,t[20]=_):_=t[20];let v;return t[21]!==i||t[22]!==o||t[23]!==c||t[24]!==_?(v=(0,J.jsx)(`group`,{position:i,quaternion:o,scale:c,children:_}),t[21]=i,t[22]=o,t[23]=c,t[24]=_,t[25]=v):v=t[25],v});function Wt(e){let[,t]=e;return t.isMesh}function Gt(e){let[t,n]=e;return(0,J.jsx)(Rt,{node:n},t)}var Kt=()=>{},Q=5,qt=Q*Q,Jt=.05;function Yt(e,t,n){let r=e,i=t,a=n;return[a,a,a,a,a,a,i,i,i,a,a,i,r,i,a,a,i,i,i,a,a,a,a,a,a]}function Xt(e,t){let n=new Float32Array(qt);for(let r=0;r<qt;r++){let i=e[r*3],a=e[r*3+2],o=1.3-Math.sqrt(i*i+a*a)/t;o<.4?o=0:o>.8&&(o=1),n[r]=o}return n}function Zt(e,t,n,r){let i=new ne,a=new Float32Array(qt*3),o=new Float32Array(qt*2),s=Yt(t,n,r),c=e*2/(Q-1);for(let t=0;t<Q;t++)for(let n=0;n<Q;n++){let r=t*Q+n,i=-e+n*c,l=e-t*c,u=e*s[r];a[r*3]=i,a[r*3+1]=u,a[r*3+2]=l,o[r*2]=n,o[r*2+1]=t}Qt(a);let l=Xt(a,e),u=[];for(let e=0;e<Q-1;e++)for(let t=0;t<Q-1;t++){let n=e*Q+t,r=n+1,i=n+Q,a=i+1;u.push(n,i,a),u.push(n,a,r)}return i.setIndex(u),i.setAttribute(`position`,new D(a,3)),i.setAttribute(`uv`,new D(o,2)),i.setAttribute(`alpha`,new D(l,1)),i.computeBoundingSphere(),i}function Qt(e){let t=t=>({x:e[t*3],y:e[t*3+1],z:e[t*3+2]}),n=(t,n,r,i)=>{e[t*3]=n,e[t*3+1]=r,e[t*3+2]=i},r=t(1),i=t(3),a=t(5),o=t(6),s=t(8),c=t(9),l=t(15),u=t(16),d=t(18),f=t(19),p=t(21),m=t(23),h=a.x+(r.x-a.x)*.5,g=a.y+(r.y-a.y)*.5,_=a.z+(r.z-a.z)*.5;n(0,o.x+(h-o.x)*2,o.y+(g-o.y)*2,o.z+(_-o.z)*2),h=c.x+(i.x-c.x)*.5,g=c.y+(i.y-c.y)*.5,_=c.z+(i.z-c.z)*.5,n(4,s.x+(h-s.x)*2,s.y+(g-s.y)*2,s.z+(_-s.z)*2),h=p.x+(l.x-p.x)*.5,g=p.y+(l.y-p.y)*.5,_=p.z+(l.z-p.z)*.5,n(20,u.x+(h-u.x)*2,u.y+(g-u.y)*2,u.z+(_-u.z)*2),h=m.x+(f.x-m.x)*.5,g=m.y+(f.y-m.y)*.5,_=m.z+(f.z-m.z)*.5,n(24,d.x+(h-d.x)*2,d.y+(g-d.y)*2,d.z+(_-d.z)*2)}function $t(e){return e.wrapS=k,e.wrapT=k,e.minFilter=A,e.magFilter=A,e.colorSpace=``,e.needsUpdate=!0,e}var en=`
  attribute float alpha;

  uniform vec2 uvOffset;

  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    // Apply UV offset for scrolling
    vUv = uv + uvOffset;
    vAlpha = alpha;

    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // Set depth to far plane so clouds are always visible and behind other geometry
    gl_Position = pos.xyww;
  }
`,tn=`
  uniform sampler2D cloudTexture;
  uniform float debugMode;
  uniform int layerIndex;

  varying vec2 vUv;
  varying float vAlpha;

  // Debug grid using screen-space derivatives for sharp, anti-aliased lines
  float debugGrid(vec2 uv, float gridSize, float lineWidth) {
    vec2 scaledUV = uv * gridSize;
    vec2 grid = abs(fract(scaledUV - 0.5) - 0.5) / fwidth(scaledUV);
    float line = min(grid.x, grid.y);
    return 1.0 - min(line / lineWidth, 1.0);
  }

  void main() {
    vec4 texColor = texture2D(cloudTexture, vUv);

    // Tribes 2 uses GL_MODULATE: final = texture × vertex color
    // Vertex color is white with varying alpha, so:
    // Final RGB = Texture RGB × 1.0 = Texture RGB
    // Final Alpha = Texture Alpha × Vertex Alpha
    float finalAlpha = texColor.a * vAlpha;
    vec3 color = texColor.rgb;

    // Debug mode: overlay R/G/B grid for layers 0/1/2
    if (debugMode > 0.5) {
      float gridIntensity = debugGrid(vUv, 4.0, 1.5);
      vec3 gridColor;
      if (layerIndex == 0) {
        gridColor = vec3(1.0, 0.0, 0.0); // Red
      } else if (layerIndex == 1) {
        gridColor = vec3(0.0, 1.0, 0.0); // Green
      } else {
        gridColor = vec3(0.0, 0.0, 1.0); // Blue
      }
      color = mix(color, gridColor, gridIntensity * 0.5);
    }

    // Output clouds with texture color and combined alpha
    gl_FragColor = vec4(color, finalAlpha);
  }
`;function nn({textureUrl:e,radius:t,heightPercent:n,speed:r,windDirection:i,layerIndex:o}){let{debugMode:s}=l(),{animationEnabled:u}=c(),d=(0,K.useRef)(null),f=pe(e,$t),p=(0,K.useMemo)(()=>Zt(t,n,n-.05,Jt),[t,n]);(0,K.useEffect)(()=>()=>{p.dispose()},[p]);let m=(0,K.useMemo)(()=>new ae({uniforms:{cloudTexture:{value:f},uvOffset:{value:new I(0,0)},debugMode:{value:s?1:0},layerIndex:{value:o}},vertexShader:en,fragmentShader:tn,transparent:!0,depthWrite:!1,side:2}),[f,s,o]);return(0,K.useEffect)(()=>()=>{m.dispose()},[m]),a(u?(e,t)=>{let n=t*1e3/32;d.current??=new I(0,0),d.current.x+=i.x*r*n,d.current.y+=i.y*r*n,d.current.x-=Math.floor(d.current.x),d.current.y-=Math.floor(d.current.y),m.uniforms.uvOffset.value.copy(d.current)}:Kt),(0,J.jsx)(`mesh`,{geometry:p,frustumCulled:!1,renderOrder:10,children:(0,J.jsx)(`primitive`,{object:m,attach:`material`})})}var rn=7;function an(e){let t=(0,q.c)(7),n,r;t[0]===e?(n=t[1],r=t[2]):(n=[`detailMapList`,e],r=()=>De(e),t[0]=e,t[1]=n,t[2]=r);let i=!!e,a;return t[3]!==n||t[4]!==r||t[5]!==i?(a={queryKey:n,queryFn:r,enabled:i},t[3]=n,t[4]=r,t[5]=i,t[6]=a):a=t[6],u(a)}function on(e){let t=(0,q.c)(18),{scene:n}=e,{data:r}=an(n.materialList||void 0),i=(n.visibleDistance>0?n.visibleDistance:500)*.95,o;t[0]===n.cloudLayers?o=t[1]:(o=n.cloudLayers.map(cn),t[0]=n.cloudLayers,t[1]=o);let s=o,c;t[2]===n.cloudLayers?c=t[3]:(c=n.cloudLayers.map(sn),t[2]=n.cloudLayers,t[3]=c);let l=c,u;bb0:{let{x:e,y:r}=n.windVelocity;if(e!==0||r!==0){let n;t[4]!==e||t[5]!==r?(n=new I(r,-e).normalize(),t[4]=e,t[5]=r,t[6]=n):n=t[6],u=n;break bb0}let i;t[7]===Symbol.for(`react.memo_cache_sentinel`)?(i=new I(1,0),t[7]=i):i=t[7],u=i}let d=u,f;bb1:{if(!r){let e;t[8]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[8]=e):e=t[8],f=e;break bb1}let e;if(t[9]!==l||t[10]!==s||t[11]!==r){e=[];for(let t=0;t<3;t++){let n=r[rn+t];n&&e.push({texture:n,height:l[t],speed:s[t]})}t[9]=l,t[10]=s,t[11]=r,t[12]=e}else e=t[12];f=e}let p=f,m=(0,K.useRef)(null),h;if(t[13]===Symbol.for(`react.memo_cache_sentinel`)?(h=e=>{let{camera:t}=e;m.current&&m.current.position.copy(t.position)},t[13]=h):h=t[13],a(h),!p||p.length===0)return null;let g;return t[14]!==p||t[15]!==i||t[16]!==d?(g=(0,J.jsx)(`group`,{ref:m,children:p.map((e,t)=>(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(nn,{textureUrl:G(e.texture),radius:i,heightPercent:e.height,speed:e.speed,windDirection:d,layerIndex:t})},t))}),t[14]=p,t[15]=i,t[16]=d,t[17]=g):g=t[17],g}function sn(e,t){return e.heightPercent||[.35,.25,.2][t]}function cn(e,t){return e.speed||[1e-4,2e-4,3e-4][t]}(0,K.createContext)(null),(0,K.createContext)(null);function ln(e){let t=e.fogDistance,n=e.visibleDistance>0?e.visibleDistance:1e3,{r,g:i,b:a}=e.fogColor,o=new B().setRGB(r,i,a).convertSRGBToLinear(),s=[];for(let t of e.fogVolumes)t.visibleDistance<=0||t.maxHeight<=t.minHeight||s.push({visibleDistance:t.visibleDistance,minHeight:t.minHeight,maxHeight:t.maxHeight,percentage:1});return{fogDistance:t,visibleDistance:n,fogColor:o,fogVolumes:s,fogLine:s.reduce((e,t)=>Math.max(e,t.maxHeight),0),enabled:n>t}}var un=S(`Sky`),dn=!1;function fn(e){return[new B().setRGB(e.r,e.g,e.b),new B().setRGB(e.r,e.g,e.b).convertSRGBToLinear()]}function pn(e){let t=(0,q.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`detailMapList`,e],queryFn:()=>(un.debug(`Loading detail map list: %s`,e),De(e))},t[0]=e,t[1]=n);let r=u(n),i,a;return t[2]!==e||t[3]!==r.data||t[4]!==r.error||t[5]!==r.status?(i=()=>{un.debug(`DML query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (${r.data.length} entries)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=e,t[3]=r.data,t[4]=r.error,t[5]=r.status,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,K.useEffect)(i,a),r}var mn=60;function hn({skyBoxFiles:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=Je(e,{path:``}),a=!!t,s=(0,K.useMemo)(()=>r.projectionMatrixInverse,[r]),c=(0,K.useMemo)(()=>n?ze(n.fogVolumes):new Float32Array(12),[n]),l=(0,K.useRef)({skybox:{value:i},fogColor:{value:t??new B(0,0,0)},enableFog:{value:a},inverseProjectionMatrix:{value:s},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:Ue.cameraHeight,fogVolumeData:{value:c},horizonFogHeight:{value:.18}}),u=(0,K.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return mn/Math.sqrt(e*e+mn*mn)},[n]);return(0,K.useEffect)(()=>{l.current.skybox.value=i,l.current.fogColor.value=t??new B(0,0,0),l.current.enableFog.value=a,l.current.fogVolumeData.value=c,l.current.horizonFogHeight.value=u},[i,t,a,c,u]),(0,J.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,J.jsxs)(`bufferGeometry`,{children:[(0,J.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,J.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,J.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.9999, 1.0);
          }
        `,fragmentShader:`
          uniform samplerCube skybox;
          uniform vec3 fogColor;
          uniform bool enableFog;
          uniform mat4 inverseProjectionMatrix;
          uniform mat4 cameraMatrixWorld;
          uniform float cameraHeight;
          uniform float fogVolumeData[12];
          uniform float horizonFogHeight;

          varying vec2 vUv;

          // Convert linear to sRGB for display
          // shaderMaterial does NOT get automatic linear->sRGB output conversion
          // Use proper sRGB transfer function (not simplified gamma 2.2) to match Three.js
          vec3 linearToSRGB(vec3 linear) {
            vec3 low = linear * 12.92;
            vec3 high = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
            return mix(low, high, step(vec3(0.0031308), linear));
          }

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
              vec3 effectiveFogColor = fogColor;

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

              finalColor = mix(skyColor.rgb, effectiveFogColor, finalFogFactor);
            } else {
              finalColor = skyColor.rgb;
            }
            // Convert linear result to sRGB for display
            gl_FragColor = vec4(linearToSRGB(finalColor), 1.0);
          }
        `,depthWrite:!1,depthTest:!1})]})}function gn(e){let t=(0,q.c)(6),{materialList:n,fogColor:r,fogState:i}=e,{data:a}=pn(n),o;t[0]===a?o=t[1]:(o=a?[G(a[1]),G(a[3]),G(a[4]),G(a[5]),G(a[0]),G(a[2])]:null,t[0]=a,t[1]=o);let s=o;if(!s)return null;let c;return t[2]!==r||t[3]!==i||t[4]!==s?(c=(0,J.jsx)(hn,{skyBoxFiles:s,fogColor:r,fogState:i}),t[2]=r,t[3]=i,t[4]=s,t[5]=c):c=t[5],c}function _n({skyColor:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=!!t,a=(0,K.useMemo)(()=>r.projectionMatrixInverse,[r]),s=(0,K.useMemo)(()=>n?ze(n.fogVolumes):new Float32Array(12),[n]),c=(0,K.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return mn/Math.sqrt(e*e+mn*mn)},[n]),l=(0,K.useRef)({skyColor:{value:e},fogColor:{value:t??new B(0,0,0)},enableFog:{value:i},inverseProjectionMatrix:{value:a},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:Ue.cameraHeight,fogVolumeData:{value:s},horizonFogHeight:{value:c}});return(0,K.useEffect)(()=>{l.current.skyColor.value=e,l.current.fogColor.value=t??new B(0,0,0),l.current.enableFog.value=i,l.current.fogVolumeData.value=s,l.current.horizonFogHeight.value=c},[e,t,i,s,c]),(0,J.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,J.jsxs)(`bufferGeometry`,{children:[(0,J.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,J.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,J.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.9999, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 skyColor;
          uniform vec3 fogColor;
          uniform bool enableFog;
          uniform mat4 inverseProjectionMatrix;
          uniform mat4 cameraMatrixWorld;
          uniform float cameraHeight;
          uniform float fogVolumeData[12];
          uniform float horizonFogHeight;

          varying vec2 vUv;

          // Convert linear to sRGB for display
          vec3 linearToSRGB(vec3 linear) {
            vec3 low = linear * 12.92;
            vec3 high = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
            return mix(low, high, step(vec3(0.0031308), linear));
          }

          void main() {
            vec2 ndc = vUv * 2.0 - 1.0;
            vec4 viewPos = inverseProjectionMatrix * vec4(ndc, 1.0, 1.0);
            viewPos.xyz /= viewPos.w;
            vec3 direction = normalize((cameraMatrixWorld * vec4(viewPos.xyz, 0.0)).xyz);
            direction = vec3(direction.z, direction.y, -direction.x);

            vec3 finalColor;

            if (enableFog) {
              // Calculate volume fog influence (same logic as SkyBoxTexture)
              float volumeFogInfluence = 0.0;

              for (int i = 0; i < 3; i++) {
                int offset = i * 4;
                float volVisDist = fogVolumeData[offset + 0];
                float volMinH = fogVolumeData[offset + 1];
                float volMaxH = fogVolumeData[offset + 2];
                float volPct = fogVolumeData[offset + 3];

                if (volVisDist <= 0.0) continue;

                if (cameraHeight >= volMinH && cameraHeight <= volMaxH) {
                  float rayInfluence;
                  if (direction.y >= 0.0) {
                    rayInfluence = 1.0 - smoothstep(0.0, 0.3, direction.y);
                  } else {
                    rayInfluence = 1.0;
                  }
                  volumeFogInfluence += rayInfluence * volPct;
                }
              }

              // Base fog factor from view direction
              float baseFogFactor;
              if (direction.y <= 0.0) {
                baseFogFactor = 1.0;
              } else if (direction.y >= horizonFogHeight) {
                baseFogFactor = 0.0;
              } else {
                float t = direction.y / horizonFogHeight;
                baseFogFactor = (1.0 - t) * (1.0 - t);
              }

              // Combine base fog with volume fog influence
              float finalFogFactor = min(1.0, baseFogFactor + volumeFogInfluence * 0.5);

              finalColor = mix(skyColor, fogColor, finalFogFactor);
            } else {
              finalColor = skyColor;
            }

            gl_FragColor = vec4(linearToSRGB(finalColor), 1.0);
          }
        `,depthWrite:!1,depthTest:!1})]})}function vn(e,t){let{fogDistance:n,visibleDistance:r}=e;return[n,r]}function yn({fogState:e,enabled:t}){let n=o(e=>e.scene),r=o(e=>e.camera),i=(0,K.useRef)(null),s=(0,K.useMemo)(()=>ze(e.fogVolumes),[e.fogVolumes]);return(0,K.useEffect)(()=>{dn||=(He(),!0)},[]),(0,K.useEffect)(()=>{Ve();let[t,a]=vn(e,r.position.y),o=new ie(e.fogColor,t,a);return n.fog=o,i.current=o,Re(r.position.y,s),()=>{n.fog=null,i.current=null,Ve()}},[n,r,e,s]),(0,K.useEffect)(()=>{let n=i.current;if(n)if(t){let[t,i]=vn(e,r.position.y);n.near=t,n.far=i}else n.near=1e10,n.far=1e10},[t,e,r.position.y]),a(()=>{let n=i.current;if(!n)return;let a=r.position.y;if(Re(a,s,t),t){let[t,r]=vn(e,a);n.near=t,n.far=r,n.color.copy(e.fogColor)}}),null}var bn=(0,K.memo)(function({entity:e}){let{skyData:t}=e;un.debug(`Rendering: materialList=%s, useSkyTextures=%s`,t.materialList,t.useSkyTextures);let{fogEnabled:n}=c(),r=t.materialList||void 0,i=(0,K.useMemo)(()=>fn(t.skySolidColor),[t.skySolidColor]),a=t.useSkyTextures,s=(0,K.useMemo)(()=>ln(t),[t]);un.debug(`fogState: fogColor=(%s, %s, %s) visibleDistance=%d fogDistance=%d enabled=%s volumes=%d`,t.fogColor.r.toFixed(3),t.fogColor.g.toFixed(3),t.fogColor.b.toFixed(3),t.visibleDistance,t.fogDistance,s.enabled,s.fogVolumes.length);let l=(0,K.useMemo)(()=>fn(t.fogColor),[t.fogColor]),u=i||l,d=s.enabled&&n,f=s.fogColor,p=o(e=>e.scene),m=o(e=>e.gl);(0,K.useEffect)(()=>{if(d){let e=f.clone();p.background=e,m.setClearColor(e)}else if(u){let e=u[0].clone();p.background=e,m.setClearColor(e)}else p.background=null;return()=>{p.background=null}},[p,m,d,f,u]);let h=i?.[1];return(0,J.jsxs)(J.Fragment,{children:[r&&a&&r.length>0?(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(gn,{materialList:r,fogColor:d?f:void 0,fogState:d?s:void 0},r)}):h?(0,J.jsx)(_n,{skyColor:h,fogColor:d?f:void 0,fogState:d?s:void 0}):null,(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(on,{scene:t})}),s.enabled?(0,J.jsx)(yn,{fogState:s,enabled:n}):null]})});function xn(e){let t=(0,q.c)(3),{children:n}=e,{audioEnabled:r}=c(),i;return t[0]!==r||t[1]!==n?(i=r?(0,J.jsx)(K.Suspense,{children:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}function $(e,t){let n=(0,K.lazy)(()=>t().then(t=>({default:t[e]}))),r=t=>{let r=(0,q.c)(5),{entity:i}=t,a=`${e}:${i.id}`,o;r[0]===i?o=r[1]:(o=(0,J.jsx)(n,{entity:i}),r[0]=i,r[1]=o);let s;return r[2]!==a||r[3]!==o?(s=(0,J.jsx)(Me,{name:a,children:o}),r[2]=a,r[3]=o,r[4]=s):s=r[4],s};return r.displayName=`createLazy(${e})`,r}var Sn=$(`PlayerModel`,()=>W(()=>import(`./PlayerModel-BineeFDG.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]))),Cn=$(`ExplosionShape`,()=>W(()=>import(`./ShapeModel-3SYyPV6E.js`),__vite__mapDeps([32,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,31]))),wn=$(`TracerProjectile`,()=>W(()=>import(`./Projectiles-D0An0RFF.js`),__vite__mapDeps([33,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]))),Tn=$(`SpriteProjectile`,()=>W(()=>import(`./Projectiles-D0An0RFF.js`),__vite__mapDeps([33,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]))),En=$(`ForceFieldBare`,()=>W(()=>import(`./ForceFieldBare-C0llo30b.js`),__vite__mapDeps([34,1,2,3,5,6,7,8,9,16,17,29,26]))),Dn=$(`AudioEmitter`,()=>W(()=>import(`./AudioEmitter-sxlstebu.js`),__vite__mapDeps([28,1,2,3,6,7,8,9,16,17,15,27,21,22,11,12,13,14,18,19,20,23,24,26]))),On=$(`WaterBlock`,()=>W(()=>import(`./WaterBlock--pJmCke8.js`),__vite__mapDeps([35,1,2,3,23,5,6,7,8,9,16,17,25,26,19]))),kn=$(`WeaponModel`,()=>W(()=>import(`./ShapeModel-3SYyPV6E.js`),__vite__mapDeps([32,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,31]))),An={1:`Storm`,2:`Inferno`},jn=(0,K.memo)(function(e){let t=(0,q.c)(26),{entity:n}=e;switch(n.renderType){case`Shape`:{let e;return t[0]===n?e=t[1]:(e=(0,J.jsx)(Mn,{entity:n}),t[0]=n,t[1]=e),e}case`ForceFieldBare`:{let e;return t[2]===n?e=t[3]:(e=(0,J.jsx)(En,{entity:n}),t[2]=n,t[3]=e),e}case`Player`:{let e;return t[4]===n?e=t[5]:(e=(0,J.jsx)(Sn,{entity:n}),t[4]=n,t[5]=e),e}case`Explosion`:{let e;return t[6]===n?e=t[7]:(e=(0,J.jsx)(Cn,{entity:n}),t[6]=n,t[7]=e),e}case`Tracer`:{let e;return t[8]===n?e=t[9]:(e=(0,J.jsx)(wn,{entity:n}),t[8]=n,t[9]=e),e}case`Sprite`:{let e;return t[10]===n?e=t[11]:(e=(0,J.jsx)(Tn,{entity:n}),t[10]=n,t[11]=e),e}case`AudioEmitter`:{let e;return t[12]===n?e=t[13]:(e=(0,J.jsx)(xn,{children:(0,J.jsx)(Dn,{entity:n})}),t[12]=n,t[13]=e),e}case`Camera`:{let e;return t[14]===n?e=t[15]:(e=(0,J.jsx)(at,{entity:n}),t[14]=n,t[15]=e),e}case`WayPoint`:{let e;return t[16]===n?e=t[17]:(e=(0,J.jsx)(ot,{entity:n}),t[16]=n,t[17]=e),e}case`TerrainBlock`:{let e;return t[18]===n.terrainData?e=t[19]:(e=(0,J.jsx)(Ot,{scene:n.terrainData}),t[18]=n.terrainData,t[19]=e),e}case`InteriorInstance`:{let e;return t[20]===n.interiorData?e=t[21]:(e=(0,J.jsx)(Ut,{scene:n.interiorData}),t[20]=n.interiorData,t[21]=e),e}case`Sky`:{let e;return t[22]===n?e=t[23]:(e=(0,J.jsx)(bn,{entity:n}),t[22]=n,t[23]=e),e}case`Sun`:return null;case`WaterBlock`:{let e;return t[24]===n?e=t[25]:(e=(0,J.jsx)(On,{entity:n}),t[24]=n,t[25]=e),e}case`MissionArea`:return null;case`None`:return null;default:return null}});function Mn(e){let t=(0,q.c)(24),{entity:n}=e,{animationEnabled:r}=c(),i=(0,K.useRef)(null),o;if(t[0]!==r||t[1]!==n.rotate?(o=()=>{if(!i.current||!n.rotate||!r)return;let e=performance.now()/1e3;i.current.rotation.y=e/3*Math.PI*2},t[0]=r,t[1]=n.rotate,t[2]=o):o=t[2],a(o),!n.shapeName)throw Error(`Shape entity missing shapeName: ${n.id}`);let s=n.runtimeObject,l=n.shapeType??`StaticShape`,u=n.dataBlock?.toLowerCase()===`flag`,d=n.teamId&&n.teamId>0?An[n.teamId]:null,f=u&&d?`${d} Flag`:null,p=n.shapeType===`Item`?`pink`:n.threads?`#00ff88`:`yellow`,m=n.rotate?i:void 0,h=s?void 0:n,_;t[3]===f?_=t[4]:(_=f?(0,J.jsx)(je,{opacity:.6,children:f}):null,t[3]=f,t[4]=_);let y;t[5]!==p||t[6]!==h||t[7]!==_?(y=(0,J.jsx)(g,{loadingColor:p,streamEntity:h,children:_}),t[5]=p,t[6]=h,t[7]=_,t[8]=y):y=t[8];let b;t[9]!==n.barrelShapeName||t[10]!==s?(b=n.barrelShapeName&&(0,J.jsx)(x,{object:s,shapeName:n.barrelShapeName,type:`Turret`,children:(0,J.jsx)(`group`,{position:[0,1.5,0],children:(0,J.jsx)(g,{})})}),t[9]=n.barrelShapeName,t[10]=s,t[11]=b):b=t[11];let S;t[12]===n?S=t[13]:(S=n.weaponShape&&(0,J.jsx)(We,{fallback:(0,J.jsx)(v,{color:`red`,label:n.weaponShape}),children:(0,J.jsx)(Me,{name:`Weapon:${n.id}/${n.weaponShape}`,fallback:(0,J.jsx)(v,{color:`cyan`,label:n.weaponShape}),children:(0,J.jsx)(kn,{entity:n})})}),t[12]=n,t[13]=S);let C;t[14]!==m||t[15]!==y||t[16]!==b||t[17]!==S?(C=(0,J.jsxs)(`group`,{ref:m,children:[y,b,S]}),t[14]=m,t[15]=y,t[16]=b,t[17]=S,t[18]=C):C=t[18];let w;return t[19]!==n.shapeName||t[20]!==l||t[21]!==C||t[22]!==s?(w=(0,J.jsx)(x,{object:s,shapeName:n.shapeName,type:l,children:C}),t[19]=n.shapeName,t[20]=l,t[21]=C,t[22]=s,t[23]=w):w=t[23],w}var Nn={Root:`_Root_dlg08_1`,Top:`_Top_dlg08_9 _Root_dlg08_1`,Bottom:`_Bottom_dlg08_14 _Root_dlg08_1`,IffArrow:`_IffArrow_dlg08_19`,Name:`_Name_dlg08_26`,HealthBar:`_HealthBar_dlg08_34`,HealthFill:`_HealthFill_dlg08_43`},Pn=150,Fn=.1,In=-.2,Ln=G(`gui/hud_alliedtriangle`),Rn=G(`gui/hud_enemytriangle`),zn=new j,Bn=[];function Vn(e){let t=(0,q.c)(21),{entity:n}=e,r=_(n.shapeName??n.dataBlock),i=o(Un),s=(0,K.useRef)(null),c=(0,K.useRef)(null),l=(0,K.useRef)(null),u=(0,K.useRef)(null),d=(0,K.useRef)(null),[f,p]=(0,K.useState)(!0),m=(0,K.useRef)(null),g;t[0]===r.scene?g=t[1]:(g=new te().setFromObject(r.scene),t[0]=r.scene,t[1]=g);let v=g.max.y+Fn,y=n.keyframes??Bn,b;t[2]===y?b=t[3]:(b=y.some(Hn),t[2]=y,t[3]=b);let x=b,S;t[4]!==i||t[5]!==n.id||t[6]!==n.iffColor||t[7]!==n.playerName||t[8]!==x||t[9]!==f||t[10]!==y?(S=()=>{let e=s.current;if(!e)return;e.getWorldPosition(zn);let t=i.position.distanceTo(zn),r=i.matrixWorld.elements,a=!((zn.x-r[12])*-r[8]+(zn.y-r[13])*-r[9]+(zn.z-r[14])*-r[10]<0)&&t<Pn;if(f!==a&&p(a),!a)return;let o=h(y,Pe.getState().time),g=o?.health??1;if(o?.damageState!=null&&o.damageState>=1){c.current&&(c.current.style.opacity=`0`),l.current&&(l.current.style.opacity=`0`);return}let _=Math.max(0,Math.min(1,1-t/Pn)).toString();if(c.current&&(c.current.style.opacity=_),l.current&&(l.current.style.opacity=_),m.current){let e=n.playerName??n.id;m.current.textContent!==e&&(m.current.textContent=e)}if(d.current&&n.iffColor){let e=n.iffColor.r>n.iffColor.g?Rn:Ln;d.current.getAttribute(`src`)!==e&&(d.current.src=e)}u.current&&x&&(u.current.style.width=`${Math.max(0,Math.min(100,g*100))}%`,u.current.style.background=n.iffColor?`rgb(${n.iffColor.r}, ${n.iffColor.g}, ${n.iffColor.b})`:``)},t[4]=i,t[5]=n.id,t[6]=n.iffColor,t[7]=n.playerName,t[8]=x,t[9]=f,t[10]=y,t[11]=S):S=t[11],a(S);let C=n.iffColor&&n.iffColor.r>n.iffColor.g?Rn:Ln,w;t[12]!==n.id||t[13]!==n.playerName||t[14]!==x||t[15]!==v||t[16]!==C||t[17]!==f?(w=f&&(0,J.jsxs)(J.Fragment,{children:[(0,J.jsx)(fe,{position:[0,v,0],center:!0,children:(0,J.jsx)(`div`,{ref:c,className:Nn.Top,children:(0,J.jsx)(`img`,{ref:d,className:Nn.IffArrow,src:C,alt:``})})}),(0,J.jsx)(fe,{position:[0,In,0],center:!0,children:(0,J.jsxs)(`div`,{ref:l,className:Nn.Bottom,children:[(0,J.jsx)(`div`,{ref:m,className:Nn.Name,children:n.playerName??n.id}),x&&(0,J.jsx)(`div`,{className:Nn.HealthBar,children:(0,J.jsx)(`div`,{ref:u,className:Nn.HealthFill})})]})})]}),t[12]=n.id,t[13]=n.playerName,t[14]=x,t[15]=v,t[16]=C,t[17]=f,t[18]=w):w=t[18];let T;return t[19]===w?T=t[20]:(T=(0,J.jsx)(`group`,{ref:s,children:w}),t[19]=w,t[20]=T),T}function Hn(e){return e.health!=null}function Un(e){return e.camera}var Wn={Root:`_Root_yuidw_1`,Distance:`_Distance_yuidw_9`,Icon:`_Icon_yuidw_18`},Gn=1.5,Kn=G(`commander/MiniIcons/com_flag_grey`),qn=new j;function Jn(e){let t=(0,q.c)(9),{entity:n}=e,r=(0,K.useRef)(null),i=(0,K.useRef)(null),s=(0,K.useRef)(null),c=o(Yn),l;t[0]!==c||t[1]!==n.iffColor?(l=()=>{if(i.current&&n.iffColor){let{r:e,g:t,b:r}=n.iffColor;i.current.style.backgroundColor=`rgb(${e},${t},${r})`}if(s.current&&r.current){r.current.getWorldPosition(qn);let e=c.position.distanceTo(qn);s.current.textContent=e.toFixed(1)}},t[0]=c,t[1]=n.iffColor,t[2]=l):l=t[2],a(l);let u=n.iffColor?`rgb(${n.iffColor.r},${n.iffColor.g},${n.iffColor.b})`:`rgb(200,200,200)`,d;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(d=[0,Gn,0],t[3]=d):d=t[3];let f;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,J.jsx)(`span`,{ref:s,className:Wn.Distance}),t[4]=f):f=t[4];let p;t[5]===u?p=t[6]:(p={backgroundColor:u,"--flag-icon-url":`url(${Kn})`},t[5]=u,t[6]=p);let m=p,h;return t[7]===m?h=t[8]:(h=(0,J.jsx)(`group`,{ref:r,children:(0,J.jsx)(fe,{position:d,center:!0,children:(0,J.jsxs)(`div`,{className:Wn.Root,children:[f,(0,J.jsx)(`div`,{ref:i,className:Wn.Icon,style:m})]})})}),t[7]=m,t[8]=h),h}function Yn(e){return e.camera}function Xn(){let e=(0,q.c)(1),t=Zn,n;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=(0,J.jsx)(`group`,{ref:t,children:(0,J.jsx)(Qn,{})}),e[0]=n):n=e[0],n}function Zn(e){Pe.setState({root:e})}var Qn=(0,K.memo)(function(){let e=me(),t=(0,K.useRef)(new Map).current,n=new Set;for(let r of e)n.add(r.id),t.set(r.id,r);for(let e of t.keys())n.has(e)||t.delete(e);return(0,J.jsx)(J.Fragment,{children:[...t.values()].map(e=>(0,J.jsx)($n,{entity:e},e.id))})}),$n=(0,K.memo)(function(e){let t=(0,q.c)(7),{entity:n}=e;if(Ne(n)){let e;t[0]===n?e=t[1]:(e=(0,J.jsx)(jn,{entity:n}),t[0]=n,t[1]=e);let r;return t[2]!==n.id||t[3]!==e?(r=(0,J.jsx)(`group`,{name:n.id,children:e}),t[2]=n.id,t[3]=e,t[4]=r):r=t[4],r}if(n.renderType===`None`)return null;let r;return t[5]===n?r=t[6]:(r=(0,J.jsx)(rr,{entity:n}),t[5]=n,t[6]=r),r});function er(e){let t=(0,q.c)(2),{entity:n}=e,r=U(tr);if(n.id===r)return null;let i;return t[0]===n?i=t[1]:(i=(0,J.jsx)(Vn,{entity:n}),t[0]=n,t[1]=i),i}function tr(e){return e.playback.streamSnapshot?.controlPlayerGhostId}function nr({entity:e}){let t=(0,K.useRef)(!1),[n,r]=(0,K.useState)(()=>(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0);return t.current=n,a(()=>{let n=(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0;n!==t.current&&(t.current=n,r(n))}),n?(0,J.jsx)(Jn,{entity:e}):null}function rr(e){let t=(0,q.c)(39),{entity:n}=e,r=n.position,i=n.scale,a;bb0:{if(!n.rotation){a=void 0;break bb0}let e;t[0]===n.rotation?e=t[1]:(e=new z(...n.rotation),t[0]=n.rotation,t[1]=e),a=e}let o=a,s=n.renderType===`Player`;if(n.renderType===`Shape`&&!n.shapeName){let e=n.id,a;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(a=(0,J.jsx)(`sphereGeometry`,{args:[.3,6,4]}),t[2]=a):a=t[2];let s;t[3]===n.className?s=t[4]:(s=y(n.className),t[3]=n.className,t[4]=s);let c;t[5]===s?c=t[6]:(c=(0,J.jsxs)(`mesh`,{children:[a,(0,J.jsx)(`meshBasicMaterial`,{color:s,wireframe:!0})]}),t[5]=s,t[6]=c);let l;t[7]===n?l=t[8]:(l=(0,J.jsx)(nr,{entity:n}),t[7]=n,t[8]=l);let u;return t[9]!==n.id||t[10]!==r||t[11]!==o||t[12]!==i||t[13]!==c||t[14]!==l?(u=(0,J.jsxs)(`group`,{name:e,position:r,quaternion:o,scale:i,children:[c,l]}),t[9]=n.id,t[10]=r,t[11]=o,t[12]=i,t[13]=c,t[14]=l,t[15]=u):u=t[15],u}let c;t[16]!==n.className||t[17]!==n.renderType?(c=n.renderType===`Explosion`?null:(0,J.jsxs)(`mesh`,{children:[(0,J.jsx)(`sphereGeometry`,{args:[.5,8,6]}),(0,J.jsx)(`meshBasicMaterial`,{color:y(n.className),wireframe:!0})]}),t[16]=n.className,t[17]=n.renderType,t[18]=c):c=t[18];let l=c,u;t[19]===n?u=t[20]:(u=(0,J.jsx)(jn,{entity:n}),t[19]=n,t[20]=u);let d;t[21]!==l||t[22]!==u?(d=(0,J.jsx)(We,{fallback:l,children:u}),t[21]=l,t[22]=u,t[23]=d):d=t[23];let f;t[24]!==n||t[25]!==s?(f=s&&(0,J.jsx)(er,{entity:n}),t[24]=n,t[25]=s,t[26]=f):f=t[26];let p;t[27]===n?p=t[28]:(p=(0,J.jsx)(nr,{entity:n}),t[27]=n,t[28]=p);let m;t[29]!==d||t[30]!==f||t[31]!==p?(m=(0,J.jsxs)(`group`,{name:`model`,children:[d,f,p]}),t[29]=d,t[30]=f,t[31]=p,t[32]=m):m=t[32];let h;return t[33]!==n.id||t[34]!==r||t[35]!==o||t[36]!==i||t[37]!==m?(h=(0,J.jsx)(`group`,{name:n.id,position:r,quaternion:o,scale:i,children:m}),t[33]=n.id,t[34]=r,t[35]=o,t[36]=i,t[37]=m,t[38]=h):h=t[38],h}function ir(){let e=(0,q.c)(3),{fov:t}=c(),n;e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=[0,256,0],e[0]=n):n=e[0];let r;return e[1]===t?r=e[2]:(r=(0,J.jsx)(qe,{makeDefault:!0,position:n,fov:t}),e[1]=t,e[2]=r),r}function ar(e){let t=(0,q.c)(3),{children:n}=e,{debugMode:r}=l(),i;return t[0]!==n||t[1]!==r?(i=r?(0,J.jsx)(K.Suspense,{children:n}):null,t[0]=n,t[1]=r,t[2]=i):i=t[2],i}var or=S(`InputConsumer`),sr=300,cr=Math.PI/2-.01,lr=45,ur=31,dr=40,fr=1/32,pr=2*Math.PI;function mr(e){return((Math.round(e/pr*65536)|0)<<16>>16)*pr/65536}var hr=new j,gr=new j,_r=new j,vr=new P(0,0,0,`YXZ`);function yr(e,t,n,r,i,a,o){if(r===0&&i===0&&a===0)return;let s=Math.sin(t),c=Math.cos(t),l=Math.sin(n),u=Math.cos(n),d=o*fr;e.x+=(c*r+s*u*i+s*l*a)*d,e.y+=(-s*r+c*u*i+c*l*a)*d,e.z+=(-l*i+u*a)*d}function br(){let{moveQueue:e,mode:t,setMode:n}=xe(),r=ve(e=>e.adapter),i=ve(e=>e.gameStatus),s=ve(e=>e.liveReady),c=ve(e=>e.sendMoves),l=ue(),u=o(e=>e.camera),d=m(),f=(0,K.useRef)(null),h=(0,K.useRef)([]),g=(0,K.useRef)(0),_=(0,K.useRef)(0),v=(0,K.useRef)(null),y=(0,K.useRef)(0),b=(0,K.useRef)(0),x=(0,K.useRef)({x:0,y:0,z:0}),S=(0,K.useRef)(0),w=(0,K.useRef)(0),T=(0,K.useRef)({x:0,y:0,z:0}),E=(0,K.useRef)(!1),D=(0,K.useRef)({x:0,y:0,z:0}),O=(0,K.useRef)({x:0,y:0,z:0}),k=(0,K.useRef)(!1),A=(0,K.useRef)(null),j=(0,K.useRef)(0),M=(0,K.useRef)(0),N=(0,K.useRef)(0),P=(0,K.useRef)(0),F=(0,K.useRef)(0),I=(0,K.useRef)([!1,!1,!1,!1,!1,!1]),L=!!r&&(i===`connected`||i===`authenticating`);return(0,K.useEffect)(()=>{if(L&&r){if(f.current===r)return;or.info(`wiring adapter to engine store`);let e=be.getState(),t={source:`live`,duration:1/0,missionName:e.mapName??null,gameType:null,serverDisplayName:e.serverName??null,recorderName:e.warriorName??null,recordingDate:null,streamingPlayback:r};l.getState().setRecording(t),l.getState().setPlaybackStatus(`playing`),f.current=r,E.current=!1,k.current=!1,A.current=null,h.current.length=0,g.current=0,_.current=0,v.current=null,n(`fly`)}else !L&&f.current&&(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),f.current=null,E.current=!1,k.current=!1,A.current=null,h.current.length=0,n(`local`))},[L,r,l,n]),(0,K.useEffect)(()=>{!s&&f.current&&(or.info(`mission change: resetting prediction state and mode`),E.current=!1,k.current=!1,A.current=null,h.current.length=0,g.current=0,_.current=0,v.current=null,j.current=0,M.current=0,N.current=0,P.current=0,F.current=0,I.current.fill(!1),n(`fly`))},[s,n]),p(()=>{if(!f.current||i!==`connected`||!s)return;let e=j.current,t=M.current;j.current=0,M.current=0;let n=N.current,r=P.current,a=F.current;N.current=0,P.current=0,F.current=0;let o=[...I.current];I.current.fill(!1);let l=mr(e),u=mr(t);y.current+=l-e,b.current+=u-t,S.current=y.current,w.current=b.current,T.current={...x.current};let d=dr*2,p=y.current-l,m=b.current-u;yr(x.current,p,m,n,r,a,d),o[1]=!0;let _=g.current++,v={x:n,y:r,z:a,yaw:e,pitch:t,roll:0,trigger:o,freeLook:!1},C=h.current;C.push({moveIndex:_,move:v,yaw:l,pitch:u,x:n,y:r,z:a}),C.length>lr&&C.splice(0,C.length-lr);let E=f.current.lastMoveAck;for(;C.length>0&&C[0].moveIndex<E;)C.shift();if(C.length>0){let e=C.slice(0,ur);c(e.map(e=>e.move),e[0].moveIndex)}let L=f.current.getSnapshot();if(L!==A.current){A.current=L;let e=L?.camera;if(e?.orbitTargetId){let t=L.entities.find(t=>t.id===e.orbitTargetId);t?.position&&(D.current={...O.current},O.current={x:t.position[0],y:t.position[1],z:t.position[2]},k.current||=(D.current={...O.current},!0))}}}),a((r,a)=>{let o=e.current;if(o.length>0){let t=0,n=0,r=0,a=0,c=0,l=0,d=[!1,!1,!1,!1,!1,!1];for(let e of o){t+=e.deltaYaw,n+=e.deltaPitch,r=e.x,a=e.y,c=e.z,l+=e.delta;for(let t=0;t<e.triggers.length;t++)e.triggers[t]&&(d[t]=!0)}if(e.current.length=0,L&&f.current&&i===`connected`&&s){j.current+=t,M.current+=n,N.current=r,P.current=a,F.current=c;for(let e=0;e<d.length;e++)d[e]&&(I.current[e]=!0);y.current+=t,b.current=Math.max(-C,Math.min(C,b.current+n))}else{let e=Pe.getState();if(e.playback&&!e.freeFlyCamera)return;xr(u,t,n,r,a,c,l);return}}if(!L||!f.current||i!==`connected`||!s)return;let c=f.current,l=c.getSnapshot(),p=l?.camera;if(p&&p!==v.current&&typeof p.yaw==`number`&&typeof p.pitch==`number`){v.current=p;let e=c.lastMoveAck;if(e>_.current){_.current=e;let t=h.current;for(;t.length>0&&t[0].moveIndex<e;)t.shift()}y.current=p.yaw,b.current=p.pitch,x.current={x:p.position[0],y:p.position[1],z:p.position[2]};let r=dr*2;for(let e of h.current)yr(x.current,y.current,b.current,e.x,e.y,e.z,r),y.current+=e.yaw,b.current=Math.max(-C,Math.min(C,b.current+e.pitch));y.current+=j.current,b.current=Math.max(-C,Math.min(C,b.current+M.current)),S.current=y.current,w.current=b.current,T.current={...x.current},E.current=!0;let i=p.mode===`third-person`?`follow`:`fly`;if(i!==t&&(or.info(`server corrected observer mode: %s → %s`,t,i),n(i),f.current&&(f.current.observerMode=i),i===`fly`&&(k.current=!1,A.current=null)),p.orbitTargetId&&!k.current){let e=l.entities.find(e=>e.id===p.orbitTargetId);if(e?.position){let t={x:e.position[0],y:e.position[1],z:e.position[2]};O.current=t,D.current={...t},k.current=!0}}}if(E.current){if(t===`fly`)Sr(r.camera,T.current,x.current,y.current,b.current,d());else if(t===`follow`){if(!k.current)return;Cr(r.camera,D.current,O.current,y.current,b.current,d(),p?.orbitDistance??4,p?.orbitTargetId)}}}),(0,K.useEffect)(()=>()=>{f.current&&=(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),null)},[l]),null}function xr(e,t,n,r,i,a,o){if((t!==0||n!==0)&&(vr.setFromQuaternion(e.quaternion,`YXZ`),vr.y-=t,vr.x-=n,vr.x=Math.max(-cr,Math.min(cr,vr.x)),e.quaternion.setFromEuler(vr)),r!==0||i!==0||a!==0){e.getWorldDirection(hr),hr.normalize(),gr.crossVectors(e.up,hr).normalize(),_r.set(0,0,0),i!==0&&_r.addScaledVector(hr,i),r!==0&&_r.addScaledVector(gr,-r),a!==0&&(_r.y+=a);let t=_r.length();t>0&&(_r.multiplyScalar(Math.min(1,t)/t*sr*o),e.position.add(_r))}}function Sr(e,t,n,r,i,a){let o=t.x+(n.x-t.x)*a,s=t.y+(n.y-t.y)*a,c=t.z+(n.z-t.z)*a;e.position.set(s,c,o);let[l,u,d,f]=w(r,i);e.quaternion.set(l,u,d,f)}function Cr(e,t,n,r,i,a,o,s){let c=t.x+(n.x-t.x)*a,l=t.y+(n.y-t.y)*a,u=t.z+(n.z-t.z)*a+(s!=null&&Pe.getState().entities.get(s)?.renderType===`Player`?1:0),d=Math.sin(i),f=Math.cos(i),p=Math.sin(r),m=Math.cos(r),h=Math.max(.1,o),g=c-p*f*h,_=l-m*f*h,v=u+d*h;e.position.set(_,v,g);let[y,b,x,S]=w(r,i);e.quaternion.set(y,b,x,S)}function wr(e,t){return(0,K.lazy)(()=>t().then(t=>({default:t[e]})))}var Tr=wr(`StreamingController`,()=>W(()=>import(`./StreamingController-DwumtOn9.js`),__vite__mapDeps([36,1,11,12,13,8,2,3,14,7,9,15,6,16,17,18,19,20,4,5,10,21,22,23,24,25,26,27,28,29,0,30,31,37]))),Er=wr(`DebugElements`,()=>W(()=>import(`./DebugElements-Dcs_BtFn.js`),__vite__mapDeps([38,1,22,11,12,13,8,2,3,14,7,9,15,6,16,17,18,19,20,23,39]))),Dr=wr(`Mission`,()=>W(()=>import(`./Mission-zQsAVgl1.js`),__vite__mapDeps([40,1,11,12,13,8,2,3,14,7,9,15,6,16,17,18,19,20,41,10,26,42]))),Or=wr(`ChatSoundPlayer`,()=>W(()=>import(`./ChatSoundPlayer-D0YoWdbd.js`),__vite__mapDeps([43,1,2,3,6,7,8,9,16,17,15,27,28,21,22,11,12,13,14,18,19,20,23,24,26]))),kr=(0,K.memo)(function(e){let t=(0,q.c)(21),{dpr:n,onCreated:r,missionName:i,missionType:a,onLoadingChange:o}=e,s=_e(),c=Ce(),l=c===`demo`||c===`live`,u;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(u=(0,J.jsx)(Se,{}),t[0]=u):u=t[0];let d;t[1]===Symbol.for(`react.memo_cache_sentinel`)?(d=(0,J.jsx)(Qe,{}),t[1]=d):d=t[1];let f,p;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(Xn,{})}),p=(0,J.jsx)(ir,{}),t[2]=f,t[3]=p):(f=t[2],p=t[3]);let m;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(m=(0,J.jsx)(xn,{children:(0,J.jsx)(Or,{})}),t[4]=m):m=t[4];let h;t[5]===Symbol.for(`react.memo_cache_sentinel`)?(h=(0,J.jsx)(ar,{children:(0,J.jsx)(Er,{})}),t[5]=h):h=t[5];let g;t[6]===s?g=t[7]:(g=s?(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(Tr,{recording:s})}):null,t[6]=s,t[7]=g);let _;t[8]!==l||t[9]!==i||t[10]!==a||t[11]!==o?(_=l?null:(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(Dr,{name:i,missionType:a,onLoadingChange:o},`${i}~${a}`)}),t[8]=l,t[9]=i,t[10]=a,t[11]=o,t[12]=_):_=t[12];let v;t[13]===Symbol.for(`react.memo_cache_sentinel`)?(v=(0,J.jsx)(br,{}),t[13]=v):v=t[13];let y;t[14]!==g||t[15]!==_?(y=(0,J.jsx)(b,{children:(0,J.jsxs)(ye,{children:[u,(0,J.jsxs)(Ae,{children:[d,f,p,m,h,g,_,v]})]})}),t[14]=g,t[15]=_,t[16]=y):y=t[16];let x;return t[17]!==n||t[18]!==r||t[19]!==y?(x=(0,J.jsx)(it,{dpr:n,onCreated:r,children:y}),t[17]=n,t[18]=r,t[19]=y,t[20]=x):x=t[20],x});export{kr as GameView};