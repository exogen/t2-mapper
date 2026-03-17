const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PlayerModel-CHa5T5CY.js","assets/chunk-DECur_0Z.js","assets/mission-CgOJ5O6t.js","assets/logger-CC5j_O4o.js","assets/GenericShape-BVUP2Hr-.js","assets/Texture-D0BO6ArI.js","assets/react-three-fiber.esm-IOIyqSDz.js","assets/jsx-runtime-BpGWiA-R.js","assets/three.module-BCXZgYUA.js","assets/traditional-ec-lUAFC.js","assets/useBaseQuery-DK4WLBLs.js","assets/index-BngaOpHI.js","assets/preload-helper-4WkklRMx.js","assets/KeyboardControls-BqqT6pch.js","assets/engineStore-DYTudHqF.js","assets/SettingsProvider-Dls8-Ecn.js","assets/manifest-NjKKupeg.js","assets/iconBase-BCRUFbxq.js","assets/index-0DffZSbP.css","assets/FloatingLabel-DtfOOmmG.js","assets/Html-CQXfFjv-.js","assets/extends-_1DzYWEQ.js","assets/FloatingLabel-DfptgH-Y.css","assets/globalFogUniforms-BmkrmymO.js","assets/loaders-Ba8dC3nL.js","assets/AudioContext-uUCY0wVz.js","assets/AudioEmitter--X9CqSsb.js","assets/DebugSuspense-RneU-m3U.js","assets/ShapeErrorBoundary-BaXWF8jv.js","assets/streamPlaybackStore-Dn9tWMRY.js","assets/ShapeModel-BKc5pvKN.js","assets/Projectiles-Bxibmc5A.js","assets/ForceFieldBare-BXlp-euF.js","assets/WaterBlock-DenYr9I1.js","assets/StreamingController-DTWCS_iN.js","assets/gameEntityTypes-mMLHEa9z.js","assets/DebugElements-CYOeFtvk.js","assets/DebugElements-BP0b5jan.css","assets/Mission-DlR5TH9A.js","assets/useQuery-Cql8MWsA.js","assets/ChatSoundPlayer-CYT1gUBt.js"])))=>i.map(i=>d[i]);
import{r as e}from"./chunk-DECur_0Z.js";import{n as t,r as n,t as r}from"./jsx-runtime-BpGWiA-R.js";import{a as i,i as a,o,t as s}from"./react-three-fiber.esm-IOIyqSDz.js";import{a as c,i as l}from"./SettingsProvider-Dls8-Ecn.js";import{t as u}from"./useQuery-Cql8MWsA.js";import{C as d,D as f,E as p,T as m,d as h,n as g,r as _,t as v,u as y,w as b,x}from"./GenericShape-BVUP2Hr-.js";import{t as S}from"./logger-CC5j_O4o.js";import"./traditional-ec-lUAFC.js";import{Bt as C,C as w,D as T,Dt as E,Et as D,G as O,Ht as k,O as A,S as j,T as M,Tt as N,Vt as P,Wt as F,_ as I,ct as L,f as R,h as ee,j as te,k as ne,kt as re,m as ie,tt as ae,x as oe,xt as se,y as z}from"./three.module-BCXZgYUA.js";import"./mission-CgOJ5O6t.js";import{a as ce,i as le}from"./engineStore-DYTudHqF.js";import{t as B}from"./preload-helper-4WkklRMx.js";import{t as V}from"./extends-_1DzYWEQ.js";import{t as ue}from"./Html-CQXfFjv-.js";import{t as H}from"./Texture-D0BO6ArI.js";import{C as U,H as de,M as fe,S as pe,_ as me,a as he,b as ge,f as _e,h as ve,i as ye,m as be,n as xe,t as Se,v as Ce,w as we,y as Te}from"./index-BngaOpHI.js";import{f as Ee,o as De,p as W,s as Oe,t as ke,u as Ae}from"./loaders-Ba8dC3nL.js";import{t as je}from"./AudioContext-uUCY0wVz.js";import{t as Me}from"./FloatingLabel-DtfOOmmG.js";import{t as Ne}from"./DebugSuspense-RneU-m3U.js";import{t as Pe}from"./gameEntityTypes-mMLHEa9z.js";import{n as Fe}from"./streamPlaybackStore-Dn9tWMRY.js";import{c as Ie,d as Le,f as Re,i as ze,n as Be,o as Ve,r as He,s as Ue,t as We}from"./globalFogUniforms-BmkrmymO.js";import{t as Ge}from"./ShapeErrorBoundary-BaXWF8jv.js";var G=e(n());function Ke(e,t,n){let r=o(e=>e.size),i=o(e=>e.viewport),a=typeof e==`number`?e:r.width*i.dpr,s=typeof t==`number`?t:r.height*i.dpr,c=(typeof e==`number`?n:e)||{},{samples:l=0,depth:u,...d}=c,f=u??c.depthBuffer,p=G.useMemo(()=>{let e=new F(a,s,{minFilter:O,magFilter:O,type:te,...d});return f&&(e.depthTexture=new w(a,s,A)),e.samples=l,e},[]);return G.useLayoutEffect(()=>{p.setSize(a,s),l&&(p.samples=l)},[l,p,a,s]),G.useEffect(()=>()=>p.dispose(),[]),p}var qe=e=>typeof e==`function`,Je=G.forwardRef(({envMap:e,resolution:t=256,frames:n=1/0,makeDefault:r,children:i,...s},c)=>{let l=o(({set:e})=>e),u=o(({camera:e})=>e),d=o(({size:e})=>e),f=G.useRef(null);G.useImperativeHandle(c,()=>f.current,[]);let p=G.useRef(null),m=Ke(t);G.useLayoutEffect(()=>{s.manual||(f.current.aspect=d.width/d.height)},[d,s]),G.useLayoutEffect(()=>{f.current.updateProjectionMatrix()});let h=0,g=null,_=qe(i);return a(t=>{_&&(n===1/0||h<n)&&(p.current.visible=!1,t.gl.setRenderTarget(m),g=t.scene.background,e&&(t.scene.background=e),t.gl.render(t.scene,f.current),t.scene.background=g,t.gl.setRenderTarget(null),p.current.visible=!0,h++)}),G.useLayoutEffect(()=>{if(r){let e=u;return l(()=>({camera:f.current})),()=>l(()=>({camera:e}))}},[f,r,l]),G.createElement(G.Fragment,null,G.createElement(`perspectiveCamera`,V({ref:f},s),!_&&i),G.createElement(`group`,{ref:p},_&&i(m.texture)))});function Ye(e,{path:t}){let[n]=i(oe,[e],e=>e.setPath(t));return n}Ye.preload=(e,{path:t})=>i.preload(oe,[e],e=>e.setPath(t));var K=t(),Xe={sunLightPointsDown:{value:!0}};function Ze(e){Xe.sunLightPointsDown.value=e}var q=r(),Qe=S(`SceneLighting`);function $e(){let e=(0,K.c)(6),t=ge(),n,r;if(e[0]===t?(n=e[1],r=e[2]):(n=()=>{t?Qe.debug(`sunData: dir=(%s, %s, %s) color=(%s, %s, %s) ambient=(%s, %s, %s)`,t.direction.x.toFixed(3),t.direction.y.toFixed(3),t.direction.z.toFixed(3),t.color.r.toFixed(3),t.color.g.toFixed(3),t.color.b.toFixed(3),t.ambient.r.toFixed(3),t.ambient.g.toFixed(3),t.ambient.b.toFixed(3)):Qe.debug(`No sunData — using fallback ambient #888`)},r=[t],e[0]=t,e[1]=n,e[2]=r),(0,G.useEffect)(n,r),!t){let t;return e[3]===Symbol.for(`react.memo_cache_sentinel`)?(t=(0,q.jsx)(`ambientLight`,{color:`#888888`,intensity:1}),e[3]=t):t=e[3],t}let i;return e[4]===t?i=e[5]:(i=(0,q.jsx)(et,{sunData:t}),e[4]=t,e[5]=i),i}function et(e){let t=(0,K.c)(29),{sunData:n}=e,r;t[0]===n.direction?r=t[1]:(r=we(n.direction),t[0]=n.direction,t[1]=r);let[i,a,o]=r,s=Math.sqrt(i*i+a*a+o*o),c=i/s,l=a/s,u=o/s,d;t[2]!==c||t[3]!==l||t[4]!==u?(d=new k(c,l,u),t[2]=c,t[3]=l,t[4]=u,t[5]=d):d=t[5];let f=d,p=-f.x*5e3,m=-f.y*5e3,h=-f.z*5e3,g;t[6]!==p||t[7]!==m||t[8]!==h?(g=new k(p,m,h),t[6]=p,t[7]=m,t[8]=h,t[9]=g):g=t[9];let _=g,v;t[10]!==n.color.b||t[11]!==n.color.g||t[12]!==n.color.r?(v=new z(n.color.r,n.color.g,n.color.b),t[10]=n.color.b,t[11]=n.color.g,t[12]=n.color.r,t[13]=v):v=t[13];let y=v,b;t[14]!==n.ambient.b||t[15]!==n.ambient.g||t[16]!==n.ambient.r?(b=new z(n.ambient.r,n.ambient.g,n.ambient.b),t[14]=n.ambient.b,t[15]=n.ambient.g,t[16]=n.ambient.r,t[17]=b):b=t[17];let x=b,S=f.y<0,C,w;t[18]===S?(C=t[19],w=t[20]):(C=()=>{Ze(S)},w=[S],t[18]=S,t[19]=C,t[20]=w),(0,G.useEffect)(C,w);let T;t[21]!==y||t[22]!==_?(T=(0,q.jsx)(`directionalLight`,{position:_,color:y,intensity:1,castShadow:!0,"shadow-mapSize-width":8192,"shadow-mapSize-height":8192,"shadow-camera-left":-4096,"shadow-camera-right":4096,"shadow-camera-top":4096,"shadow-camera-bottom":-4096,"shadow-camera-near":100,"shadow-camera-far":12e3,"shadow-bias":-1e-5,"shadow-normalBias":.4,"shadow-radius":2}),t[21]=y,t[22]=_,t[23]=T):T=t[23];let E;t[24]===x?E=t[25]:(E=(0,q.jsx)(`ambientLight`,{color:x,intensity:1}),t[24]=x,t[25]=E);let D;return t[26]!==T||t[27]!==E?(D=(0,q.jsxs)(q.Fragment,{children:[T,E]}),t[26]=T,t[27]=E,t[28]=D):D=t[28],D}var tt={toneMapping:0,outputColorSpace:E};function nt(e){let t=(0,K.c)(8),{children:n,renderOnDemand:r,dpr:i,onCreated:a}=e,o=r===void 0?!1:r,{renderOnDemand:c}=l(),u=o||c?`demand`:`always`,d;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(d={type:1},t[0]=d):d=t[0];let f;t[1]===n?f=t[2]:(f=(0,q.jsx)(G.Suspense,{children:n}),t[1]=n,t[2]=f);let p;return t[3]!==i||t[4]!==a||t[5]!==u||t[6]!==f?(p=(0,q.jsx)(s,{frameloop:u,dpr:i,gl:tt,shadows:d,onCreated:a,children:f}),t[3]=i,t[4]=a,t[5]=u,t[6]=f,t[7]=p):p=t[7],p}function rt(e){let t=(0,K.c)(12),{entity:n}=e,{registerCamera:r,unregisterCamera:i}=he(),a=(0,G.useId)(),o=n.cameraDataBlock,s;t[0]===n.position?s=t[1]:(s=n.position?new k(...n.position):new k,t[0]=n.position,t[1]=s);let c=s,l;t[2]===n.rotation?l=t[3]:(l=n.rotation?new se(...n.rotation):new se,t[2]=n.rotation,t[3]=l);let u=l,d,f;return t[4]!==o||t[5]!==a||t[6]!==c||t[7]!==r||t[8]!==u||t[9]!==i?(d=()=>{if(o===`Observer`){let e={id:a,position:c,rotation:u};return r(e),()=>{i(e)}}},f=[a,o,r,i,c,u],t[4]=o,t[5]=a,t[6]=c,t[7]=r,t[8]=u,t[9]=i,t[10]=d,t[11]=f):(d=t[10],f=t[11]),(0,G.useEffect)(d,f),null}function it(e){let t=(0,K.c)(3),{entity:n}=e,r;return t[0]!==n.label||t[1]!==n.position?(r=n.label?(0,q.jsx)(Me,{position:n.position,opacity:.6,children:n.label}):null,t[0]=n.label,t[1]=n.position,t[2]=r):r=t[2],r}function at(e){let t=new Float32Array(e.length);for(let n=0;n<e.length;n++)t[n]=e[n]/65535;return t}var ot=256,st=512,ct=64,lt=150,ut=`
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
`;function dt({shader:e,baseTextures:t,alphaTextures:n,visibilityMask:r,tiling:i,detailTexture:a=null,lightmap:o=null}){e.uniforms.sunLightPointsDown=Xe.sunLightPointsDown;let s=t.length;if(t.forEach((t,n)=>{e.uniforms[`albedo${n}`]={value:t}}),n.forEach((t,n)=>{e.uniforms[`mask${n}`]={value:t}}),r&&(e.uniforms.visibilityMask={value:r}),t.forEach((t,n)=>{e.uniforms[`tiling${n}`]={value:i[n]??32}}),o&&(e.uniforms.terrainLightmap={value:o}),a&&(e.uniforms.detailTexture={value:a},e.uniforms.detailTiling={value:ct},e.uniforms.detailFadeDistance={value:lt},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
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

${ut}

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
  vec2 alphaUv = baseUv + vec2(0.5 / ${ot}.0);
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
  vec2 lightmapUv = vMapUv + vec2(0.5 / ${st}.0);
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

#include <tonemapping_fragment>`)}var ft={0:32,1:32,2:32,3:32,4:32,5:32},pt=(0,G.memo)(function({displacementMap:e,visibilityMask:t,textureNames:n,alphaTextures:r,detailTextureName:i,lightmap:a}){let{debugMode:o}=l(),s=Ie(),c=H(n.map(e=>Ee(e)),e=>{e.forEach(e=>Re(e,{anisotropy:s}))}),u=i?W(i):null,d=H(u??ke,e=>{Re(e,{anisotropy:s})}),f=(0,G.useCallback)(e=>{dt({shader:e,baseTextures:c,alphaTextures:r,visibilityMask:t,tiling:ft,detailTexture:u?d:null,lightmap:a}),Ve(e,We)},[c,r,t,d,u,a]),p=(0,G.useMemo)(()=>[n.join(`,`),u??`none`,a?a.id:`nolm`,c.map(e=>e.id).join(`,`)].join(`|`),[n,u,a,c]),m=(0,G.useRef)(null);return(0,G.useEffect)(()=>{let e=m.current;e&&(e.defines??={},e.defines.DEBUG_MODE=o?1:0,e.needsUpdate=!0)},[o]),(0,G.useEffect)(()=>{let e=m.current;e&&(e.customProgramCacheKey=()=>p,e.needsUpdate=!0)},[p]),(0,q.jsx)(`meshLambertMaterial`,{ref:m,map:e,depthWrite:!0,side:0,defines:{DEBUG_MODE:o?1:0},onBeforeCompile:f},`${u?`detail`:`nodetail`}-${a?`lightmap`:`nolightmap`}`)}),mt=(0,G.memo)(function(e){let t=(0,K.c)(8),{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s}=e,c;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(c=(0,q.jsx)(`meshLambertMaterial`,{color:`rgb(0, 109, 56)`,wireframe:!0}),t[0]=c):c=t[0];let l;return t[1]!==a||t[2]!==o||t[3]!==n||t[4]!==s||t[5]!==i||t[6]!==r?(l=(0,q.jsx)(G.Suspense,{fallback:c,children:(0,q.jsx)(pt,{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s})}),t[1]=a,t[2]=o,t[3]=n,t[4]=s,t[5]=i,t[6]=r,t[7]=l):l=t[7],l}),ht=(0,G.memo)(function(e){let t=(0,K.c)(15),{tileX:n,tileZ:r,blockSize:i,basePosition:a,textureNames:o,geometry:s,displacementMap:c,visibilityMask:l,alphaTextures:u,detailTextureName:d,lightmap:f,visible:p}=e,m=p===void 0?!0:p,h=i/2,g=a.x+n*i+h,_=a.z+r*i+h,v;t[0]!==g||t[1]!==_?(v=[g,0,_],t[0]=g,t[1]=_,t[2]=v):v=t[2];let y=v,b;t[3]!==u||t[4]!==d||t[5]!==c||t[6]!==f||t[7]!==o||t[8]!==l?(b=(0,q.jsx)(mt,{displacementMap:c,visibilityMask:l,textureNames:o,alphaTextures:u,detailTextureName:d,lightmap:f}),t[3]=u,t[4]=d,t[5]=c,t[6]=f,t[7]=o,t[8]=l,t[9]=b):b=t[9];let x;return t[10]!==s||t[11]!==y||t[12]!==b||t[13]!==m?(x=(0,q.jsx)(`mesh`,{position:y,geometry:s,castShadow:!0,receiveShadow:!0,visible:m,children:b}),t[10]=s,t[11]=y,t[12]=b,t[13]=m,t[14]=x):x=t[14],x}),gt=S(`TerrainBlock`),_t=8,vt=600,J=256,Y=512,X=2048;function yt(e,t){let n=new ee,r=(t+1)*(t+1),i=new Float32Array(r*3),a=new Float32Array(r*3),o=new Float32Array(r*2),s=t*t*6,c=new Uint32Array(s),l=0,u=e/t;for(let n=0;n<=t;n++)for(let r=0;r<=t;r++){let s=n*(t+1)+r;i[s*3]=r*u-e/2,i[s*3+1]=e/2-n*u,i[s*3+2]=0,a[s*3]=0,a[s*3+1]=0,a[s*3+2]=1,o[s*2]=r/t,o[s*2+1]=1-n/t}for(let e=0;e<t;e++)for(let n=0;n<t;n++){let r=e*(t+1)+n,i=r+1,a=(e+1)*(t+1)+n,o=a+1;(n^e)&1?(c[l++]=r,c[l++]=a,c[l++]=i,c[l++]=i,c[l++]=a,c[l++]=o):(c[l++]=r,c[l++]=a,c[l++]=o,c[l++]=r,c[l++]=o,c[l++]=i)}return n.setIndex(new ie(c,1)),n.setAttribute(`position`,new T(i,3)),n.setAttribute(`normal`,new T(a,3)),n.setAttribute(`uv`,new T(o,2)),n.rotateX(-Math.PI/2),n.rotateY(-Math.PI/2),n}function bt(e,t,n){let r=e.attributes.position,i=e.attributes.uv,a=e.attributes.normal,o=r.array,s=i.array,c=a.array,l=r.count,u=(e,n)=>(e=Math.max(0,Math.min(J-1,e)),n=Math.max(0,Math.min(J-1,n)),t[n*J+e]/65535*X),d=(e,n)=>{e=Math.max(0,Math.min(J-1,e)),n=Math.max(0,Math.min(J-1,n));let r=Math.floor(e),i=Math.floor(n),a=Math.min(r+1,J-1),o=Math.min(i+1,J-1),s=e-r,c=n-i,l=t[i*J+r]/65535*X,u=t[i*J+a]/65535*X,d=t[o*J+r]/65535*X,f=t[o*J+a]/65535*X,p=l*(1-s)+u*s,m=d*(1-s)+f*s;return p*(1-c)+m*c};for(let e=0;e<l;e++){let t=s[e*2],r=s[e*2+1],i=u(Math.floor(t*J)&J-1,Math.floor(r*J)&J-1);o[e*3+1]=i;let a=t*(J-1),l=r*(J-1),f=d(a-1,l),p=d(a+1,l),m=d(a,l+1),h=d(a,l-1),g=(p-f)/2,_=(m-h)/2,v=n,y=g,b=Math.sqrt(_*_+v*v+y*y);b>0?(_/=b,v/=b,y/=b):(_=0,v=1,y=0),c[e*3]=_,c[e*3+1]=v,c[e*3+2]=y}r.needsUpdate=!0,a.needsUpdate=!0}function xt(e,t,n,r,i,a){let o=r.z/i,s=r.x/i,c=r.y,l=Math.sqrt(o*o+s*s);if(l<1e-4)return 1;let u=.5/l,d=o*u,f=s*u,p=c*u,m=e,h=t,g=n+.1,_=J*3;for(let e=0;e<_;e++){if(m+=d,h+=f,g+=p,m<0||m>=J||h<0||h>=J||g>X)return 1;let e=a(m,h);if(g<e)return 0}return 1}function St(e,t,n){let r=(t,n)=>{let r=Math.max(0,Math.min(J-1,t)),i=Math.max(0,Math.min(J-1,n)),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,J-1),c=Math.min(o+1,J-1),l=r-a,u=i-o,d=e[o*J+a]/65535,f=e[o*J+s]/65535,p=e[c*J+a]/65535,m=e[c*J+s]/65535,h=d*(1-l)+f*l,g=p*(1-l)+m*l;return(h*(1-u)+g*u)*X},i=new k(-t.x,-t.y,-t.z).normalize(),a=new Uint8Array(Y*Y),o=.5;for(let e=0;e<Y;e++)for(let t=0;t<Y;t++){let s=t/2+.25,c=e/2+.25,l=r(s,c),u=r(s-o,c),d=r(s+o,c),f=r(s,c-o),p=r(s,c+o),m=(d-u)/(2*o),h=-((p-f)/(2*o)),g=n,_=-m,v=Math.sqrt(h*h+g*g+_*_),y=Math.max(0,h/v*i.x+g/v*i.y+_/v*i.z),b=1;y>0&&(b=xt(s,c,l,i,n,r)),a[e*Y+t]=Math.floor(y*b*255)}let s=new j(a,Y,Y,N,C);return s.colorSpace=``,s.generateMipmaps=!0,s.wrapS=I,s.wrapT=I,s.magFilter=O,s.minFilter=O,s.needsUpdate=!0,s}function Ct(e){let t=(0,K.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`terrain`,e],queryFn:()=>(gt.debug(`Loading terrain: %s`,e),Ae(e))},t[0]=e,t[1]=n);let r=u(n),i,a;return t[2]!==r.data||t[3]!==r.error||t[4]!==r.status||t[5]!==e?(i=()=>{gt.debug(`Query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (data ready)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=r.data,t[3]=r.error,t[4]=r.status,t[5]=e,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,G.useEffect)(i,a),r}function wt(){let e=Te();return e&&e.visibleDistance>0?e.visibleDistance:vt}function Tt(e){let t=new Uint8Array(J*J);t.fill(255);for(let n of e){let e=n&255,r=n>>8&255,i=n>>16,a=r*J;for(let n=0;n<i;n++){let r=a+e+n;r<t.length&&(t[r]=0)}}let n=new j(t,J,J,N,C);return n.colorSpace=``,n.wrapS=n.wrapT=I,n.magFilter=L,n.minFilter=L,n.needsUpdate=!0,n}var Et=(0,G.memo)(function(e){let t=(0,K.c)(62),{scene:n}=e,r=n.terrFileName,i=n.squareSize||_t,s=n.detailTextureName||void 0,c=i*256,l=wt(),u=o(Dt),d=-i*(J/2),f;t[0]===d?f=t[1]:(f={x:d,z:d},t[0]=d,t[1]=f);let p=f,m;t[2]===n.emptySquareRuns?m=t[3]:(m=n.emptySquareRuns??[],t[2]=n.emptySquareRuns,t[3]=m);let h=m,{data:g}=Ct(r),_;bb0:{if(!g){_=null;break bb0}let e=i*256,n;t[4]!==e||t[5]!==i||t[6]!==g.heightMap?(n=yt(e,J),bt(n,g.heightMap,i),t[4]=e,t[5]=i,t[6]=g.heightMap,t[7]=n):n=t[7],_=n}let v=_,y,b;t[8]!==i||t[9]!==g?(y=()=>{if(g)return g.heightMap,Ot},b=[g,i],t[8]=i,t[9]=g,t[10]=y,t[11]=b):(y=t[10],b=t[11]),(0,G.useEffect)(y,b);let x=ge(),S;bb1:{if(!x){let e;t[12]===Symbol.for(`react.memo_cache_sentinel`)?(e=new k(.57735,-.57735,.57735),t[12]=e):e=t[12],S=e;break bb1}let e;t[13]===x.direction?e=t[14]:(e=we(x.direction),t[13]=x.direction,t[14]=e);let[n,r,i]=e,a=Math.sqrt(n*n+r*r+i*i),o=n/a,s=r/a,c=i/a,l;t[15]!==c||t[16]!==o||t[17]!==s?(l=new k(o,s,c),t[15]=c,t[16]=o,t[17]=s,t[18]=l):l=t[18],S=l}let C=S,w;bb2:{if(!g){w=null;break bb2}let e;t[19]!==i||t[20]!==C||t[21]!==g.heightMap?(e=St(g.heightMap,C,i),t[19]=i,t[20]=C,t[21]=g.heightMap,t[22]=e):e=t[22],w=e}let T=w,E;bb3:{if(!g){E=null;break bb3}let e;t[23]===g.heightMap?e=t[24]:(e=new j(at(g.heightMap),J,J,N,A),e.colorSpace=``,e.generateMipmaps=!1,e.wrapS=D,e.wrapT=D,e.needsUpdate=!0,t[23]=g.heightMap,t[24]=e),E=e}let O=E,M;t[25]===h?M=t[26]:(M=Tt(h),t[25]=h,t[26]=M);let P=M,F;t[27]===Symbol.for(`react.memo_cache_sentinel`)?(F=Tt([]),t[27]=F):F=t[27];let I=F,L;bb4:{if(!g){L=null;break bb4}let e;t[28]===g.alphaMaps?e=t[29]:(e=g.alphaMaps.map(kt),t[28]=g.alphaMaps,t[29]=e),L=e}let R=L,ee=2*Math.ceil(l/c)+1,te=ee*ee-1,ne=(0,G.useRef)(null),re;t[30]===Symbol.for(`react.memo_cache_sentinel`)?(re=new ae,t[30]=re):re=t[30];let ie=re,oe;t[31]===Symbol.for(`react.memo_cache_sentinel`)?(oe={xStart:1/0,xEnd:-1/0,zStart:1/0,zEnd:-1/0},t[31]=oe):oe=t[31];let se=(0,G.useRef)(oe),z=(0,G.useRef)(null),ce;if(t[32]!==p||t[33]!==c||t[34]!==u||t[35]!==l?(ce=()=>{let e=ne.current;if(!e)return;let t=u.position.x-p.x,n=u.position.z-p.z,r=Math.floor((t-l)/c),i=Math.ceil((t+l)/c),a=Math.floor((n-l)/c),o=Math.ceil((n+l)/c),s=se.current;if(e===z.current&&r===s.xStart&&i===s.xEnd&&a===s.zStart&&o===s.zEnd)return;z.current=e,s.xStart=r,s.xEnd=i,s.zStart=a,s.zEnd=o;let d=c/2,f=0;for(let t=r;t<i;t++)for(let n=a;n<o;n++)t===0&&n===0||(ie.makeTranslation(p.x+t*c+d,0,p.z+n*c+d),e.setMatrixAt(f,ie),f++);e.count=f,e.instanceMatrix.needsUpdate=!0},t[32]=p,t[33]=c,t[34]=u,t[35]=l,t[36]=ce):ce=t[36],a(ce),!g||!v||!O||!R)return gt.debug(`Not ready: terrain=%s geometry=%s displacement=%s alpha=%s`,!!g,!!v,!!O,!!R),null;let le=T??void 0,B;t[37]!==p||t[38]!==c||t[39]!==s||t[40]!==P||t[41]!==R||t[42]!==O||t[43]!==v||t[44]!==le||t[45]!==g.textureNames?(B=(0,q.jsx)(ht,{tileX:0,tileZ:0,blockSize:c,basePosition:p,textureNames:g.textureNames,geometry:v,displacementMap:O,visibilityMask:P,alphaTextures:R,detailTextureName:s,lightmap:le}),t[37]=p,t[38]=c,t[39]=s,t[40]=P,t[41]=R,t[42]=O,t[43]=v,t[44]=le,t[45]=g.textureNames,t[46]=B):B=t[46];let V;t[47]!==te||t[48]!==v?(V=[v,void 0,te],t[47]=te,t[48]=v,t[49]=V):V=t[49];let ue=T??void 0,H;t[50]!==s||t[51]!==R||t[52]!==O||t[53]!==ue||t[54]!==g.textureNames?(H=(0,q.jsx)(mt,{displacementMap:O,visibilityMask:I,textureNames:g.textureNames,alphaTextures:R,detailTextureName:s,lightmap:ue}),t[50]=s,t[51]=R,t[52]=O,t[53]=ue,t[54]=g.textureNames,t[55]=H):H=t[55];let U;t[56]!==V||t[57]!==H?(U=(0,q.jsx)(`instancedMesh`,{ref:ne,args:V,castShadow:!0,receiveShadow:!0,frustumCulled:!1,children:H}),t[56]=V,t[57]=H,t[58]=U):U=t[58];let de;return t[59]!==B||t[60]!==U?(de=(0,q.jsxs)(q.Fragment,{children:[B,U]}),t[59]=B,t[60]=U,t[61]=de):de=t[61],de});function Dt(e){return e.camera}function Ot(){}function kt(e){return Le(e)}var At=`
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
`;function jt(e,t){let n=t.surfaceOutsideVisible??!1;e.uniforms.useSceneLighting={value:n},e.uniforms.interiorDebugColor={value:n?new k(0,.4,1):new k(1,.2,0)},e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
${At}
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

#include <tonemapping_fragment>`)}var Mt=S(`InteriorInstance`);function Nt(e){let t=(0,K.c)(2),n;return t[0]===e?n=t[1]:(n=De(e),t[0]=e,t[1]=n),f(n)}function Pt({materialName:e,material:t,lightMap:n}){let r=l()?.debugMode??!1,i=Ie(),a=H(W(e),e=>Re(e,{anisotropy:i})),o=new Set(t?.userData?.flag_names??[]).has(`SelfIlluminating`),s=new Set(t?.userData?.surface_flag_names??[]).has(`SurfaceOutsideVisible`),c=(0,G.useCallback)(e=>{Ve(e,We),jt(e,{surfaceOutsideVisible:s})},[s]),u=(0,G.useRef)(null),d=(0,G.useRef)(null);(0,G.useEffect)(()=>{let e=u.current??d.current;e&&(e.defines??={},e.defines.DEBUG_MODE=r?1:0,e.needsUpdate=!0)},[r]);let f={DEBUG_MODE:r?1:0},p=`${s}`;return o?(0,q.jsx)(`meshBasicMaterial`,{ref:u,map:a,toneMapped:!1,defines:f,onBeforeCompile:c},p):(0,q.jsx)(`meshLambertMaterial`,{ref:d,map:a,lightMap:n,toneMapped:!1,defines:f,onBeforeCompile:c},p)}function Ft(e){if(!e)return null;let t=e.emissiveMap;return t&&(t.colorSpace=E),t??null}function It(e){let t=(0,K.c)(13),{node:n}=e,r;bb0:{if(!n.material){let e;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[0]=e):e=t[0],r=e;break bb0}if(Array.isArray(n.material)){let e;t[1]===n.material?e=t[2]:(e=n.material.map(Lt),t[1]=n.material,t[2]=e),r=e;break bb0}let e;t[3]===n.material?e=t[4]:(e=Ft(n.material),t[3]=n.material,t[4]=e);let i;t[5]===e?i=t[6]:(i=[e],t[5]=e,t[6]=i),r=i}let i=r,a;t[7]!==i||t[8]!==n.material?(a=n.material?(0,q.jsx)(Ne,{name:`InteriorTexture:${Array.isArray(n.material)?n.material[0]?.userData?.resource_path:n.material?.userData?.resource_path??`?`}`,fallback:(0,q.jsx)(`meshStandardMaterial`,{color:`yellow`,wireframe:!0}),children:Array.isArray(n.material)?n.material.map((e,t)=>(0,q.jsx)(Pt,{materialName:e.userData.resource_path,material:e,lightMap:i[t]},t)):(0,q.jsx)(Pt,{materialName:n.material.userData.resource_path,material:n.material,lightMap:i[0]})}):null,t[7]=i,t[8]=n.material,t[9]=a):a=t[9];let o;return t[10]!==n.geometry||t[11]!==a?(o=(0,q.jsx)(`mesh`,{geometry:n.geometry,castShadow:!0,receiveShadow:!0,children:a}),t[10]=n.geometry,t[11]=a,t[12]=o):o=t[12],o}function Lt(e){return Ft(e)}var Rt=(0,G.memo)(function(e){let t=(0,K.c)(10),{interiorFile:n,ghostIndex:r}=e,{nodes:i}=Nt(n),a=l()?.debugMode??!1,o;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(o=[0,-Math.PI/2,0],t[0]=o):o=t[0];let s;t[1]===i?s=t[2]:(s=Object.entries(i).filter(Ht).map(Ut),t[1]=i,t[2]=s);let c;t[3]!==a||t[4]!==r||t[5]!==n?(c=a?(0,q.jsxs)(Me,{children:[r,`: `,n]}):null,t[3]=a,t[4]=r,t[5]=n,t[6]=c):c=t[6];let u;return t[7]!==s||t[8]!==c?(u=(0,q.jsxs)(`group`,{rotation:o,children:[s,c]}),t[7]=s,t[8]=c,t[9]=u):u=t[9],u});function zt(e){let t=(0,K.c)(9),{color:n,label:r}=e,i;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(i=(0,q.jsx)(`boxGeometry`,{args:[10,10,10]}),t[0]=i):i=t[0];let a;t[1]===n?a=t[2]:(a=(0,q.jsx)(`meshStandardMaterial`,{color:n,wireframe:!0}),t[1]=n,t[2]=a);let o;t[3]!==n||t[4]!==r?(o=r?(0,q.jsx)(Me,{color:n,children:r}):null,t[3]=n,t[4]=r,t[5]=o):o=t[5];let s;return t[6]!==a||t[7]!==o?(s=(0,q.jsxs)(`mesh`,{children:[i,a,o]}),t[6]=a,t[7]=o,t[8]=s):s=t[8],s}function Bt(e){let t=(0,K.c)(3),{label:n}=e,r=l()?.debugMode??!1,i;return t[0]!==r||t[1]!==n?(i=r?(0,q.jsx)(zt,{color:`red`,label:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}var Vt=(0,G.memo)(function(e){let t=(0,K.c)(26),{scene:n}=e,r;t[0]===n.transform.position?r=t[1]:(r=we(n.transform.position),t[0]=n.transform.position,t[1]=r);let i=r,a;t[2]===n.transform?a=t[3]:(a=pe(n.transform),t[2]=n.transform,t[3]=a);let o=a,s;t[4]===n.scale?s=t[5]:(s=U(n.scale),t[4]=n.scale,t[5]=s);let c=s,l=`${n.ghostIndex}: ${n.interiorFile}`,u;t[6]===l?u=t[7]:(u=(0,q.jsx)(Bt,{label:l}),t[6]=l,t[7]=u);let f;t[8]===n.interiorFile?f=t[9]:(f=e=>{Mt.error(`Failed to load %s: %s`,n.interiorFile,e.message)},t[8]=n.interiorFile,t[9]=f);let p=`InteriorModel:${n.interiorFile}`,m;t[10]===Symbol.for(`react.memo_cache_sentinel`)?(m=(0,q.jsx)(zt,{color:`orange`}),t[10]=m):m=t[10];let h;t[11]!==n.ghostIndex||t[12]!==n.interiorFile?(h=(0,q.jsx)(Rt,{interiorFile:n.interiorFile,ghostIndex:n.ghostIndex}),t[11]=n.ghostIndex,t[12]=n.interiorFile,t[13]=h):h=t[13];let g;t[14]!==p||t[15]!==h?(g=(0,q.jsx)(Ne,{name:p,fallback:m,children:h}),t[14]=p,t[15]=h,t[16]=g):g=t[16];let _;t[17]!==g||t[18]!==u||t[19]!==f?(_=(0,q.jsx)(d,{fallback:u,onError:f,children:g}),t[17]=g,t[18]=u,t[19]=f,t[20]=_):_=t[20];let v;return t[21]!==i||t[22]!==o||t[23]!==c||t[24]!==_?(v=(0,q.jsx)(`group`,{position:i,quaternion:o,scale:c,children:_}),t[21]=i,t[22]=o,t[23]=c,t[24]=_,t[25]=v):v=t[25],v});function Ht(e){let[,t]=e;return t.isMesh}function Ut(e){let[t,n]=e;return(0,q.jsx)(It,{node:n},t)}var Wt=()=>{},Z=5,Gt=Z*Z,Kt=.05;function qt(e,t,n){let r=e,i=t,a=n;return[a,a,a,a,a,a,i,i,i,a,a,i,r,i,a,a,i,i,i,a,a,a,a,a,a]}function Jt(e,t){let n=new Float32Array(Gt);for(let r=0;r<Gt;r++){let i=e[r*3],a=e[r*3+2],o=1.3-Math.sqrt(i*i+a*a)/t;o<.4?o=0:o>.8&&(o=1),n[r]=o}return n}function Yt(e,t,n,r){let i=new ee,a=new Float32Array(Gt*3),o=new Float32Array(Gt*2),s=qt(t,n,r),c=e*2/(Z-1);for(let t=0;t<Z;t++)for(let n=0;n<Z;n++){let r=t*Z+n,i=-e+n*c,l=e-t*c,u=e*s[r];a[r*3]=i,a[r*3+1]=u,a[r*3+2]=l,o[r*2]=n,o[r*2+1]=t}Xt(a);let l=Jt(a,e),u=[];for(let e=0;e<Z-1;e++)for(let t=0;t<Z-1;t++){let n=e*Z+t,r=n+1,i=n+Z,a=i+1;u.push(n,i,a),u.push(n,a,r)}return i.setIndex(u),i.setAttribute(`position`,new T(a,3)),i.setAttribute(`uv`,new T(o,2)),i.setAttribute(`alpha`,new T(l,1)),i.computeBoundingSphere(),i}function Xt(e){let t=t=>({x:e[t*3],y:e[t*3+1],z:e[t*3+2]}),n=(t,n,r,i)=>{e[t*3]=n,e[t*3+1]=r,e[t*3+2]=i},r=t(1),i=t(3),a=t(5),o=t(6),s=t(8),c=t(9),l=t(15),u=t(16),d=t(18),f=t(19),p=t(21),m=t(23),h=a.x+(r.x-a.x)*.5,g=a.y+(r.y-a.y)*.5,_=a.z+(r.z-a.z)*.5;n(0,o.x+(h-o.x)*2,o.y+(g-o.y)*2,o.z+(_-o.z)*2),h=c.x+(i.x-c.x)*.5,g=c.y+(i.y-c.y)*.5,_=c.z+(i.z-c.z)*.5,n(4,s.x+(h-s.x)*2,s.y+(g-s.y)*2,s.z+(_-s.z)*2),h=p.x+(l.x-p.x)*.5,g=p.y+(l.y-p.y)*.5,_=p.z+(l.z-p.z)*.5,n(20,u.x+(h-u.x)*2,u.y+(g-u.y)*2,u.z+(_-u.z)*2),h=m.x+(f.x-m.x)*.5,g=m.y+(f.y-m.y)*.5,_=m.z+(f.z-m.z)*.5,n(24,d.x+(h-d.x)*2,d.y+(g-d.y)*2,d.z+(_-d.z)*2)}function Zt(e){return e.wrapS=D,e.wrapT=D,e.minFilter=O,e.magFilter=O,e.colorSpace=``,e.needsUpdate=!0,e}var Qt=`
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
`,$t=`
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
`;function en({textureUrl:e,radius:t,heightPercent:n,speed:r,windDirection:i,layerIndex:o}){let{debugMode:s}=l(),{animationEnabled:u}=c(),d=(0,G.useRef)(null),f=H(e,Zt),p=(0,G.useMemo)(()=>Yt(t,n,n-.05,Kt),[t,n]);(0,G.useEffect)(()=>()=>{p.dispose()},[p]);let m=(0,G.useMemo)(()=>new re({uniforms:{cloudTexture:{value:f},uvOffset:{value:new P(0,0)},debugMode:{value:s?1:0},layerIndex:{value:o}},vertexShader:Qt,fragmentShader:$t,transparent:!0,depthWrite:!1,side:2}),[f,s,o]);return(0,G.useEffect)(()=>()=>{m.dispose()},[m]),a(u?(e,t)=>{let n=t*1e3/32;d.current??=new P(0,0),d.current.x+=i.x*r*n,d.current.y+=i.y*r*n,d.current.x-=Math.floor(d.current.x),d.current.y-=Math.floor(d.current.y),m.uniforms.uvOffset.value.copy(d.current)}:Wt),(0,q.jsx)(`mesh`,{geometry:p,frustumCulled:!1,renderOrder:10,children:(0,q.jsx)(`primitive`,{object:m,attach:`material`})})}var tn=7;function nn(e){let t=(0,K.c)(7),n,r;t[0]===e?(n=t[1],r=t[2]):(n=[`detailMapList`,e],r=()=>Oe(e),t[0]=e,t[1]=n,t[2]=r);let i=!!e,a;return t[3]!==n||t[4]!==r||t[5]!==i?(a={queryKey:n,queryFn:r,enabled:i},t[3]=n,t[4]=r,t[5]=i,t[6]=a):a=t[6],u(a)}function rn(e){let t=(0,K.c)(18),{scene:n}=e,{data:r}=nn(n.materialList||void 0),i=(n.visibleDistance>0?n.visibleDistance:500)*.95,o;t[0]===n.cloudLayers?o=t[1]:(o=n.cloudLayers.map(on),t[0]=n.cloudLayers,t[1]=o);let s=o,c;t[2]===n.cloudLayers?c=t[3]:(c=n.cloudLayers.map(an),t[2]=n.cloudLayers,t[3]=c);let l=c,u;bb0:{let{x:e,y:r}=n.windVelocity;if(e!==0||r!==0){let n;t[4]!==e||t[5]!==r?(n=new P(r,-e).normalize(),t[4]=e,t[5]=r,t[6]=n):n=t[6],u=n;break bb0}let i;t[7]===Symbol.for(`react.memo_cache_sentinel`)?(i=new P(1,0),t[7]=i):i=t[7],u=i}let d=u,f;bb1:{if(!r){let e;t[8]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[8]=e):e=t[8],f=e;break bb1}let e;if(t[9]!==l||t[10]!==s||t[11]!==r){e=[];for(let t=0;t<3;t++){let n=r[tn+t];n&&e.push({texture:n,height:l[t],speed:s[t]})}t[9]=l,t[10]=s,t[11]=r,t[12]=e}else e=t[12];f=e}let p=f,m=(0,G.useRef)(null),h;if(t[13]===Symbol.for(`react.memo_cache_sentinel`)?(h=e=>{let{camera:t}=e;m.current&&m.current.position.copy(t.position)},t[13]=h):h=t[13],a(h),!p||p.length===0)return null;let g;return t[14]!==p||t[15]!==i||t[16]!==d?(g=(0,q.jsx)(`group`,{ref:m,children:p.map((e,t)=>(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(en,{textureUrl:W(e.texture),radius:i,heightPercent:e.height,speed:e.speed,windDirection:d,layerIndex:t})},t))}),t[14]=p,t[15]=i,t[16]=d,t[17]=g):g=t[17],g}function an(e,t){return e.heightPercent||[.35,.25,.2][t]}function on(e,t){return e.speed||[1e-4,2e-4,3e-4][t]}(0,G.createContext)(null),(0,G.createContext)(null);function sn(e){let t=e.fogDistance,n=e.visibleDistance>0?e.visibleDistance:1e3,{r,g:i,b:a}=e.fogColor,o=new z().setRGB(r,i,a).convertSRGBToLinear(),s=[];for(let t of e.fogVolumes)t.visibleDistance<=0||t.maxHeight<=t.minHeight||s.push({visibleDistance:t.visibleDistance,minHeight:t.minHeight,maxHeight:t.maxHeight,percentage:1});return{fogDistance:t,visibleDistance:n,fogColor:o,fogVolumes:s,fogLine:s.reduce((e,t)=>Math.max(e,t.maxHeight),0),enabled:n>t}}var cn=S(`Sky`),ln=!1;function un(e){return[new z().setRGB(e.r,e.g,e.b),new z().setRGB(e.r,e.g,e.b).convertSRGBToLinear()]}function dn(e){let t=(0,K.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`detailMapList`,e],queryFn:()=>(cn.debug(`Loading detail map list: %s`,e),Oe(e))},t[0]=e,t[1]=n);let r=u(n),i,a;return t[2]!==e||t[3]!==r.data||t[4]!==r.error||t[5]!==r.status?(i=()=>{cn.debug(`DML query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (${r.data.length} entries)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=e,t[3]=r.data,t[4]=r.error,t[5]=r.status,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,G.useEffect)(i,a),r}var fn=60;function pn({skyBoxFiles:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=Ye(e,{path:``}),a=!!t,s=(0,G.useMemo)(()=>r.projectionMatrixInverse,[r]),c=(0,G.useMemo)(()=>n?Be(n.fogVolumes):new Float32Array(12),[n]),l=(0,G.useRef)({skybox:{value:i},fogColor:{value:t??new z(0,0,0)},enableFog:{value:a},inverseProjectionMatrix:{value:s},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:We.cameraHeight,fogVolumeData:{value:c},horizonFogHeight:{value:.18}}),u=(0,G.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return fn/Math.sqrt(e*e+fn*fn)},[n]);return(0,G.useEffect)(()=>{l.current.skybox.value=i,l.current.fogColor.value=t??new z(0,0,0),l.current.enableFog.value=a,l.current.fogVolumeData.value=c,l.current.horizonFogHeight.value=u},[i,t,a,c,u]),(0,q.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,q.jsxs)(`bufferGeometry`,{children:[(0,q.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,q.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,q.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function mn(e){let t=(0,K.c)(6),{materialList:n,fogColor:r,fogState:i}=e,{data:a}=dn(n),o;t[0]===a?o=t[1]:(o=a?[W(a[1]),W(a[3]),W(a[4]),W(a[5]),W(a[0]),W(a[2])]:null,t[0]=a,t[1]=o);let s=o;if(!s)return null;let c;return t[2]!==r||t[3]!==i||t[4]!==s?(c=(0,q.jsx)(pn,{skyBoxFiles:s,fogColor:r,fogState:i}),t[2]=r,t[3]=i,t[4]=s,t[5]=c):c=t[5],c}function hn({skyColor:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=!!t,a=(0,G.useMemo)(()=>r.projectionMatrixInverse,[r]),s=(0,G.useMemo)(()=>n?Be(n.fogVolumes):new Float32Array(12),[n]),c=(0,G.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return fn/Math.sqrt(e*e+fn*fn)},[n]),l=(0,G.useRef)({skyColor:{value:e},fogColor:{value:t??new z(0,0,0)},enableFog:{value:i},inverseProjectionMatrix:{value:a},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:We.cameraHeight,fogVolumeData:{value:s},horizonFogHeight:{value:c}});return(0,G.useEffect)(()=>{l.current.skyColor.value=e,l.current.fogColor.value=t??new z(0,0,0),l.current.enableFog.value=i,l.current.fogVolumeData.value=s,l.current.horizonFogHeight.value=c},[e,t,i,s,c]),(0,q.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,q.jsxs)(`bufferGeometry`,{children:[(0,q.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,q.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,q.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function gn(e,t){let{fogDistance:n,visibleDistance:r}=e;return[n,r]}function _n({fogState:e,enabled:t}){let n=o(e=>e.scene),r=o(e=>e.camera),i=(0,G.useRef)(null),s=(0,G.useMemo)(()=>Be(e.fogVolumes),[e.fogVolumes]);return(0,G.useEffect)(()=>{ln||=(Ue(),!0)},[]),(0,G.useEffect)(()=>{He();let[t,a]=gn(e,r.position.y),o=new ne(e.fogColor,t,a);return n.fog=o,i.current=o,ze(r.position.y,s),()=>{n.fog=null,i.current=null,He()}},[n,r,e,s]),(0,G.useEffect)(()=>{let n=i.current;if(n)if(t){let[t,i]=gn(e,r.position.y);n.near=t,n.far=i}else n.near=1e10,n.far=1e10},[t,e,r.position.y]),a(()=>{let n=i.current;if(!n)return;let a=r.position.y;if(ze(a,s,t),t){let[t,r]=gn(e,a);n.near=t,n.far=r,n.color.copy(e.fogColor)}}),null}var vn=(0,G.memo)(function({entity:e}){let{skyData:t}=e;cn.debug(`Rendering: materialList=%s, useSkyTextures=%s`,t.materialList,t.useSkyTextures);let{fogEnabled:n}=c(),r=t.materialList||void 0,i=(0,G.useMemo)(()=>un(t.skySolidColor),[t.skySolidColor]),a=t.useSkyTextures,s=(0,G.useMemo)(()=>sn(t),[t]);cn.debug(`fogState: fogColor=(%s, %s, %s) visibleDistance=%d fogDistance=%d enabled=%s volumes=%d`,t.fogColor.r.toFixed(3),t.fogColor.g.toFixed(3),t.fogColor.b.toFixed(3),t.visibleDistance,t.fogDistance,s.enabled,s.fogVolumes.length);let l=(0,G.useMemo)(()=>un(t.fogColor),[t.fogColor]),u=i||l,d=s.enabled&&n,f=s.fogColor,p=o(e=>e.scene),m=o(e=>e.gl);(0,G.useEffect)(()=>{if(d){let e=f.clone();p.background=e,m.setClearColor(e)}else if(u){let e=u[0].clone();p.background=e,m.setClearColor(e)}else p.background=null;return()=>{p.background=null}},[p,m,d,f,u]);let h=i?.[1];return(0,q.jsxs)(q.Fragment,{children:[r&&a&&r.length>0?(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(mn,{materialList:r,fogColor:d?f:void 0,fogState:d?s:void 0},r)}):h?(0,q.jsx)(hn,{skyColor:h,fogColor:d?f:void 0,fogState:d?s:void 0}):null,(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(rn,{scene:t})}),s.enabled?(0,q.jsx)(_n,{fogState:s,enabled:n}):null]})});function yn(e){let t=(0,K.c)(3),{children:n}=e,{audioEnabled:r}=c(),i;return t[0]!==r||t[1]!==n?(i=r?(0,q.jsx)(G.Suspense,{children:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}function Q(e,t){let n=(0,G.lazy)(()=>t().then(t=>({default:t[e]}))),r=t=>{let r=(0,K.c)(5),{entity:i}=t,a=`${e}:${i.id}`,o;r[0]===i?o=r[1]:(o=(0,q.jsx)(n,{entity:i}),r[0]=i,r[1]=o);let s;return r[2]!==a||r[3]!==o?(s=(0,q.jsx)(Ne,{name:a,children:o}),r[2]=a,r[3]=o,r[4]=s):s=r[4],s};return r.displayName=`createLazy(${e})`,r}var bn=Q(`PlayerModel`,()=>B(()=>import(`./PlayerModel-CHa5T5CY.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29]))),xn=Q(`ExplosionShape`,()=>B(()=>import(`./ShapeModel-BKc5pvKN.js`),__vite__mapDeps([30,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,29]))),Sn=Q(`TracerProjectile`,()=>B(()=>import(`./Projectiles-Bxibmc5A.js`),__vite__mapDeps([31,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]))),Cn=Q(`SpriteProjectile`,()=>B(()=>import(`./Projectiles-Bxibmc5A.js`),__vite__mapDeps([31,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]))),wn=Q(`ForceFieldBare`,()=>B(()=>import(`./ForceFieldBare-BXlp-euF.js`),__vite__mapDeps([32,1,2,3,5,6,7,8,9,15,16,27,24]))),Tn=Q(`AudioEmitter`,()=>B(()=>import(`./AudioEmitter--X9CqSsb.js`),__vite__mapDeps([26,1,2,3,6,7,8,9,15,16,14,25,19,20,11,12,13,17,18,21,22,24]))),En=Q(`WaterBlock`,()=>B(()=>import(`./WaterBlock-DenYr9I1.js`),__vite__mapDeps([33,1,11,12,2,3,13,7,9,14,6,8,15,16,17,18,21,5,23,24]))),Dn=Q(`WeaponModel`,()=>B(()=>import(`./ShapeModel-BKc5pvKN.js`),__vite__mapDeps([30,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,29]))),On={1:`Storm`,2:`Inferno`},kn=(0,G.memo)(function(e){let t=(0,K.c)(26),{entity:n}=e;switch(n.renderType){case`Shape`:{let e;return t[0]===n?e=t[1]:(e=(0,q.jsx)(An,{entity:n}),t[0]=n,t[1]=e),e}case`ForceFieldBare`:{let e;return t[2]===n?e=t[3]:(e=(0,q.jsx)(wn,{entity:n}),t[2]=n,t[3]=e),e}case`Player`:{let e;return t[4]===n?e=t[5]:(e=(0,q.jsx)(bn,{entity:n}),t[4]=n,t[5]=e),e}case`Explosion`:{let e;return t[6]===n?e=t[7]:(e=(0,q.jsx)(xn,{entity:n}),t[6]=n,t[7]=e),e}case`Tracer`:{let e;return t[8]===n?e=t[9]:(e=(0,q.jsx)(Sn,{entity:n}),t[8]=n,t[9]=e),e}case`Sprite`:{let e;return t[10]===n?e=t[11]:(e=(0,q.jsx)(Cn,{entity:n}),t[10]=n,t[11]=e),e}case`AudioEmitter`:{let e;return t[12]===n?e=t[13]:(e=(0,q.jsx)(yn,{children:(0,q.jsx)(Tn,{entity:n})}),t[12]=n,t[13]=e),e}case`Camera`:{let e;return t[14]===n?e=t[15]:(e=(0,q.jsx)(rt,{entity:n}),t[14]=n,t[15]=e),e}case`WayPoint`:{let e;return t[16]===n?e=t[17]:(e=(0,q.jsx)(it,{entity:n}),t[16]=n,t[17]=e),e}case`TerrainBlock`:{let e;return t[18]===n.terrainData?e=t[19]:(e=(0,q.jsx)(Et,{scene:n.terrainData}),t[18]=n.terrainData,t[19]=e),e}case`InteriorInstance`:{let e;return t[20]===n.interiorData?e=t[21]:(e=(0,q.jsx)(Vt,{scene:n.interiorData}),t[20]=n.interiorData,t[21]=e),e}case`Sky`:{let e;return t[22]===n?e=t[23]:(e=(0,q.jsx)(vn,{entity:n}),t[22]=n,t[23]=e),e}case`Sun`:return null;case`WaterBlock`:{let e;return t[24]===n?e=t[25]:(e=(0,q.jsx)(En,{entity:n}),t[24]=n,t[25]=e),e}case`MissionArea`:return null;case`None`:return null;default:return null}});function An(e){let t=(0,K.c)(24),{entity:n}=e,{animationEnabled:r}=c(),i=(0,G.useRef)(null),o;if(t[0]!==r||t[1]!==n.rotate?(o=()=>{if(!i.current||!n.rotate||!r)return;let e=performance.now()/1e3;i.current.rotation.y=e/3*Math.PI*2},t[0]=r,t[1]=n.rotate,t[2]=o):o=t[2],a(o),!n.shapeName)throw Error(`Shape entity missing shapeName: ${n.id}`);let s=n.runtimeObject,l=n.shapeType??`StaticShape`,u=n.dataBlock?.toLowerCase()===`flag`,d=n.teamId&&n.teamId>0?On[n.teamId]:null,f=u&&d?`${d} Flag`:null,p=n.shapeType===`Item`?`pink`:n.threads?`#00ff88`:`yellow`,m=n.rotate?i:void 0,h=s?void 0:n,_;t[3]===f?_=t[4]:(_=f?(0,q.jsx)(Me,{opacity:.6,children:f}):null,t[3]=f,t[4]=_);let y;t[5]!==p||t[6]!==h||t[7]!==_?(y=(0,q.jsx)(g,{loadingColor:p,streamEntity:h,children:_}),t[5]=p,t[6]=h,t[7]=_,t[8]=y):y=t[8];let b;t[9]!==n.barrelShapeName||t[10]!==s?(b=n.barrelShapeName&&(0,q.jsx)(x,{object:s,shapeName:n.barrelShapeName,type:`Turret`,children:(0,q.jsx)(`group`,{position:[0,1.5,0],children:(0,q.jsx)(g,{})})}),t[9]=n.barrelShapeName,t[10]=s,t[11]=b):b=t[11];let S;t[12]===n?S=t[13]:(S=n.weaponShape&&(0,q.jsx)(Ge,{fallback:(0,q.jsx)(v,{color:`red`,label:n.weaponShape}),children:(0,q.jsx)(Ne,{name:`Weapon:${n.id}/${n.weaponShape}`,fallback:(0,q.jsx)(v,{color:`cyan`,label:n.weaponShape}),children:(0,q.jsx)(Dn,{entity:n})})}),t[12]=n,t[13]=S);let C;t[14]!==m||t[15]!==y||t[16]!==b||t[17]!==S?(C=(0,q.jsxs)(`group`,{ref:m,children:[y,b,S]}),t[14]=m,t[15]=y,t[16]=b,t[17]=S,t[18]=C):C=t[18];let w;return t[19]!==n.shapeName||t[20]!==l||t[21]!==C||t[22]!==s?(w=(0,q.jsx)(x,{object:s,shapeName:n.shapeName,type:l,children:C}),t[19]=n.shapeName,t[20]=l,t[21]=C,t[22]=s,t[23]=w):w=t[23],w}var jn={Root:`_Root_dlg08_1`,Top:`_Top_dlg08_9 _Root_dlg08_1`,Bottom:`_Bottom_dlg08_14 _Root_dlg08_1`,IffArrow:`_IffArrow_dlg08_19`,Name:`_Name_dlg08_26`,HealthBar:`_HealthBar_dlg08_34`,HealthFill:`_HealthFill_dlg08_43`},Mn=150,Nn=.1,Pn=-.2,Fn=W(`gui/hud_alliedtriangle`),In=W(`gui/hud_enemytriangle`),Ln=new k,Rn=[];function zn(e){let t=(0,K.c)(21),{entity:n}=e,r=_(n.shapeName??n.dataBlock),i=o(Vn),s=(0,G.useRef)(null),c=(0,G.useRef)(null),l=(0,G.useRef)(null),u=(0,G.useRef)(null),d=(0,G.useRef)(null),[f,p]=(0,G.useState)(!0),m=(0,G.useRef)(null),g;t[0]===r.scene?g=t[1]:(g=new R().setFromObject(r.scene),t[0]=r.scene,t[1]=g);let v=g.max.y+Nn,y=n.keyframes??Rn,b;t[2]===y?b=t[3]:(b=y.some(Bn),t[2]=y,t[3]=b);let x=b,S;t[4]!==i||t[5]!==n.id||t[6]!==n.iffColor||t[7]!==n.playerName||t[8]!==x||t[9]!==f||t[10]!==y?(S=()=>{let e=s.current;if(!e)return;e.getWorldPosition(Ln);let t=i.position.distanceTo(Ln),r=i.matrixWorld.elements,a=!((Ln.x-r[12])*-r[8]+(Ln.y-r[13])*-r[9]+(Ln.z-r[14])*-r[10]<0)&&t<Mn;if(f!==a&&p(a),!a)return;let o=h(y,Fe.getState().time),g=o?.health??1;if(o?.damageState!=null&&o.damageState>=1){c.current&&(c.current.style.opacity=`0`),l.current&&(l.current.style.opacity=`0`);return}let _=Math.max(0,Math.min(1,1-t/Mn)).toString();if(c.current&&(c.current.style.opacity=_),l.current&&(l.current.style.opacity=_),m.current){let e=n.playerName??n.id;m.current.textContent!==e&&(m.current.textContent=e)}if(d.current&&n.iffColor){let e=n.iffColor.r>n.iffColor.g?In:Fn;d.current.getAttribute(`src`)!==e&&(d.current.src=e)}u.current&&x&&(u.current.style.width=`${Math.max(0,Math.min(100,g*100))}%`,u.current.style.background=n.iffColor?`rgb(${n.iffColor.r}, ${n.iffColor.g}, ${n.iffColor.b})`:``)},t[4]=i,t[5]=n.id,t[6]=n.iffColor,t[7]=n.playerName,t[8]=x,t[9]=f,t[10]=y,t[11]=S):S=t[11],a(S);let C=n.iffColor&&n.iffColor.r>n.iffColor.g?In:Fn,w;t[12]!==n.id||t[13]!==n.playerName||t[14]!==x||t[15]!==v||t[16]!==C||t[17]!==f?(w=f&&(0,q.jsxs)(q.Fragment,{children:[(0,q.jsx)(ue,{position:[0,v,0],center:!0,children:(0,q.jsx)(`div`,{ref:c,className:jn.Top,children:(0,q.jsx)(`img`,{ref:d,className:jn.IffArrow,src:C,alt:``})})}),(0,q.jsx)(ue,{position:[0,Pn,0],center:!0,children:(0,q.jsxs)(`div`,{ref:l,className:jn.Bottom,children:[(0,q.jsx)(`div`,{ref:m,className:jn.Name,children:n.playerName??n.id}),x&&(0,q.jsx)(`div`,{className:jn.HealthBar,children:(0,q.jsx)(`div`,{ref:u,className:jn.HealthFill})})]})})]}),t[12]=n.id,t[13]=n.playerName,t[14]=x,t[15]=v,t[16]=C,t[17]=f,t[18]=w):w=t[18];let T;return t[19]===w?T=t[20]:(T=(0,q.jsx)(`group`,{ref:s,children:w}),t[19]=w,t[20]=T),T}function Bn(e){return e.health!=null}function Vn(e){return e.camera}var Hn={Root:`_Root_yuidw_1`,Distance:`_Distance_yuidw_9`,Icon:`_Icon_yuidw_18`},Un=1.5,Wn=W(`commander/MiniIcons/com_flag_grey`),Gn=new k;function Kn(e){let t=(0,K.c)(9),{entity:n}=e,r=(0,G.useRef)(null),i=(0,G.useRef)(null),s=(0,G.useRef)(null),c=o(qn),l;t[0]!==c||t[1]!==n.iffColor?(l=()=>{if(i.current&&n.iffColor){let{r:e,g:t,b:r}=n.iffColor;i.current.style.backgroundColor=`rgb(${e},${t},${r})`}if(s.current&&r.current){r.current.getWorldPosition(Gn);let e=c.position.distanceTo(Gn);s.current.textContent=e.toFixed(1)}},t[0]=c,t[1]=n.iffColor,t[2]=l):l=t[2],a(l);let u=n.iffColor?`rgb(${n.iffColor.r},${n.iffColor.g},${n.iffColor.b})`:`rgb(200,200,200)`,d;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(d=[0,Un,0],t[3]=d):d=t[3];let f;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,q.jsx)(`span`,{ref:s,className:Hn.Distance}),t[4]=f):f=t[4];let p;t[5]===u?p=t[6]:(p={backgroundColor:u,"--flag-icon-url":`url(${Wn})`},t[5]=u,t[6]=p);let m=p,h;return t[7]===m?h=t[8]:(h=(0,q.jsx)(`group`,{ref:r,children:(0,q.jsx)(ue,{position:d,center:!0,children:(0,q.jsxs)(`div`,{className:Hn.Root,children:[f,(0,q.jsx)(`div`,{ref:i,className:Hn.Icon,style:m})]})})}),t[7]=m,t[8]=h),h}function qn(e){return e.camera}function Jn(){let e=(0,K.c)(1),t=Yn,n;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=(0,q.jsx)(`group`,{ref:t,children:(0,q.jsx)(Xn,{})}),e[0]=n):n=e[0],n}function Yn(e){Fe.setState({root:e})}var Xn=(0,G.memo)(function(){let e=me(),t=(0,G.useRef)(new Map).current,n=new Set;for(let r of e)n.add(r.id),t.set(r.id,r);for(let e of t.keys())n.has(e)||t.delete(e);return(0,q.jsx)(q.Fragment,{children:[...t.values()].map(e=>(0,q.jsx)(Zn,{entity:e},e.id))})}),Zn=(0,G.memo)(function(e){let t=(0,K.c)(7),{entity:n}=e;if(Pe(n)){let e;t[0]===n?e=t[1]:(e=(0,q.jsx)(kn,{entity:n}),t[0]=n,t[1]=e);let r;return t[2]!==n.id||t[3]!==e?(r=(0,q.jsx)(`group`,{name:n.id,children:e}),t[2]=n.id,t[3]=e,t[4]=r):r=t[4],r}if(n.renderType===`None`)return null;let r;return t[5]===n?r=t[6]:(r=(0,q.jsx)(tr,{entity:n}),t[5]=n,t[6]=r),r});function Qn(e){let t=(0,K.c)(2),{entity:n}=e,r=le($n);if(n.id===r)return null;let i;return t[0]===n?i=t[1]:(i=(0,q.jsx)(zn,{entity:n}),t[0]=n,t[1]=i),i}function $n(e){return e.playback.streamSnapshot?.controlPlayerGhostId}function er({entity:e}){let t=(0,G.useRef)(!1),[n,r]=(0,G.useState)(()=>(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0);return t.current=n,a(()=>{let n=(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0;n!==t.current&&(t.current=n,r(n))}),n?(0,q.jsx)(Kn,{entity:e}):null}function tr(e){let t=(0,K.c)(39),{entity:n}=e,r=n.position,i=n.scale,a;bb0:{if(!n.rotation){a=void 0;break bb0}let e;t[0]===n.rotation?e=t[1]:(e=new se(...n.rotation),t[0]=n.rotation,t[1]=e),a=e}let o=a,s=n.renderType===`Player`;if(n.renderType===`Shape`&&!n.shapeName){let e=n.id,a;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(a=(0,q.jsx)(`sphereGeometry`,{args:[.3,6,4]}),t[2]=a):a=t[2];let s;t[3]===n.className?s=t[4]:(s=y(n.className),t[3]=n.className,t[4]=s);let c;t[5]===s?c=t[6]:(c=(0,q.jsxs)(`mesh`,{children:[a,(0,q.jsx)(`meshBasicMaterial`,{color:s,wireframe:!0})]}),t[5]=s,t[6]=c);let l;t[7]===n?l=t[8]:(l=(0,q.jsx)(er,{entity:n}),t[7]=n,t[8]=l);let u;return t[9]!==n.id||t[10]!==r||t[11]!==o||t[12]!==i||t[13]!==c||t[14]!==l?(u=(0,q.jsxs)(`group`,{name:e,position:r,quaternion:o,scale:i,children:[c,l]}),t[9]=n.id,t[10]=r,t[11]=o,t[12]=i,t[13]=c,t[14]=l,t[15]=u):u=t[15],u}let c;t[16]!==n.className||t[17]!==n.renderType?(c=n.renderType===`Explosion`?null:(0,q.jsxs)(`mesh`,{children:[(0,q.jsx)(`sphereGeometry`,{args:[.5,8,6]}),(0,q.jsx)(`meshBasicMaterial`,{color:y(n.className),wireframe:!0})]}),t[16]=n.className,t[17]=n.renderType,t[18]=c):c=t[18];let l=c,u;t[19]===n?u=t[20]:(u=(0,q.jsx)(kn,{entity:n}),t[19]=n,t[20]=u);let d;t[21]!==l||t[22]!==u?(d=(0,q.jsx)(Ge,{fallback:l,children:u}),t[21]=l,t[22]=u,t[23]=d):d=t[23];let f;t[24]!==n||t[25]!==s?(f=s&&(0,q.jsx)(Qn,{entity:n}),t[24]=n,t[25]=s,t[26]=f):f=t[26];let p;t[27]===n?p=t[28]:(p=(0,q.jsx)(er,{entity:n}),t[27]=n,t[28]=p);let m;t[29]!==d||t[30]!==f||t[31]!==p?(m=(0,q.jsxs)(`group`,{name:`model`,children:[d,f,p]}),t[29]=d,t[30]=f,t[31]=p,t[32]=m):m=t[32];let h;return t[33]!==n.id||t[34]!==r||t[35]!==o||t[36]!==i||t[37]!==m?(h=(0,q.jsx)(`group`,{name:n.id,position:r,quaternion:o,scale:i,children:m}),t[33]=n.id,t[34]=r,t[35]=o,t[36]=i,t[37]=m,t[38]=h):h=t[38],h}function nr(){let e=(0,K.c)(3),{fov:t}=c(),n;e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=[0,256,0],e[0]=n):n=e[0];let r;return e[1]===t?r=e[2]:(r=(0,q.jsx)(Je,{makeDefault:!0,position:n,fov:t}),e[1]=t,e[2]=r),r}function rr(e){let t=(0,K.c)(3),{children:n}=e,{debugMode:r}=l(),i;return t[0]!==n||t[1]!==r?(i=r?(0,q.jsx)(G.Suspense,{children:n}):null,t[0]=n,t[1]=r,t[2]=i):i=t[2],i}var ir=S(`InputConsumer`),ar=300,or=Math.PI/2-.01,sr=45,cr=31,lr=40,ur=1/32,dr=2*Math.PI;function fr(e){return((Math.round(e/dr*65536)|0)<<16>>16)*dr/65536}var pr=new k,mr=new k,$=new k,hr=new M(0,0,0,`YXZ`);function gr(e,t,n,r,i,a,o){if(r===0&&i===0&&a===0)return;let s=Math.sin(t),c=Math.cos(t),l=Math.sin(n),u=Math.cos(n),d=o*ur;e.x+=(c*r+s*u*i+s*l*a)*d,e.y+=(-s*r+c*u*i+c*l*a)*d,e.z+=(-l*i+u*a)*d}function _r(){let{moveQueue:e,mode:t,setMode:n}=xe(),r=ve(e=>e.adapter),i=ve(e=>e.gameStatus),s=ve(e=>e.liveReady),c=ve(e=>e.sendMoves),l=ce(),u=o(e=>e.camera),d=m(),f=(0,G.useRef)(null),h=(0,G.useRef)([]),g=(0,G.useRef)(0),_=(0,G.useRef)(0),v=(0,G.useRef)(null),y=(0,G.useRef)(0),b=(0,G.useRef)(0),x=(0,G.useRef)({x:0,y:0,z:0}),S=(0,G.useRef)(0),C=(0,G.useRef)(0),w=(0,G.useRef)({x:0,y:0,z:0}),T=(0,G.useRef)(!1),E=(0,G.useRef)({x:0,y:0,z:0}),D=(0,G.useRef)({x:0,y:0,z:0}),O=(0,G.useRef)(!1),k=(0,G.useRef)(null),A=(0,G.useRef)(0),j=(0,G.useRef)(0),M=(0,G.useRef)(0),N=(0,G.useRef)(0),P=(0,G.useRef)(0),F=(0,G.useRef)([!1,!1,!1,!1,!1,!1]),I=!!r&&(i===`connected`||i===`authenticating`);return(0,G.useEffect)(()=>{if(I&&r){if(f.current===r)return;ir.info(`wiring adapter to engine store`);let e=be.getState(),t={source:`live`,duration:1/0,missionName:e.mapName??null,gameType:null,serverDisplayName:e.serverName??null,recorderName:e.warriorName??null,recordingDate:null,streamingPlayback:r};l.getState().setRecording(t),l.getState().setPlaybackStatus(`playing`),f.current=r,T.current=!1,O.current=!1,k.current=null,h.current.length=0,g.current=0,_.current=0,v.current=null,n(`fly`)}else !I&&f.current&&(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),f.current=null,T.current=!1,O.current=!1,k.current=null,h.current.length=0,n(`local`))},[I,r,l,n]),(0,G.useEffect)(()=>{!s&&f.current&&(ir.info(`mission change: resetting prediction state and mode`),T.current=!1,O.current=!1,k.current=null,h.current.length=0,g.current=0,_.current=0,v.current=null,A.current=0,j.current=0,M.current=0,N.current=0,P.current=0,F.current.fill(!1),n(`fly`))},[s,n]),p(()=>{if(!f.current||i!==`connected`||!s)return;let e=A.current,t=j.current;A.current=0,j.current=0;let n=M.current,r=N.current,a=P.current;M.current=0,N.current=0,P.current=0;let o=[...F.current];F.current.fill(!1);let l=fr(e),u=fr(t);y.current+=l-e,b.current+=u-t,S.current=y.current,C.current=b.current,w.current={...x.current};let d=lr*2,p=y.current-l,m=b.current-u;gr(x.current,p,m,n,r,a,d),o[1]=!0;let _=g.current++,v={x:n,y:r,z:a,yaw:e,pitch:t,roll:0,trigger:o,freeLook:!1},T=h.current;T.push({moveIndex:_,move:v,yaw:l,pitch:u,x:n,y:r,z:a}),T.length>sr&&T.splice(0,T.length-sr);let I=f.current.lastMoveAck;for(;T.length>0&&T[0].moveIndex<I;)T.shift();if(T.length>0){let e=T.slice(0,cr);c(e.map(e=>e.move),e[0].moveIndex)}let L=f.current.getSnapshot();if(L!==k.current){k.current=L;let e=L?.camera;if(e?.orbitTargetId){let t=L.entities.find(t=>t.id===e.orbitTargetId);t?.position&&(E.current={...D.current},D.current={x:t.position[0],y:t.position[1],z:t.position[2]},O.current||=(E.current={...D.current},!0))}}}),a((r,a)=>{let o=e.current;if(o.length>0){let t=0,n=0,r=0,a=0,c=0,l=0,d=[!1,!1,!1,!1,!1,!1];for(let e of o){t+=e.deltaYaw,n+=e.deltaPitch,r=e.x,a=e.y,c=e.z,l+=e.delta;for(let t=0;t<e.triggers.length;t++)e.triggers[t]&&(d[t]=!0)}if(e.current.length=0,I&&f.current&&i===`connected`&&s){A.current+=t,j.current+=n,M.current=r,N.current=a,P.current=c;for(let e=0;e<d.length;e++)d[e]&&(F.current[e]=!0);y.current+=t,b.current=Math.max(-fe,Math.min(fe,b.current+n))}else{let e=Fe.getState();if(e.playback&&!e.freeFlyCamera)return;vr(u,t,n,r,a,c,l);return}}if(!I||!f.current||i!==`connected`||!s)return;let c=f.current,l=c.getSnapshot(),p=l?.camera;if(p&&p!==v.current&&typeof p.yaw==`number`&&typeof p.pitch==`number`){v.current=p;let e=c.lastMoveAck;if(e>_.current){_.current=e;let t=h.current;for(;t.length>0&&t[0].moveIndex<e;)t.shift()}y.current=p.yaw,b.current=p.pitch,x.current={x:p.position[0],y:p.position[1],z:p.position[2]};let r=lr*2;for(let e of h.current)gr(x.current,y.current,b.current,e.x,e.y,e.z,r),y.current+=e.yaw,b.current=Math.max(-fe,Math.min(fe,b.current+e.pitch));y.current+=A.current,b.current=Math.max(-fe,Math.min(fe,b.current+j.current)),S.current=y.current,C.current=b.current,w.current={...x.current},T.current=!0;let i=p.mode===`third-person`?`follow`:`fly`;if(i!==t&&(ir.info(`server corrected observer mode: %s → %s`,t,i),n(i),f.current&&(f.current.observerMode=i),i===`fly`&&(O.current=!1,k.current=null)),p.orbitTargetId&&!O.current){let e=l.entities.find(e=>e.id===p.orbitTargetId);if(e?.position){let t={x:e.position[0],y:e.position[1],z:e.position[2]};D.current=t,E.current={...t},O.current=!0}}}if(T.current){if(t===`fly`)yr(r.camera,w.current,x.current,y.current,b.current,d());else if(t===`follow`){if(!O.current)return;br(r.camera,E.current,D.current,y.current,b.current,d(),p?.orbitDistance??4,p?.orbitTargetId)}}}),(0,G.useEffect)(()=>()=>{f.current&&=(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),null)},[l]),null}function vr(e,t,n,r,i,a,o){if((t!==0||n!==0)&&(hr.setFromQuaternion(e.quaternion,`YXZ`),hr.y-=t,hr.x-=n,hr.x=Math.max(-or,Math.min(or,hr.x)),e.quaternion.setFromEuler(hr)),r!==0||i!==0||a!==0){e.getWorldDirection(pr),pr.normalize(),mr.crossVectors(e.up,pr).normalize(),$.set(0,0,0),i!==0&&$.addScaledVector(pr,i),r!==0&&$.addScaledVector(mr,-r),a!==0&&($.y+=a);let t=$.length();t>0&&($.multiplyScalar(Math.min(1,t)/t*ar*o),e.position.add($))}}function yr(e,t,n,r,i,a){let o=t.x+(n.x-t.x)*a,s=t.y+(n.y-t.y)*a,c=t.z+(n.z-t.z)*a;e.position.set(s,c,o);let[l,u,d,f]=de(r,i);e.quaternion.set(l,u,d,f)}function br(e,t,n,r,i,a,o,s){let c=t.x+(n.x-t.x)*a,l=t.y+(n.y-t.y)*a,u=t.z+(n.z-t.z)*a+(s!=null&&Fe.getState().entities.get(s)?.renderType===`Player`?1:0),d=Math.sin(i),f=Math.cos(i),p=Math.sin(r),m=Math.cos(r),h=Math.max(.1,o),g=c-p*f*h,_=l-m*f*h,v=u+d*h;e.position.set(_,v,g);let[y,b,x,S]=de(r,i);e.quaternion.set(y,b,x,S)}function xr(e,t){return(0,G.lazy)(()=>t().then(t=>({default:t[e]})))}var Sr=xr(`StreamingController`,()=>B(()=>import(`./StreamingController-DTWCS_iN.js`),__vite__mapDeps([34,1,11,12,2,3,13,7,9,14,6,8,15,16,17,18,4,5,10,19,20,21,22,23,24,25,26,27,0,28,29,35]))),Cr=xr(`DebugElements`,()=>B(()=>import(`./DebugElements-CYOeFtvk.js`),__vite__mapDeps([36,1,20,11,12,2,3,13,7,9,14,6,8,15,16,17,18,21,37]))),wr=xr(`Mission`,()=>B(()=>import(`./Mission-DlR5TH9A.js`),__vite__mapDeps([38,1,11,12,2,3,13,7,9,14,6,8,15,16,17,18,39,10,24]))),Tr=xr(`ChatSoundPlayer`,()=>B(()=>import(`./ChatSoundPlayer-CYT1gUBt.js`),__vite__mapDeps([40,1,2,3,6,7,8,9,15,16,14,25,26,19,20,11,12,13,17,18,21,22,24]))),Er=(0,G.memo)(function(e){let t=(0,K.c)(21),{dpr:n,onCreated:r,missionName:i,missionType:a,onLoadingChange:o}=e,s=_e(),c=Ce(),l=c===`demo`||c===`live`,u;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(u=(0,q.jsx)(Se,{}),t[0]=u):u=t[0];let d;t[1]===Symbol.for(`react.memo_cache_sentinel`)?(d=(0,q.jsx)($e,{}),t[1]=d):d=t[1];let f,p;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Jn,{})}),p=(0,q.jsx)(nr,{}),t[2]=f,t[3]=p):(f=t[2],p=t[3]);let m;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(m=(0,q.jsx)(yn,{children:(0,q.jsx)(Tr,{})}),t[4]=m):m=t[4];let h;t[5]===Symbol.for(`react.memo_cache_sentinel`)?(h=(0,q.jsx)(rr,{children:(0,q.jsx)(Cr,{})}),t[5]=h):h=t[5];let g;t[6]===s?g=t[7]:(g=s?(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Sr,{recording:s})}):null,t[6]=s,t[7]=g);let _;t[8]!==l||t[9]!==i||t[10]!==a||t[11]!==o?(_=l?null:(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(wr,{name:i,missionType:a,onLoadingChange:o},`${i}~${a}`)}),t[8]=l,t[9]=i,t[10]=a,t[11]=o,t[12]=_):_=t[12];let v;t[13]===Symbol.for(`react.memo_cache_sentinel`)?(v=(0,q.jsx)(_r,{}),t[13]=v):v=t[13];let y;t[14]!==g||t[15]!==_?(y=(0,q.jsx)(b,{children:(0,q.jsxs)(ye,{children:[u,(0,q.jsxs)(je,{children:[d,f,p,m,h,g,_,v]})]})}),t[14]=g,t[15]=_,t[16]=y):y=t[16];let x;return t[17]!==n||t[18]!==r||t[19]!==y?(x=(0,q.jsx)(nt,{dpr:n,onCreated:r,children:y}),t[17]=n,t[18]=r,t[19]=y,t[20]=x):x=t[20],x});export{Er as GameView};