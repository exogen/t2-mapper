const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PlayerModel-b1ACWo31.js","assets/chunk-DECur_0Z.js","assets/GenericShape-DUxLjpMf.js","assets/Texture-CIsc25mc.js","assets/react-three-fiber.esm-CgPHUpXo.js","assets/jsx-runtime-BpGWiA-R.js","assets/three.module-07hRbor4.js","assets/traditional-BTL5qX2E.js","assets/useBaseQuery-F4EIRb06.js","assets/index-Ch3o8QXg.js","assets/preload-helper-CwUjIIrH.js","assets/mission-Bem2ztlS.js","assets/logger-z_EpIdIa.js","assets/streamHelpers-D2N8suZp.js","assets/SettingsProvider-CCHVZuSg.js","assets/manifest-CirqV3Ls.js","assets/stringUtils-EmGsjr9D.js","assets/iconBase-BCRUFbxq.js","assets/middleware-DPacZrFu.js","assets/JoystickContext-YJ6eVLFP.js","assets/scene-BdOVRsxo.js","assets/cameraTourStore-PEzPVGnX.js","assets/engineStore-Dkm20jvr.js","assets/index-Aaa3CLK3.css","assets/FloatingLabel-CSAq3sjH.js","assets/Html-xieVz_L5.js","assets/extends-COZGby3T.js","assets/FloatingLabel-DAQByNim.css","assets/globalFogUniforms-CtxQvsRj.js","assets/loaders-CIpiZadQ.js","assets/AudioContext-CMp1T7r9.js","assets/AudioEmitter-CDgumTuJ.js","assets/DebugSuspense-Dk4MzcWf.js","assets/ShapeErrorBoundary-CJ_4YTMy.js","assets/streamPlaybackStore-DhJekvnx.js","assets/ShapeModel-_aaRf60T.js","assets/Projectiles-DDA1oztB.js","assets/ForceFieldBare-BzZ8rEsl.js","assets/WaterBlock-C_DD6ULb.js","assets/StreamingController-DhVPkAKa.js","assets/gameEntityTypes-B1KihaDt.js","assets/DebugElements-BH7xXycL.js","assets/DebugElements-BP0b5jan.css","assets/Mission-Bh6FfSDD.js","assets/useQuery-DRIKFTbb.js","assets/misToScene-DdnDTJru.js","assets/ChatSoundPlayer-emYEZuCd.js"])))=>i.map(i=>d[i]);
import{r as e}from"./chunk-DECur_0Z.js";import{n as t,r as n,t as r}from"./jsx-runtime-BpGWiA-R.js";import{a as i,i as a,o,t as s}from"./react-three-fiber.esm-CgPHUpXo.js";import{a as c,i as l}from"./SettingsProvider-CCHVZuSg.js";import{t as u}from"./useQuery-DRIKFTbb.js";import{C as d,D as f,E as p,T as m,d as h,n as g,r as _,t as v,u as y,w as b,x}from"./GenericShape-DUxLjpMf.js";import{t as S}from"./stringUtils-EmGsjr9D.js";import{t as C}from"./logger-z_EpIdIa.js";import{n as w,t as T}from"./cameraTourStore-PEzPVGnX.js";import{t as E,x as D}from"./streamHelpers-D2N8suZp.js";import{A as O,At as k,C as A,Dt as j,E as M,Et as N,Gt as ee,Ht as P,K as F,M as I,O as L,Ot as te,S as ne,St as re,Ut as R,Vt as ie,_ as ae,b as z,f as B,h as oe,k as se,lt as V,m as ce,nt as le,v as ue,w as H}from"./three.module-07hRbor4.js";import{n as U,r as de,t as fe}from"./scene-BdOVRsxo.js";import"./mission-Bem2ztlS.js";import{a as pe,i as me}from"./engineStore-Dkm20jvr.js";import{t as W}from"./preload-helper-CwUjIIrH.js";import{A as he,D as ge,F as _e,I as ve,M as ye,N as be,R as xe,_ as Se,a as Ce,c as we,g as Te,i as Ee,k as De,l as Oe,m as ke,n as Ae,o as je,p as Me,r as Ne,s as Pe,t as Fe,u as Ie,z as Le}from"./index-Ch3o8QXg.js";import{f as Re,o as ze,p as G,s as Be,t as Ve,u as He}from"./loaders-CIpiZadQ.js";import{t as Ue}from"./AudioContext-CMp1T7r9.js";import{t as We}from"./extends-COZGby3T.js";import{t as Ge}from"./Html-xieVz_L5.js";import{t as Ke}from"./Texture-CIsc25mc.js";import{n as qe,t as Je}from"./FloatingLabel-CSAq3sjH.js";import{t as Ye}from"./DebugSuspense-Dk4MzcWf.js";import{t as Xe}from"./gameEntityTypes-B1KihaDt.js";import{n as Ze}from"./streamPlaybackStore-DhJekvnx.js";import{c as Qe,d as $e,f as et,i as tt,n as nt,o as rt,r as it,s as at,t as ot}from"./globalFogUniforms-CtxQvsRj.js";import{t as st}from"./ShapeErrorBoundary-CJ_4YTMy.js";var K=e(n());function ct(e,t,n){let r=o(e=>e.size),i=o(e=>e.viewport),a=typeof e==`number`?e:r.width*i.dpr,s=typeof t==`number`?t:r.height*i.dpr,c=(typeof e==`number`?n:e)||{},{samples:l=0,depth:u,...d}=c,f=u??c.depthBuffer,p=K.useMemo(()=>{let e=new ee(a,s,{minFilter:F,magFilter:F,type:I,...d});return f&&(e.depthTexture=new H(a,s,se)),e.samples=l,e},[]);return K.useLayoutEffect(()=>{p.setSize(a,s),l&&(p.samples=l)},[l,p,a,s]),K.useEffect(()=>()=>p.dispose(),[]),p}var lt=e=>typeof e==`function`,ut=K.forwardRef(({envMap:e,resolution:t=256,frames:n=1/0,makeDefault:r,children:i,...s},c)=>{let l=o(({set:e})=>e),u=o(({camera:e})=>e),d=o(({size:e})=>e),f=K.useRef(null);K.useImperativeHandle(c,()=>f.current,[]);let p=K.useRef(null),m=ct(t);K.useLayoutEffect(()=>{s.manual||(f.current.aspect=d.width/d.height)},[d,s]),K.useLayoutEffect(()=>{f.current.updateProjectionMatrix()});let h=0,g=null,_=lt(i);return a(t=>{_&&(n===1/0||h<n)&&(p.current.visible=!1,t.gl.setRenderTarget(m),g=t.scene.background,e&&(t.scene.background=e),t.gl.render(t.scene,f.current),t.scene.background=g,t.gl.setRenderTarget(null),p.current.visible=!0,h++)}),K.useLayoutEffect(()=>{if(r){let e=u;return l(()=>({camera:f.current})),()=>l(()=>({camera:e}))}},[f,r,l]),K.createElement(K.Fragment,null,K.createElement(`perspectiveCamera`,We({ref:f},s),!_&&i),K.createElement(`group`,{ref:p},_&&i(m.texture)))});function dt(e,{path:t}){let[n]=i(ne,[e],e=>e.setPath(t));return n}dt.preload=(e,{path:t})=>i.preload(ne,[e],e=>e.setPath(t));var q=t(),ft={sunLightPointsDown:{value:!0}};function pt(e){ft.sunLightPointsDown.value=e}var J=r(),mt=C(`SceneLighting`);function ht(){let e=(0,q.c)(6),t=ve(),n,r;if(e[0]===t?(n=e[1],r=e[2]):(n=()=>{t?mt.debug(`sunData: dir=(%s, %s, %s) color=(%s, %s, %s) ambient=(%s, %s, %s)`,t.direction.x.toFixed(3),t.direction.y.toFixed(3),t.direction.z.toFixed(3),t.color.r.toFixed(3),t.color.g.toFixed(3),t.color.b.toFixed(3),t.ambient.r.toFixed(3),t.ambient.g.toFixed(3),t.ambient.b.toFixed(3)):mt.debug(`No sunData — using fallback ambient #888`)},r=[t],e[0]=t,e[1]=n,e[2]=r),(0,K.useEffect)(n,r),!t){let t;return e[3]===Symbol.for(`react.memo_cache_sentinel`)?(t=(0,J.jsx)(`ambientLight`,{color:`#888888`,intensity:1}),e[3]=t):t=e[3],t}let i;return e[4]===t?i=e[5]:(i=(0,J.jsx)(gt,{sunData:t}),e[4]=t,e[5]=i),i}function gt(e){let t=(0,q.c)(29),{sunData:n}=e,r;t[0]===n.direction?r=t[1]:(r=de(n.direction),t[0]=n.direction,t[1]=r);let[i,a,o]=r,s=Math.sqrt(i*i+a*a+o*o),c=i/s,l=a/s,u=o/s,d;t[2]!==c||t[3]!==l||t[4]!==u?(d=new R(c,l,u),t[2]=c,t[3]=l,t[4]=u,t[5]=d):d=t[5];let f=d,p=-f.x*5e3,m=-f.y*5e3,h=-f.z*5e3,g;t[6]!==p||t[7]!==m||t[8]!==h?(g=new R(p,m,h),t[6]=p,t[7]=m,t[8]=h,t[9]=g):g=t[9];let _=g,v;t[10]!==n.color.b||t[11]!==n.color.g||t[12]!==n.color.r?(v=new z(n.color.r,n.color.g,n.color.b),t[10]=n.color.b,t[11]=n.color.g,t[12]=n.color.r,t[13]=v):v=t[13];let y=v,b;t[14]!==n.ambient.b||t[15]!==n.ambient.g||t[16]!==n.ambient.r?(b=new z(n.ambient.r,n.ambient.g,n.ambient.b),t[14]=n.ambient.b,t[15]=n.ambient.g,t[16]=n.ambient.r,t[17]=b):b=t[17];let x=b,S=f.y<0,C,w;t[18]===S?(C=t[19],w=t[20]):(C=()=>{pt(S)},w=[S],t[18]=S,t[19]=C,t[20]=w),(0,K.useEffect)(C,w);let T;t[21]!==y||t[22]!==_?(T=(0,J.jsx)(`directionalLight`,{position:_,color:y,intensity:1,castShadow:!0,"shadow-mapSize-width":8192,"shadow-mapSize-height":8192,"shadow-camera-left":-4096,"shadow-camera-right":4096,"shadow-camera-top":4096,"shadow-camera-bottom":-4096,"shadow-camera-near":100,"shadow-camera-far":12e3,"shadow-bias":-1e-5,"shadow-normalBias":.4,"shadow-radius":2}),t[21]=y,t[22]=_,t[23]=T):T=t[23];let E;t[24]===x?E=t[25]:(E=(0,J.jsx)(`ambientLight`,{color:x,intensity:1}),t[24]=x,t[25]=E);let D;return t[26]!==T||t[27]!==E?(D=(0,J.jsxs)(J.Fragment,{children:[T,E]}),t[26]=T,t[27]=E,t[28]=D):D=t[28],D}function _t(){let e=(0,q.c)(4),{fpsLimit:t}=c(),n=o(vt),r,i;return e[0]!==t||e[1]!==n?(r=()=>{if(t==null)return;let e=1e3/t,r=0,i;function a(t){i=requestAnimationFrame(a),t-r>=e&&(r=t-(t-r)%e,n())}return i=requestAnimationFrame(a),()=>cancelAnimationFrame(i)},i=[t,n],e[0]=t,e[1]=n,e[2]=r,e[3]=i):(r=e[2],i=e[3]),(0,K.useEffect)(r,i),t}function vt(e){return e.invalidate}function yt(){return _t(),null}var bt={toneMapping:0,outputColorSpace:te};function xt(e){let t=(0,q.c)(11),{children:n,renderOnDemand:r,dpr:i,onCreated:a}=e,o=r===void 0?!1:r,{renderOnDemand:u}=l(),d=o||u,{fpsLimit:f}=c(),p=f!=null&&!d,m=d||p?`demand`:`always`,h;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(h={type:1},t[0]=h):h=t[0];let g;t[1]===n?g=t[2]:(g=(0,J.jsx)(K.Suspense,{children:n}),t[1]=n,t[2]=g);let _;t[3]===p?_=t[4]:(_=p?(0,J.jsx)(yt,{}):null,t[3]=p,t[4]=_);let v;return t[5]!==i||t[6]!==a||t[7]!==m||t[8]!==g||t[9]!==_?(v=(0,J.jsxs)(s,{frameloop:m,dpr:i,gl:bt,shadows:h,onCreated:a,children:[g,_]}),t[5]=i,t[6]=a,t[7]=m,t[8]=g,t[9]=_,t[10]=v):v=t[10],v}function St(e){let t=(0,q.c)(12),{entity:n}=e,{registerCamera:r,unregisterCamera:i}=Se(),a=(0,K.useId)(),o=n.cameraDataBlock,s;t[0]===n.position?s=t[1]:(s=n.position?new R(...n.position):new R,t[0]=n.position,t[1]=s);let c=s,l;t[2]===n.rotation?l=t[3]:(l=n.rotation?new re(...n.rotation):new re,t[2]=n.rotation,t[3]=l);let u=l,d,f;return t[4]!==o||t[5]!==a||t[6]!==c||t[7]!==r||t[8]!==u||t[9]!==i?(d=()=>{if(o===`Observer`){let e={id:a,position:c,rotation:u};return r(e),()=>{i(e)}}},f=[a,o,r,i,c,u],t[4]=o,t[5]=a,t[6]=c,t[7]=r,t[8]=u,t[9]=i,t[10]=d,t[11]=f):(d=t[10],f=t[11]),(0,K.useEffect)(d,f),null}function Ct(e){let t=(0,q.c)(2),{entity:n}=e,r;return t[0]===n.label?r=t[1]:(r=n.label?(0,J.jsx)(Je,{opacity:.6,children:n.label}):null,t[0]=n.label,t[1]=r),r}function wt(e){let t=new Float32Array(e.length);for(let n=0;n<e.length;n++)t[n]=e[n]/65535;return t}var Tt=256,Et=512,Dt=64,Ot=150,kt=`
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
`;function At({shader:e,baseTextures:t,alphaTextures:n,visibilityMask:r,tiling:i,detailTexture:a=null,lightmap:o=null}){e.uniforms.sunLightPointsDown=ft.sunLightPointsDown;let s=t.length;if(t.forEach((t,n)=>{e.uniforms[`albedo${n}`]={value:t}}),n.forEach((t,n)=>{e.uniforms[`mask${n}`]={value:t}}),r&&(e.uniforms.visibilityMask={value:r}),t.forEach((t,n)=>{e.uniforms[`tiling${n}`]={value:i[n]??32}}),o&&(e.uniforms.terrainLightmap={value:o}),a&&(e.uniforms.detailTexture={value:a},e.uniforms.detailTiling={value:Dt},e.uniforms.detailFadeDistance={value:Ot},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
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

${kt}

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
  vec2 alphaUv = baseUv + vec2(0.5 / ${Tt}.0);
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
  vec2 lightmapUv = vMapUv + vec2(0.5 / ${Et}.0);
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

#include <tonemapping_fragment>`)}var jt={0:32,1:32,2:32,3:32,4:32,5:32},Mt=(0,K.memo)(function({displacementMap:e,visibilityMask:t,textureNames:n,alphaTextures:r,detailTextureName:i,lightmap:a}){let{debugMode:o}=l(),s=Qe(),c=Ke(n.map(e=>Re(e)),e=>{e.forEach(e=>et(e,{anisotropy:s}))}),u=i?G(i):null,d=Ke(u??Ve,e=>{et(e,{anisotropy:s})}),f=(0,K.useCallback)(e=>{At({shader:e,baseTextures:c,alphaTextures:r,visibilityMask:t,tiling:jt,detailTexture:u?d:null,lightmap:a}),rt(e,ot)},[c,r,t,d,u,a]),p=(0,K.useMemo)(()=>[n.join(`,`),u??`none`,a?a.id:`nolm`,c.map(e=>e.id).join(`,`)].join(`|`),[n,u,a,c]),m=(0,K.useRef)(null);return(0,K.useEffect)(()=>{let e=m.current;e&&(e.defines??={},e.defines.DEBUG_MODE=o?1:0,e.needsUpdate=!0)},[o]),(0,K.useEffect)(()=>{let e=m.current;e&&(e.customProgramCacheKey=()=>p,e.needsUpdate=!0)},[p]),(0,J.jsx)(`meshLambertMaterial`,{ref:m,map:e,depthWrite:!0,side:0,defines:{DEBUG_MODE:o?1:0},onBeforeCompile:f},`${u?`detail`:`nodetail`}-${a?`lightmap`:`nolightmap`}`)}),Nt=(0,K.memo)(function(e){let t=(0,q.c)(8),{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s}=e,c;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(c=(0,J.jsx)(`meshLambertMaterial`,{color:`rgb(0, 109, 56)`,wireframe:!0}),t[0]=c):c=t[0];let l;return t[1]!==a||t[2]!==o||t[3]!==n||t[4]!==s||t[5]!==i||t[6]!==r?(l=(0,J.jsx)(K.Suspense,{fallback:c,children:(0,J.jsx)(Mt,{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s})}),t[1]=a,t[2]=o,t[3]=n,t[4]=s,t[5]=i,t[6]=r,t[7]=l):l=t[7],l}),Pt=(0,K.memo)(function(e){let t=(0,q.c)(15),{tileX:n,tileZ:r,blockSize:i,basePosition:a,textureNames:o,geometry:s,displacementMap:c,visibilityMask:l,alphaTextures:u,detailTextureName:d,lightmap:f,visible:p}=e,m=p===void 0?!0:p,h=i/2,g=a.x+n*i+h,_=a.z+r*i+h,v;t[0]!==g||t[1]!==_?(v=[g,0,_],t[0]=g,t[1]=_,t[2]=v):v=t[2];let y=v,b;t[3]!==u||t[4]!==d||t[5]!==c||t[6]!==f||t[7]!==o||t[8]!==l?(b=(0,J.jsx)(Nt,{displacementMap:c,visibilityMask:l,textureNames:o,alphaTextures:u,detailTextureName:d,lightmap:f}),t[3]=u,t[4]=d,t[5]=c,t[6]=f,t[7]=o,t[8]=l,t[9]=b):b=t[9];let x;return t[10]!==s||t[11]!==y||t[12]!==b||t[13]!==m?(x=(0,J.jsx)(`mesh`,{position:y,geometry:s,castShadow:!0,receiveShadow:!0,visible:m,children:b}),t[10]=s,t[11]=y,t[12]=b,t[13]=m,t[14]=x):x=t[14],x}),Ft=C(`TerrainBlock`),It=8,Lt=600,Y=256,Rt=512,zt=2048;function Bt(e,t){let n=new oe,r=(t+1)*(t+1),i=new Float32Array(r*3),a=new Float32Array(r*3),o=new Float32Array(r*2),s=t*t*6,c=new Uint32Array(s),l=0,u=e/t;for(let n=0;n<=t;n++)for(let r=0;r<=t;r++){let s=n*(t+1)+r;i[s*3]=r*u-e/2,i[s*3+1]=e/2-n*u,i[s*3+2]=0,a[s*3]=0,a[s*3+1]=0,a[s*3+2]=1,o[s*2]=r/t,o[s*2+1]=1-n/t}for(let e=0;e<t;e++)for(let n=0;n<t;n++){let r=e*(t+1)+n,i=r+1,a=(e+1)*(t+1)+n,o=a+1;(n^e)&1?(c[l++]=r,c[l++]=a,c[l++]=i,c[l++]=i,c[l++]=a,c[l++]=o):(c[l++]=r,c[l++]=a,c[l++]=o,c[l++]=r,c[l++]=o,c[l++]=i)}return n.setIndex(new ce(c,1)),n.setAttribute(`position`,new L(i,3)),n.setAttribute(`normal`,new L(a,3)),n.setAttribute(`uv`,new L(o,2)),n.rotateX(-Math.PI/2),n.rotateY(-Math.PI/2),n}function Vt(e,t,n){let r=e.attributes.position,i=e.attributes.uv,a=e.attributes.normal,o=r.array,s=i.array,c=a.array,l=r.count,u=(e,n)=>(e=Math.max(0,Math.min(Y-1,e)),n=Math.max(0,Math.min(Y-1,n)),t[n*Y+e]/65535*zt),d=(e,n)=>{e=Math.max(0,Math.min(Y-1,e)),n=Math.max(0,Math.min(Y-1,n));let r=Math.floor(e),i=Math.floor(n),a=Math.min(r+1,Y-1),o=Math.min(i+1,Y-1),s=e-r,c=n-i,l=t[i*Y+r]/65535*zt,u=t[i*Y+a]/65535*zt,d=t[o*Y+r]/65535*zt,f=t[o*Y+a]/65535*zt,p=l*(1-s)+u*s,m=d*(1-s)+f*s;return p*(1-c)+m*c};for(let e=0;e<l;e++){let t=s[e*2],r=s[e*2+1],i=u(Math.floor(t*Y)&Y-1,Math.floor(r*Y)&Y-1);o[e*3+1]=i;let a=t*(Y-1),l=r*(Y-1),f=d(a-1,l),p=d(a+1,l),m=d(a,l+1),h=d(a,l-1),g=(p-f)/2,_=(m-h)/2,v=n,y=g,b=Math.sqrt(_*_+v*v+y*y);b>0?(_/=b,v/=b,y/=b):(_=0,v=1,y=0),c[e*3]=_,c[e*3+1]=v,c[e*3+2]=y}r.needsUpdate=!0,a.needsUpdate=!0}function Ht(e,t,n,r,i,a){let o=r.z/i,s=r.x/i,c=r.y,l=Math.sqrt(o*o+s*s);if(l<1e-4)return 1;let u=.5/l,d=o*u,f=s*u,p=c*u,m=e,h=t,g=n+.1,_=Y*3;for(let e=0;e<_;e++){if(m+=d,h+=f,g+=p,m<0||m>=Y||h<0||h>=Y||g>zt)return 1;let e=a(m,h);if(g<e)return 0}return 1}function Ut(e,t,n){let r=(t,n)=>{let r=Math.max(0,Math.min(Y-1,t)),i=Math.max(0,Math.min(Y-1,n)),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,Y-1),c=Math.min(o+1,Y-1),l=r-a,u=i-o,d=e[o*Y+a]/65535,f=e[o*Y+s]/65535,p=e[c*Y+a]/65535,m=e[c*Y+s]/65535,h=d*(1-l)+f*l,g=p*(1-l)+m*l;return(h*(1-u)+g*u)*zt},i=new R(-t.x,-t.y,-t.z).normalize(),a=new Uint8Array(Rt*Rt),o=.5;for(let e=0;e<Rt;e++)for(let t=0;t<Rt;t++){let s=t/2+.25,c=e/2+.25,l=r(s,c),u=r(s-o,c),d=r(s+o,c),f=r(s,c-o),p=r(s,c+o),m=(d-u)/(2*o),h=-((p-f)/(2*o)),g=n,_=-m,v=Math.sqrt(h*h+g*g+_*_),y=Math.max(0,h/v*i.x+g/v*i.y+_/v*i.z),b=1;y>0&&(b=Ht(s,c,l,i,n,r)),a[e*Rt+t]=Math.floor(y*b*255)}let s=new A(a,Rt,Rt,N,ie);return s.colorSpace=``,s.generateMipmaps=!0,s.wrapS=ue,s.wrapT=ue,s.magFilter=F,s.minFilter=F,s.needsUpdate=!0,s}function Wt(e){let t=(0,q.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`terrain`,e],queryFn:()=>(Ft.debug(`Loading terrain: %s`,e),He(e))},t[0]=e,t[1]=n);let r=u(n),i,a;return t[2]!==r.data||t[3]!==r.error||t[4]!==r.status||t[5]!==e?(i=()=>{Ft.debug(`Query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (data ready)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=r.data,t[3]=r.error,t[4]=r.status,t[5]=e,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,K.useEffect)(i,a),r}function Gt(){let e=_e();return e&&e.visibleDistance>0?e.visibleDistance:Lt}function Kt(e){let t=new Uint8Array(Y*Y);t.fill(255);for(let n of e){let e=n&255,r=n>>8&255,i=n>>16,a=r*Y;for(let n=0;n<i;n++){let r=a+e+n;r<t.length&&(t[r]=0)}}let n=new A(t,Y,Y,N,ie);return n.colorSpace=``,n.wrapS=n.wrapT=ue,n.magFilter=V,n.minFilter=V,n.needsUpdate=!0,n}var qt=(0,K.memo)(function(e){let t=(0,q.c)(62),{scene:n}=e,r=n.terrFileName,i=n.squareSize||It,s=n.detailTextureName||void 0,c=i*256,l=Gt(),u=o(Jt),d=-i*(Y/2),f;t[0]===d?f=t[1]:(f={x:d,z:d},t[0]=d,t[1]=f);let p=f,m;t[2]===n.emptySquareRuns?m=t[3]:(m=n.emptySquareRuns??[],t[2]=n.emptySquareRuns,t[3]=m);let h=m,{data:g}=Wt(r),_;bb0:{if(!g){_=null;break bb0}let e=i*256,n;t[4]!==e||t[5]!==i||t[6]!==g.heightMap?(n=Bt(e,Y),Vt(n,g.heightMap,i),t[4]=e,t[5]=i,t[6]=g.heightMap,t[7]=n):n=t[7],_=n}let v=_,y,b;t[8]!==i||t[9]!==g?(y=()=>{if(g)return Le(xe(g.heightMap,i)),Yt},b=[g,i],t[8]=i,t[9]=g,t[10]=y,t[11]=b):(y=t[10],b=t[11]),(0,K.useEffect)(y,b);let x=ve(),S;bb1:{if(!x){let e;t[12]===Symbol.for(`react.memo_cache_sentinel`)?(e=new R(.57735,-.57735,.57735),t[12]=e):e=t[12],S=e;break bb1}let e;t[13]===x.direction?e=t[14]:(e=de(x.direction),t[13]=x.direction,t[14]=e);let[n,r,i]=e,a=Math.sqrt(n*n+r*r+i*i),o=n/a,s=r/a,c=i/a,l;t[15]!==c||t[16]!==o||t[17]!==s?(l=new R(o,s,c),t[15]=c,t[16]=o,t[17]=s,t[18]=l):l=t[18],S=l}let C=S,w;bb2:{if(!g){w=null;break bb2}let e;t[19]!==i||t[20]!==C||t[21]!==g.heightMap?(e=Ut(g.heightMap,C,i),t[19]=i,t[20]=C,t[21]=g.heightMap,t[22]=e):e=t[22],w=e}let T=w,E;bb3:{if(!g){E=null;break bb3}let e;t[23]===g.heightMap?e=t[24]:(e=new A(wt(g.heightMap),Y,Y,N,se),e.colorSpace=``,e.generateMipmaps=!1,e.wrapS=j,e.wrapT=j,e.needsUpdate=!0,t[23]=g.heightMap,t[24]=e),E=e}let D=E,O;t[25]===h?O=t[26]:(O=Kt(h),t[25]=h,t[26]=O);let k=O,M;t[27]===Symbol.for(`react.memo_cache_sentinel`)?(M=Kt([]),t[27]=M):M=t[27];let ee=M,P;bb4:{if(!g){P=null;break bb4}let e;t[28]===g.alphaMaps?e=t[29]:(e=g.alphaMaps.map(Xt),t[28]=g.alphaMaps,t[29]=e),P=e}let F=P,I=2*Math.ceil(l/c)+1,L=I*I-1,te=(0,K.useRef)(null),ne;t[30]===Symbol.for(`react.memo_cache_sentinel`)?(ne=new le,t[30]=ne):ne=t[30];let re=ne,ie;t[31]===Symbol.for(`react.memo_cache_sentinel`)?(ie={xStart:1/0,xEnd:-1/0,zStart:1/0,zEnd:-1/0},t[31]=ie):ie=t[31];let ae=(0,K.useRef)(ie),z=(0,K.useRef)(null),B;if(t[32]!==p||t[33]!==c||t[34]!==u||t[35]!==l?(B=()=>{let e=te.current;if(!e)return;let t=u.position.x-p.x,n=u.position.z-p.z,r=Math.floor((t-l)/c),i=Math.ceil((t+l)/c),a=Math.floor((n-l)/c),o=Math.ceil((n+l)/c),s=ae.current;if(e===z.current&&r===s.xStart&&i===s.xEnd&&a===s.zStart&&o===s.zEnd)return;z.current=e,s.xStart=r,s.xEnd=i,s.zStart=a,s.zEnd=o;let d=c/2,f=0;for(let t=r;t<i;t++)for(let n=a;n<o;n++)t===0&&n===0||(re.makeTranslation(p.x+t*c+d,0,p.z+n*c+d),e.setMatrixAt(f,re),f++);e.count=f,e.instanceMatrix.needsUpdate=!0},t[32]=p,t[33]=c,t[34]=u,t[35]=l,t[36]=B):B=t[36],a(B),!g||!v||!D||!F)return Ft.debug(`Not ready: terrain=%s geometry=%s displacement=%s alpha=%s`,!!g,!!v,!!D,!!F),null;let oe=T??void 0,V;t[37]!==p||t[38]!==c||t[39]!==s||t[40]!==k||t[41]!==F||t[42]!==D||t[43]!==v||t[44]!==oe||t[45]!==g.textureNames?(V=(0,J.jsx)(Pt,{tileX:0,tileZ:0,blockSize:c,basePosition:p,textureNames:g.textureNames,geometry:v,displacementMap:D,visibilityMask:k,alphaTextures:F,detailTextureName:s,lightmap:oe}),t[37]=p,t[38]=c,t[39]=s,t[40]=k,t[41]=F,t[42]=D,t[43]=v,t[44]=oe,t[45]=g.textureNames,t[46]=V):V=t[46];let ce;t[47]!==L||t[48]!==v?(ce=[v,void 0,L],t[47]=L,t[48]=v,t[49]=ce):ce=t[49];let ue=T??void 0,H;t[50]!==s||t[51]!==F||t[52]!==D||t[53]!==ue||t[54]!==g.textureNames?(H=(0,J.jsx)(Nt,{displacementMap:D,visibilityMask:ee,textureNames:g.textureNames,alphaTextures:F,detailTextureName:s,lightmap:ue}),t[50]=s,t[51]=F,t[52]=D,t[53]=ue,t[54]=g.textureNames,t[55]=H):H=t[55];let U;t[56]!==ce||t[57]!==H?(U=(0,J.jsx)(`instancedMesh`,{ref:te,args:ce,castShadow:!0,receiveShadow:!0,frustumCulled:!1,children:H}),t[56]=ce,t[57]=H,t[58]=U):U=t[58];let fe;return t[59]!==V||t[60]!==U?(fe=(0,J.jsxs)(J.Fragment,{children:[V,U]}),t[59]=V,t[60]=U,t[61]=fe):fe=t[61],fe});function Jt(e){return e.camera}function Yt(){return Le(null)}function Xt(e){return $e(e)}var Zt=`
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
`;function Qt(e,t){let n=t.surfaceOutsideVisible??!1;e.uniforms.useSceneLighting={value:n},e.uniforms.interiorDebugColor={value:n?new R(0,.4,1):new R(1,.2,0)},e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
${Zt}
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

#include <tonemapping_fragment>`)}var $t=C(`InteriorInstance`);function en(e){let t=(0,q.c)(2),n;return t[0]===e?n=t[1]:(n=ze(e),t[0]=e,t[1]=n),f(n)}function tn({materialName:e,material:t,lightMap:n}){let r=l()?.debugMode??!1,i=Qe(),a=Ke(G(e),e=>et(e,{anisotropy:i})),o=new Set(t?.userData?.flag_names??[]).has(`SelfIlluminating`),s=new Set(t?.userData?.surface_flag_names??[]).has(`SurfaceOutsideVisible`),c=(0,K.useCallback)(e=>{rt(e,ot),Qt(e,{surfaceOutsideVisible:s})},[s]),u=(0,K.useRef)(null),d=(0,K.useRef)(null);(0,K.useEffect)(()=>{let e=u.current??d.current;e&&(e.defines??={},e.defines.DEBUG_MODE=r?1:0,e.needsUpdate=!0)},[r]);let f={DEBUG_MODE:r?1:0},p=`${s}`;return o?(0,J.jsx)(`meshBasicMaterial`,{ref:u,map:a,toneMapped:!1,defines:f,onBeforeCompile:c},p):(0,J.jsx)(`meshLambertMaterial`,{ref:d,map:a,lightMap:n,toneMapped:!1,defines:f,onBeforeCompile:c},p)}function nn(e){if(!e)return null;let t=e.emissiveMap;return t&&(t.colorSpace=te),t??null}function rn(e){let t=(0,q.c)(13),{node:n}=e,r;bb0:{if(!n.material){let e;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[0]=e):e=t[0],r=e;break bb0}if(Array.isArray(n.material)){let e;t[1]===n.material?e=t[2]:(e=n.material.map(an),t[1]=n.material,t[2]=e),r=e;break bb0}let e;t[3]===n.material?e=t[4]:(e=nn(n.material),t[3]=n.material,t[4]=e);let i;t[5]===e?i=t[6]:(i=[e],t[5]=e,t[6]=i),r=i}let i=r,a;t[7]!==i||t[8]!==n.material?(a=n.material?(0,J.jsx)(Ye,{name:`InteriorTexture:${Array.isArray(n.material)?n.material[0]?.userData?.resource_path:n.material?.userData?.resource_path??`?`}`,fallback:(0,J.jsx)(`meshStandardMaterial`,{color:`yellow`,wireframe:!0}),children:Array.isArray(n.material)?n.material.map((e,t)=>(0,J.jsx)(tn,{materialName:e.userData.resource_path,material:e,lightMap:i[t]},t)):(0,J.jsx)(tn,{materialName:n.material.userData.resource_path,material:n.material,lightMap:i[0]})}):null,t[7]=i,t[8]=n.material,t[9]=a):a=t[9];let o;return t[10]!==n.geometry||t[11]!==a?(o=(0,J.jsx)(`mesh`,{geometry:n.geometry,castShadow:!0,receiveShadow:!0,children:a}),t[10]=n.geometry,t[11]=a,t[12]=o):o=t[12],o}function an(e){return nn(e)}var on=(0,K.memo)(function(e){let t=(0,q.c)(10),{interiorFile:n,ghostIndex:r}=e,{nodes:i}=en(n),a=l()?.debugMode??!1,o;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(o=[0,-Math.PI/2,0],t[0]=o):o=t[0];let s;t[1]===i?s=t[2]:(s=Object.entries(i).filter(un).map(dn),t[1]=i,t[2]=s);let c;t[3]!==a||t[4]!==r||t[5]!==n?(c=a?(0,J.jsxs)(Je,{children:[r,`: `,n]}):null,t[3]=a,t[4]=r,t[5]=n,t[6]=c):c=t[6];let u;return t[7]!==s||t[8]!==c?(u=(0,J.jsxs)(`group`,{rotation:o,children:[s,c]}),t[7]=s,t[8]=c,t[9]=u):u=t[9],u});function sn(e){let t=(0,q.c)(9),{color:n,label:r}=e,i;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(i=(0,J.jsx)(`boxGeometry`,{args:[10,10,10]}),t[0]=i):i=t[0];let a;t[1]===n?a=t[2]:(a=(0,J.jsx)(`meshStandardMaterial`,{color:n,wireframe:!0}),t[1]=n,t[2]=a);let o;t[3]!==n||t[4]!==r?(o=r?(0,J.jsx)(Je,{color:n,children:r}):null,t[3]=n,t[4]=r,t[5]=o):o=t[5];let s;return t[6]!==a||t[7]!==o?(s=(0,J.jsxs)(`mesh`,{children:[i,a,o]}),t[6]=a,t[7]=o,t[8]=s):s=t[8],s}function cn(e){let t=(0,q.c)(3),{label:n}=e,r=l()?.debugMode??!1,i;return t[0]!==r||t[1]!==n?(i=r?(0,J.jsx)(sn,{color:`red`,label:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}var ln=(0,K.memo)(function(e){let t=(0,q.c)(26),{scene:n}=e,r;t[0]===n.transform.position?r=t[1]:(r=de(n.transform.position),t[0]=n.transform.position,t[1]=r);let i=r,a;t[2]===n.transform?a=t[3]:(a=fe(n.transform),t[2]=n.transform,t[3]=a);let o=a,s;t[4]===n.scale?s=t[5]:(s=U(n.scale),t[4]=n.scale,t[5]=s);let c=s,l=`${n.ghostIndex}: ${n.interiorFile}`,u;t[6]===l?u=t[7]:(u=(0,J.jsx)(cn,{label:l}),t[6]=l,t[7]=u);let f;t[8]===n.interiorFile?f=t[9]:(f=e=>{$t.error(`Failed to load %s: %s`,n.interiorFile,e.message)},t[8]=n.interiorFile,t[9]=f);let p=`InteriorModel:${n.interiorFile}`,m;t[10]===Symbol.for(`react.memo_cache_sentinel`)?(m=(0,J.jsx)(sn,{color:`orange`}),t[10]=m):m=t[10];let h;t[11]!==n.ghostIndex||t[12]!==n.interiorFile?(h=(0,J.jsx)(on,{interiorFile:n.interiorFile,ghostIndex:n.ghostIndex}),t[11]=n.ghostIndex,t[12]=n.interiorFile,t[13]=h):h=t[13];let g;t[14]!==p||t[15]!==h?(g=(0,J.jsx)(Ye,{name:p,fallback:m,children:h}),t[14]=p,t[15]=h,t[16]=g):g=t[16];let _;t[17]!==g||t[18]!==u||t[19]!==f?(_=(0,J.jsx)(d,{fallback:u,onError:f,children:g}),t[17]=g,t[18]=u,t[19]=f,t[20]=_):_=t[20];let v;return t[21]!==i||t[22]!==o||t[23]!==c||t[24]!==_?(v=(0,J.jsx)(`group`,{position:i,quaternion:o,scale:c,children:_}),t[21]=i,t[22]=o,t[23]=c,t[24]=_,t[25]=v):v=t[25],v});function un(e){let[,t]=e;return t.isMesh}function dn(e){let[t,n]=e;return(0,J.jsx)(rn,{node:n},t)}var fn=()=>{},X=5,pn=X*X,mn=.05;function hn(e,t,n){let r=e,i=t,a=n;return[a,a,a,a,a,a,i,i,i,a,a,i,r,i,a,a,i,i,i,a,a,a,a,a,a]}function gn(e,t){let n=new Float32Array(pn);for(let r=0;r<pn;r++){let i=e[r*3],a=e[r*3+2],o=1.3-Math.sqrt(i*i+a*a)/t;o<.4?o=0:o>.8&&(o=1),n[r]=o}return n}function _n(e,t,n,r){let i=new oe,a=new Float32Array(pn*3),o=new Float32Array(pn*2),s=hn(t,n,r),c=e*2/(X-1);for(let t=0;t<X;t++)for(let n=0;n<X;n++){let r=t*X+n,i=-e+n*c,l=e-t*c,u=e*s[r];a[r*3]=i,a[r*3+1]=u,a[r*3+2]=l,o[r*2]=n,o[r*2+1]=t}vn(a);let l=gn(a,e),u=[];for(let e=0;e<X-1;e++)for(let t=0;t<X-1;t++){let n=e*X+t,r=n+1,i=n+X,a=i+1;u.push(n,i,a),u.push(n,a,r)}return i.setIndex(u),i.setAttribute(`position`,new L(a,3)),i.setAttribute(`uv`,new L(o,2)),i.setAttribute(`alpha`,new L(l,1)),i.computeBoundingSphere(),i}function vn(e){let t=t=>({x:e[t*3],y:e[t*3+1],z:e[t*3+2]}),n=(t,n,r,i)=>{e[t*3]=n,e[t*3+1]=r,e[t*3+2]=i},r=t(1),i=t(3),a=t(5),o=t(6),s=t(8),c=t(9),l=t(15),u=t(16),d=t(18),f=t(19),p=t(21),m=t(23),h=a.x+(r.x-a.x)*.5,g=a.y+(r.y-a.y)*.5,_=a.z+(r.z-a.z)*.5;n(0,o.x+(h-o.x)*2,o.y+(g-o.y)*2,o.z+(_-o.z)*2),h=c.x+(i.x-c.x)*.5,g=c.y+(i.y-c.y)*.5,_=c.z+(i.z-c.z)*.5,n(4,s.x+(h-s.x)*2,s.y+(g-s.y)*2,s.z+(_-s.z)*2),h=p.x+(l.x-p.x)*.5,g=p.y+(l.y-p.y)*.5,_=p.z+(l.z-p.z)*.5,n(20,u.x+(h-u.x)*2,u.y+(g-u.y)*2,u.z+(_-u.z)*2),h=m.x+(f.x-m.x)*.5,g=m.y+(f.y-m.y)*.5,_=m.z+(f.z-m.z)*.5,n(24,d.x+(h-d.x)*2,d.y+(g-d.y)*2,d.z+(_-d.z)*2)}function yn(e){return e.wrapS=j,e.wrapT=j,e.minFilter=F,e.magFilter=F,e.colorSpace=``,e.needsUpdate=!0,e}var bn=`
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
`,xn=`
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
`;function Sn({textureUrl:e,radius:t,heightPercent:n,speed:r,windDirection:i,layerIndex:o}){let{debugMode:s}=l(),{animationEnabled:u}=c(),d=(0,K.useRef)(null),f=Ke(e,yn),p=(0,K.useMemo)(()=>_n(t,n,n-.05,mn),[t,n]);(0,K.useEffect)(()=>()=>{p.dispose()},[p]);let m=(0,K.useMemo)(()=>new k({uniforms:{cloudTexture:{value:f},uvOffset:{value:new P(0,0)},debugMode:{value:s?1:0},layerIndex:{value:o}},vertexShader:bn,fragmentShader:xn,transparent:!0,depthWrite:!1,side:2}),[f,s,o]);return(0,K.useEffect)(()=>()=>{m.dispose()},[m]),a(u?(e,t)=>{let n=t*1e3/32;d.current??=new P(0,0),d.current.x+=i.x*r*n,d.current.y+=i.y*r*n,d.current.x-=Math.floor(d.current.x),d.current.y-=Math.floor(d.current.y),m.uniforms.uvOffset.value.copy(d.current)}:fn),(0,J.jsx)(`mesh`,{geometry:p,frustumCulled:!1,renderOrder:10,children:(0,J.jsx)(`primitive`,{object:m,attach:`material`})})}var Cn=7;function wn(e){let t=(0,q.c)(7),n,r;t[0]===e?(n=t[1],r=t[2]):(n=[`detailMapList`,e],r=()=>Be(e),t[0]=e,t[1]=n,t[2]=r);let i=!!e,a;return t[3]!==n||t[4]!==r||t[5]!==i?(a={queryKey:n,queryFn:r,enabled:i},t[3]=n,t[4]=r,t[5]=i,t[6]=a):a=t[6],u(a)}function Tn(e){let t=(0,q.c)(18),{scene:n}=e,{data:r}=wn(n.materialList||void 0),i=(n.visibleDistance>0?n.visibleDistance:500)*.95,o;t[0]===n.cloudLayers?o=t[1]:(o=n.cloudLayers.map(Dn),t[0]=n.cloudLayers,t[1]=o);let s=o,c;t[2]===n.cloudLayers?c=t[3]:(c=n.cloudLayers.map(En),t[2]=n.cloudLayers,t[3]=c);let l=c,u;bb0:{let{x:e,y:r}=n.windVelocity;if(e!==0||r!==0){let n;t[4]!==e||t[5]!==r?(n=new P(r,-e).normalize(),t[4]=e,t[5]=r,t[6]=n):n=t[6],u=n;break bb0}let i;t[7]===Symbol.for(`react.memo_cache_sentinel`)?(i=new P(1,0),t[7]=i):i=t[7],u=i}let d=u,f;bb1:{if(!r){let e;t[8]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[8]=e):e=t[8],f=e;break bb1}let e;if(t[9]!==l||t[10]!==s||t[11]!==r){e=[];for(let t=0;t<3;t++){let n=r[Cn+t];n&&e.push({texture:n,height:l[t],speed:s[t]})}t[9]=l,t[10]=s,t[11]=r,t[12]=e}else e=t[12];f=e}let p=f,m=(0,K.useRef)(null),h;if(t[13]===Symbol.for(`react.memo_cache_sentinel`)?(h=e=>{let{camera:t}=e;m.current&&m.current.position.copy(t.position)},t[13]=h):h=t[13],a(h),!p||p.length===0)return null;let g;return t[14]!==p||t[15]!==i||t[16]!==d?(g=(0,J.jsx)(`group`,{ref:m,children:p.map((e,t)=>(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(Sn,{textureUrl:G(e.texture),radius:i,heightPercent:e.height,speed:e.speed,windDirection:d,layerIndex:t})},t))}),t[14]=p,t[15]=i,t[16]=d,t[17]=g):g=t[17],g}function En(e,t){return e.heightPercent||[.35,.25,.2][t]}function Dn(e,t){return e.speed||[1e-4,2e-4,3e-4][t]}(0,K.createContext)(null),(0,K.createContext)(null);function On(e){let t=e.fogDistance,n=e.visibleDistance>0?e.visibleDistance:1e3,{r,g:i,b:a}=e.fogColor,o=new z().setRGB(r,i,a).convertSRGBToLinear(),s=[];for(let t of e.fogVolumes)t.visibleDistance<=0||t.maxHeight<=t.minHeight||s.push({visibleDistance:t.visibleDistance,minHeight:t.minHeight,maxHeight:t.maxHeight,percentage:1});return{fogDistance:t,visibleDistance:n,fogColor:o,fogVolumes:s,fogLine:s.reduce((e,t)=>Math.max(e,t.maxHeight),0),enabled:n>t}}var kn=C(`Sky`),An=!1;function jn(e){return[new z().setRGB(e.r,e.g,e.b),new z().setRGB(e.r,e.g,e.b).convertSRGBToLinear()]}function Mn(e){let t=(0,q.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`detailMapList`,e],queryFn:()=>(kn.debug(`Loading detail map list: %s`,e),Be(e))},t[0]=e,t[1]=n);let r=u(n),i,a;return t[2]!==e||t[3]!==r.data||t[4]!==r.error||t[5]!==r.status?(i=()=>{kn.debug(`DML query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (${r.data.length} entries)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=e,t[3]=r.data,t[4]=r.error,t[5]=r.status,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,K.useEffect)(i,a),r}var Nn=60;function Pn({skyBoxFiles:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=dt(e,{path:``}),a=!!t,s=(0,K.useMemo)(()=>r.projectionMatrixInverse,[r]),c=(0,K.useMemo)(()=>n?nt(n.fogVolumes):new Float32Array(12),[n]),l=(0,K.useRef)({skybox:{value:i},fogColor:{value:t??new z(0,0,0)},enableFog:{value:a},inverseProjectionMatrix:{value:s},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:ot.cameraHeight,fogVolumeData:{value:c},horizonFogHeight:{value:.18}}),u=(0,K.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return Nn/Math.sqrt(e*e+Nn*Nn)},[n]);return(0,K.useEffect)(()=>{l.current.skybox.value=i,l.current.fogColor.value=t??new z(0,0,0),l.current.enableFog.value=a,l.current.fogVolumeData.value=c,l.current.horizonFogHeight.value=u},[i,t,a,c,u]),(0,J.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,J.jsxs)(`bufferGeometry`,{children:[(0,J.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,J.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,J.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function Fn(e){let t=(0,q.c)(6),{materialList:n,fogColor:r,fogState:i}=e,{data:a}=Mn(n),o;t[0]===a?o=t[1]:(o=a?[G(a[1]),G(a[3]),G(a[4]),G(a[5]),G(a[0]),G(a[2])]:null,t[0]=a,t[1]=o);let s=o;if(!s)return null;let c;return t[2]!==r||t[3]!==i||t[4]!==s?(c=(0,J.jsx)(Pn,{skyBoxFiles:s,fogColor:r,fogState:i}),t[2]=r,t[3]=i,t[4]=s,t[5]=c):c=t[5],c}function In({skyColor:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=!!t,a=(0,K.useMemo)(()=>r.projectionMatrixInverse,[r]),s=(0,K.useMemo)(()=>n?nt(n.fogVolumes):new Float32Array(12),[n]),c=(0,K.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return Nn/Math.sqrt(e*e+Nn*Nn)},[n]),l=(0,K.useRef)({skyColor:{value:e},fogColor:{value:t??new z(0,0,0)},enableFog:{value:i},inverseProjectionMatrix:{value:a},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:ot.cameraHeight,fogVolumeData:{value:s},horizonFogHeight:{value:c}});return(0,K.useEffect)(()=>{l.current.skyColor.value=e,l.current.fogColor.value=t??new z(0,0,0),l.current.enableFog.value=i,l.current.fogVolumeData.value=s,l.current.horizonFogHeight.value=c},[e,t,i,s,c]),(0,J.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,J.jsxs)(`bufferGeometry`,{children:[(0,J.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,J.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,J.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function Ln(e,t){let{fogDistance:n,visibleDistance:r}=e;return[n,r]}function Rn({fogState:e,enabled:t}){let n=o(e=>e.scene),r=o(e=>e.camera),i=(0,K.useRef)(null),s=(0,K.useMemo)(()=>nt(e.fogVolumes),[e.fogVolumes]);return(0,K.useEffect)(()=>{An||=(at(),!0)},[]),(0,K.useEffect)(()=>{it();let[t,a]=Ln(e,r.position.y),o=new O(e.fogColor,t,a);return n.fog=o,i.current=o,tt(r.position.y,s),()=>{n.fog=null,i.current=null,it()}},[n,r,e,s]),(0,K.useEffect)(()=>{let n=i.current;if(n)if(t){let[t,i]=Ln(e,r.position.y);n.near=t,n.far=i}else n.near=1e10,n.far=1e10},[t,e,r.position.y]),a(()=>{let n=i.current;if(!n)return;let a=r.position.y;if(tt(a,s,t),t){let[t,r]=Ln(e,a);n.near=t,n.far=r,n.color.copy(e.fogColor)}}),null}var zn=(0,K.memo)(function({entity:e}){let{skyData:t}=e;kn.debug(`Rendering: materialList=%s, useSkyTextures=%s`,t.materialList,t.useSkyTextures);let{fogEnabled:n}=c(),r=t.materialList||void 0,i=(0,K.useMemo)(()=>jn(t.skySolidColor),[t.skySolidColor]),a=t.useSkyTextures,s=(0,K.useMemo)(()=>On(t),[t]);kn.debug(`fogState: fogColor=(%s, %s, %s) visibleDistance=%d fogDistance=%d enabled=%s volumes=%d`,t.fogColor.r.toFixed(3),t.fogColor.g.toFixed(3),t.fogColor.b.toFixed(3),t.visibleDistance,t.fogDistance,s.enabled,s.fogVolumes.length);let l=(0,K.useMemo)(()=>jn(t.fogColor),[t.fogColor]),u=i||l,d=s.enabled&&n,f=s.fogColor,p=o(e=>e.scene),m=o(e=>e.gl);(0,K.useEffect)(()=>{if(d){let e=f.clone();p.background=e,m.setClearColor(e)}else if(u){let e=u[0].clone();p.background=e,m.setClearColor(e)}else p.background=null;return()=>{p.background=null}},[p,m,d,f,u]);let h=i?.[1];return(0,J.jsxs)(J.Fragment,{children:[r&&a&&r.length>0?(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(Fn,{materialList:r,fogColor:d?f:void 0,fogState:d?s:void 0},r)}):h?(0,J.jsx)(In,{skyColor:h,fogColor:d?f:void 0,fogState:d?s:void 0}):null,(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(Tn,{scene:t})}),s.enabled?(0,J.jsx)(Rn,{fogState:s,enabled:n}):null]})});function Bn(e){let t=(0,q.c)(3),{children:n}=e,{audioEnabled:r}=c(),i;return t[0]!==r||t[1]!==n?(i=r?(0,J.jsx)(K.Suspense,{children:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}function Z(e,t){let n=(0,K.lazy)(()=>t().then(t=>({default:t[e]}))),r=t=>{let r=(0,q.c)(5),{entity:i}=t,a=`${e}:${i.id}`,o;r[0]===i?o=r[1]:(o=(0,J.jsx)(n,{entity:i}),r[0]=i,r[1]=o);let s;return r[2]!==a||r[3]!==o?(s=(0,J.jsx)(Ye,{name:a,children:o}),r[2]=a,r[3]=o,r[4]=s):s=r[4],s};return r.displayName=`createLazy(${e})`,r}var Vn=Z(`PlayerModel`,()=>W(()=>import(`./PlayerModel-b1ACWo31.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34]))),Hn=Z(`ExplosionShape`,()=>W(()=>import(`./ShapeModel-_aaRf60T.js`),__vite__mapDeps([35,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,34]))),Un=Z(`TracerProjectile`,()=>W(()=>import(`./Projectiles-DDA1oztB.js`),__vite__mapDeps([36,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29]))),Wn=Z(`SpriteProjectile`,()=>W(()=>import(`./Projectiles-DDA1oztB.js`),__vite__mapDeps([36,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29]))),Gn=Z(`ForceFieldBare`,()=>W(()=>import(`./ForceFieldBare-BzZ8rEsl.js`),__vite__mapDeps([37,1,3,4,5,6,7,14,15,16,32,12,29,11]))),Kn=Z(`AudioEmitter`,()=>W(()=>import(`./AudioEmitter-CDgumTuJ.js`),__vite__mapDeps([31,1,4,5,6,7,14,15,16,12,30,22,18,24,25,9,10,11,13,17,19,20,21,23,26,27,29]))),qn=Z(`WaterBlock`,()=>W(()=>import(`./WaterBlock-C_DD6ULb.js`),__vite__mapDeps([38,1,26,3,4,5,6,7,14,15,16,28,29,11,12,20]))),Jn=Z(`WeaponModel`,()=>W(()=>import(`./ShapeModel-_aaRf60T.js`),__vite__mapDeps([35,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,34]))),Yn=(0,K.memo)(function(e){let t=(0,q.c)(26),{entity:n}=e;switch(n.renderType){case`Shape`:{let e;return t[0]===n?e=t[1]:(e=(0,J.jsx)(Xn,{entity:n}),t[0]=n,t[1]=e),e}case`ForceFieldBare`:{let e;return t[2]===n?e=t[3]:(e=(0,J.jsx)(Gn,{entity:n}),t[2]=n,t[3]=e),e}case`Player`:{let e;return t[4]===n?e=t[5]:(e=(0,J.jsx)(Vn,{entity:n}),t[4]=n,t[5]=e),e}case`Explosion`:{let e;return t[6]===n?e=t[7]:(e=(0,J.jsx)(Hn,{entity:n}),t[6]=n,t[7]=e),e}case`Tracer`:{let e;return t[8]===n?e=t[9]:(e=(0,J.jsx)(Un,{entity:n}),t[8]=n,t[9]=e),e}case`Sprite`:{let e;return t[10]===n?e=t[11]:(e=(0,J.jsx)(Wn,{entity:n}),t[10]=n,t[11]=e),e}case`AudioEmitter`:{let e;return t[12]===n?e=t[13]:(e=(0,J.jsx)(Bn,{children:(0,J.jsx)(Kn,{entity:n})}),t[12]=n,t[13]=e),e}case`Camera`:{let e;return t[14]===n?e=t[15]:(e=(0,J.jsx)(St,{entity:n}),t[14]=n,t[15]=e),e}case`WayPoint`:{let e;return t[16]===n?e=t[17]:(e=(0,J.jsx)(Ct,{entity:n}),t[16]=n,t[17]=e),e}case`TerrainBlock`:{let e;return t[18]===n.terrainData?e=t[19]:(e=(0,J.jsx)(qt,{scene:n.terrainData}),t[18]=n.terrainData,t[19]=e),e}case`InteriorInstance`:{let e;return t[20]===n.interiorData?e=t[21]:(e=(0,J.jsx)(ln,{scene:n.interiorData}),t[20]=n.interiorData,t[21]=e),e}case`Sky`:{let e;return t[22]===n?e=t[23]:(e=(0,J.jsx)(zn,{entity:n}),t[22]=n,t[23]=e),e}case`Sun`:return null;case`WaterBlock`:{let e;return t[24]===n?e=t[25]:(e=(0,J.jsx)(qn,{entity:n}),t[24]=n,t[25]=e),e}case`MissionArea`:return null;case`None`:return null;default:return null}});function Xn(e){let t=(0,q.c)(24),{entity:n}=e,{animationEnabled:r}=c(),i=(0,K.useRef)(null),o;if(t[0]!==r||t[1]!==n.rotate?(o=()=>{if(!i.current||!n.rotate||!r)return;let e=performance.now()/1e3;i.current.rotation.y=e/3*Math.PI*2},t[0]=r,t[1]=n.rotate,t[2]=o):o=t[2],a(o),!n.shapeName)throw Error(`Shape entity missing shapeName: ${n.id}`);let s=n.runtimeObject,l=n.shapeType??`StaticShape`,u=n.dataBlock?.toLowerCase()===`flag`,d=n.teamId&&n.teamId>0?S[n.teamId]:null,f=u&&d?`${d} Flag`:null,p=n.shapeType===`Item`?`pink`:n.threads?`#00ff88`:`yellow`,m=n.rotate?i:void 0,h=s?void 0:n,_;t[3]===f?_=t[4]:(_=f?(0,J.jsx)(Je,{opacity:.6,children:f}):null,t[3]=f,t[4]=_);let y;t[5]!==p||t[6]!==h||t[7]!==_?(y=(0,J.jsx)(g,{loadingColor:p,streamEntity:h,children:_}),t[5]=p,t[6]=h,t[7]=_,t[8]=y):y=t[8];let b;t[9]!==n.barrelShapeName||t[10]!==s?(b=n.barrelShapeName&&(0,J.jsx)(x,{object:s,shapeName:n.barrelShapeName,type:`Turret`,children:(0,J.jsx)(`group`,{position:[0,1.5,0],children:(0,J.jsx)(g,{})})}),t[9]=n.barrelShapeName,t[10]=s,t[11]=b):b=t[11];let C;t[12]===n?C=t[13]:(C=n.weaponShape&&(0,J.jsx)(st,{fallback:(0,J.jsx)(v,{color:`red`,label:n.weaponShape}),children:(0,J.jsx)(Ye,{name:`Weapon:${n.id}/${n.weaponShape}`,fallback:(0,J.jsx)(v,{color:`cyan`,label:n.weaponShape}),children:(0,J.jsx)(Jn,{entity:n})})}),t[12]=n,t[13]=C);let w;t[14]!==m||t[15]!==y||t[16]!==b||t[17]!==C?(w=(0,J.jsxs)(`group`,{ref:m,children:[y,b,C]}),t[14]=m,t[15]=y,t[16]=b,t[17]=C,t[18]=w):w=t[18];let T;return t[19]!==n.shapeName||t[20]!==l||t[21]!==w||t[22]!==s?(T=(0,J.jsx)(x,{object:s,shapeName:n.shapeName,type:l,children:w}),t[19]=n.shapeName,t[20]=l,t[21]=w,t[22]=s,t[23]=T):T=t[23],T}var Zn={Root:`_Root_1i0cm_1`,Top:`_Top_1i0cm_10 _Root_1i0cm_1`,Bottom:`_Bottom_1i0cm_15 _Root_1i0cm_1`,IffArrow:`_IffArrow_1i0cm_20`,Name:`_Name_1i0cm_27`,HealthBar:`_HealthBar_1i0cm_35`,HealthFill:`_HealthFill_1i0cm_44`},Qn=150,$n=.1,er=-.2,tr=G(`gui/hud_alliedtriangle`),nr=G(`gui/hud_enemytriangle`),rr=[];function ir(e){let t=(0,q.c)(23),{entity:n}=e,r=_(n.shapeName??n.dataBlock),i;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(i={fadeDistance:Qn},t[0]=i):i=t[0];let{groupRef:o,isVisible:s,opacityRef:c}=qe(i),l=(0,K.useRef)(null),u=(0,K.useRef)(null),d=(0,K.useRef)(null),f=(0,K.useRef)(null),p=(0,K.useRef)(null),m;t[1]===r.scene?m=t[2]:(m=new B().setFromObject(r.scene),t[1]=r.scene,t[2]=m);let g=m.max.y+$n,v=n.keyframes??rr,y;t[3]===v?y=t[4]:(y=v.some(ar),t[3]=v,t[4]=y);let b=y,x;t[5]!==n.id||t[6]!==n.iffColor||t[7]!==n.playerName||t[8]!==b||t[9]!==s||t[10]!==v||t[11]!==c?(x=()=>{if(!s)return;let e=h(v,Ze.getState().time),t=e?.health??1;if(e?.damageState!=null&&e.damageState>=1){l.current&&(l.current.style.opacity=`0`),u.current&&(u.current.style.opacity=`0`);return}let r=c.current;if(l.current&&(l.current.style.opacity=r),u.current&&(u.current.style.opacity=r),p.current){let e=n.playerName??n.id;p.current.textContent!==e&&(p.current.textContent=e)}if(f.current&&n.iffColor){let e=n.iffColor.r>n.iffColor.g?nr:tr;f.current.getAttribute(`src`)!==e&&(f.current.src=e)}d.current&&b&&(d.current.style.width=`${Math.max(0,Math.min(100,t*100))}%`,d.current.style.background=n.iffColor?`rgb(${n.iffColor.r}, ${n.iffColor.g}, ${n.iffColor.b})`:``)},t[5]=n.id,t[6]=n.iffColor,t[7]=n.playerName,t[8]=b,t[9]=s,t[10]=v,t[11]=c,t[12]=x):x=t[12],a(x);let S=n.iffColor&&n.iffColor.r>n.iffColor.g?nr:tr,C;t[13]!==n.id||t[14]!==n.playerName||t[15]!==b||t[16]!==g||t[17]!==S||t[18]!==s?(C=s&&(0,J.jsxs)(J.Fragment,{children:[(0,J.jsx)(Ge,{position:[0,g,0],center:!0,children:(0,J.jsx)(`div`,{ref:l,className:Zn.Top,children:(0,J.jsx)(`img`,{ref:f,className:Zn.IffArrow,src:S,alt:``})})}),(0,J.jsx)(Ge,{position:[0,er,0],center:!0,children:(0,J.jsxs)(`div`,{ref:u,className:Zn.Bottom,children:[(0,J.jsx)(`div`,{ref:p,className:Zn.Name,children:n.playerName??n.id}),b&&(0,J.jsx)(`div`,{className:Zn.HealthBar,children:(0,J.jsx)(`div`,{ref:d,className:Zn.HealthFill})})]})})]}),t[13]=n.id,t[14]=n.playerName,t[15]=b,t[16]=g,t[17]=S,t[18]=s,t[19]=C):C=t[19];let w;return t[20]!==o||t[21]!==C?(w=(0,J.jsx)(`group`,{ref:o,children:C}),t[20]=o,t[21]=C,t[22]=w):w=t[22],w}function ar(e){return e.health!=null}var or={Root:`_Root_yuidw_1`,Distance:`_Distance_yuidw_9`,Icon:`_Icon_yuidw_18`},sr=1.5,cr=G(`commander/MiniIcons/com_flag_grey`),lr=new R;function ur(e){let t=(0,q.c)(9),{entity:n}=e,r=(0,K.useRef)(null),i=(0,K.useRef)(null),s=(0,K.useRef)(null),c=o(dr),l;t[0]!==c||t[1]!==n.iffColor?(l=()=>{if(i.current&&n.iffColor){let{r:e,g:t,b:r}=n.iffColor;i.current.style.backgroundColor=`rgb(${e},${t},${r})`}if(s.current&&r.current){r.current.getWorldPosition(lr);let e=c.position.distanceTo(lr);s.current.textContent=e.toFixed(1)}},t[0]=c,t[1]=n.iffColor,t[2]=l):l=t[2],a(l);let u=n.iffColor?`rgb(${n.iffColor.r},${n.iffColor.g},${n.iffColor.b})`:`rgb(200,200,200)`,d;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(d=[0,sr,0],t[3]=d):d=t[3];let f;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,J.jsx)(`span`,{ref:s,className:or.Distance}),t[4]=f):f=t[4];let p;t[5]===u?p=t[6]:(p={backgroundColor:u,"--flag-icon-url":`url(${cr})`},t[5]=u,t[6]=p);let m=p,h;return t[7]===m?h=t[8]:(h=(0,J.jsx)(`group`,{ref:r,children:(0,J.jsx)(Ge,{position:d,center:!0,children:(0,J.jsxs)(`div`,{className:or.Root,children:[f,(0,J.jsx)(`div`,{ref:i,className:or.Icon,style:m})]})})}),t[7]=m,t[8]=h),h}function dr(e){return e.camera}function fr(){let e=(0,q.c)(1),t=pr,n;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=(0,J.jsx)(`group`,{ref:t,children:(0,J.jsx)(mr,{})}),e[0]=n):n=e[0],n}function pr(e){Ze.setState({root:e})}var mr=(0,K.memo)(function(){let e=ye(),t=(0,K.useRef)(new Map).current,n=new Set;for(let r of e)n.add(r.id),t.set(r.id,r);for(let e of t.keys())n.has(e)||t.delete(e);return(0,J.jsx)(J.Fragment,{children:[...t.values()].map(e=>(0,J.jsx)(hr,{entity:e},e.id))})}),hr=(0,K.memo)(function(e){let t=(0,q.c)(7),{entity:n}=e;if(Xe(n)){let e;t[0]===n?e=t[1]:(e=(0,J.jsx)(Yn,{entity:n}),t[0]=n,t[1]=e);let r;return t[2]!==n.id||t[3]!==e?(r=(0,J.jsx)(`group`,{name:n.id,children:e}),t[2]=n.id,t[3]=e,t[4]=r):r=t[4],r}if(n.renderType===`None`)return null;let r;return t[5]===n?r=t[6]:(r=(0,J.jsx)(yr,{entity:n}),t[5]=n,t[6]=r),r});function gr(e){let t=(0,q.c)(2),{entity:n}=e,r=me(_r);if(n.id===r)return null;let i;return t[0]===n?i=t[1]:(i=(0,J.jsx)(ir,{entity:n}),t[0]=n,t[1]=i),i}function _r(e){return e.playback.streamSnapshot?.controlPlayerGhostId}function vr({entity:e}){let t=(0,K.useRef)(!1),[n,r]=(0,K.useState)(()=>(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0);return t.current=n,a(()=>{let n=(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0;n!==t.current&&(t.current=n,r(n))}),n?(0,J.jsx)(ur,{entity:e}):null}function yr(e){let t=(0,q.c)(39),{entity:n}=e,r=n.position,i=n.scale,a;bb0:{if(!n.rotation){a=void 0;break bb0}let e;t[0]===n.rotation?e=t[1]:(e=new re(...n.rotation),t[0]=n.rotation,t[1]=e),a=e}let o=a,s=n.renderType===`Player`;if(n.renderType===`Shape`&&!n.shapeName){let e=n.id,a;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(a=(0,J.jsx)(`sphereGeometry`,{args:[.3,6,4]}),t[2]=a):a=t[2];let s;t[3]===n.className?s=t[4]:(s=y(n.className),t[3]=n.className,t[4]=s);let c;t[5]===s?c=t[6]:(c=(0,J.jsxs)(`mesh`,{children:[a,(0,J.jsx)(`meshBasicMaterial`,{color:s,wireframe:!0})]}),t[5]=s,t[6]=c);let l;t[7]===n?l=t[8]:(l=(0,J.jsx)(vr,{entity:n}),t[7]=n,t[8]=l);let u;return t[9]!==n.id||t[10]!==r||t[11]!==o||t[12]!==i||t[13]!==c||t[14]!==l?(u=(0,J.jsxs)(`group`,{name:e,position:r,quaternion:o,scale:i,children:[c,l]}),t[9]=n.id,t[10]=r,t[11]=o,t[12]=i,t[13]=c,t[14]=l,t[15]=u):u=t[15],u}let c;t[16]!==n.className||t[17]!==n.renderType?(c=n.renderType===`Explosion`?null:(0,J.jsxs)(`mesh`,{children:[(0,J.jsx)(`sphereGeometry`,{args:[.5,8,6]}),(0,J.jsx)(`meshBasicMaterial`,{color:y(n.className),wireframe:!0})]}),t[16]=n.className,t[17]=n.renderType,t[18]=c):c=t[18];let l=c,u;t[19]===n?u=t[20]:(u=(0,J.jsx)(Yn,{entity:n}),t[19]=n,t[20]=u);let d;t[21]!==l||t[22]!==u?(d=(0,J.jsx)(st,{fallback:l,children:u}),t[21]=l,t[22]=u,t[23]=d):d=t[23];let f;t[24]!==n||t[25]!==s?(f=s&&(0,J.jsx)(gr,{entity:n}),t[24]=n,t[25]=s,t[26]=f):f=t[26];let p;t[27]===n?p=t[28]:(p=(0,J.jsx)(vr,{entity:n}),t[27]=n,t[28]=p);let m;t[29]!==d||t[30]!==f||t[31]!==p?(m=(0,J.jsxs)(`group`,{name:`model`,children:[d,f,p]}),t[29]=d,t[30]=f,t[31]=p,t[32]=m):m=t[32];let h;return t[33]!==n.id||t[34]!==r||t[35]!==o||t[36]!==i||t[37]!==m?(h=(0,J.jsx)(`group`,{name:n.id,position:r,quaternion:o,scale:i,children:m}),t[33]=n.id,t[34]=r,t[35]=o,t[36]=i,t[37]=m,t[38]=h):h=t[38],h}function br(){let e=(0,q.c)(3),{fov:t}=c(),n;e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=[0,256,0],e[0]=n):n=e[0];let r;return e[1]===t?r=e[2]:(r=(0,J.jsx)(ut,{makeDefault:!0,position:n,fov:t}),e[1]=t,e[2]=r),r}function xr(e){let t=(0,q.c)(3),{children:n}=e,{debugMode:r}=l(),i;return t[0]!==n||t[1]!==r?(i=r?(0,J.jsx)(K.Suspense,{children:n}):null,t[0]=n,t[1]=r,t[2]=i):i=t[2],i}var Sr=C(`InputConsumer`),Cr=270,wr=Math.PI/2-.01,Tr=45,Er=31,Dr=40,Or=1/32,kr=2*Math.PI;function Ar(e){return((Math.round(e/kr*65536)|0)<<16>>16)*kr/65536}var jr=new R,Mr=new R,Nr=new R,Pr=new M(0,0,0,`YXZ`);function Fr(e,t,n,r,i,a,o){if(r===0&&i===0&&a===0)return;let s=Math.sin(t),c=Math.cos(t),l=Math.sin(n),u=Math.cos(n),d=o*Or;e.x+=(c*r+s*u*i+s*l*a)*d,e.y+=(-s*r+c*u*i+c*l*a)*d,e.z+=(-l*i+u*a)*d}function Ir(){let{moveQueue:e,mode:t,setMode:n}=Me(),r=he(e=>e.adapter),i=he(e=>e.gameStatus),s=he(e=>e.liveReady),c=he(e=>e.sendMoves),l=pe(),u=o(e=>e.camera),d=m(),f=(0,K.useRef)(null),h=(0,K.useRef)([]),g=(0,K.useRef)(0),_=(0,K.useRef)(0),v=(0,K.useRef)(null),y=(0,K.useRef)(0),b=(0,K.useRef)(0),x=(0,K.useRef)({x:0,y:0,z:0}),S=(0,K.useRef)(0),C=(0,K.useRef)(0),w=(0,K.useRef)({x:0,y:0,z:0}),T=(0,K.useRef)(!1),D=(0,K.useRef)({x:0,y:0,z:0}),O=(0,K.useRef)({x:0,y:0,z:0}),k=(0,K.useRef)(!1),A=(0,K.useRef)(null),j=(0,K.useRef)(0),M=(0,K.useRef)(0),N=(0,K.useRef)(0),ee=(0,K.useRef)(0),P=(0,K.useRef)(0),F=(0,K.useRef)([!1,!1,!1,!1,!1,!1]),I=!!r&&(i===`connected`||i===`authenticating`);return(0,K.useEffect)(()=>{if(I&&r){if(f.current===r)return;Sr.info(`wiring adapter to engine store`);let e=De.getState(),t={source:`live`,duration:1/0,missionName:e.mapName??null,gameType:null,serverDisplayName:e.serverName??null,recorderName:e.warriorName??null,recordingDate:null,streamingPlayback:r};l.getState().setRecording(t),l.getState().setPlaybackStatus(`playing`),f.current=r,T.current=!1,k.current=!1,A.current=null,h.current.length=0,g.current=0,_.current=0,v.current=null,n(`fly`)}else !I&&f.current&&(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),f.current=null,T.current=!1,k.current=!1,A.current=null,h.current.length=0,n(`local`))},[I,r,l,n]),(0,K.useEffect)(()=>{!s&&f.current&&(Sr.info(`mission change: resetting prediction state and mode`),T.current=!1,k.current=!1,A.current=null,h.current.length=0,g.current=0,_.current=0,v.current=null,j.current=0,M.current=0,N.current=0,ee.current=0,P.current=0,F.current.fill(!1),n(`fly`))},[s,n]),(0,K.useEffect)(()=>{if(!I)return Ze.subscribe(e=>{n(e.cameraMode===`orbitOverride`?`follow`:`local`)})},[I,n]),p(()=>{if(!f.current||i!==`connected`||!s)return;let e=j.current,t=M.current;j.current=0,M.current=0;let n=N.current,r=ee.current,a=P.current;N.current=0,ee.current=0,P.current=0;let o=[...F.current];F.current.fill(!1);let l=Ar(e),u=Ar(t);y.current+=l-e,b.current+=u-t,S.current=y.current,C.current=b.current,w.current={...x.current};let d=Dr*2,p=y.current-l,m=b.current-u;Fr(x.current,p,m,n,r,a,d),o[1]=!0;let _=g.current++,v={x:n,y:r,z:a,yaw:e,pitch:t,roll:0,trigger:o,freeLook:!1},T=h.current;T.push({moveIndex:_,move:v,yaw:l,pitch:u,x:n,y:r,z:a}),T.length>Tr&&T.splice(0,T.length-Tr);let E=f.current.lastMoveAck;for(;T.length>0&&T[0].moveIndex<E;)T.shift();if(T.length>0){let e=T.slice(0,Er);c(e.map(e=>e.move),e[0].moveIndex)}let I=f.current.getSnapshot();if(I!==A.current){A.current=I;let e=I?.camera;if(e?.orbitTargetId){let t=I.entities.find(t=>t.id===e.orbitTargetId);t?.position&&(D.current={...O.current},O.current={x:t.position[0],y:t.position[1],z:t.position[2]},k.current||=(D.current={...O.current},!0))}}}),a((r,a)=>{let o=e.current;if(o.length>0){let t=0,n=0,r=0,a=0,c=0,l=0,d=[!1,!1,!1,!1,!1,!1];for(let e of o){t+=e.deltaYaw,n+=e.deltaPitch,Math.abs(e.x)>Math.abs(r)&&(r=e.x),Math.abs(e.y)>Math.abs(a)&&(a=e.y),Math.abs(e.z)>Math.abs(c)&&(c=e.z),l+=e.delta;for(let t=0;t<e.triggers.length;t++)e.triggers[t]&&(d[t]=!0)}if(e.current.length=0,I&&f.current&&i===`connected`&&s){j.current+=t,M.current+=n,N.current=r,ee.current=a,P.current=c;for(let e=0;e<d.length;e++)d[e]&&(F.current[e]=!0);y.current+=t,b.current=Math.max(-E,Math.min(E,b.current+n))}else{let e=Ze.getState();if(e.playback){e.cameraMode===`freeFly`?Lr(u,t,n,r,a,c,l):e.cameraMode===`orbitOverride`&&(e.orbitOverrideYaw+=t,e.orbitOverridePitch=Math.max(-E,Math.min(E,e.orbitOverridePitch+n)));return}Lr(u,t,n,r,a,c,l);return}}if(!I||!f.current||i!==`connected`||!s)return;let c=f.current,l=c.getSnapshot(),p=l?.camera;if(p&&p!==v.current&&typeof p.yaw==`number`&&typeof p.pitch==`number`){v.current=p;let e=c.lastMoveAck;if(e>_.current){_.current=e;let t=h.current;for(;t.length>0&&t[0].moveIndex<e;)t.shift()}y.current=p.yaw,b.current=p.pitch,x.current={x:p.position[0],y:p.position[1],z:p.position[2]};let r=Dr*2;for(let e of h.current)Fr(x.current,y.current,b.current,e.x,e.y,e.z,r),y.current+=e.yaw,b.current=Math.max(-E,Math.min(E,b.current+e.pitch));y.current+=j.current,b.current=Math.max(-E,Math.min(E,b.current+M.current)),S.current=y.current,C.current=b.current,w.current={...x.current},T.current=!0;let i=p.mode===`third-person`?`follow`:`fly`;if(i!==t&&(Sr.info(`server corrected observer mode: %s → %s`,t,i),n(i),f.current&&(f.current.observerMode=i),i===`fly`&&(k.current=!1,A.current=null)),p.orbitTargetId&&!k.current){let e=l.entities.find(e=>e.id===p.orbitTargetId);if(e?.position){let t={x:e.position[0],y:e.position[1],z:e.position[2]};O.current=t,D.current={...t},k.current=!0}}}if(T.current){if(t===`fly`)Rr(r.camera,w.current,x.current,y.current,b.current,d());else if(t===`follow`){if(!k.current)return;zr(r.camera,D.current,O.current,y.current,b.current,d(),p?.orbitDistance??4,p?.orbitTargetId)}}}),(0,K.useEffect)(()=>()=>{f.current&&=(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),null)},[l]),null}function Lr(e,t,n,r,i,a,o){if((t!==0||n!==0)&&(Pr.setFromQuaternion(e.quaternion,`YXZ`),Pr.y-=t,Pr.x-=n,Pr.x=Math.max(-wr,Math.min(wr,Pr.x)),e.quaternion.setFromEuler(Pr)),r!==0||i!==0||a!==0){e.getWorldDirection(jr),jr.normalize(),Mr.crossVectors(e.up,jr).normalize(),Nr.set(0,0,0),i!==0&&Nr.addScaledVector(jr,i),r!==0&&Nr.addScaledVector(Mr,-r),a!==0&&(Nr.y+=a);let t=Nr.length();t>0&&(Nr.multiplyScalar(Math.min(1,t)/t*Cr*o),e.position.add(Nr))}}function Rr(e,t,n,r,i,a){let o=t.x+(n.x-t.x)*a,s=t.y+(n.y-t.y)*a,c=t.z+(n.z-t.z)*a;e.position.set(s,c,o);let[l,u,d,f]=D(r,i);e.quaternion.set(l,u,d,f)}function zr(e,t,n,r,i,a,o,s){let c=t.x+(n.x-t.x)*a,l=t.y+(n.y-t.y)*a,u=t.z+(n.z-t.z)*a+(s!=null&&Ze.getState().entities.get(s)?.renderType===`Player`?1:0),d=Math.sin(i),f=Math.cos(i),p=Math.sin(r),m=Math.cos(r),h=Math.max(.1,o),g=c-p*f*h,_=l-m*f*h,v=u+d*h;e.position.set(_,v,g);let[y,b,x,S]=D(r,i);e.quaternion.set(y,b,x,S)}var Br=C(`CameraTourConsumer`);function Vr(e){return e<.5?4*e*e*e:1-(-2*e+2)**3/2}var Hr=3,Ur=2,Wr=1.8,Gr=1.8,Kr=1.2,qr=.6,Jr=3/4*(2*Math.PI),Yr=Jr/qr,Xr=1.5,Zr=1.5,Qr=6,$r=180,ei=1.4,ti=new B,ni=new B,ri=new B,ii=new le,ai=new R,oi=new R,si=new R,ci=new R,li=new R,Q=new re,ui=new re,di=new le,fi=new M;function pi(e){if(e.orbitCenter)return li.set(e.orbitCenter[0],e.orbitCenter[1],e.orbitCenter[2]);let t=e.targets[e.currentIndex];return li.set(t.position[0],t.position[1],t.position[2])}function mi(e){return e.orbitRadius??Hr}function hi(e){return mi(e)*(Ur/Hr)}function gi(e,t,n){let r=pi(e),i=mi(e),a=hi(e);return n.set(r.x+Math.cos(t)*i,r.y+a,r.z+Math.sin(t)*i)}function _i(e,t,n){let r=e.getObjectByName(t.entityId);if(r){ti.setFromObject(r),ti.getCenter(ai),n.orbitCenter=[ai.x,ai.y,ai.z];let e=di.copy(r.matrixWorld).invert();ni.makeEmpty(),r.traverse(t=>{t.geometry&&(t.geometry.boundingBox||t.geometry.computeBoundingBox(),ri.copy(t.geometry.boundingBox),ii.multiplyMatrices(e,t.matrixWorld),ri.applyMatrix4(ii),ni.union(ri))}),ni.getSize(oi);let i=oi.y,a=Math.max(oi.x,oi.z),o=i/2+Gr,s=a/2+Kr,c=Math.max(o,s);n.orbitRadius=Math.max(Wr,c);let l=o>=s?`height`:`spread`,u=c<Wr?` (clamped)`:``;Br.debug(`%s: size=%s height→%s spread→%s driven by %s → radius=%d%s`,t.label,`${oi.x.toFixed(1)}×${oi.y.toFixed(1)}×${oi.z.toFixed(1)}`,o.toFixed(1),s.toFixed(1),l,n.orbitRadius,u)}else n.orbitCenter=null,n.orbitRadius=null,Br.debug(`%s: no scene object, fallback radius=%d`,t.label,Hr)}function vi(e){return fi.setFromQuaternion(e,`YXZ`),fi.z=0,e.setFromEuler(fi)}function yi(e,t){return di.lookAt(e,t,ci.set(0,1,0)),ui.setFromRotationMatrix(di),vi(ui)}function bi(e,t,n){let r=pi(t),i=gi(t,n,si.clone()),a=e.distanceTo(i);if(a<20)return new ae([e.clone(),i],!1,`centripetal`);let o=new R().addVectors(e,i).multiplyScalar(.5);return o.lerp(r,.3),o.y+=a*.15,new ae([e.clone(),o,i],!1,`centripetal`)}function xi(e,t){let n=pi(t);return Math.atan2(e.z-n.z,e.x-n.x)}function Si(e){return Math.max(Zr,Math.min(Qr,e/$r))}function Ci(e,t,n,r){let i=e.targets[e.currentIndex];if(!e.curve){e.startPos=[t.position.x,t.position.y,t.position.z],vi(Q.copy(t.quaternion)),e.startQuat=[Q.x,Q.y,Q.z,Q.w],_i(r,i,e);let n=t.position.clone();e.curve=bi(n,e,xi(n,e)),e.phaseDuration=Si(e.curve.getLength()),e.elapsed=0;return}e.elapsed+=n;let a=Math.min(1,Vr(e.elapsed/e.phaseDuration));e.curve.getPointAt(a,si),t.position.copy(si);let o=Vr(Math.min(1,e.elapsed/e.phaseDuration*ei)),s=yi(si,pi(e));o<1&&e.startQuat?(Q.set(e.startQuat[0],e.startQuat[1],e.startQuat[2],e.startQuat[3]),Q.slerp(s,o),t.quaternion.copy(Q)):t.quaternion.copy(s),e.elapsed>=e.phaseDuration&&(e.phase=`orbiting`,e.elapsed=0,e.orbitStartAngle=xi(t.position,e))}function wi(e,t,n){let r=e.targets.length===1,i=e.currentIndex>=e.targets.length-1;e.elapsed+=n;let a=e.orbitStartAngle,o=Yr+Xr,s;if(e.elapsed<=Yr)s=a+e.elapsed*qr;else{let t=e.elapsed-Yr,n=Math.min(1,t/Xr),r=t*qr*(1-n/2);s=a+Jr+r}gi(e,s,si),t.position.copy(si);let c=yi(si,pi(e));t.quaternion.copy(c),e.elapsed>=o&&(r||i?T.getState().cancel():T.getState().advanceTarget())}function Ti(){let e=(0,q.c)(4),t=o(Ai),n=o(ki),r=o(Oi),i=(0,K.useRef)(null);Ie(`nextStop`,Di),Ie(`exitTour`,Ei);let s;return e[0]!==n||e[1]!==t||e[2]!==r?(s=(e,a)=>{let o=T.getState().animation;if(!o){i.current&&=(vi(n.quaternion),null);return}t(),i.current=o,o.phase===`traveling`?Ci(o,n,a,r):wi(o,n,a)},e[0]=n,e[1]=t,e[2]=r,e[3]=s):s=e[3],a(s),null}function Ei(){T.getState().cancel()}function Di(){let e=T.getState().animation;e&&(e.currentIndex>=e.targets.length-1?T.getState().cancel():T.getState().advanceTarget())}function Oi(e){return e.scene}function ki(e){return e.camera}function Ai(e){return e.invalidate}var ji=3;function $({map:e}){let t=je,n=o(e=>e.gl.domElement),r=(0,K.useMemo)(()=>{let n=e.map(e=>{let t=Array.isArray(e.keys)?e.keys:[e.keys];return{name:e.name,bindings:t.map(Oe)}}),r={};for(let e of n)r[e.name]=Ne(e.bindings[0]);let i=new Map,a=[],o=[],s=[],c=[],l=[];for(let e of n)for(let t of e.bindings)switch(t.type){case`key`:{let n=i.get(t.code);n||(n=[],i.set(t.code,n)),n.push({action:e,binding:t});break}case`click`:a.push({action:e,binding:t});break;case`drag`:o.push({action:e,binding:t});break;case`pointerLockMove`:s.push({action:e});break;case`scroll`:c.push({action:e});break;case`touch`:l.push({action:e});break}function u(e){return e==null?!0:e===!!document.pointerLockElement}function d(e){let{actions:n}=t.getState(),r={};for(let[,t]of i)for(let{action:i,binding:a}of t){let t=e.has(a.code)&&Pe(e,a.modifiers),o=n[i.name]?.pressed??!1;t&&!o?(r[i.name]={pressed:!0},we(i.name)):!t&&o&&(r[i.name]={pressed:!1})}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}let f=-1,p=0,m=0,h=!1;function g(e,n){t.setState(t=>({...t,actions:{...t.actions,[e]:n}}))}function _(e){let t=!!document.pointerLockElement;for(let{action:t,binding:n}of a){if(!u(n.whenPointerLocked))continue;let r=n.button??0;e.button===r&&Ce(e,n.modifiers)&&g(t.name,{pressed:!0})}t||(f=e.button,p=e.clientX,m=e.clientY,h=!1)}function v(e){if(document.pointerLockElement){if(s.length>0){let{actions:n}=t.getState(),r={};for(let{action:t}of s){let i=n[t.name];r[t.name]={...i,deltaX:i.deltaX+e.movementX,deltaY:i.deltaY+e.movementY}}t.setState(e=>({...e,actions:{...e.actions,...r}}))}return}if(f<0)return;if(!h){let n=e.clientX-p,r=e.clientY-m;if(Math.abs(n)<ji&&Math.abs(r)<ji)return;h=!0;for(let{action:e,binding:n}of a)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].pressed&&g(e.name,{pressed:!1});for(let{action:e,binding:t}of o)u(t.whenPointerLocked)&&(t.button??0)===f&&g(e.name,{dragging:!0,deltaX:0,deltaY:0,startX:p,startY:m})}let{actions:n}=t.getState(),r={};for(let{action:t,binding:i}of o){if(!u(i.whenPointerLocked)||(i.button??0)!==f)continue;let a=n[t.name];r[t.name]={...a,deltaX:a.deltaX+e.movementX,deltaY:a.deltaY+e.movementY}}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}function y(e){let n=!!document.pointerLockElement;for(let{action:n,binding:r}of a){if(!u(r.whenPointerLocked))continue;let i=r.button??0;e.button===i&&t.getState().actions[n.name].pressed&&(we(n.name),g(n.name,{pressed:!1}))}if(!n&&e.button===f){for(let{action:e,binding:n}of o)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].dragging&&g(e.name,Ae());f=-1,h=!1}}function b(e){for(let{action:t}of c)g(t.name,{deltaX:e.deltaX,deltaY:e.deltaY}),we(t.name)}let x=null,S=0,C=0;function w(e){if(x!==null||l.length===0)return;let t=e.changedTouches[0];if(t){x=t.identifier,S=t.clientX,C=t.clientY;for(let{action:e}of l)g(e.name,{touching:!0,dragging:!1,deltaX:0,deltaY:0})}}function T(e){if(x!==null)for(let n=0;n<e.changedTouches.length;n++){let r=e.changedTouches[n];if(r.identifier!==x)continue;let i=r.clientX-S,a=r.clientY-C;S=r.clientX,C=r.clientY;for(let{action:e}of l){let n=t.getState().actions[e.name];g(e.name,{touching:!0,dragging:!0,deltaX:n.deltaX+i,deltaY:n.deltaY+a})}break}}function E(e){if(x!==null){for(let t=0;t<e.changedTouches.length;t++)if(e.changedTouches[t].identifier===x){x=null;for(let{action:e}of l)g(e.name,Ee());break}}}return{actionNames:n.map(e=>e.name),initialActions:r,deriveKeyActions:d,hasKeyBindings:i.size>0,handleMouseDown:_,handleMouseMove:v,handleMouseUp:y,handleWheel:b,handleTouchStart:w,handleTouchMove:T,handleTouchEnd:E,hasMouseBindings:a.length>0||o.length>0||s.length>0,hasScrollBindings:c.length>0,hasTouchBindings:l.length>0}},[e,t]);return(0,K.useEffect)(()=>{t.setState(e=>({...e,actions:{...e.actions,...r.initialActions}}));let e;return r.hasKeyBindings&&(r.deriveKeyActions(t.getState().keys),e=t.subscribe(e=>e.keys,e=>r.deriveKeyActions(e))),r.hasMouseBindings&&(n.addEventListener(`mousedown`,r.handleMouseDown),document.addEventListener(`mousemove`,r.handleMouseMove),document.addEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.addEventListener(`wheel`,r.handleWheel,{passive:!0}),r.hasTouchBindings&&(n.addEventListener(`touchstart`,r.handleTouchStart,{passive:!0}),document.addEventListener(`touchmove`,r.handleTouchMove,{passive:!0}),document.addEventListener(`touchend`,r.handleTouchEnd,{passive:!0}),document.addEventListener(`touchcancel`,r.handleTouchEnd,{passive:!0})),()=>{e?.(),r.hasMouseBindings&&(n.removeEventListener(`mousedown`,r.handleMouseDown),document.removeEventListener(`mousemove`,r.handleMouseMove),document.removeEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.removeEventListener(`wheel`,r.handleWheel),r.hasTouchBindings&&(n.removeEventListener(`touchstart`,r.handleTouchStart),document.removeEventListener(`touchmove`,r.handleTouchMove),document.removeEventListener(`touchend`,r.handleTouchEnd),document.removeEventListener(`touchcancel`,r.handleTouchEnd)),t.setState(e=>{let t={...e.actions};for(let e of r.actionNames)delete t[e];return{...e,actions:t}})}},[r,t,n]),null}var Mi=[{name:`moveForward`,keys:[`KeyW`]},{name:`moveBackward`,keys:[`KeyS`]},{name:`moveLeft`,keys:[`KeyA`]},{name:`moveRight`,keys:[`KeyD`]},{name:`moveUp`,keys:[`KeyE`]},{name:`moveDown`,keys:[`KeyQ`]},{name:`adjustSpeed`,keys:[{type:`scroll`}]}],Ni=[{name:`lookUp`,keys:[`ArrowUp`]},{name:`lookDown`,keys:[`ArrowDown`]},{name:`lookLeft`,keys:[`ArrowLeft`]},{name:`lookRight`,keys:[`ArrowRight`]},{name:`dragLook`,keys:[{type:`drag`,button:0}]},{name:`lockedLook`,keys:[{type:`pointerLockMove`}]},{name:`touchLook`,keys:[{type:`touch`}]}],Pi=[{name:`canvasClick`,keys:[{type:`click`,button:0,whenPointerLocked:!1}]}],Fi=[{name:`camera1`,keys:[`Digit1`]},{name:`camera2`,keys:[`Digit2`]},{name:`camera3`,keys:[`Digit3`]},{name:`camera4`,keys:[`Digit4`]},{name:`camera5`,keys:[`Digit5`]},{name:`camera6`,keys:[`Digit6`]},{name:`camera7`,keys:[`Digit7`]},{name:`camera8`,keys:[`Digit8`]},{name:`camera9`,keys:[`Digit9`]}],Ii=[{name:`playPause`,keys:[`Space`]},{name:`decreasePlaybackSpeed`,keys:[`Comma`,`Shift-Comma`]},{name:`increasePlaybackSpeed`,keys:[`Period`,`Shift-Period`]}],Li=[{name:`toggleObserverMode`,keys:[`Space`]}],Ri=[{name:`nextPlayer`,keys:[{type:`click`,button:0,whenPointerLocked:!0}]}],zi=[{name:`nextStop`,keys:[{type:`click`,button:0}]},{name:`exitTour`,keys:[`Escape`]}];function Bi(){let e=(0,q.c)(27),t=ge(),n=ke(),r=w(Vi),i=t?.source===`demo`,a=t?.source===`live`,o=!t,s=o&&!r||a&&n===`fly`,c=!r,l=!r,u;e[0]===s?u=e[1]:(u=s&&(0,J.jsx)($,{map:Mi}),e[0]=s,e[1]=u);let d;e[2]===c?d=e[3]:(d=c&&(0,J.jsx)($,{map:Ni}),e[2]=c,e[3]=d);let f;e[4]===l?f=e[5]:(f=l&&(0,J.jsx)($,{map:Pi}),e[4]=l,e[5]=f);let p;e[6]!==o||e[7]!==r?(p=o&&!r&&(0,J.jsx)($,{map:Fi}),e[6]=o,e[7]=r,e[8]=p):p=e[8];let m;e[9]===i?m=e[10]:(m=i&&(0,J.jsx)($,{map:Ii}),e[9]=i,e[10]=m);let h;e[11]===a?h=e[12]:(h=a&&(0,J.jsx)($,{map:Li}),e[11]=a,e[12]=h);let g;e[13]!==n||e[14]!==a?(g=a&&n===`follow`&&(0,J.jsx)($,{map:Ri}),e[13]=n,e[14]=a,e[15]=g):g=e[15];let _;e[16]===r?_=e[17]:(_=r&&(0,J.jsx)($,{map:zi}),e[16]=r,e[17]=_);let v;return e[18]!==u||e[19]!==d||e[20]!==f||e[21]!==p||e[22]!==m||e[23]!==h||e[24]!==g||e[25]!==_?(v=(0,J.jsxs)(J.Fragment,{children:[u,d,f,p,m,h,g,_]}),e[18]=u,e[19]=d,e[20]=f,e[21]=p,e[22]=m,e[23]=h,e[24]=g,e[25]=_,e[26]=v):v=e[26],v}function Vi(e){return e.animation!==null}function Hi(e,t){return(0,K.lazy)(()=>t().then(t=>({default:t[e]})))}var Ui=Hi(`StreamingController`,()=>W(()=>import(`./StreamingController-DhVPkAKa.js`),__vite__mapDeps([39,1,9,10,11,12,4,5,6,7,13,14,15,16,17,18,19,20,21,22,23,2,3,8,24,25,26,27,28,29,30,31,0,32,33,34,40]))),Wi=Hi(`DebugElements`,()=>W(()=>import(`./DebugElements-BH7xXycL.js`),__vite__mapDeps([41,1,25,9,10,11,12,4,5,6,7,13,14,15,16,17,18,19,20,21,22,23,26,42]))),Gi=Hi(`Mission`,()=>W(()=>import(`./Mission-Bh6FfSDD.js`),__vite__mapDeps([43,1,9,10,11,12,4,5,6,7,13,14,15,16,17,18,19,20,21,22,23,44,8,29,45]))),Ki=Hi(`ChatSoundPlayer`,()=>W(()=>import(`./ChatSoundPlayer-emYEZuCd.js`),__vite__mapDeps([46,1,14,5,15,16,6,30,4,7,22,18,31,12,24,25,9,10,11,13,17,19,20,21,23,26,27,29]))),qi=(0,K.memo)(function(e){let t=(0,q.c)(23),{dpr:n,onCreated:r,missionName:i,missionType:a,onLoadingChange:o}=e,s=ge(),c=be(),l=c===`demo`||c===`live`,u,d;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(u=(0,J.jsx)(Bi,{}),d=(0,J.jsx)(Fe,{}),t[0]=u,t[1]=d):(u=t[0],d=t[1]);let f;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,J.jsx)(ht,{}),t[2]=f):f=t[2];let p,m;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(p=(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(fr,{})}),m=(0,J.jsx)(br,{}),t[3]=p,t[4]=m):(p=t[3],m=t[4]);let h;t[5]===Symbol.for(`react.memo_cache_sentinel`)?(h=(0,J.jsx)(Bn,{children:(0,J.jsx)(Ki,{})}),t[5]=h):h=t[5];let g;t[6]===Symbol.for(`react.memo_cache_sentinel`)?(g=(0,J.jsx)(xr,{children:(0,J.jsx)(Wi,{})}),t[6]=g):g=t[6];let _;t[7]===s?_=t[8]:(_=s?(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(Ui,{recording:s})}):null,t[7]=s,t[8]=_);let v;t[9]!==l||t[10]!==i||t[11]!==a||t[12]!==o?(v=l?null:(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(Gi,{name:i,missionType:a,onLoadingChange:o},`${i}~${a}`)}),t[9]=l,t[10]=i,t[11]=a,t[12]=o,t[13]=v):v=t[13];let y,x;t[14]===Symbol.for(`react.memo_cache_sentinel`)?(y=(0,J.jsx)(Ti,{}),x=(0,J.jsx)(Ir,{}),t[14]=y,t[15]=x):(y=t[14],x=t[15]);let S;t[16]!==_||t[17]!==v?(S=(0,J.jsx)(b,{children:(0,J.jsxs)(Te,{children:[u,d,(0,J.jsxs)(Ue,{children:[f,p,m,h,g,_,v,y,x]})]})}),t[16]=_,t[17]=v,t[18]=S):S=t[18];let C;return t[19]!==n||t[20]!==r||t[21]!==S?(C=(0,J.jsx)(xt,{dpr:n,onCreated:r,children:S}),t[19]=n,t[20]=r,t[21]=S,t[22]=C):C=t[22],C});export{qi as GameView};