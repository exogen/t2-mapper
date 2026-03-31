const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PlayerModel-DaX_n0Xh.js","assets/chunk-DECur_0Z.js","assets/Html-DrHEhPVE.js","assets/jsx-runtime-BpGWiA-R.js","assets/three.module-DRRYkRPO.js","assets/traditional-DhFuLw_p.js","assets/GenericShape-qKSaXNSk.js","assets/Texture-D7437V2F.js","assets/useBaseQuery-DZzv5LNT.js","assets/index-Dm6hBYn9.js","assets/preload-helper-yuLzSqLi.js","assets/streamHelpers-BvWKgQMn.js","assets/mission-JRomjECE.js","assets/logger-B058WGzf.js","assets/SettingsProvider-DVIFsPwe.js","assets/engineStore-DeZJbWme.js","assets/loaders-BhaVxgpz.js","assets/stringUtils-EmGsjr9D.js","assets/SettingsProvider-DAQByNim.css","assets/iconBase-BCRUFbxq.js","assets/JoystickContext-BJFVWHNC.js","assets/scene-6ZXksKVQ.js","assets/cameraTourStore-CDmCk75t.js","assets/index-BulUt8gq.css","assets/useAnisotropy-nhH7jNtm.js","assets/globalFogUniforms-CCW7odYy.js","assets/shapeMaterial-B0M2T1Ub.js","assets/DebugSuspense-CNky_EQQ.js","assets/ShapeErrorBoundary-75cvF0LI.js","assets/streamPlaybackStore-D-tkUWut.js","assets/PlayerModel-Bi7C0zGW.css","assets/ShapeModel-eZvNJsLY.js","assets/Projectiles-DlNks7l0.js","assets/ForceFieldBare-DMinQDX-.js","assets/AudioEmitter-BuCRagwl.js","assets/WaterBlock-D0vGBv3d.js","assets/StreamingController-BLcsIID1.js","assets/gameEntityTypes-n-ppAY7z.js","assets/DebugElements-DXesdZsb.js","assets/DebugElements-BP0b5jan.css","assets/Mission-DUBV2Clg.js","assets/useQuery-BxM2Gp2t.js","assets/misToScene-BZgvLXYv.js","assets/ChatSoundPlayer-CeH36_2V.js"])))=>i.map(i=>d[i]);
import{r as e}from"./chunk-DECur_0Z.js";import{n as t,r as n,t as r}from"./jsx-runtime-BpGWiA-R.js";import{c as i,n as a,o,r as s,s as c,t as l}from"./Html-DrHEhPVE.js";import{_ as u,a as d,i as f,y as p}from"./SettingsProvider-DVIFsPwe.js";import{t as m}from"./useQuery-BxM2Gp2t.js";import{D as h,E as g,O as _,S as v,T as y,d as b,n as x,t as S,w as C}from"./GenericShape-qKSaXNSk.js";import{f as w,o as T,p as E,s as D,t as O,u as k}from"./loaders-BhaVxgpz.js";import{t as A}from"./stringUtils-EmGsjr9D.js";import{A as j,At as M,C as ee,Dt as N,E as P,Et as F,Gt as te,Ht as ne,K as I,M as re,O as L,Ot as ie,S as ae,St as oe,Ut as R,Vt as se,_ as ce,b as z,f as B,h as le,k as ue,lt as V,m as de,nt as fe,v as pe,w as me}from"./three.module-DRRYkRPO.js";import{t as he}from"./logger-B058WGzf.js";import"./mission-JRomjECE.js";import{a as ge}from"./engineStore-DeZJbWme.js";import{t as _e}from"./Texture-D7437V2F.js";import{t as H}from"./preload-helper-yuLzSqLi.js";import{n as ve,t as U}from"./cameraTourStore-CDmCk75t.js";import{t as W,x as ye}from"./streamHelpers-BvWKgQMn.js";import{n as be,r as xe,t as Se}from"./scene-6ZXksKVQ.js";import{A as Ce,D as we,F as Te,I as Ee,M as De,N as Oe,R as ke,_ as Ae,a as je,c as Me,g as Ne,i as Pe,k as Fe,l as Ie,m as Le,n as Re,o as ze,p as Be,r as Ve,s as He,t as Ue,u as We,z as Ge}from"./index-Dm6hBYn9.js";import{i as Ke,n as qe,o as Je,r as Ye,s as Xe,t as Ze}from"./globalFogUniforms-CCW7odYy.js";import{a as Qe,i as $e,r as et}from"./shapeMaterial-B0M2T1Ub.js";import{t as tt}from"./DebugSuspense-CNky_EQQ.js";import{t as nt}from"./gameEntityTypes-n-ppAY7z.js";import{n as rt}from"./streamPlaybackStore-D-tkUWut.js";import{a as it,i as at,n as ot,t as st}from"./useAnisotropy-nhH7jNtm.js";import{t as ct}from"./ShapeErrorBoundary-75cvF0LI.js";var G=e(n());function lt(e,t,n){let r=i(e=>e.size),a=i(e=>e.viewport),o=typeof e==`number`?e:r.width*a.dpr,s=typeof t==`number`?t:r.height*a.dpr,c=(typeof e==`number`?n:e)||{},{samples:l=0,depth:u,...d}=c,f=u??c.depthBuffer,p=G.useMemo(()=>{let e=new te(o,s,{minFilter:I,magFilter:I,type:re,...d});return f&&(e.depthTexture=new me(o,s,ue)),e.samples=l,e},[]);return G.useLayoutEffect(()=>{p.setSize(o,s),l&&(p.samples=l)},[l,p,o,s]),G.useEffect(()=>()=>p.dispose(),[]),p}var ut=e=>typeof e==`function`,dt=G.forwardRef(({envMap:e,resolution:t=256,frames:n=1/0,makeDefault:r,children:s,...c},l)=>{let u=i(({set:e})=>e),d=i(({camera:e})=>e),f=i(({size:e})=>e),p=G.useRef(null);G.useImperativeHandle(l,()=>p.current,[]);let m=G.useRef(null),h=lt(t);G.useLayoutEffect(()=>{c.manual||(p.current.aspect=f.width/f.height)},[f,c]),G.useLayoutEffect(()=>{p.current.updateProjectionMatrix()});let g=0,_=null,v=ut(s);return o(t=>{v&&(n===1/0||g<n)&&(m.current.visible=!1,t.gl.setRenderTarget(h),_=t.scene.background,e&&(t.scene.background=e),t.gl.render(t.scene,p.current),t.scene.background=_,t.gl.setRenderTarget(null),m.current.visible=!0,g++)}),G.useLayoutEffect(()=>{if(r){let e=d;return u(()=>({camera:p.current})),()=>u(()=>({camera:e}))}},[p,r,u]),G.createElement(G.Fragment,null,G.createElement(`perspectiveCamera`,a({ref:p},c),!v&&s),G.createElement(`group`,{ref:m},v&&s(h.texture)))});function ft(e,{path:t}){let[n]=c(ae,[e],e=>e.setPath(t));return n}ft.preload=(e,{path:t})=>c.preload(ae,[e],e=>e.setPath(t));var K=t(),pt={sunLightPointsDown:{value:!0}};function mt(e){pt.sunLightPointsDown.value=e}var q=r(),ht=he(`SceneLighting`);function gt(){let e=(0,K.c)(6),t=Ee(),n,r;if(e[0]===t?(n=e[1],r=e[2]):(n=()=>{t?ht.debug(`sunData: dir=(%s, %s, %s) color=(%s, %s, %s) ambient=(%s, %s, %s)`,t.direction.x.toFixed(3),t.direction.y.toFixed(3),t.direction.z.toFixed(3),t.color.r.toFixed(3),t.color.g.toFixed(3),t.color.b.toFixed(3),t.ambient.r.toFixed(3),t.ambient.g.toFixed(3),t.ambient.b.toFixed(3)):ht.debug(`No sunData — using fallback ambient #888`)},r=[t],e[0]=t,e[1]=n,e[2]=r),(0,G.useEffect)(n,r),!t){let t;return e[3]===Symbol.for(`react.memo_cache_sentinel`)?(t=(0,q.jsx)(`ambientLight`,{color:`#888888`,intensity:1}),e[3]=t):t=e[3],t}let i;return e[4]===t?i=e[5]:(i=(0,q.jsx)(_t,{sunData:t}),e[4]=t,e[5]=i),i}function _t(e){let t=(0,K.c)(29),{sunData:n}=e,r;t[0]===n.direction?r=t[1]:(r=xe(n.direction),t[0]=n.direction,t[1]=r);let[i,a,o]=r,s=Math.sqrt(i*i+a*a+o*o),c=i/s,l=a/s,u=o/s,d;t[2]!==c||t[3]!==l||t[4]!==u?(d=new R(c,l,u),t[2]=c,t[3]=l,t[4]=u,t[5]=d):d=t[5];let f=d,p=-f.x*5e3,m=-f.y*5e3,h=-f.z*5e3,g;t[6]!==p||t[7]!==m||t[8]!==h?(g=new R(p,m,h),t[6]=p,t[7]=m,t[8]=h,t[9]=g):g=t[9];let _=g,v;t[10]!==n.color.b||t[11]!==n.color.g||t[12]!==n.color.r?(v=new z(n.color.r,n.color.g,n.color.b),t[10]=n.color.b,t[11]=n.color.g,t[12]=n.color.r,t[13]=v):v=t[13];let y=v,b;t[14]!==n.ambient.b||t[15]!==n.ambient.g||t[16]!==n.ambient.r?(b=new z(n.ambient.r,n.ambient.g,n.ambient.b),t[14]=n.ambient.b,t[15]=n.ambient.g,t[16]=n.ambient.r,t[17]=b):b=t[17];let x=b,S=f.y<0,C,w;t[18]===S?(C=t[19],w=t[20]):(C=()=>{mt(S)},w=[S],t[18]=S,t[19]=C,t[20]=w),(0,G.useEffect)(C,w);let T;t[21]!==y||t[22]!==_?(T=(0,q.jsx)(`directionalLight`,{position:_,color:y,intensity:1,castShadow:!0,"shadow-mapSize-width":8192,"shadow-mapSize-height":8192,"shadow-camera-left":-4096,"shadow-camera-right":4096,"shadow-camera-top":4096,"shadow-camera-bottom":-4096,"shadow-camera-near":100,"shadow-camera-far":12e3,"shadow-bias":-1e-5,"shadow-normalBias":.4,"shadow-radius":2}),t[21]=y,t[22]=_,t[23]=T):T=t[23];let E;t[24]===x?E=t[25]:(E=(0,q.jsx)(`ambientLight`,{color:x,intensity:1}),t[24]=x,t[25]=E);let D;return t[26]!==T||t[27]!==E?(D=(0,q.jsxs)(q.Fragment,{children:[T,E]}),t[26]=T,t[27]=E,t[28]=D):D=t[28],D}function vt(){let e=(0,K.c)(4),{fpsLimit:t}=d(),n=i(yt),r,a;return e[0]!==t||e[1]!==n?(r=()=>{if(t==null)return;let e=1e3/t,r=0,i;function a(t){i=requestAnimationFrame(a),t-r>=e&&(r=t-(t-r)%e,n())}return i=requestAnimationFrame(a),()=>cancelAnimationFrame(i)},a=[t,n],e[0]=t,e[1]=n,e[2]=r,e[3]=a):(r=e[2],a=e[3]),(0,G.useEffect)(r,a),t}function yt(e){return e.invalidate}function bt(){return vt(),null}var xt={toneMapping:0,outputColorSpace:ie};function St(e){let t=(0,K.c)(11),{children:n,renderOnDemand:r,dpr:i,onCreated:a}=e,o=r===void 0?!1:r,{renderOnDemand:c}=f(),l=o||c,{fpsLimit:u}=d(),p=u!=null&&!l,m=l||p?`demand`:`always`,h;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(h={type:1},t[0]=h):h=t[0];let g;t[1]===n?g=t[2]:(g=(0,q.jsx)(G.Suspense,{children:n}),t[1]=n,t[2]=g);let _;t[3]===p?_=t[4]:(_=p?(0,q.jsx)(bt,{}):null,t[3]=p,t[4]=_);let v;return t[5]!==i||t[6]!==a||t[7]!==m||t[8]!==g||t[9]!==_?(v=(0,q.jsxs)(s,{frameloop:m,dpr:i,gl:xt,shadows:h,onCreated:a,children:[g,_]}),t[5]=i,t[6]=a,t[7]=m,t[8]=g,t[9]=_,t[10]=v):v=t[10],v}function Ct(e){let t=(0,K.c)(12),{entity:n}=e,{registerCamera:r,unregisterCamera:i}=Ae(),a=(0,G.useId)(),o=n.cameraDataBlock,s;t[0]===n.position?s=t[1]:(s=n.position?new R(...n.position):new R,t[0]=n.position,t[1]=s);let c=s,l;t[2]===n.rotation?l=t[3]:(l=n.rotation?new oe(...n.rotation):new oe,t[2]=n.rotation,t[3]=l);let u=l,d,f;return t[4]!==o||t[5]!==a||t[6]!==c||t[7]!==r||t[8]!==u||t[9]!==i?(d=()=>{if(o===`Observer`){let e={id:a,position:c,rotation:u};return r(e),()=>{i(e)}}},f=[a,o,r,i,c,u],t[4]=o,t[5]=a,t[6]=c,t[7]=r,t[8]=u,t[9]=i,t[10]=d,t[11]=f):(d=t[10],f=t[11]),(0,G.useEffect)(d,f),null}function wt(e){let t=(0,K.c)(2),{entity:n}=e,r;return t[0]===n.label?r=t[1]:(r=n.label?(0,q.jsx)(u,{opacity:.6,children:n.label}):null,t[0]=n.label,t[1]=r),r}function Tt(e){let t=new Float32Array(e.length);for(let n=0;n<e.length;n++)t[n]=e[n]/65535;return t}var Et=256,Dt=512,Ot=64,kt=150,At=`
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
`;function jt({shader:e,baseTextures:t,alphaTextures:n,visibilityMask:r,tiling:i,detailTexture:a=null,lightmap:o=null}){e.uniforms.sunLightPointsDown=pt.sunLightPointsDown;let s=t.length;if(t.forEach((t,n)=>{e.uniforms[`albedo${n}`]={value:t}}),n.forEach((t,n)=>{e.uniforms[`mask${n}`]={value:t}}),r&&(e.uniforms.visibilityMask={value:r}),t.forEach((t,n)=>{e.uniforms[`tiling${n}`]={value:i[n]??32}}),o&&(e.uniforms.terrainLightmap={value:o}),a&&(e.uniforms.detailTexture={value:a},e.uniforms.detailTiling={value:Ot},e.uniforms.detailFadeDistance={value:kt},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
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

${At}

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
  vec2 alphaUv = baseUv + vec2(0.5 / ${Et}.0);
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
  vec2 lightmapUv = vMapUv + vec2(0.5 / ${Dt}.0);
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

#include <tonemapping_fragment>`)}var Mt={0:32,1:32,2:32,3:32,4:32,5:32},Nt=(0,G.memo)(function({displacementMap:e,visibilityMask:t,textureNames:n,alphaTextures:r,detailTextureName:i,lightmap:a}){let{debugMode:o}=f(),s=st(),c=_e(n.map(e=>w(e)),e=>{e.forEach(e=>it(e,{anisotropy:s}))}),l=i?E(i):null,u=_e(l??O,e=>{it(e,{anisotropy:s})}),d=(0,G.useCallback)(e=>{jt({shader:e,baseTextures:c,alphaTextures:r,visibilityMask:t,tiling:Mt,detailTexture:l?u:null,lightmap:a}),Je(e,Ze)},[c,r,t,u,l,a]),p=(0,G.useMemo)(()=>[n.join(`,`),l??`none`,a?a.id:`nolm`,c.map(e=>e.id).join(`,`)].join(`|`),[n,l,a,c]),m=(0,G.useRef)(null);return(0,G.useEffect)(()=>{let e=m.current;e&&(e.defines??={},e.defines.DEBUG_MODE=o?1:0,e.needsUpdate=!0)},[o]),(0,G.useEffect)(()=>{let e=m.current;e&&(e.customProgramCacheKey=()=>p,e.needsUpdate=!0)},[p]),(0,q.jsx)(`meshLambertMaterial`,{ref:m,map:e,depthWrite:!0,side:0,defines:{DEBUG_MODE:o?1:0},onBeforeCompile:d},`${l?`detail`:`nodetail`}-${a?`lightmap`:`nolightmap`}`)}),Pt=(0,G.memo)(function(e){let t=(0,K.c)(8),{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s}=e,c;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(c=(0,q.jsx)(`meshLambertMaterial`,{color:`rgb(0, 109, 56)`,wireframe:!0}),t[0]=c):c=t[0];let l;return t[1]!==a||t[2]!==o||t[3]!==n||t[4]!==s||t[5]!==i||t[6]!==r?(l=(0,q.jsx)(G.Suspense,{fallback:c,children:(0,q.jsx)(Nt,{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s})}),t[1]=a,t[2]=o,t[3]=n,t[4]=s,t[5]=i,t[6]=r,t[7]=l):l=t[7],l}),Ft=(0,G.memo)(function(e){let t=(0,K.c)(15),{tileX:n,tileZ:r,blockSize:i,basePosition:a,textureNames:o,geometry:s,displacementMap:c,visibilityMask:l,alphaTextures:u,detailTextureName:d,lightmap:f,visible:p}=e,m=p===void 0?!0:p,h=i/2,g=a.x+n*i+h,_=a.z+r*i+h,v;t[0]!==g||t[1]!==_?(v=[g,0,_],t[0]=g,t[1]=_,t[2]=v):v=t[2];let y=v,b;t[3]!==u||t[4]!==d||t[5]!==c||t[6]!==f||t[7]!==o||t[8]!==l?(b=(0,q.jsx)(Pt,{displacementMap:c,visibilityMask:l,textureNames:o,alphaTextures:u,detailTextureName:d,lightmap:f}),t[3]=u,t[4]=d,t[5]=c,t[6]=f,t[7]=o,t[8]=l,t[9]=b):b=t[9];let x;return t[10]!==s||t[11]!==y||t[12]!==b||t[13]!==m?(x=(0,q.jsx)(`mesh`,{position:y,geometry:s,castShadow:!0,receiveShadow:!0,visible:m,children:b}),t[10]=s,t[11]=y,t[12]=b,t[13]=m,t[14]=x):x=t[14],x}),It=he(`TerrainBlock`),Lt=8,Rt=600,J=256,zt=512,Bt=2048;function Vt(e,t){let n=new le,r=(t+1)*(t+1),i=new Float32Array(r*3),a=new Float32Array(r*3),o=new Float32Array(r*2),s=t*t*6,c=new Uint32Array(s),l=0,u=e/t;for(let n=0;n<=t;n++)for(let r=0;r<=t;r++){let s=n*(t+1)+r;i[s*3]=r*u-e/2,i[s*3+1]=e/2-n*u,i[s*3+2]=0,a[s*3]=0,a[s*3+1]=0,a[s*3+2]=1,o[s*2]=r/t,o[s*2+1]=1-n/t}for(let e=0;e<t;e++)for(let n=0;n<t;n++){let r=e*(t+1)+n,i=r+1,a=(e+1)*(t+1)+n,o=a+1;(n^e)&1?(c[l++]=r,c[l++]=a,c[l++]=i,c[l++]=i,c[l++]=a,c[l++]=o):(c[l++]=r,c[l++]=a,c[l++]=o,c[l++]=r,c[l++]=o,c[l++]=i)}return n.setIndex(new de(c,1)),n.setAttribute(`position`,new L(i,3)),n.setAttribute(`normal`,new L(a,3)),n.setAttribute(`uv`,new L(o,2)),n.rotateX(-Math.PI/2),n.rotateY(-Math.PI/2),n}function Ht(e,t,n){let r=e.attributes.position,i=e.attributes.uv,a=e.attributes.normal,o=r.array,s=i.array,c=a.array,l=r.count,u=(e,n)=>(e=Math.max(0,Math.min(J-1,e)),n=Math.max(0,Math.min(J-1,n)),t[n*J+e]/65535*Bt),d=(e,n)=>{e=Math.max(0,Math.min(J-1,e)),n=Math.max(0,Math.min(J-1,n));let r=Math.floor(e),i=Math.floor(n),a=Math.min(r+1,J-1),o=Math.min(i+1,J-1),s=e-r,c=n-i,l=t[i*J+r]/65535*Bt,u=t[i*J+a]/65535*Bt,d=t[o*J+r]/65535*Bt,f=t[o*J+a]/65535*Bt,p=l*(1-s)+u*s,m=d*(1-s)+f*s;return p*(1-c)+m*c};for(let e=0;e<l;e++){let t=s[e*2],r=s[e*2+1],i=u(Math.floor(t*J)&J-1,Math.floor(r*J)&J-1);o[e*3+1]=i;let a=t*(J-1),l=r*(J-1),f=d(a-1,l),p=d(a+1,l),m=d(a,l+1),h=d(a,l-1),g=(p-f)/2,_=(m-h)/2,v=n,y=g,b=Math.sqrt(_*_+v*v+y*y);b>0?(_/=b,v/=b,y/=b):(_=0,v=1,y=0),c[e*3]=_,c[e*3+1]=v,c[e*3+2]=y}r.needsUpdate=!0,a.needsUpdate=!0}function Ut(e,t,n,r,i,a){let o=r.z/i,s=r.x/i,c=r.y,l=Math.sqrt(o*o+s*s);if(l<1e-4)return 1;let u=.5/l,d=o*u,f=s*u,p=c*u,m=e,h=t,g=n+.1,_=J*3;for(let e=0;e<_;e++){if(m+=d,h+=f,g+=p,m<0||m>=J||h<0||h>=J||g>Bt)return 1;let e=a(m,h);if(g<e)return 0}return 1}function Wt(e,t,n){let r=(t,n)=>{let r=Math.max(0,Math.min(J-1,t)),i=Math.max(0,Math.min(J-1,n)),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,J-1),c=Math.min(o+1,J-1),l=r-a,u=i-o,d=e[o*J+a]/65535,f=e[o*J+s]/65535,p=e[c*J+a]/65535,m=e[c*J+s]/65535,h=d*(1-l)+f*l,g=p*(1-l)+m*l;return(h*(1-u)+g*u)*Bt},i=new R(-t.x,-t.y,-t.z).normalize(),a=new Uint8Array(zt*zt),o=.5;for(let e=0;e<zt;e++)for(let t=0;t<zt;t++){let s=t/2+.25,c=e/2+.25,l=r(s,c),u=r(s-o,c),d=r(s+o,c),f=r(s,c-o),p=r(s,c+o),m=(d-u)/(2*o),h=-((p-f)/(2*o)),g=n,_=-m,v=Math.sqrt(h*h+g*g+_*_),y=Math.max(0,h/v*i.x+g/v*i.y+_/v*i.z),b=1;y>0&&(b=Ut(s,c,l,i,n,r)),a[e*zt+t]=Math.floor(y*b*255)}let s=new ee(a,zt,zt,F,se);return s.colorSpace=``,s.generateMipmaps=!0,s.wrapS=pe,s.wrapT=pe,s.magFilter=I,s.minFilter=I,s.needsUpdate=!0,s}function Gt(e){let t=(0,K.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`terrain`,e],queryFn:()=>(It.debug(`Loading terrain: %s`,e),k(e))},t[0]=e,t[1]=n);let r=m(n),i,a;return t[2]!==r.data||t[3]!==r.error||t[4]!==r.status||t[5]!==e?(i=()=>{It.debug(`Query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (data ready)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=r.data,t[3]=r.error,t[4]=r.status,t[5]=e,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,G.useEffect)(i,a),r}function Kt(){let e=Te();return e&&e.visibleDistance>0?e.visibleDistance:Rt}function qt(e){let t=new Uint8Array(J*J);t.fill(255);for(let n of e){let e=n&255,r=n>>8&255,i=n>>16,a=r*J;for(let n=0;n<i;n++){let r=a+e+n;r<t.length&&(t[r]=0)}}let n=new ee(t,J,J,F,se);return n.colorSpace=``,n.wrapS=n.wrapT=pe,n.magFilter=V,n.minFilter=V,n.needsUpdate=!0,n}var Jt=(0,G.memo)(function(e){let t=(0,K.c)(62),{scene:n}=e,r=n.terrFileName,a=n.squareSize||Lt,s=n.detailTextureName||void 0,c=a*256,l=Kt(),u=i(Yt),d=-a*(J/2),f;t[0]===d?f=t[1]:(f={x:d,z:d},t[0]=d,t[1]=f);let p=f,m;t[2]===n.emptySquareRuns?m=t[3]:(m=n.emptySquareRuns??[],t[2]=n.emptySquareRuns,t[3]=m);let h=m,{data:g}=Gt(r),_;bb0:{if(!g){_=null;break bb0}let e=a*256,n;t[4]!==e||t[5]!==a||t[6]!==g.heightMap?(n=Vt(e,J),Ht(n,g.heightMap,a),t[4]=e,t[5]=a,t[6]=g.heightMap,t[7]=n):n=t[7],_=n}let v=_,y,b;t[8]!==a||t[9]!==g?(y=()=>{if(g)return Ge(ke(g.heightMap,a)),Xt},b=[g,a],t[8]=a,t[9]=g,t[10]=y,t[11]=b):(y=t[10],b=t[11]),(0,G.useEffect)(y,b);let x=Ee(),S;bb1:{if(!x){let e;t[12]===Symbol.for(`react.memo_cache_sentinel`)?(e=new R(.57735,-.57735,.57735),t[12]=e):e=t[12],S=e;break bb1}let e;t[13]===x.direction?e=t[14]:(e=xe(x.direction),t[13]=x.direction,t[14]=e);let[n,r,i]=e,a=Math.sqrt(n*n+r*r+i*i),o=n/a,s=r/a,c=i/a,l;t[15]!==c||t[16]!==o||t[17]!==s?(l=new R(o,s,c),t[15]=c,t[16]=o,t[17]=s,t[18]=l):l=t[18],S=l}let C=S,w;bb2:{if(!g){w=null;break bb2}let e;t[19]!==a||t[20]!==C||t[21]!==g.heightMap?(e=Wt(g.heightMap,C,a),t[19]=a,t[20]=C,t[21]=g.heightMap,t[22]=e):e=t[22],w=e}let T=w,E;bb3:{if(!g){E=null;break bb3}let e;t[23]===g.heightMap?e=t[24]:(e=new ee(Tt(g.heightMap),J,J,F,ue),e.colorSpace=``,e.generateMipmaps=!1,e.wrapS=N,e.wrapT=N,e.needsUpdate=!0,t[23]=g.heightMap,t[24]=e),E=e}let D=E,O;t[25]===h?O=t[26]:(O=qt(h),t[25]=h,t[26]=O);let k=O,A;t[27]===Symbol.for(`react.memo_cache_sentinel`)?(A=qt([]),t[27]=A):A=t[27];let j=A,M;bb4:{if(!g){M=null;break bb4}let e;t[28]===g.alphaMaps?e=t[29]:(e=g.alphaMaps.map(Zt),t[28]=g.alphaMaps,t[29]=e),M=e}let P=M,te=2*Math.ceil(l/c)+1,ne=te*te-1,I=(0,G.useRef)(null),re;t[30]===Symbol.for(`react.memo_cache_sentinel`)?(re=new fe,t[30]=re):re=t[30];let L=re,ie;t[31]===Symbol.for(`react.memo_cache_sentinel`)?(ie={xStart:1/0,xEnd:-1/0,zStart:1/0,zEnd:-1/0},t[31]=ie):ie=t[31];let ae=(0,G.useRef)(ie),oe=(0,G.useRef)(null),se;if(t[32]!==p||t[33]!==c||t[34]!==u||t[35]!==l?(se=()=>{let e=I.current;if(!e)return;let t=u.position.x-p.x,n=u.position.z-p.z,r=Math.floor((t-l)/c),i=Math.ceil((t+l)/c),a=Math.floor((n-l)/c),o=Math.ceil((n+l)/c),s=ae.current;if(e===oe.current&&r===s.xStart&&i===s.xEnd&&a===s.zStart&&o===s.zEnd)return;oe.current=e,s.xStart=r,s.xEnd=i,s.zStart=a,s.zEnd=o;let d=c/2,f=0;for(let t=r;t<i;t++)for(let n=a;n<o;n++)t===0&&n===0||(L.makeTranslation(p.x+t*c+d,0,p.z+n*c+d),e.setMatrixAt(f,L),f++);e.count=f,e.instanceMatrix.needsUpdate=!0},t[32]=p,t[33]=c,t[34]=u,t[35]=l,t[36]=se):se=t[36],o(se),!g||!v||!D||!P)return It.debug(`Not ready: terrain=%s geometry=%s displacement=%s alpha=%s`,!!g,!!v,!!D,!!P),null;let ce=T??void 0,z;t[37]!==p||t[38]!==c||t[39]!==s||t[40]!==k||t[41]!==P||t[42]!==D||t[43]!==v||t[44]!==ce||t[45]!==g.textureNames?(z=(0,q.jsx)(Ft,{tileX:0,tileZ:0,blockSize:c,basePosition:p,textureNames:g.textureNames,geometry:v,displacementMap:D,visibilityMask:k,alphaTextures:P,detailTextureName:s,lightmap:ce}),t[37]=p,t[38]=c,t[39]=s,t[40]=k,t[41]=P,t[42]=D,t[43]=v,t[44]=ce,t[45]=g.textureNames,t[46]=z):z=t[46];let B;t[47]!==ne||t[48]!==v?(B=[v,void 0,ne],t[47]=ne,t[48]=v,t[49]=B):B=t[49];let le=T??void 0,V;t[50]!==s||t[51]!==P||t[52]!==D||t[53]!==le||t[54]!==g.textureNames?(V=(0,q.jsx)(Pt,{displacementMap:D,visibilityMask:j,textureNames:g.textureNames,alphaTextures:P,detailTextureName:s,lightmap:le}),t[50]=s,t[51]=P,t[52]=D,t[53]=le,t[54]=g.textureNames,t[55]=V):V=t[55];let de;t[56]!==B||t[57]!==V?(de=(0,q.jsx)(`instancedMesh`,{ref:I,args:B,castShadow:!0,receiveShadow:!0,frustumCulled:!1,children:V}),t[56]=B,t[57]=V,t[58]=de):de=t[58];let pe;return t[59]!==z||t[60]!==de?(pe=(0,q.jsxs)(q.Fragment,{children:[z,de]}),t[59]=z,t[60]=de,t[61]=pe):pe=t[61],pe});function Yt(e){return e.camera}function Xt(){return Ge(null)}function Zt(e){return at(e)}var Qt=`
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
`;function $t(e,t){let n=t.surfaceOutsideVisible??!1;e.uniforms.useSceneLighting={value:n},e.uniforms.interiorDebugColor={value:n?new R(0,.4,1):new R(1,.2,0)},e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
${Qt}
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

#include <tonemapping_fragment>`)}var en=he(`InteriorInstance`);function tn(e){let t=(0,K.c)(2),n;return t[0]===e?n=t[1]:(n=T(e),t[0]=e,t[1]=n),_(n)}function nn({materialName:e,material:t,lightMap:n}){let r=f()?.debugMode??!1,i=st(),a=_e(E(e),e=>it(e,{anisotropy:i})),o=new Set(t?.userData?.flag_names??[]).has(`SelfIlluminating`),s=new Set(t?.userData?.surface_flag_names??[]).has(`SurfaceOutsideVisible`),c=(0,G.useCallback)(e=>{Je(e,Ze),$t(e,{surfaceOutsideVisible:s})},[s]),l=(0,G.useRef)(null),u=(0,G.useRef)(null);(0,G.useEffect)(()=>{let e=l.current??u.current;e&&(e.defines??={},e.defines.DEBUG_MODE=r?1:0,e.needsUpdate=!0)},[r]);let d={DEBUG_MODE:r?1:0},p=`${s}`;return o?(0,q.jsx)(`meshBasicMaterial`,{ref:l,map:a,toneMapped:!1,defines:d,onBeforeCompile:c},p):(0,q.jsx)(`meshLambertMaterial`,{ref:u,map:a,lightMap:n,toneMapped:!1,defines:d,onBeforeCompile:c},p)}function rn(e){if(!e)return null;let t=e.emissiveMap;return t&&(t.colorSpace=ie),t??null}function an(e){let t=(0,K.c)(13),{node:n}=e,r;bb0:{if(!n.material){let e;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[0]=e):e=t[0],r=e;break bb0}if(Array.isArray(n.material)){let e;t[1]===n.material?e=t[2]:(e=n.material.map(on),t[1]=n.material,t[2]=e),r=e;break bb0}let e;t[3]===n.material?e=t[4]:(e=rn(n.material),t[3]=n.material,t[4]=e);let i;t[5]===e?i=t[6]:(i=[e],t[5]=e,t[6]=i),r=i}let i=r,a;t[7]!==i||t[8]!==n.material?(a=n.material?(0,q.jsx)(tt,{name:`InteriorTexture:${Array.isArray(n.material)?n.material[0]?.userData?.resource_path:n.material?.userData?.resource_path??`?`}`,fallback:(0,q.jsx)(`meshStandardMaterial`,{color:`yellow`,wireframe:!0}),children:Array.isArray(n.material)?n.material.map((e,t)=>(0,q.jsx)(nn,{materialName:e.userData.resource_path,material:e,lightMap:i[t]},t)):(0,q.jsx)(nn,{materialName:n.material.userData.resource_path,material:n.material,lightMap:i[0]})}):null,t[7]=i,t[8]=n.material,t[9]=a):a=t[9];let o;return t[10]!==n.geometry||t[11]!==a?(o=(0,q.jsx)(`mesh`,{geometry:n.geometry,castShadow:!0,receiveShadow:!0,children:a}),t[10]=n.geometry,t[11]=a,t[12]=o):o=t[12],o}function on(e){return rn(e)}var sn=(0,G.memo)(function(e){let t=(0,K.c)(10),{interiorFile:n,ghostIndex:r}=e,{nodes:i}=tn(n),a=f()?.debugMode??!1,o;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(o=[0,-Math.PI/2,0],t[0]=o):o=t[0];let s;t[1]===i?s=t[2]:(s=Object.entries(i).filter(dn).map(fn),t[1]=i,t[2]=s);let c;t[3]!==a||t[4]!==r||t[5]!==n?(c=a?(0,q.jsxs)(u,{children:[r,`: `,n]}):null,t[3]=a,t[4]=r,t[5]=n,t[6]=c):c=t[6];let l;return t[7]!==s||t[8]!==c?(l=(0,q.jsxs)(`group`,{rotation:o,children:[s,c]}),t[7]=s,t[8]=c,t[9]=l):l=t[9],l});function cn(e){let t=(0,K.c)(9),{color:n,label:r}=e,i;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(i=(0,q.jsx)(`boxGeometry`,{args:[10,10,10]}),t[0]=i):i=t[0];let a;t[1]===n?a=t[2]:(a=(0,q.jsx)(`meshStandardMaterial`,{color:n,wireframe:!0}),t[1]=n,t[2]=a);let o;t[3]!==n||t[4]!==r?(o=r?(0,q.jsx)(u,{color:n,children:r}):null,t[3]=n,t[4]=r,t[5]=o):o=t[5];let s;return t[6]!==a||t[7]!==o?(s=(0,q.jsxs)(`mesh`,{children:[i,a,o]}),t[6]=a,t[7]=o,t[8]=s):s=t[8],s}function ln(e){let t=(0,K.c)(3),{label:n}=e,r=f()?.debugMode??!1,i;return t[0]!==r||t[1]!==n?(i=r?(0,q.jsx)(cn,{color:`red`,label:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}var un=(0,G.memo)(function(e){let t=(0,K.c)(26),{scene:n}=e,r;t[0]===n.transform.position?r=t[1]:(r=xe(n.transform.position),t[0]=n.transform.position,t[1]=r);let i=r,a;t[2]===n.transform?a=t[3]:(a=Se(n.transform),t[2]=n.transform,t[3]=a);let o=a,s;t[4]===n.scale?s=t[5]:(s=be(n.scale),t[4]=n.scale,t[5]=s);let c=s,l=`${n.ghostIndex}: ${n.interiorFile}`,u;t[6]===l?u=t[7]:(u=(0,q.jsx)(ln,{label:l}),t[6]=l,t[7]=u);let d;t[8]===n.interiorFile?d=t[9]:(d=e=>{en.error(`Failed to load %s: %s`,n.interiorFile,e.message)},t[8]=n.interiorFile,t[9]=d);let f=`InteriorModel:${n.interiorFile}`,p;t[10]===Symbol.for(`react.memo_cache_sentinel`)?(p=(0,q.jsx)(cn,{color:`orange`}),t[10]=p):p=t[10];let m;t[11]!==n.ghostIndex||t[12]!==n.interiorFile?(m=(0,q.jsx)(sn,{interiorFile:n.interiorFile,ghostIndex:n.ghostIndex}),t[11]=n.ghostIndex,t[12]=n.interiorFile,t[13]=m):m=t[13];let h;t[14]!==f||t[15]!==m?(h=(0,q.jsx)(tt,{name:f,fallback:p,children:m}),t[14]=f,t[15]=m,t[16]=h):h=t[16];let g;t[17]!==h||t[18]!==u||t[19]!==d?(g=(0,q.jsx)(C,{fallback:u,onError:d,children:h}),t[17]=h,t[18]=u,t[19]=d,t[20]=g):g=t[20];let _;return t[21]!==i||t[22]!==o||t[23]!==c||t[24]!==g?(_=(0,q.jsx)(`group`,{position:i,quaternion:o,scale:c,children:g}),t[21]=i,t[22]=o,t[23]=c,t[24]=g,t[25]=_):_=t[25],_});function dn(e){let[,t]=e;return t.isMesh}function fn(e){let[t,n]=e;return(0,q.jsx)(an,{node:n},t)}var pn=()=>{},Y=5,mn=Y*Y,hn=.05;function gn(e,t,n){let r=e,i=t,a=n;return[a,a,a,a,a,a,i,i,i,a,a,i,r,i,a,a,i,i,i,a,a,a,a,a,a]}function _n(e,t){let n=new Float32Array(mn);for(let r=0;r<mn;r++){let i=e[r*3],a=e[r*3+2],o=1.3-Math.sqrt(i*i+a*a)/t;o<.4?o=0:o>.8&&(o=1),n[r]=o}return n}function vn(e,t,n,r){let i=new le,a=new Float32Array(mn*3),o=new Float32Array(mn*2),s=gn(t,n,r),c=e*2/(Y-1);for(let t=0;t<Y;t++)for(let n=0;n<Y;n++){let r=t*Y+n,i=-e+n*c,l=e-t*c,u=e*s[r];a[r*3]=i,a[r*3+1]=u,a[r*3+2]=l,o[r*2]=n,o[r*2+1]=t}yn(a);let l=_n(a,e),u=[];for(let e=0;e<Y-1;e++)for(let t=0;t<Y-1;t++){let n=e*Y+t,r=n+1,i=n+Y,a=i+1;u.push(n,i,a),u.push(n,a,r)}return i.setIndex(u),i.setAttribute(`position`,new L(a,3)),i.setAttribute(`uv`,new L(o,2)),i.setAttribute(`alpha`,new L(l,1)),i.computeBoundingSphere(),i}function yn(e){let t=t=>({x:e[t*3],y:e[t*3+1],z:e[t*3+2]}),n=(t,n,r,i)=>{e[t*3]=n,e[t*3+1]=r,e[t*3+2]=i},r=t(1),i=t(3),a=t(5),o=t(6),s=t(8),c=t(9),l=t(15),u=t(16),d=t(18),f=t(19),p=t(21),m=t(23),h=a.x+(r.x-a.x)*.5,g=a.y+(r.y-a.y)*.5,_=a.z+(r.z-a.z)*.5;n(0,o.x+(h-o.x)*2,o.y+(g-o.y)*2,o.z+(_-o.z)*2),h=c.x+(i.x-c.x)*.5,g=c.y+(i.y-c.y)*.5,_=c.z+(i.z-c.z)*.5,n(4,s.x+(h-s.x)*2,s.y+(g-s.y)*2,s.z+(_-s.z)*2),h=p.x+(l.x-p.x)*.5,g=p.y+(l.y-p.y)*.5,_=p.z+(l.z-p.z)*.5,n(20,u.x+(h-u.x)*2,u.y+(g-u.y)*2,u.z+(_-u.z)*2),h=m.x+(f.x-m.x)*.5,g=m.y+(f.y-m.y)*.5,_=m.z+(f.z-m.z)*.5,n(24,d.x+(h-d.x)*2,d.y+(g-d.y)*2,d.z+(_-d.z)*2)}function bn(e){return e.wrapS=N,e.wrapT=N,e.minFilter=I,e.magFilter=I,e.colorSpace=``,e.needsUpdate=!0,e}var xn=`
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
`,Sn=`
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
`;function Cn({textureUrl:e,radius:t,heightPercent:n,speed:r,windDirection:i,layerIndex:a}){let{debugMode:s}=f(),{animationEnabled:c}=d(),l=(0,G.useRef)(null),u=_e(e,bn),p=(0,G.useMemo)(()=>vn(t,n,n-.05,hn),[t,n]);(0,G.useEffect)(()=>()=>{p.dispose()},[p]);let m=(0,G.useMemo)(()=>new M({uniforms:{cloudTexture:{value:u},uvOffset:{value:new ne(0,0)},debugMode:{value:s?1:0},layerIndex:{value:a}},vertexShader:xn,fragmentShader:Sn,transparent:!0,depthWrite:!1,side:2}),[u,s,a]);return(0,G.useEffect)(()=>()=>{m.dispose()},[m]),o(c?(e,t)=>{let n=t*1e3/32;l.current??=new ne(0,0),l.current.x+=i.x*r*n,l.current.y+=i.y*r*n,l.current.x-=Math.floor(l.current.x),l.current.y-=Math.floor(l.current.y),m.uniforms.uvOffset.value.copy(l.current)}:pn),(0,q.jsx)(`mesh`,{geometry:p,frustumCulled:!1,renderOrder:10,children:(0,q.jsx)(`primitive`,{object:m,attach:`material`})})}var wn=7;function Tn(e){let t=(0,K.c)(7),n,r;t[0]===e?(n=t[1],r=t[2]):(n=[`detailMapList`,e],r=()=>D(e),t[0]=e,t[1]=n,t[2]=r);let i=!!e,a;return t[3]!==n||t[4]!==r||t[5]!==i?(a={queryKey:n,queryFn:r,enabled:i},t[3]=n,t[4]=r,t[5]=i,t[6]=a):a=t[6],m(a)}function En(e){let t=(0,K.c)(18),{scene:n}=e,{data:r}=Tn(n.materialList||void 0),i=(n.visibleDistance>0?n.visibleDistance:500)*.95,a;t[0]===n.cloudLayers?a=t[1]:(a=n.cloudLayers.map(On),t[0]=n.cloudLayers,t[1]=a);let s=a,c;t[2]===n.cloudLayers?c=t[3]:(c=n.cloudLayers.map(Dn),t[2]=n.cloudLayers,t[3]=c);let l=c,u;bb0:{let{x:e,y:r}=n.windVelocity;if(e!==0||r!==0){let n;t[4]!==e||t[5]!==r?(n=new ne(r,-e).normalize(),t[4]=e,t[5]=r,t[6]=n):n=t[6],u=n;break bb0}let i;t[7]===Symbol.for(`react.memo_cache_sentinel`)?(i=new ne(1,0),t[7]=i):i=t[7],u=i}let d=u,f;bb1:{if(!r){let e;t[8]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[8]=e):e=t[8],f=e;break bb1}let e;if(t[9]!==l||t[10]!==s||t[11]!==r){e=[];for(let t=0;t<3;t++){let n=r[wn+t];n&&e.push({texture:n,height:l[t],speed:s[t]})}t[9]=l,t[10]=s,t[11]=r,t[12]=e}else e=t[12];f=e}let p=f,m=(0,G.useRef)(null),h;if(t[13]===Symbol.for(`react.memo_cache_sentinel`)?(h=e=>{let{camera:t}=e;m.current&&m.current.position.copy(t.position)},t[13]=h):h=t[13],o(h),!p||p.length===0)return null;let g;return t[14]!==p||t[15]!==i||t[16]!==d?(g=(0,q.jsx)(`group`,{ref:m,children:p.map((e,t)=>(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Cn,{textureUrl:E(e.texture),radius:i,heightPercent:e.height,speed:e.speed,windDirection:d,layerIndex:t})},t))}),t[14]=p,t[15]=i,t[16]=d,t[17]=g):g=t[17],g}function Dn(e,t){return e.heightPercent||[.35,.25,.2][t]}function On(e,t){return e.speed||[1e-4,2e-4,3e-4][t]}(0,G.createContext)(null),(0,G.createContext)(null);function kn(e){let t=e.fogDistance,n=e.visibleDistance>0?e.visibleDistance:1e3,{r,g:i,b:a}=e.fogColor,o=new z().setRGB(r,i,a).convertSRGBToLinear(),s=[];for(let t of e.fogVolumes)t.visibleDistance<=0||t.maxHeight<=t.minHeight||s.push({visibleDistance:t.visibleDistance,minHeight:t.minHeight,maxHeight:t.maxHeight,percentage:1});return{fogDistance:t,visibleDistance:n,fogColor:o,fogVolumes:s,fogLine:s.reduce((e,t)=>Math.max(e,t.maxHeight),0),enabled:n>t}}var An=he(`Sky`),jn=!1;function Mn(e){return[new z().setRGB(e.r,e.g,e.b),new z().setRGB(e.r,e.g,e.b).convertSRGBToLinear()]}function Nn(e){let t=(0,K.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`detailMapList`,e],queryFn:()=>(An.debug(`Loading detail map list: %s`,e),D(e))},t[0]=e,t[1]=n);let r=m(n),i,a;return t[2]!==e||t[3]!==r.data||t[4]!==r.error||t[5]!==r.status?(i=()=>{An.debug(`DML query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (${r.data.length} entries)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=e,t[3]=r.data,t[4]=r.error,t[5]=r.status,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,G.useEffect)(i,a),r}var Pn=60;function Fn({skyBoxFiles:e,fogColor:t,fogState:n}){let r=i(e=>e.camera),a=ft(e,{path:``}),o=!!t,s=(0,G.useMemo)(()=>r.projectionMatrixInverse,[r]),c=(0,G.useMemo)(()=>n?qe(n.fogVolumes):new Float32Array(12),[n]),l=(0,G.useRef)({skybox:{value:a},fogColor:{value:t??new z(0,0,0)},enableFog:{value:o},inverseProjectionMatrix:{value:s},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:Ze.cameraHeight,fogVolumeData:{value:c},horizonFogHeight:{value:.18}}),u=(0,G.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return Pn/Math.sqrt(e*e+Pn*Pn)},[n]);return(0,G.useEffect)(()=>{l.current.skybox.value=a,l.current.fogColor.value=t??new z(0,0,0),l.current.enableFog.value=o,l.current.fogVolumeData.value=c,l.current.horizonFogHeight.value=u},[a,t,o,c,u]),(0,q.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,q.jsxs)(`bufferGeometry`,{children:[(0,q.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,q.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,q.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function In(e){let t=(0,K.c)(13),{materialList:n,fogColor:r,fogState:i}=e,{data:a}=Nn(n),o;t[0]===a?o=t[1]:(o=a?[E(a[1]),E(a[3]),E(a[4]),E(a[5]),E(a[0]),E(a[2])]:null,t[0]=a,t[1]=o);let s=o,c;t[2]===a?.[6]?c=t[3]:(c=()=>{let e=a?.[6];if(!e)return;let t=E(e);if(t===O)return;let n=ot(t,Rn);return n.image&&(it(n,{noColorSpace:!0}),$e(n)),Ln},t[2]=a?.[6],t[3]=c);let l;t[4]===a?l=t[5]:(l=[a],t[4]=a,t[5]=l),(0,G.useEffect)(c,l);let{debugMode:u}=f(),d,p;if(t[6]===u?(d=t[7],p=t[8]):(d=()=>{Qe.shapeEnvMapDebugUV.value=u},p=[u],t[6]=u,t[7]=d,t[8]=p),(0,G.useEffect)(d,p),!s)return null;let m;return t[9]!==r||t[10]!==i||t[11]!==s?(m=(0,q.jsx)(Fn,{skyBoxFiles:s,fogColor:r,fogState:i}),t[9]=r,t[10]=i,t[11]=s,t[12]=m):m=t[12],m}function Ln(){return et()}function Rn(e){it(e,{noColorSpace:!0}),$e(e)}function zn({skyColor:e,fogColor:t,fogState:n}){let r=i(e=>e.camera),a=!!t,o=(0,G.useMemo)(()=>r.projectionMatrixInverse,[r]),s=(0,G.useMemo)(()=>n?qe(n.fogVolumes):new Float32Array(12),[n]),c=(0,G.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return Pn/Math.sqrt(e*e+Pn*Pn)},[n]),l=(0,G.useRef)({skyColor:{value:e},fogColor:{value:t??new z(0,0,0)},enableFog:{value:a},inverseProjectionMatrix:{value:o},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:Ze.cameraHeight,fogVolumeData:{value:s},horizonFogHeight:{value:c}});return(0,G.useEffect)(()=>{l.current.skyColor.value=e,l.current.fogColor.value=t??new z(0,0,0),l.current.enableFog.value=a,l.current.fogVolumeData.value=s,l.current.horizonFogHeight.value=c},[e,t,a,s,c]),(0,q.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,q.jsxs)(`bufferGeometry`,{children:[(0,q.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,q.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,q.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function Bn(e,t){let{fogDistance:n,visibleDistance:r}=e;return[n,r]}function Vn({fogState:e,enabled:t}){let n=i(e=>e.scene),r=i(e=>e.camera),a=(0,G.useRef)(null),s=(0,G.useMemo)(()=>qe(e.fogVolumes),[e.fogVolumes]);return(0,G.useEffect)(()=>{jn||=(Xe(),!0)},[]),(0,G.useEffect)(()=>{Ye();let[t,i]=Bn(e,r.position.y),o=new j(e.fogColor,t,i);return n.fog=o,a.current=o,Ke(r.position.y,s),()=>{n.fog=null,a.current=null,Ye()}},[n,r,e,s]),(0,G.useEffect)(()=>{let n=a.current;if(n)if(t){let[t,i]=Bn(e,r.position.y);n.near=t,n.far=i}else n.near=1e10,n.far=1e10},[t,e,r.position.y]),o(()=>{let n=a.current;if(!n)return;let i=r.position.y;if(Ke(i,s,t),t){let[t,r]=Bn(e,i);n.near=t,n.far=r,n.color.copy(e.fogColor)}}),null}var Hn=(0,G.memo)(function({entity:e}){let{skyData:t}=e;An.debug(`Rendering: materialList=%s, useSkyTextures=%s`,t.materialList,t.useSkyTextures);let{fogEnabled:n}=d(),r=t.materialList||void 0,a=(0,G.useMemo)(()=>Mn(t.skySolidColor),[t.skySolidColor]),o=t.useSkyTextures,s=(0,G.useMemo)(()=>kn(t),[t]);An.debug(`fogState: fogColor=(%s, %s, %s) visibleDistance=%d fogDistance=%d enabled=%s volumes=%d`,t.fogColor.r.toFixed(3),t.fogColor.g.toFixed(3),t.fogColor.b.toFixed(3),t.visibleDistance,t.fogDistance,s.enabled,s.fogVolumes.length);let c=(0,G.useMemo)(()=>Mn(t.fogColor),[t.fogColor]),l=a||c,u=s.enabled&&n,f=s.fogColor,p=i(e=>e.scene),m=i(e=>e.gl);(0,G.useEffect)(()=>{if(u){let e=f.clone();p.background=e,m.setClearColor(e)}else if(l){let e=l[0].clone();p.background=e,m.setClearColor(e)}else p.background=null;return()=>{p.background=null}},[p,m,u,f,l]);let h=a?.[1];return(0,q.jsxs)(q.Fragment,{children:[r&&o&&r.length>0?(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(In,{materialList:r,fogColor:u?f:void 0,fogState:u?s:void 0},r)}):h?(0,q.jsx)(zn,{skyColor:h,fogColor:u?f:void 0,fogState:u?s:void 0}):null,(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(En,{scene:t})}),s.enabled?(0,q.jsx)(Vn,{fogState:s,enabled:n}):null]})});function Un(e){let t=(0,K.c)(3),{children:n}=e,{audioEnabled:r}=d(),i;return t[0]!==r||t[1]!==n?(i=r?(0,q.jsx)(G.Suspense,{children:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}function X(e,t){let n=(0,G.lazy)(()=>t().then(t=>({default:t[e]}))),r=t=>{let r=(0,K.c)(5),{entity:i}=t,a=`${e}:${i.id}`,o;r[0]===i?o=r[1]:(o=(0,q.jsx)(n,{entity:i}),r[0]=i,r[1]=o);let s;return r[2]!==a||r[3]!==o?(s=(0,q.jsx)(tt,{name:a,children:o}),r[2]=a,r[3]=o,r[4]=s):s=r[4],s};return r.displayName=`createLazy(${e})`,r}var Wn=X(`PlayerModel`,()=>H(()=>import(`./PlayerModel-DaX_n0Xh.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]))),Gn=X(`ExplosionShape`,()=>H(()=>import(`./ShapeModel-eZvNJsLY.js`),__vite__mapDeps([31,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,29]))),Kn=X(`TracerProjectile`,()=>H(()=>import(`./Projectiles-DlNks7l0.js`),__vite__mapDeps([32,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]))),qn=X(`SpriteProjectile`,()=>H(()=>import(`./Projectiles-DlNks7l0.js`),__vite__mapDeps([32,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]))),Jn=X(`ForceFieldBare`,()=>H(()=>import(`./ForceFieldBare-DMinQDX-.js`),__vite__mapDeps([33,1,2,3,4,5,7,14,13,15,16,12,17,18,27]))),Yn=X(`AudioEmitter`,()=>H(()=>import(`./AudioEmitter-BuCRagwl.js`),__vite__mapDeps([34,14,1,2,3,4,5,13,15,16,12,17,18]))),Xn=X(`WaterBlock`,()=>H(()=>import(`./WaterBlock-D0vGBv3d.js`),__vite__mapDeps([35,1,2,3,4,5,7,14,13,15,16,12,17,18,24,25,21]))),Zn=X(`WeaponModel`,()=>H(()=>import(`./ShapeModel-eZvNJsLY.js`),__vite__mapDeps([31,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,29]))),Qn=(0,G.memo)(function(e){let t=(0,K.c)(26),{entity:n}=e;switch(n.renderType){case`Shape`:{let e;return t[0]===n?e=t[1]:(e=(0,q.jsx)($n,{entity:n}),t[0]=n,t[1]=e),e}case`ForceFieldBare`:{let e;return t[2]===n?e=t[3]:(e=(0,q.jsx)(Jn,{entity:n}),t[2]=n,t[3]=e),e}case`Player`:{let e;return t[4]===n?e=t[5]:(e=(0,q.jsx)(Wn,{entity:n}),t[4]=n,t[5]=e),e}case`Explosion`:{let e;return t[6]===n?e=t[7]:(e=(0,q.jsx)(Gn,{entity:n}),t[6]=n,t[7]=e),e}case`Tracer`:{let e;return t[8]===n?e=t[9]:(e=(0,q.jsx)(Kn,{entity:n}),t[8]=n,t[9]=e),e}case`Sprite`:{let e;return t[10]===n?e=t[11]:(e=(0,q.jsx)(qn,{entity:n}),t[10]=n,t[11]=e),e}case`AudioEmitter`:{let e;return t[12]===n?e=t[13]:(e=(0,q.jsx)(Un,{children:(0,q.jsx)(Yn,{entity:n})}),t[12]=n,t[13]=e),e}case`Camera`:{let e;return t[14]===n?e=t[15]:(e=(0,q.jsx)(Ct,{entity:n}),t[14]=n,t[15]=e),e}case`WayPoint`:{let e;return t[16]===n?e=t[17]:(e=(0,q.jsx)(wt,{entity:n}),t[16]=n,t[17]=e),e}case`TerrainBlock`:{let e;return t[18]===n.terrainData?e=t[19]:(e=(0,q.jsx)(Jt,{scene:n.terrainData}),t[18]=n.terrainData,t[19]=e),e}case`InteriorInstance`:{let e;return t[20]===n.interiorData?e=t[21]:(e=(0,q.jsx)(un,{scene:n.interiorData}),t[20]=n.interiorData,t[21]=e),e}case`Sky`:{let e;return t[22]===n?e=t[23]:(e=(0,q.jsx)(Hn,{entity:n}),t[22]=n,t[23]=e),e}case`Sun`:return null;case`WaterBlock`:{let e;return t[24]===n?e=t[25]:(e=(0,q.jsx)(Xn,{entity:n}),t[24]=n,t[25]=e),e}case`MissionArea`:return null;case`None`:return null;default:return null}});function $n(e){let t=(0,K.c)(25),{entity:n}=e,{animationEnabled:r}=d(),i=(0,G.useRef)(null),a;if(t[0]!==r||t[1]!==n.rotate?(a=()=>{if(!i.current||!n.rotate||!r)return;let e=performance.now()/1e3;i.current.rotation.y=e/3*Math.PI*2},t[0]=r,t[1]=n.rotate,t[2]=a):a=t[2],o(a),!n.shapeName)throw Error(`Shape entity missing shapeName: ${n.id}`);let s=n.runtimeObject,c=n.shapeType??`StaticShape`,l=n.dataBlock?.toLowerCase()===`flag`,f=n.teamId&&n.teamId>0?A[n.teamId]:null,p=l&&f?`${f} Flag`:null,m=n.shapeType===`Item`?`pink`:n.threads?`#00ff88`:`yellow`,h=n.rotate?i:void 0,g=s?void 0:n,_;t[3]===p?_=t[4]:(_=p?(0,q.jsx)(u,{opacity:.6,children:p}):null,t[3]=p,t[4]=_);let y;t[5]!==n.emap||t[6]!==m||t[7]!==g||t[8]!==_?(y=(0,q.jsx)(x,{loadingColor:m,streamEntity:g,emap:n.emap,children:_}),t[5]=n.emap,t[6]=m,t[7]=g,t[8]=_,t[9]=y):y=t[9];let b;t[10]!==n.barrelShapeName||t[11]!==s?(b=n.barrelShapeName&&(0,q.jsx)(v,{object:s,shapeName:n.barrelShapeName,type:`Turret`,children:(0,q.jsx)(`group`,{position:[0,1.5,0],children:(0,q.jsx)(x,{})})}),t[10]=n.barrelShapeName,t[11]=s,t[12]=b):b=t[12];let C;t[13]===n?C=t[14]:(C=n.weaponShape&&(0,q.jsx)(ct,{fallback:(0,q.jsx)(S,{color:`red`,label:n.weaponShape}),children:(0,q.jsx)(tt,{name:`Weapon:${n.id}/${n.weaponShape}`,fallback:(0,q.jsx)(S,{color:`cyan`,label:n.weaponShape}),children:(0,q.jsx)(Zn,{entity:n})})}),t[13]=n,t[14]=C);let w;t[15]!==h||t[16]!==y||t[17]!==b||t[18]!==C?(w=(0,q.jsxs)(`group`,{ref:h,children:[y,b,C]}),t[15]=h,t[16]=y,t[17]=b,t[18]=C,t[19]=w):w=t[19];let T;return t[20]!==n.shapeName||t[21]!==c||t[22]!==w||t[23]!==s?(T=(0,q.jsx)(v,{object:s,shapeName:n.shapeName,type:c,children:w}),t[20]=n.shapeName,t[21]=c,t[22]=w,t[23]=s,t[24]=T):T=t[24],T}var er={Root:`_Root_yuidw_1`,Distance:`_Distance_yuidw_9`,Icon:`_Icon_yuidw_18`},tr=1.5,nr=E(`commander/MiniIcons/com_flag_grey`),rr=new R;function ir(e){let t=(0,K.c)(9),{entity:n}=e,r=(0,G.useRef)(null),a=(0,G.useRef)(null),s=(0,G.useRef)(null),c=i(ar),u;t[0]!==c||t[1]!==n.iffColor?(u=()=>{if(a.current&&n.iffColor){let{r:e,g:t,b:r}=n.iffColor;a.current.style.backgroundColor=`rgb(${e},${t},${r})`}if(s.current&&r.current){r.current.getWorldPosition(rr);let e=c.position.distanceTo(rr);s.current.textContent=e.toFixed(1)}},t[0]=c,t[1]=n.iffColor,t[2]=u):u=t[2],o(u);let d=n.iffColor?`rgb(${n.iffColor.r},${n.iffColor.g},${n.iffColor.b})`:`rgb(200,200,200)`,f;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(f=[0,tr,0],t[3]=f):f=t[3];let p;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(p=(0,q.jsx)(`span`,{ref:s,className:er.Distance}),t[4]=p):p=t[4];let m;t[5]===d?m=t[6]:(m={backgroundColor:d,"--flag-icon-url":`url(${nr})`},t[5]=d,t[6]=m);let h=m,g;return t[7]===h?g=t[8]:(g=(0,q.jsx)(`group`,{ref:r,children:(0,q.jsx)(l,{position:f,center:!0,children:(0,q.jsxs)(`div`,{className:er.Root,children:[p,(0,q.jsx)(`div`,{ref:a,className:er.Icon,style:h})]})})}),t[7]=h,t[8]=g),g}function ar(e){return e.camera}function or(){let e=(0,K.c)(1),t=sr,n;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=(0,q.jsx)(`group`,{ref:t,children:(0,q.jsx)(cr,{})}),e[0]=n):n=e[0],n}function sr(e){rt.setState({root:e})}var cr=(0,G.memo)(function(){let e=De(),t=(0,G.useRef)(new Map).current,n=new Set;for(let r of e)n.add(r.id),t.set(r.id,r);for(let e of t.keys())n.has(e)||t.delete(e);return(0,q.jsx)(q.Fragment,{children:[...t.values()].map(e=>(0,q.jsx)(lr,{entity:e},e.id))})}),lr=(0,G.memo)(function(e){let t=(0,K.c)(7),{entity:n}=e;if(nt(n)){let e;t[0]===n?e=t[1]:(e=(0,q.jsx)(Qn,{entity:n}),t[0]=n,t[1]=e);let r;return t[2]!==n.id||t[3]!==e?(r=(0,q.jsx)(`group`,{name:n.id,children:e}),t[2]=n.id,t[3]=e,t[4]=r):r=t[4],r}if(n.renderType===`None`)return null;let r;return t[5]===n?r=t[6]:(r=(0,q.jsx)(dr,{entity:n}),t[5]=n,t[6]=r),r});function ur({entity:e}){let t=(0,G.useRef)(!1),[n,r]=(0,G.useState)(()=>(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0);return t.current=n,o(()=>{let n=(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0;n!==t.current&&(t.current=n,r(n))}),n?(0,q.jsx)(ir,{entity:e}):null}function dr(e){let t=(0,K.c)(35),{entity:n}=e,r=n.position,i=n.scale,a;bb0:{if(!n.rotation){a=void 0;break bb0}let e;t[0]===n.rotation?e=t[1]:(e=new oe(...n.rotation),t[0]=n.rotation,t[1]=e),a=e}let o=a;if(n.renderType===`Shape`&&!n.shapeName){let e=n.id,a;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(a=(0,q.jsx)(`sphereGeometry`,{args:[.3,6,4]}),t[2]=a):a=t[2];let s;t[3]===n.className?s=t[4]:(s=b(n.className),t[3]=n.className,t[4]=s);let c;t[5]===s?c=t[6]:(c=(0,q.jsxs)(`mesh`,{children:[a,(0,q.jsx)(`meshBasicMaterial`,{color:s,wireframe:!0})]}),t[5]=s,t[6]=c);let l;t[7]===n?l=t[8]:(l=(0,q.jsx)(ur,{entity:n}),t[7]=n,t[8]=l);let u;return t[9]!==n.id||t[10]!==r||t[11]!==o||t[12]!==i||t[13]!==c||t[14]!==l?(u=(0,q.jsxs)(`group`,{name:e,position:r,quaternion:o,scale:i,children:[c,l]}),t[9]=n.id,t[10]=r,t[11]=o,t[12]=i,t[13]=c,t[14]=l,t[15]=u):u=t[15],u}let s;t[16]!==n.className||t[17]!==n.renderType?(s=n.renderType===`Explosion`?null:(0,q.jsxs)(`mesh`,{children:[(0,q.jsx)(`sphereGeometry`,{args:[.5,8,6]}),(0,q.jsx)(`meshBasicMaterial`,{color:b(n.className),wireframe:!0})]}),t[16]=n.className,t[17]=n.renderType,t[18]=s):s=t[18];let c=s,l;t[19]===n?l=t[20]:(l=(0,q.jsx)(Qn,{entity:n}),t[19]=n,t[20]=l);let u;t[21]!==c||t[22]!==l?(u=(0,q.jsx)(ct,{fallback:c,children:l}),t[21]=c,t[22]=l,t[23]=u):u=t[23];let d;t[24]===n?d=t[25]:(d=(0,q.jsx)(ur,{entity:n}),t[24]=n,t[25]=d);let f;t[26]!==u||t[27]!==d?(f=(0,q.jsxs)(`group`,{name:`model`,children:[u,d]}),t[26]=u,t[27]=d,t[28]=f):f=t[28];let p;return t[29]!==n.id||t[30]!==r||t[31]!==o||t[32]!==i||t[33]!==f?(p=(0,q.jsx)(`group`,{name:n.id,position:r,quaternion:o,scale:i,children:f}),t[29]=n.id,t[30]=r,t[31]=o,t[32]=i,t[33]=f,t[34]=p):p=t[34],p}function fr(){let e=(0,K.c)(3),{fov:t}=d(),n;e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=[0,256,0],e[0]=n):n=e[0];let r;return e[1]===t?r=e[2]:(r=(0,q.jsx)(dt,{makeDefault:!0,position:n,fov:t}),e[1]=t,e[2]=r),r}function pr(e){let t=(0,K.c)(3),{children:n}=e,{debugMode:r}=f(),i;return t[0]!==n||t[1]!==r?(i=r?(0,q.jsx)(G.Suspense,{children:n}):null,t[0]=n,t[1]=r,t[2]=i):i=t[2],i}var mr=he(`InputConsumer`),hr=200,gr=Math.PI/2-.01,_r=45,vr=31,yr=40,br=1/32,xr=2*Math.PI;function Sr(e){return((Math.round(e/xr*65536)|0)<<16>>16)*xr/65536}var Cr=new R,wr=new R,Z=new R,Tr=new P(0,0,0,`YXZ`);function Er(e,t,n,r,i,a,o){if(r===0&&i===0&&a===0)return;let s=Math.sin(t),c=Math.cos(t),l=Math.sin(n),u=Math.cos(n),d=o*br;e.x+=(c*r+s*u*i+s*l*a)*d,e.y+=(-s*r+c*u*i+c*l*a)*d,e.z+=(-l*i+u*a)*d}function Dr(){let{moveQueue:e,mode:t,setMode:n}=Be(),r=Ce(e=>e.adapter),a=Ce(e=>e.gameStatus),s=Ce(e=>e.liveReady),c=Ce(e=>e.sendMoves),l=ge(),u=i(e=>e.camera),d=g(),f=(0,G.useRef)(null),p=(0,G.useRef)([]),m=(0,G.useRef)(0),_=(0,G.useRef)(0),v=(0,G.useRef)(null),y=(0,G.useRef)(0),b=(0,G.useRef)(0),x=(0,G.useRef)({x:0,y:0,z:0}),S=(0,G.useRef)(0),C=(0,G.useRef)(0),w=(0,G.useRef)({x:0,y:0,z:0}),T=(0,G.useRef)(!1),E=(0,G.useRef)({x:0,y:0,z:0}),D=(0,G.useRef)({x:0,y:0,z:0}),O=(0,G.useRef)(!1),k=(0,G.useRef)(null),A=(0,G.useRef)(0),j=(0,G.useRef)(0),M=(0,G.useRef)(0),ee=(0,G.useRef)(0),N=(0,G.useRef)(0),P=(0,G.useRef)([!1,!1,!1,!1,!1,!1]),F=!!r&&(a===`connected`||a===`authenticating`);return(0,G.useEffect)(()=>{if(F&&r){if(f.current===r)return;mr.info(`wiring adapter to engine store`);let e=Fe.getState(),t={source:`live`,duration:1/0,missionName:e.mapName??null,gameType:null,serverDisplayName:e.serverName??null,recorderName:e.warriorName??null,recordingDate:null,streamingPlayback:r};l.getState().setRecording(t),l.getState().setPlaybackStatus(`playing`),f.current=r,T.current=!1,O.current=!1,k.current=null,p.current.length=0,m.current=0,_.current=0,v.current=null,n(`fly`)}else !F&&f.current&&(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),f.current=null,T.current=!1,O.current=!1,k.current=null,p.current.length=0,n(`local`))},[F,r,l,n]),(0,G.useEffect)(()=>{!s&&f.current&&(mr.info(`mission change: resetting prediction state and mode`),T.current=!1,O.current=!1,k.current=null,p.current.length=0,m.current=0,_.current=0,v.current=null,A.current=0,j.current=0,M.current=0,ee.current=0,N.current=0,P.current.fill(!1),n(`fly`))},[s,n]),(0,G.useEffect)(()=>{if(!F)return rt.subscribe(e=>{n(e.cameraMode===`orbitOverride`?`follow`:`local`)})},[F,n]),h(()=>{if(!f.current||a!==`connected`||!s)return;let e=A.current,t=j.current;A.current=0,j.current=0;let n=M.current,r=ee.current,i=N.current;M.current=0,ee.current=0,N.current=0;let o=[...P.current];P.current.fill(!1);let l=Sr(e),u=Sr(t);y.current+=l-e,b.current+=u-t,S.current=y.current,C.current=b.current,w.current={...x.current};let d=yr*2,h=y.current-l,g=b.current-u;Er(x.current,h,g,n,r,i,d),o[1]=!0;let _=m.current++,v={x:n,y:r,z:i,yaw:e,pitch:t,roll:0,trigger:o,freeLook:!1},T=p.current;T.push({moveIndex:_,move:v,yaw:l,pitch:u,x:n,y:r,z:i}),T.length>_r&&T.splice(0,T.length-_r);let F=f.current.lastMoveAck;for(;T.length>0&&T[0].moveIndex<F;)T.shift();if(T.length>0){let e=T.slice(0,vr);c(e.map(e=>e.move),e[0].moveIndex)}let te=f.current.getSnapshot();if(te!==k.current){k.current=te;let e=te?.camera;if(e?.orbitTargetId){let t=te.entities.find(t=>t.id===e.orbitTargetId);t?.position&&(E.current={...D.current},D.current={x:t.position[0],y:t.position[1],z:t.position[2]},O.current||=(E.current={...D.current},!0))}}}),o((r,i)=>{let o=e.current;if(o.length>0){let t=0,n=0,r=0,i=0,c=0,l=0,d=[!1,!1,!1,!1,!1,!1];for(let e of o){t+=e.deltaYaw,n+=e.deltaPitch,Math.abs(e.x)>Math.abs(r)&&(r=e.x),Math.abs(e.y)>Math.abs(i)&&(i=e.y),Math.abs(e.z)>Math.abs(c)&&(c=e.z),l+=e.delta;for(let t=0;t<e.triggers.length;t++)e.triggers[t]&&(d[t]=!0)}if(e.current.length=0,F&&f.current&&a===`connected`&&s){A.current+=t,j.current+=n,M.current=r,ee.current=i,N.current=c;for(let e=0;e<d.length;e++)d[e]&&(P.current[e]=!0);y.current+=t,b.current=Math.max(-W,Math.min(W,b.current+n))}else{let e=rt.getState();if(e.playback){e.cameraMode===`freeFly`?Or(u,t,n,r,i,c,l):e.cameraMode===`orbitOverride`&&(e.orbitOverrideYaw+=t,e.orbitOverridePitch=Math.max(-W,Math.min(W,e.orbitOverridePitch+n)));return}Or(u,t,n,r,i,c,l);return}}if(!F||!f.current||a!==`connected`||!s)return;let c=f.current,l=c.getSnapshot(),m=l?.camera;if(m&&m!==v.current&&typeof m.yaw==`number`&&typeof m.pitch==`number`){v.current=m;let e=c.lastMoveAck;if(e>_.current){_.current=e;let t=p.current;for(;t.length>0&&t[0].moveIndex<e;)t.shift()}y.current=m.yaw,b.current=m.pitch,x.current={x:m.position[0],y:m.position[1],z:m.position[2]};let r=yr*2;for(let e of p.current)Er(x.current,y.current,b.current,e.x,e.y,e.z,r),y.current+=e.yaw,b.current=Math.max(-W,Math.min(W,b.current+e.pitch));y.current+=A.current,b.current=Math.max(-W,Math.min(W,b.current+j.current)),S.current=y.current,C.current=b.current,w.current={...x.current},T.current=!0;let i=m.mode===`third-person`?`follow`:`fly`;if(i!==t&&(mr.info(`server corrected observer mode: %s → %s`,t,i),n(i),f.current&&(f.current.observerMode=i),i===`fly`&&(O.current=!1,k.current=null)),m.orbitTargetId&&!O.current){let e=l.entities.find(e=>e.id===m.orbitTargetId);if(e?.position){let t={x:e.position[0],y:e.position[1],z:e.position[2]};D.current=t,E.current={...t},O.current=!0}}}if(T.current){if(t===`fly`)kr(r.camera,w.current,x.current,y.current,b.current,d());else if(t===`follow`){if(!O.current)return;Ar(r.camera,E.current,D.current,y.current,b.current,d(),m?.orbitDistance??4,m?.orbitTargetId)}}}),(0,G.useEffect)(()=>()=>{f.current&&=(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),null)},[l]),null}function Or(e,t,n,r,i,a,o){if((t!==0||n!==0)&&(Tr.setFromQuaternion(e.quaternion,`YXZ`),Tr.y-=t,Tr.x-=n,Tr.x=Math.max(-gr,Math.min(gr,Tr.x)),e.quaternion.setFromEuler(Tr)),r!==0||i!==0||a!==0){e.getWorldDirection(Cr),Cr.normalize(),wr.crossVectors(e.up,Cr).normalize(),Z.set(0,0,0),i!==0&&Z.addScaledVector(Cr,i),r!==0&&Z.addScaledVector(wr,-r),a!==0&&(Z.y+=a);let t=Z.length();t>0&&(Z.multiplyScalar(Math.min(1,t)/t*hr*o),e.position.add(Z))}}function kr(e,t,n,r,i,a){let o=t.x+(n.x-t.x)*a,s=t.y+(n.y-t.y)*a,c=t.z+(n.z-t.z)*a;e.position.set(s,c,o);let[l,u,d,f]=ye(r,i);e.quaternion.set(l,u,d,f)}function Ar(e,t,n,r,i,a,o,s){let c=t.x+(n.x-t.x)*a,l=t.y+(n.y-t.y)*a,u=t.z+(n.z-t.z)*a+(s!=null&&rt.getState().entities.get(s)?.renderType===`Player`?1:0),d=Math.sin(i),f=Math.cos(i),p=Math.sin(r),m=Math.cos(r),h=Math.max(.1,o),g=c-p*f*h,_=l-m*f*h,v=u+d*h;e.position.set(_,v,g);let[y,b,x,S]=ye(r,i);e.quaternion.set(y,b,x,S)}var jr=he(`CameraTourConsumer`);function Mr(e){return e<.5?4*e*e*e:1-(-2*e+2)**3/2}var Nr=3,Pr=2,Fr=1.8,Ir=1.8,Lr=1.2,Rr=.6,zr=3/4*(2*Math.PI),Br=zr/Rr,Vr=1.5,Hr=1.5,Ur=6,Wr=180,Gr=1.4,Kr=new B,qr=new B,Jr=new B,Yr=new fe,Xr=new R,Zr=new R,Qr=new R,$r=new R,ei=new R,Q=new oe,ti=new oe,ni=new fe,ri=new P;function ii(e){if(e.orbitCenter)return ei.set(e.orbitCenter[0],e.orbitCenter[1],e.orbitCenter[2]);let t=e.targets[e.currentIndex];return ei.set(t.position[0],t.position[1],t.position[2])}function ai(e){return e.orbitRadius??Nr}function oi(e){return ai(e)*(Pr/Nr)}function si(e,t,n){let r=ii(e),i=ai(e),a=oi(e);return n.set(r.x+Math.cos(t)*i,r.y+a,r.z+Math.sin(t)*i)}function ci(e,t,n){let r=e.getObjectByName(t.entityId);if(r){Kr.setFromObject(r),Kr.getCenter(Xr),n.orbitCenter=[Xr.x,Xr.y,Xr.z];let e=ni.copy(r.matrixWorld).invert();qr.makeEmpty(),r.traverse(t=>{t.geometry&&(t.geometry.boundingBox||t.geometry.computeBoundingBox(),Jr.copy(t.geometry.boundingBox),Yr.multiplyMatrices(e,t.matrixWorld),Jr.applyMatrix4(Yr),qr.union(Jr))}),qr.getSize(Zr);let i=Zr.y,a=Math.max(Zr.x,Zr.z),o=i/2+Ir,s=a/2+Lr,c=Math.max(o,s);n.orbitRadius=Math.max(Fr,c);let l=o>=s?`height`:`spread`,u=c<Fr?` (clamped)`:``;jr.debug(`%s: size=%s height→%s spread→%s driven by %s → radius=%d%s`,t.label,`${Zr.x.toFixed(1)}×${Zr.y.toFixed(1)}×${Zr.z.toFixed(1)}`,o.toFixed(1),s.toFixed(1),l,n.orbitRadius,u)}else n.orbitCenter=null,n.orbitRadius=null,jr.debug(`%s: no scene object, fallback radius=%d`,t.label,Nr)}function li(e){return ri.setFromQuaternion(e,`YXZ`),ri.z=0,e.setFromEuler(ri)}function ui(e,t){return ni.lookAt(e,t,$r.set(0,1,0)),ti.setFromRotationMatrix(ni),li(ti)}function di(e,t,n){let r=ii(t),i=si(t,n,Qr.clone()),a=e.distanceTo(i);if(a<20)return new ce([e.clone(),i],!1,`centripetal`);let o=new R().addVectors(e,i).multiplyScalar(.5);return o.lerp(r,.3),o.y+=a*.15,new ce([e.clone(),o,i],!1,`centripetal`)}function fi(e,t){let n=ii(t);return Math.atan2(e.z-n.z,e.x-n.x)}function pi(e){return Math.max(Hr,Math.min(Ur,e/Wr))}function mi(e,t,n,r){let i=e.targets[e.currentIndex];if(!e.curve){e.startPos=[t.position.x,t.position.y,t.position.z],li(Q.copy(t.quaternion)),e.startQuat=[Q.x,Q.y,Q.z,Q.w],ci(r,i,e);let n=t.position.clone();e.curve=di(n,e,fi(n,e)),e.phaseDuration=pi(e.curve.getLength()),e.elapsed=0;return}e.elapsed+=n;let a=Math.min(1,Mr(e.elapsed/e.phaseDuration));e.curve.getPointAt(a,Qr),t.position.copy(Qr);let o=Mr(Math.min(1,e.elapsed/e.phaseDuration*Gr)),s=ui(Qr,ii(e));o<1&&e.startQuat?(Q.set(e.startQuat[0],e.startQuat[1],e.startQuat[2],e.startQuat[3]),Q.slerp(s,o),t.quaternion.copy(Q)):t.quaternion.copy(s),e.elapsed>=e.phaseDuration&&(e.phase=`orbiting`,e.elapsed=0,e.orbitStartAngle=fi(t.position,e))}function hi(e,t,n){let r=e.targets.length===1,i=e.currentIndex>=e.targets.length-1;e.elapsed+=n;let a=e.orbitStartAngle,o=Br+Vr,s;if(e.elapsed<=Br)s=a+e.elapsed*Rr;else{let t=e.elapsed-Br,n=Math.min(1,t/Vr),r=t*Rr*(1-n/2);s=a+zr+r}si(e,s,Qr),t.position.copy(Qr);let c=ui(Qr,ii(e));t.quaternion.copy(c),e.elapsed>=o&&(r||i?U.getState().cancel():U.getState().advanceTarget())}function gi(){let e=(0,K.c)(4),t=i(xi),n=i(bi),r=i(yi),a=(0,G.useRef)(null);We(`nextStop`,vi),We(`exitTour`,_i);let s;return e[0]!==n||e[1]!==t||e[2]!==r?(s=(e,i)=>{let o=U.getState().animation;if(!o){a.current&&=(li(n.quaternion),null);return}t(),a.current=o,o.phase===`traveling`?mi(o,n,i,r):hi(o,n,i)},e[0]=n,e[1]=t,e[2]=r,e[3]=s):s=e[3],o(s),null}function _i(){U.getState().cancel()}function vi(){let e=U.getState().animation;e&&(e.currentIndex>=e.targets.length-1?U.getState().cancel():U.getState().advanceTarget())}function yi(e){return e.scene}function bi(e){return e.camera}function xi(e){return e.invalidate}var Si=3;function $({map:e}){let t=ze,n=i(e=>e.gl.domElement),r=(0,G.useMemo)(()=>{let n=e.map(e=>{let t=Array.isArray(e.keys)?e.keys:[e.keys];return{name:e.name,bindings:t.map(Ie)}}),r={};for(let e of n)r[e.name]=Ve(e.bindings[0]);let i=new Map,a=[],o=[],s=[],c=[],l=[];for(let e of n)for(let t of e.bindings)switch(t.type){case`key`:{let n=i.get(t.code);n||(n=[],i.set(t.code,n)),n.push({action:e,binding:t});break}case`click`:a.push({action:e,binding:t});break;case`drag`:o.push({action:e,binding:t});break;case`pointerLockMove`:s.push({action:e});break;case`scroll`:c.push({action:e});break;case`touch`:l.push({action:e});break}function u(e){return e==null?!0:e===!!document.pointerLockElement}function d(e){let{actions:n}=t.getState(),r={};for(let[,t]of i)for(let{action:i,binding:a}of t){let t=e.has(a.code)&&He(e,a.modifiers),o=n[i.name]?.pressed??!1;t&&!o?(r[i.name]={pressed:!0},Me(i.name)):!t&&o&&(r[i.name]={pressed:!1})}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}let f=-1,p=0,m=0,h=!1;function g(e,n){t.setState(t=>({...t,actions:{...t.actions,[e]:n}}))}function _(e){let t=!!document.pointerLockElement;for(let{action:t,binding:n}of a){if(!u(n.whenPointerLocked))continue;let r=n.button??0;e.button===r&&je(e,n.modifiers)&&g(t.name,{pressed:!0})}t||(f=e.button,p=e.clientX,m=e.clientY,h=!1)}function v(e){if(document.pointerLockElement){if(s.length>0){let{actions:n}=t.getState(),r={};for(let{action:t}of s){let i=n[t.name];r[t.name]={...i,deltaX:i.deltaX+e.movementX,deltaY:i.deltaY+e.movementY}}t.setState(e=>({...e,actions:{...e.actions,...r}}))}return}if(f<0)return;if(!h){let n=e.clientX-p,r=e.clientY-m;if(Math.abs(n)<Si&&Math.abs(r)<Si)return;h=!0;for(let{action:e,binding:n}of a)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].pressed&&g(e.name,{pressed:!1});for(let{action:e,binding:t}of o)u(t.whenPointerLocked)&&(t.button??0)===f&&g(e.name,{dragging:!0,deltaX:0,deltaY:0,startX:p,startY:m})}let{actions:n}=t.getState(),r={};for(let{action:t,binding:i}of o){if(!u(i.whenPointerLocked)||(i.button??0)!==f)continue;let a=n[t.name];r[t.name]={...a,deltaX:a.deltaX+e.movementX,deltaY:a.deltaY+e.movementY}}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}function y(e){let n=!!document.pointerLockElement;for(let{action:n,binding:r}of a){if(!u(r.whenPointerLocked))continue;let i=r.button??0;e.button===i&&t.getState().actions[n.name].pressed&&(Me(n.name),g(n.name,{pressed:!1}))}if(!n&&e.button===f){for(let{action:e,binding:n}of o)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].dragging&&g(e.name,Re());f=-1,h=!1}}function b(e){for(let{action:t}of c)g(t.name,{deltaX:e.deltaX,deltaY:e.deltaY}),Me(t.name)}let x=null,S=0,C=0;function w(e){if(x!==null||l.length===0)return;let t=e.changedTouches[0];if(t){x=t.identifier,S=t.clientX,C=t.clientY;for(let{action:e}of l)g(e.name,{touching:!0,dragging:!1,deltaX:0,deltaY:0})}}function T(e){if(x!==null)for(let n=0;n<e.changedTouches.length;n++){let r=e.changedTouches[n];if(r.identifier!==x)continue;let i=r.clientX-S,a=r.clientY-C;S=r.clientX,C=r.clientY;for(let{action:e}of l){let n=t.getState().actions[e.name];g(e.name,{touching:!0,dragging:!0,deltaX:n.deltaX+i,deltaY:n.deltaY+a})}break}}function E(e){if(x!==null){for(let t=0;t<e.changedTouches.length;t++)if(e.changedTouches[t].identifier===x){x=null;for(let{action:e}of l)g(e.name,Pe());break}}}return{actionNames:n.map(e=>e.name),initialActions:r,deriveKeyActions:d,hasKeyBindings:i.size>0,handleMouseDown:_,handleMouseMove:v,handleMouseUp:y,handleWheel:b,handleTouchStart:w,handleTouchMove:T,handleTouchEnd:E,hasMouseBindings:a.length>0||o.length>0||s.length>0,hasScrollBindings:c.length>0,hasTouchBindings:l.length>0}},[e,t]);return(0,G.useEffect)(()=>{t.setState(e=>({...e,actions:{...e.actions,...r.initialActions}}));let e;return r.hasKeyBindings&&(r.deriveKeyActions(t.getState().keys),e=t.subscribe(e=>e.keys,e=>r.deriveKeyActions(e))),r.hasMouseBindings&&(n.addEventListener(`mousedown`,r.handleMouseDown),document.addEventListener(`mousemove`,r.handleMouseMove),document.addEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.addEventListener(`wheel`,r.handleWheel,{passive:!0}),r.hasTouchBindings&&(n.addEventListener(`touchstart`,r.handleTouchStart,{passive:!0}),document.addEventListener(`touchmove`,r.handleTouchMove,{passive:!0}),document.addEventListener(`touchend`,r.handleTouchEnd,{passive:!0}),document.addEventListener(`touchcancel`,r.handleTouchEnd,{passive:!0})),()=>{e?.(),r.hasMouseBindings&&(n.removeEventListener(`mousedown`,r.handleMouseDown),document.removeEventListener(`mousemove`,r.handleMouseMove),document.removeEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.removeEventListener(`wheel`,r.handleWheel),r.hasTouchBindings&&(n.removeEventListener(`touchstart`,r.handleTouchStart),document.removeEventListener(`touchmove`,r.handleTouchMove),document.removeEventListener(`touchend`,r.handleTouchEnd),document.removeEventListener(`touchcancel`,r.handleTouchEnd)),t.setState(e=>{let t={...e.actions};for(let e of r.actionNames)delete t[e];return{...e,actions:t}})}},[r,t,n]),null}var Ci=[{name:`moveForward`,keys:[`KeyW`]},{name:`moveBackward`,keys:[`KeyS`]},{name:`moveLeft`,keys:[`KeyA`]},{name:`moveRight`,keys:[`KeyD`]},{name:`moveUp`,keys:[`KeyE`]},{name:`moveDown`,keys:[`KeyQ`]},{name:`adjustSpeed`,keys:[{type:`scroll`}]}],wi=[{name:`lookUp`,keys:[`ArrowUp`]},{name:`lookDown`,keys:[`ArrowDown`]},{name:`lookLeft`,keys:[`ArrowLeft`]},{name:`lookRight`,keys:[`ArrowRight`]},{name:`dragLook`,keys:[{type:`drag`,button:0}]},{name:`lockedLook`,keys:[{type:`pointerLockMove`}]},{name:`touchLook`,keys:[{type:`touch`}]}],Ti=[{name:`canvasClick`,keys:[{type:`click`,button:0,whenPointerLocked:!1}]}],Ei=[{name:`camera1`,keys:[`Digit1`]},{name:`camera2`,keys:[`Digit2`]},{name:`camera3`,keys:[`Digit3`]},{name:`camera4`,keys:[`Digit4`]},{name:`camera5`,keys:[`Digit5`]},{name:`camera6`,keys:[`Digit6`]},{name:`camera7`,keys:[`Digit7`]},{name:`camera8`,keys:[`Digit8`]},{name:`camera9`,keys:[`Digit9`]}],Di=[{name:`playPause`,keys:[`Space`]},{name:`decreasePlaybackSpeed`,keys:[`Comma`,`Shift-Comma`]},{name:`increasePlaybackSpeed`,keys:[`Period`,`Shift-Period`]}],Oi=[{name:`toggleObserverMode`,keys:[`Space`]}],ki=[{name:`nextPlayer`,keys:[{type:`click`,button:0,whenPointerLocked:!0}]}],Ai=[{name:`nextStop`,keys:[{type:`click`,button:0}]},{name:`exitTour`,keys:[`Escape`]}];function ji(){let e=(0,K.c)(27),t=we(),n=Le(),r=ve(Mi),i=t?.source===`demo`,a=t?.source===`live`,o=!t,s=o&&!r||a&&n===`fly`,c=!r,l=!r,u;e[0]===s?u=e[1]:(u=s&&(0,q.jsx)($,{map:Ci}),e[0]=s,e[1]=u);let d;e[2]===c?d=e[3]:(d=c&&(0,q.jsx)($,{map:wi}),e[2]=c,e[3]=d);let f;e[4]===l?f=e[5]:(f=l&&(0,q.jsx)($,{map:Ti}),e[4]=l,e[5]=f);let p;e[6]!==o||e[7]!==r?(p=o&&!r&&(0,q.jsx)($,{map:Ei}),e[6]=o,e[7]=r,e[8]=p):p=e[8];let m;e[9]===i?m=e[10]:(m=i&&(0,q.jsx)($,{map:Di}),e[9]=i,e[10]=m);let h;e[11]===a?h=e[12]:(h=a&&(0,q.jsx)($,{map:Oi}),e[11]=a,e[12]=h);let g;e[13]!==n||e[14]!==a?(g=a&&n===`follow`&&(0,q.jsx)($,{map:ki}),e[13]=n,e[14]=a,e[15]=g):g=e[15];let _;e[16]===r?_=e[17]:(_=r&&(0,q.jsx)($,{map:Ai}),e[16]=r,e[17]=_);let v;return e[18]!==u||e[19]!==d||e[20]!==f||e[21]!==p||e[22]!==m||e[23]!==h||e[24]!==g||e[25]!==_?(v=(0,q.jsxs)(q.Fragment,{children:[u,d,f,p,m,h,g,_]}),e[18]=u,e[19]=d,e[20]=f,e[21]=p,e[22]=m,e[23]=h,e[24]=g,e[25]=_,e[26]=v):v=e[26],v}function Mi(e){return e.animation!==null}function Ni(e,t){return(0,G.lazy)(()=>t().then(t=>({default:t[e]})))}var Pi=Ni(`StreamingController`,()=>H(()=>import(`./StreamingController-BLcsIID1.js`),__vite__mapDeps([36,1,9,10,11,4,12,13,2,3,5,14,15,16,17,18,19,20,21,22,23,6,7,8,24,25,26,0,27,28,29,30,37]))),Fi=Ni(`DebugElements`,()=>H(()=>import(`./DebugElements-DXesdZsb.js`),__vite__mapDeps([38,1,2,3,4,5,25,26,39]))),Ii=Ni(`Mission`,()=>H(()=>import(`./Mission-DUBV2Clg.js`),__vite__mapDeps([40,1,9,10,11,4,12,13,2,3,5,14,15,16,17,18,19,20,21,22,23,41,8,42]))),Li=Ni(`ChatSoundPlayer`,()=>H(()=>import(`./ChatSoundPlayer-CeH36_2V.js`),__vite__mapDeps([43,1,14,2,3,4,5,13,15,16,12,17,18]))),Ri=(0,G.memo)(function(e){let t=(0,K.c)(23),{dpr:n,onCreated:r,missionName:i,missionType:a,onLoadingChange:o}=e,s=we(),c=Oe(),l=c===`demo`||c===`live`,u,d;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(u=(0,q.jsx)(ji,{}),d=(0,q.jsx)(Ue,{}),t[0]=u,t[1]=d):(u=t[0],d=t[1]);let f;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,q.jsx)(gt,{}),t[2]=f):f=t[2];let m,h;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(m=(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(or,{})}),h=(0,q.jsx)(fr,{}),t[3]=m,t[4]=h):(m=t[3],h=t[4]);let g;t[5]===Symbol.for(`react.memo_cache_sentinel`)?(g=(0,q.jsx)(Un,{children:(0,q.jsx)(Li,{})}),t[5]=g):g=t[5];let _;t[6]===Symbol.for(`react.memo_cache_sentinel`)?(_=(0,q.jsx)(pr,{children:(0,q.jsx)(Fi,{})}),t[6]=_):_=t[6];let v;t[7]===s?v=t[8]:(v=s?(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Pi,{recording:s})}):null,t[7]=s,t[8]=v);let b;t[9]!==l||t[10]!==i||t[11]!==a||t[12]!==o?(b=l?null:(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Ii,{name:i,missionType:a,onLoadingChange:o},`${i}~${a}`)}),t[9]=l,t[10]=i,t[11]=a,t[12]=o,t[13]=b):b=t[13];let x,S;t[14]===Symbol.for(`react.memo_cache_sentinel`)?(x=(0,q.jsx)(gi,{}),S=(0,q.jsx)(Dr,{}),t[14]=x,t[15]=S):(x=t[14],S=t[15]);let C;t[16]!==v||t[17]!==b?(C=(0,q.jsx)(y,{children:(0,q.jsxs)(Ne,{children:[u,d,(0,q.jsxs)(p,{children:[f,m,h,g,_,v,b,x,S]})]})}),t[16]=v,t[17]=b,t[18]=C):C=t[18];let w;return t[19]!==n||t[20]!==r||t[21]!==C?(w=(0,q.jsx)(St,{dpr:n,onCreated:r,children:C}),t[19]=n,t[20]=r,t[21]=C,t[22]=w):w=t[22],w});export{Ri as GameView};