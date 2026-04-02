const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PlayerModel-CEkjCM3w.js","assets/chunk-DECur_0Z.js","assets/index-DuexFH-D.js","assets/preload-helper-BPkniflS.js","assets/streamHelpers-DNksG7mZ.js","assets/three.module-C9W4LJrj.js","assets/mission-S3koG-vu.js","assets/logger-B058WGzf.js","assets/react-three-fiber.esm-CD18QK1u.js","assets/jsx-runtime-BpGWiA-R.js","assets/traditional-ec-lUAFC.js","assets/SettingsProvider-CeFD8Cx1.js","assets/engineStore-Mono9lyt.js","assets/manifest-MMwwguGo.js","assets/stringUtils-EmGsjr9D.js","assets/iconBase-BCRUFbxq.js","assets/JoystickContext-D1zeSnLk.js","assets/scene-BpfzP6B-.js","assets/cameraTourStore-DQ989o2x.js","assets/index-BD1vN1aq.css","assets/Html-DOBpqhkg.js","assets/extends-DPirtscy.js","assets/playbackUtils-huPZPMi3.js","assets/Texture-D2i1vM3o.js","assets/useBaseQuery-Dfqu631u.js","assets/globalFogUniforms-BQRkMz5n.js","assets/GenericShape-DTmrOv2n.js","assets/AudioEmitter-IziXU2Av.js","assets/DebugBounds-BnJbEQUF.js","assets/AudioEmitter-DAQByNim.css","assets/useAnisotropy-Dq6cNuNI.js","assets/DebugSuspense-D7OBM5vj.js","assets/ShapeErrorBoundary-CKhGCR8M.js","assets/streamPlaybackStore-UQ4nn4bZ.js","assets/PlayerModel-Bi7C0zGW.css","assets/ShapeModel-DgDDL7I2.js","assets/Projectiles-Dr7eZwbS.js","assets/ForceFieldBare-BdigqQO3.js","assets/AudioEmitter-DmOXGjHe.js","assets/WaterBlock-C-8tx_Ud.js","assets/StreamingController-GPefNdta.js","assets/gameEntityTypes-6Vr_C_kI.js","assets/DebugElements-CstJF6BN.js","assets/DebugElements-BP0b5jan.css","assets/Mission-DyWxaKaZ2.js","assets/useQuery-DguWrewZ.js","assets/misToScene-CUofLla5.js","assets/ChatSoundPlayer-B7e0yCQv.js"])))=>i.map(i=>d[i]);
import{r as e}from"./chunk-DECur_0Z.js";import{n as t,r as n,t as r}from"./jsx-runtime-BpGWiA-R.js";import{a as i,i as a,o,t as s}from"./react-three-fiber.esm-CD18QK1u.js";import{a as c,i as l}from"./SettingsProvider-CeFD8Cx1.js";import{t as u}from"./useQuery-DguWrewZ.js";import{A as d,O as f,T as p,b as m,c as h,k as g,v as _,y as v}from"./playbackUtils-huPZPMi3.js";import{t as y}from"./stringUtils-EmGsjr9D.js";import{a as b}from"./engineStore-Mono9lyt.js";import{t as x}from"./logger-B058WGzf.js";import{n as S,r as C,t as w}from"./cameraTourStore-DQ989o2x.js";import{t as T,x as E}from"./streamHelpers-DNksG7mZ.js";import{A as D,C as ee,Ct as O,D as k,Dt as A,Ht as j,Kt as M,N,Ot as P,S as F,Ut as I,Wt as L,_ as te,b as R,f as z,h as ne,j as re,jt as ie,k as B,kt as ae,m as oe,q as se,rt as ce,ut as le,v as ue,w as de}from"./three.module-C9W4LJrj.js";import{n as fe,r as pe,t as me}from"./scene-BpfzP6B-.js";import"./mission-S3koG-vu.js";import{t as V}from"./preload-helper-BPkniflS.js";import{t as he}from"./extends-DPirtscy.js";import{t as ge}from"./Html-DOBpqhkg.js";import{t as H}from"./Texture-D2i1vM3o.js";import{$ as _e,A as ve,C as ye,D as be,G as xe,K as Se,O as Ce,Q as we,S as Te,U as Ee,V as De,W as Oe,X as ke,Y as Ae,_ as je,b as Me,f as Ne,g as Pe,h as Fe,j as Ie,m as Le,o as Re,p as U,q as ze,s as Be,t as Ve,u as He,v as Ue,w as We,x as Ge,y as Ke}from"./index-DuexFH-D.js";import{n as qe,t as Je}from"./DebugBounds-BnJbEQUF.js";import{f as Ye,u as Xe}from"./AudioEmitter-IziXU2Av.js";import{t as Ze}from"./DebugSuspense-D7OBM5vj.js";import{t as Qe}from"./gameEntityTypes-6Vr_C_kI.js";import{n as $e}from"./streamPlaybackStore-UQ4nn4bZ.js";import{n as et,o as tt,t as nt}from"./GenericShape-DTmrOv2n.js";import{c as rt,d as it,i as at,n as ot,o as st,r as ct,s as lt,t as W,u as ut}from"./globalFogUniforms-BQRkMz5n.js";import{t as dt}from"./useAnisotropy-Dq6cNuNI.js";import{t as ft}from"./ShapeErrorBoundary-CKhGCR8M.js";var G=e(n());function pt(e,t,n){let r=o(e=>e.size),i=o(e=>e.viewport),a=typeof e==`number`?e:r.width*i.dpr,s=typeof t==`number`?t:r.height*i.dpr,c=(typeof e==`number`?n:e)||{},{samples:l=0,depth:u,...d}=c,f=u??c.depthBuffer,p=G.useMemo(()=>{let e=new M(a,s,{minFilter:se,magFilter:se,type:N,...d});return f&&(e.depthTexture=new de(a,s,D)),e.samples=l,e},[]);return G.useLayoutEffect(()=>{p.setSize(a,s),l&&(p.samples=l)},[l,p,a,s]),G.useEffect(()=>()=>p.dispose(),[]),p}var mt=e=>typeof e==`function`,ht=G.forwardRef(({envMap:e,resolution:t=256,frames:n=1/0,makeDefault:r,children:i,...s},c)=>{let l=o(({set:e})=>e),u=o(({camera:e})=>e),d=o(({size:e})=>e),f=G.useRef(null);G.useImperativeHandle(c,()=>f.current,[]);let p=G.useRef(null),m=pt(t);G.useLayoutEffect(()=>{s.manual||(f.current.aspect=d.width/d.height)},[d,s]),G.useLayoutEffect(()=>{f.current.updateProjectionMatrix()});let h=0,g=null,_=mt(i);return a(t=>{_&&(n===1/0||h<n)&&(p.current.visible=!1,t.gl.setRenderTarget(m),g=t.scene.background,e&&(t.scene.background=e),t.gl.render(t.scene,f.current),t.scene.background=g,t.gl.setRenderTarget(null),p.current.visible=!0,h++)}),G.useLayoutEffect(()=>{if(r){let e=u;return l(()=>({camera:f.current})),()=>l(()=>({camera:e}))}},[f,r,l]),G.createElement(G.Fragment,null,G.createElement(`perspectiveCamera`,he({ref:f},s),!_&&i),G.createElement(`group`,{ref:p},_&&i(m.texture)))});function gt(e,{path:t}){let[n]=i(F,[e],e=>e.setPath(t));return n}gt.preload=(e,{path:t})=>i.preload(F,[e],e=>e.setPath(t));var K=t(),_t={sunLightPointsDown:{value:!0}};function vt(e){_t.sunLightPointsDown.value=e}var q=r(),yt=x(`SceneLighting`);function bt(){let e=(0,K.c)(6),t=ke(),n,r;if(e[0]===t?(n=e[1],r=e[2]):(n=()=>{t?yt.debug(`sunData: dir=(%s, %s, %s) color=(%s, %s, %s) ambient=(%s, %s, %s)`,t.direction.x.toFixed(3),t.direction.y.toFixed(3),t.direction.z.toFixed(3),t.color.r.toFixed(3),t.color.g.toFixed(3),t.color.b.toFixed(3),t.ambient.r.toFixed(3),t.ambient.g.toFixed(3),t.ambient.b.toFixed(3)):yt.debug(`No sunData — using fallback ambient #888`)},r=[t],e[0]=t,e[1]=n,e[2]=r),(0,G.useEffect)(n,r),!t){let t;return e[3]===Symbol.for(`react.memo_cache_sentinel`)?(t=(0,q.jsx)(`ambientLight`,{color:`#888888`,intensity:1}),e[3]=t):t=e[3],t}let i;return e[4]===t?i=e[5]:(i=(0,q.jsx)(xt,{sunData:t}),e[4]=t,e[5]=i),i}function xt(e){let t=(0,K.c)(29),{sunData:n}=e,r;t[0]===n.direction?r=t[1]:(r=pe(n.direction),t[0]=n.direction,t[1]=r);let[i,a,o]=r,s=Math.sqrt(i*i+a*a+o*o),c=i/s,l=a/s,u=o/s,d;t[2]!==c||t[3]!==l||t[4]!==u?(d=new L(c,l,u),t[2]=c,t[3]=l,t[4]=u,t[5]=d):d=t[5];let f=d,p=-f.x*5e3,m=-f.y*5e3,h=-f.z*5e3,g;t[6]!==p||t[7]!==m||t[8]!==h?(g=new L(p,m,h),t[6]=p,t[7]=m,t[8]=h,t[9]=g):g=t[9];let _=g,v;t[10]!==n.color.b||t[11]!==n.color.g||t[12]!==n.color.r?(v=new R(n.color.r,n.color.g,n.color.b),t[10]=n.color.b,t[11]=n.color.g,t[12]=n.color.r,t[13]=v):v=t[13];let y=v,b;t[14]!==n.ambient.b||t[15]!==n.ambient.g||t[16]!==n.ambient.r?(b=new R(n.ambient.r,n.ambient.g,n.ambient.b),t[14]=n.ambient.b,t[15]=n.ambient.g,t[16]=n.ambient.r,t[17]=b):b=t[17];let x=b,S=f.y<0,C,w;t[18]===S?(C=t[19],w=t[20]):(C=()=>{vt(S)},w=[S],t[18]=S,t[19]=C,t[20]=w),(0,G.useEffect)(C,w);let T;t[21]!==y||t[22]!==_?(T=(0,q.jsx)(`directionalLight`,{position:_,color:y,intensity:1,castShadow:!0,"shadow-mapSize-width":8192,"shadow-mapSize-height":8192,"shadow-camera-left":-4096,"shadow-camera-right":4096,"shadow-camera-top":4096,"shadow-camera-bottom":-4096,"shadow-camera-near":100,"shadow-camera-far":12e3,"shadow-bias":-1e-5,"shadow-normalBias":.4,"shadow-radius":2}),t[21]=y,t[22]=_,t[23]=T):T=t[23];let E;t[24]===x?E=t[25]:(E=(0,q.jsx)(`ambientLight`,{color:x,intensity:1}),t[24]=x,t[25]=E);let D;return t[26]!==T||t[27]!==E?(D=(0,q.jsxs)(q.Fragment,{children:[T,E]}),t[26]=T,t[27]=E,t[28]=D):D=t[28],D}function St(){let e=(0,K.c)(4),{fpsLimit:t}=c(),n=o(Ct),r,i;return e[0]!==t||e[1]!==n?(r=()=>{if(t==null)return;let e=1e3/t,r=0,i;function a(t){i=requestAnimationFrame(a),t-r>=e&&(r=t-(t-r)%e,n())}return i=requestAnimationFrame(a),()=>cancelAnimationFrame(i)},i=[t,n],e[0]=t,e[1]=n,e[2]=r,e[3]=i):(r=e[2],i=e[3]),(0,G.useEffect)(r,i),t}function Ct(e){return e.invalidate}function wt(){return St(),null}var Tt={toneMapping:0,outputColorSpace:ae};function Et(e){let t=(0,K.c)(11),{children:n,renderOnDemand:r,dpr:i,onCreated:a}=e,o=r===void 0?!1:r,{renderOnDemand:u}=l(),d=o||u,{fpsLimit:f}=c(),p=f!=null&&!d,m=d||p?`demand`:`always`,h;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(h={type:1},t[0]=h):h=t[0];let g;t[1]===n?g=t[2]:(g=(0,q.jsx)(G.Suspense,{children:n}),t[1]=n,t[2]=g);let _;t[3]===p?_=t[4]:(_=p?(0,q.jsx)(wt,{}):null,t[3]=p,t[4]=_);let v;return t[5]!==i||t[6]!==a||t[7]!==m||t[8]!==g||t[9]!==_?(v=(0,q.jsxs)(s,{frameloop:m,dpr:i,gl:Tt,shadows:h,onCreated:a,children:[g,_]}),t[5]=i,t[6]=a,t[7]=m,t[8]=g,t[9]=_,t[10]=v):v=t[10],v}function Dt(e){let t=(0,K.c)(14),{entity:n}=e,{registerCamera:r,unregisterCamera:i}=Ie(),a=(0,G.useId)(),o=n.cameraDataBlock,s;t[0]===n.position?s=t[1]:(s=n.position?new L(...n.position):new L,t[0]=n.position,t[1]=s);let c=s,l;t[2]===n.rotation?l=t[3]:(l=n.rotation?new O(...n.rotation):new O,t[2]=n.rotation,t[3]=l);let u=l,d,f;t[4]!==o||t[5]!==a||t[6]!==c||t[7]!==r||t[8]!==u||t[9]!==i?(d=()=>{if(o===`Observer`){let e={id:a,position:c,rotation:u};return r(e),()=>{i(e)}}},f=[a,o,r,i,c,u],t[4]=o,t[5]=a,t[6]=c,t[7]=r,t[8]=u,t[9]=i,t[10]=d,t[11]=f):(d=t[10],f=t[11]),(0,G.useEffect)(d,f);let p=C(n.id),m;return t[12]===p?m=t[13]:(m=p?(0,q.jsx)(qe,{radius:1.5}):null,t[12]=p,t[13]=m),m}function Ot(e){let t=(0,K.c)(7),{entity:n}=e,r=C(n.id),i;t[0]===n.label?i=t[1]:(i=n.label?(0,q.jsx)(Xe,{opacity:.6,children:n.label}):null,t[0]=n.label,t[1]=i);let a;t[2]===r?a=t[3]:(a=r&&(0,q.jsx)(qe,{radius:1.5}),t[2]=r,t[3]=a);let o;return t[4]!==i||t[5]!==a?(o=(0,q.jsxs)(q.Fragment,{children:[i,a]}),t[4]=i,t[5]=a,t[6]=o):o=t[6],o}function kt(e){let t=new Float32Array(e.length);for(let n=0;n<e.length;n++)t[n]=e[n]/65535;return t}var At=256,jt=512,Mt=64,Nt=150,Pt=`
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
`;function Ft({shader:e,baseTextures:t,alphaTextures:n,visibilityMask:r,tiling:i,detailTexture:a=null,lightmap:o=null}){e.uniforms.sunLightPointsDown=_t.sunLightPointsDown;let s=t.length;if(t.forEach((t,n)=>{e.uniforms[`albedo${n}`]={value:t}}),n.forEach((t,n)=>{e.uniforms[`mask${n}`]={value:t}}),r&&(e.uniforms.visibilityMask={value:r}),t.forEach((t,n)=>{e.uniforms[`tiling${n}`]={value:i[n]??32}}),o&&(e.uniforms.terrainLightmap={value:o}),a&&(e.uniforms.detailTexture={value:a},e.uniforms.detailTiling={value:Mt},e.uniforms.detailFadeDistance={value:Nt},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
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

${Pt}

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
  vec2 alphaUv = baseUv + vec2(0.5 / ${At}.0);
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
  vec2 lightmapUv = vMapUv + vec2(0.5 / ${jt}.0);
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

#include <tonemapping_fragment>`)}var It={0:32,1:32,2:32,3:32,4:32,5:32},Lt=(0,G.memo)(function({displacementMap:e,visibilityMask:t,textureNames:n,alphaTextures:r,detailTextureName:i,lightmap:a}){let{debugMode:o}=l(),s=dt(),c=H(n.map(e=>Ne(e)),e=>{e.forEach(e=>it(e,{anisotropy:s}))}),u=i?U(i):null,d=H(u??Ve,e=>{it(e,{anisotropy:s})}),f=(0,G.useCallback)(e=>{Ft({shader:e,baseTextures:c,alphaTextures:r,visibilityMask:t,tiling:It,detailTexture:u?d:null,lightmap:a}),st(e,W)},[c,r,t,d,u,a]),p=(0,G.useMemo)(()=>[n.join(`,`),u??`none`,a?a.id:`nolm`,c.map(e=>e.id).join(`,`)].join(`|`),[n,u,a,c]),m=(0,G.useRef)(null);return(0,G.useEffect)(()=>{let e=m.current;e&&(e.defines??={},e.defines.DEBUG_MODE=o?1:0,e.needsUpdate=!0)},[o]),(0,G.useEffect)(()=>{let e=m.current;e&&(e.customProgramCacheKey=()=>p,e.needsUpdate=!0)},[p]),(0,q.jsx)(`meshLambertMaterial`,{ref:m,map:e,depthWrite:!0,side:0,defines:{DEBUG_MODE:o?1:0},onBeforeCompile:f},`${u?`detail`:`nodetail`}-${a?`lightmap`:`nolightmap`}`)}),Rt=(0,G.memo)(function(e){let t=(0,K.c)(8),{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s}=e,c;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(c=(0,q.jsx)(`meshLambertMaterial`,{color:`rgb(0, 109, 56)`,wireframe:!0}),t[0]=c):c=t[0];let l;return t[1]!==a||t[2]!==o||t[3]!==n||t[4]!==s||t[5]!==i||t[6]!==r?(l=(0,q.jsx)(G.Suspense,{fallback:c,children:(0,q.jsx)(Lt,{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s})}),t[1]=a,t[2]=o,t[3]=n,t[4]=s,t[5]=i,t[6]=r,t[7]=l):l=t[7],l}),zt=(0,G.memo)(function(e){let t=(0,K.c)(15),{tileX:n,tileZ:r,blockSize:i,basePosition:a,textureNames:o,geometry:s,displacementMap:c,visibilityMask:l,alphaTextures:u,detailTextureName:d,lightmap:f,visible:p}=e,m=p===void 0?!0:p,h=i/2,g=a.x+n*i+h,_=a.z+r*i+h,v;t[0]!==g||t[1]!==_?(v=[g,0,_],t[0]=g,t[1]=_,t[2]=v):v=t[2];let y=v,b;t[3]!==u||t[4]!==d||t[5]!==c||t[6]!==f||t[7]!==o||t[8]!==l?(b=(0,q.jsx)(Rt,{displacementMap:c,visibilityMask:l,textureNames:o,alphaTextures:u,detailTextureName:d,lightmap:f}),t[3]=u,t[4]=d,t[5]=c,t[6]=f,t[7]=o,t[8]=l,t[9]=b):b=t[9];let x;return t[10]!==s||t[11]!==y||t[12]!==b||t[13]!==m?(x=(0,q.jsx)(`mesh`,{position:y,geometry:s,castShadow:!0,receiveShadow:!0,visible:m,children:b}),t[10]=s,t[11]=y,t[12]=b,t[13]=m,t[14]=x):x=t[14],x}),Bt=x(`TerrainBlock`),Vt=8,Ht=600,J=256,Ut=512,Y=2048;function Wt(e,t){let n=new ne,r=(t+1)*(t+1),i=new Float32Array(r*3),a=new Float32Array(r*3),o=new Float32Array(r*2),s=t*t*6,c=new Uint32Array(s),l=0,u=e/t;for(let n=0;n<=t;n++)for(let r=0;r<=t;r++){let s=n*(t+1)+r;i[s*3]=r*u-e/2,i[s*3+1]=e/2-n*u,i[s*3+2]=0,a[s*3]=0,a[s*3+1]=0,a[s*3+2]=1,o[s*2]=r/t,o[s*2+1]=1-n/t}for(let e=0;e<t;e++)for(let n=0;n<t;n++){let r=e*(t+1)+n,i=r+1,a=(e+1)*(t+1)+n,o=a+1;(n^e)&1?(c[l++]=r,c[l++]=a,c[l++]=i,c[l++]=i,c[l++]=a,c[l++]=o):(c[l++]=r,c[l++]=a,c[l++]=o,c[l++]=r,c[l++]=o,c[l++]=i)}return n.setIndex(new oe(c,1)),n.setAttribute(`position`,new B(i,3)),n.setAttribute(`normal`,new B(a,3)),n.setAttribute(`uv`,new B(o,2)),n.rotateX(-Math.PI/2),n.rotateY(-Math.PI/2),n}function Gt(e,t,n){let r=e.attributes.position,i=e.attributes.uv,a=e.attributes.normal,o=r.array,s=i.array,c=a.array,l=r.count,u=(e,n)=>(e=Math.max(0,Math.min(J-1,e)),n=Math.max(0,Math.min(J-1,n)),t[n*J+e]/65535*Y),d=(e,n)=>{e=Math.max(0,Math.min(J-1,e)),n=Math.max(0,Math.min(J-1,n));let r=Math.floor(e),i=Math.floor(n),a=Math.min(r+1,J-1),o=Math.min(i+1,J-1),s=e-r,c=n-i,l=t[i*J+r]/65535*Y,u=t[i*J+a]/65535*Y,d=t[o*J+r]/65535*Y,f=t[o*J+a]/65535*Y,p=l*(1-s)+u*s,m=d*(1-s)+f*s;return p*(1-c)+m*c};for(let e=0;e<l;e++){let t=s[e*2],r=s[e*2+1],i=u(Math.floor(t*J)&J-1,Math.floor(r*J)&J-1);o[e*3+1]=i;let a=t*(J-1),l=r*(J-1),f=d(a-1,l),p=d(a+1,l),m=d(a,l+1),h=d(a,l-1),g=(p-f)/2,_=(m-h)/2,v=n,y=g,b=Math.sqrt(_*_+v*v+y*y);b>0?(_/=b,v/=b,y/=b):(_=0,v=1,y=0),c[e*3]=_,c[e*3+1]=v,c[e*3+2]=y}r.needsUpdate=!0,a.needsUpdate=!0}function Kt(e,t,n,r,i,a){let o=r.z/i,s=r.x/i,c=r.y,l=Math.sqrt(o*o+s*s);if(l<1e-4)return 1;let u=.5/l,d=o*u,f=s*u,p=c*u,m=e,h=t,g=n+.1,_=J*3;for(let e=0;e<_;e++){if(m+=d,h+=f,g+=p,m<0||m>=J||h<0||h>=J||g>Y)return 1;let e=a(m,h);if(g<e)return 0}return 1}function qt(e,t,n){let r=(t,n)=>{let r=Math.max(0,Math.min(J-1,t)),i=Math.max(0,Math.min(J-1,n)),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,J-1),c=Math.min(o+1,J-1),l=r-a,u=i-o,d=e[o*J+a]/65535,f=e[o*J+s]/65535,p=e[c*J+a]/65535,m=e[c*J+s]/65535,h=d*(1-l)+f*l,g=p*(1-l)+m*l;return(h*(1-u)+g*u)*Y},i=new L(-t.x,-t.y,-t.z).normalize(),a=new Uint8Array(Ut*Ut),o=.5;for(let e=0;e<Ut;e++)for(let t=0;t<Ut;t++){let s=t/2+.25,c=e/2+.25,l=r(s,c),u=r(s-o,c),d=r(s+o,c),f=r(s,c-o),p=r(s,c+o),m=(d-u)/(2*o),h=-((p-f)/(2*o)),g=n,_=-m,v=Math.sqrt(h*h+g*g+_*_),y=Math.max(0,h/v*i.x+g/v*i.y+_/v*i.z),b=1;y>0&&(b=Kt(s,c,l,i,n,r)),a[e*Ut+t]=Math.floor(y*b*255)}let s=new ee(a,Ut,Ut,A,j);return s.colorSpace=``,s.generateMipmaps=!0,s.wrapS=ue,s.wrapT=ue,s.magFilter=se,s.minFilter=se,s.needsUpdate=!0,s}function Jt(e){let t=(0,K.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`terrain`,e],queryFn:()=>(Bt.debug(`Loading terrain: %s`,e),He(e))},t[0]=e,t[1]=n);let r=u(n),i,a;return t[2]!==r.data||t[3]!==r.error||t[4]!==r.status||t[5]!==e?(i=()=>{Bt.debug(`Query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (data ready)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=r.data,t[3]=r.error,t[4]=r.status,t[5]=e,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,G.useEffect)(i,a),r}function Yt(){let e=Ae();return e&&e.visibleDistance>0?e.visibleDistance:Ht}function Xt(e){let t=new Uint8Array(J*J);t.fill(255);for(let n of e){let e=n&255,r=n>>8&255,i=n>>16,a=r*J;for(let n=0;n<i;n++){let r=a+e+n;r<t.length&&(t[r]=0)}}let n=new ee(t,J,J,A,j);return n.colorSpace=``,n.wrapS=n.wrapT=ue,n.magFilter=le,n.minFilter=le,n.needsUpdate=!0,n}var Zt=(0,G.memo)(function(e){let t=(0,K.c)(68),{entity:n}=e,r=n.terrainData,i=C(n.id),s=r.terrFileName,c=r.squareSize||Vt,l=r.detailTextureName||void 0,u=c*256,d=Yt(),f=o($t),p=-c*(J/2),m;t[0]===p?m=t[1]:(m={x:p,z:p},t[0]=p,t[1]=m);let h=m,g;t[2]===r.emptySquareRuns?g=t[3]:(g=r.emptySquareRuns??[],t[2]=r.emptySquareRuns,t[3]=g);let _=g,{data:v}=Jt(s),y;bb0:{if(!v){y=null;break bb0}let e=c*256,n;t[4]!==e||t[5]!==c||t[6]!==v.heightMap?(n=Wt(e,J),Gt(n,v.heightMap,c),t[4]=e,t[5]=c,t[6]=v.heightMap,t[7]=n):n=t[7],y=n}let b=y,x,S;t[8]!==c||t[9]!==v?(x=()=>{if(v)return _e(we(v.heightMap,c)),en},S=[v,c],t[8]=c,t[9]=v,t[10]=x,t[11]=S):(x=t[10],S=t[11]),(0,G.useEffect)(x,S);let w=ke(),T;bb1:{if(!w){let e;t[12]===Symbol.for(`react.memo_cache_sentinel`)?(e=new L(.57735,-.57735,.57735),t[12]=e):e=t[12],T=e;break bb1}let e;t[13]===w.direction?e=t[14]:(e=pe(w.direction),t[13]=w.direction,t[14]=e);let[n,r,i]=e,a=Math.sqrt(n*n+r*r+i*i),o=n/a,s=r/a,c=i/a,l;t[15]!==c||t[16]!==o||t[17]!==s?(l=new L(o,s,c),t[15]=c,t[16]=o,t[17]=s,t[18]=l):l=t[18],T=l}let E=T,O;bb2:{if(!v){O=null;break bb2}let e;t[19]!==c||t[20]!==E||t[21]!==v.heightMap?(e=qt(v.heightMap,E,c),t[19]=c,t[20]=E,t[21]=v.heightMap,t[22]=e):e=t[22],O=e}let k=O,j;bb3:{if(!v){j=null;break bb3}let e;t[23]===v.heightMap?e=t[24]:(e=new ee(kt(v.heightMap),J,J,A,D),e.colorSpace=``,e.generateMipmaps=!1,e.wrapS=P,e.wrapT=P,e.needsUpdate=!0,t[23]=v.heightMap,t[24]=e),j=e}let M=j,N;t[25]===_?N=t[26]:(N=Xt(_),t[25]=_,t[26]=N);let F=N,I;t[27]===Symbol.for(`react.memo_cache_sentinel`)?(I=Xt([]),t[27]=I):I=t[27];let te=I,R;bb4:{if(!v){R=null;break bb4}let e;t[28]===v.alphaMaps?e=t[29]:(e=v.alphaMaps.map(tn),t[28]=v.alphaMaps,t[29]=e),R=e}let z=R,ne=2*Math.ceil(d/u)+1,re=ne*ne-1,ie=(0,G.useRef)(null),B;t[30]===Symbol.for(`react.memo_cache_sentinel`)?(B=new ce,t[30]=B):B=t[30];let ae=B,oe;t[31]===Symbol.for(`react.memo_cache_sentinel`)?(oe={xStart:1/0,xEnd:-1/0,zStart:1/0,zEnd:-1/0},t[31]=oe):oe=t[31];let se=(0,G.useRef)(oe),le=(0,G.useRef)(null),ue;if(t[32]!==h||t[33]!==u||t[34]!==f||t[35]!==d?(ue=()=>{let e=ie.current;if(!e)return;let t=f.position.x-h.x,n=f.position.z-h.z,r=Math.floor((t-d)/u),i=Math.ceil((t+d)/u),a=Math.floor((n-d)/u),o=Math.ceil((n+d)/u),s=se.current;if(e===le.current&&r===s.xStart&&i===s.xEnd&&a===s.zStart&&o===s.zEnd)return;le.current=e,s.xStart=r,s.xEnd=i,s.zStart=a,s.zEnd=o;let c=u/2,l=0;for(let t=r;t<i;t++)for(let n=a;n<o;n++)t===0&&n===0||(ae.makeTranslation(h.x+t*u+c,0,h.z+n*u+c),e.setMatrixAt(l,ae),l++);e.count=l,e.instanceMatrix.needsUpdate=!0},t[32]=h,t[33]=u,t[34]=f,t[35]=d,t[36]=ue):ue=t[36],a(ue),!v||!b||!M||!z)return Bt.debug(`Not ready: terrain=%s geometry=%s displacement=%s alpha=%s`,!!v,!!b,!!M,!!z),null;let de=k??void 0,fe;t[37]!==h||t[38]!==u||t[39]!==l||t[40]!==F||t[41]!==z||t[42]!==M||t[43]!==b||t[44]!==de||t[45]!==v.textureNames?(fe=(0,q.jsx)(zt,{tileX:0,tileZ:0,blockSize:u,basePosition:h,textureNames:v.textureNames,geometry:b,displacementMap:M,visibilityMask:F,alphaTextures:z,detailTextureName:l,lightmap:de}),t[37]=h,t[38]=u,t[39]=l,t[40]=F,t[41]=z,t[42]=M,t[43]=b,t[44]=de,t[45]=v.textureNames,t[46]=fe):fe=t[46];let me;t[47]!==re||t[48]!==b?(me=[b,void 0,re],t[47]=re,t[48]=b,t[49]=me):me=t[49];let V=k??void 0,he;t[50]!==l||t[51]!==z||t[52]!==M||t[53]!==V||t[54]!==v.textureNames?(he=(0,q.jsx)(Rt,{displacementMap:M,visibilityMask:te,textureNames:v.textureNames,alphaTextures:z,detailTextureName:l,lightmap:V}),t[50]=l,t[51]=z,t[52]=M,t[53]=V,t[54]=v.textureNames,t[55]=he):he=t[55];let ge;t[56]!==me||t[57]!==he?(ge=(0,q.jsx)(`instancedMesh`,{ref:ie,args:me,castShadow:!0,receiveShadow:!0,frustumCulled:!1,children:he}),t[56]=me,t[57]=he,t[58]=ge):ge=t[58];let H;t[59]!==h||t[60]!==u||t[61]!==i||t[62]!==v?(H=i&&v&&(0,q.jsx)(Qt,{heightMap:v.heightMap,blockSize:u,basePosition:h}),t[59]=h,t[60]=u,t[61]=i,t[62]=v,t[63]=H):H=t[63];let ve;return t[64]!==fe||t[65]!==ge||t[66]!==H?(ve=(0,q.jsxs)(q.Fragment,{children:[fe,ge,H]}),t[64]=fe,t[65]=ge,t[66]=H,t[67]=ve):ve=t[67],ve});function Qt(e){let t=(0,K.c)(15),{heightMap:n,blockSize:r,basePosition:i}=e,a=0;for(let e=0;e<n.length;e++){let t=n[e]/65535*Y;t>a&&(a=t)}let o=i.x+r/2,s=a/2,c=i.z+r/2,l;t[0]!==o||t[1]!==s||t[2]!==c?(l=[o,s,c],t[0]=o,t[1]=s,t[2]=c,t[3]=l):l=t[3];let u=l,d;t[4]!==r||t[5]!==a?(d=[r,a,r],t[4]=r,t[5]=a,t[6]=d):d=t[6];let f=d,p;t[7]!==u||t[8]!==f?(p={center:u,size:f},t[7]=u,t[8]=f,t[9]=p):p=t[9];let m=p,h;t[10]===m.size?h=t[11]:(h=(0,q.jsx)(Je,{size:m.size}),t[10]=m.size,t[11]=h);let g;return t[12]!==m.center||t[13]!==h?(g=(0,q.jsx)(`group`,{position:m.center,children:h}),t[12]=m.center,t[13]=h,t[14]=g):g=t[14],g}function $t(e){return e.camera}function en(){return _e(null)}function tn(e){return ut(e)}var nn=`
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
`;function rn(e,t){let n=t.surfaceOutsideVisible??!1;e.uniforms.useSceneLighting={value:n},e.uniforms.interiorDebugColor={value:n?new L(0,.4,1):new L(1,.2,0)},e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
${nn}
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

#include <tonemapping_fragment>`)}var an=x(`InteriorInstance`);function on(e){let t=(0,K.c)(2),n;return t[0]===e?n=t[1]:(n=Re(e),t[0]=e,t[1]=n),Le(n)}function sn({materialName:e,material:t,lightMap:n}){let r=l()?.debugMode??!1,i=dt(),a=H(U(e),e=>it(e,{anisotropy:i})),o=new Set(t?.userData?.flag_names??[]).has(`SelfIlluminating`),s=new Set(t?.userData?.surface_flag_names??[]).has(`SurfaceOutsideVisible`),c=(0,G.useCallback)(e=>{st(e,W),rn(e,{surfaceOutsideVisible:s})},[s]),u=(0,G.useRef)(null),d=(0,G.useRef)(null);(0,G.useEffect)(()=>{let e=u.current??d.current;e&&(e.defines??={},e.defines.DEBUG_MODE=r?1:0,e.needsUpdate=!0)},[r]);let f={DEBUG_MODE:r?1:0},p=`${s}`;return o?(0,q.jsx)(`meshBasicMaterial`,{ref:u,map:a,toneMapped:!1,defines:f,onBeforeCompile:c},p):(0,q.jsx)(`meshLambertMaterial`,{ref:d,map:a,lightMap:n,toneMapped:!1,defines:f,onBeforeCompile:c},p)}function cn(e){if(!e)return null;let t=e.emissiveMap;return t&&(t.colorSpace=ae),t??null}function ln(e){let t=(0,K.c)(13),{node:n}=e,r;bb0:{if(!n.material){let e;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[0]=e):e=t[0],r=e;break bb0}if(Array.isArray(n.material)){let e;t[1]===n.material?e=t[2]:(e=n.material.map(un),t[1]=n.material,t[2]=e),r=e;break bb0}let e;t[3]===n.material?e=t[4]:(e=cn(n.material),t[3]=n.material,t[4]=e);let i;t[5]===e?i=t[6]:(i=[e],t[5]=e,t[6]=i),r=i}let i=r,a;t[7]!==i||t[8]!==n.material?(a=n.material?(0,q.jsx)(Ze,{name:`InteriorTexture:${Array.isArray(n.material)?n.material[0]?.userData?.resource_path:n.material?.userData?.resource_path??`?`}`,fallback:(0,q.jsx)(`meshStandardMaterial`,{color:`yellow`,wireframe:!0}),children:Array.isArray(n.material)?n.material.map((e,t)=>(0,q.jsx)(sn,{materialName:e.userData.resource_path,material:e,lightMap:i[t]},t)):(0,q.jsx)(sn,{materialName:n.material.userData.resource_path,material:n.material,lightMap:i[0]})}):null,t[7]=i,t[8]=n.material,t[9]=a):a=t[9];let o;return t[10]!==n.geometry||t[11]!==a?(o=(0,q.jsx)(`mesh`,{geometry:n.geometry,castShadow:!0,receiveShadow:!0,children:a}),t[10]=n.geometry,t[11]=a,t[12]=o):o=t[12],o}function un(e){return cn(e)}var dn=(0,G.memo)(function(e){let t=(0,K.c)(27),{interiorFile:n,ghostIndex:r,isTarget:i}=e,a=on(n),{nodes:o}=a,s=l()?.debugMode??!1,c;bb0:{if(!i){c=null;break bb0}let e,n;if(t[0]!==a.scene){let r=new z().setFromObject(a.scene);e=new L,n=new L,r.getCenter(e),r.getSize(n),t[0]=a.scene,t[1]=e,t[2]=n}else e=t[1],n=t[2];let r;t[3]!==e.x||t[4]!==e.y||t[5]!==e.z?(r=[e.x,e.y,e.z],t[3]=e.x,t[4]=e.y,t[5]=e.z,t[6]=r):r=t[6];let o=r,s;t[7]!==n.x||t[8]!==n.y||t[9]!==n.z?(s=[n.x,n.y,n.z],t[7]=n.x,t[8]=n.y,t[9]=n.z,t[10]=s):s=t[10];let l=s,u;t[11]!==o||t[12]!==l?(u={center:o,size:l},t[11]=o,t[12]=l,t[13]=u):u=t[13],c=u}let u=c,d;t[14]===Symbol.for(`react.memo_cache_sentinel`)?(d=[0,-Math.PI/2,0],t[14]=d):d=t[14];let f;t[15]===o?f=t[16]:(f=Object.entries(o).filter(hn).map(gn),t[15]=o,t[16]=f);let p;t[17]!==s||t[18]!==r||t[19]!==n?(p=s?(0,q.jsxs)(Xe,{children:[r,`: `,n]}):null,t[17]=s,t[18]=r,t[19]=n,t[20]=p):p=t[20];let m;t[21]===u?m=t[22]:(m=u&&(0,q.jsx)(`group`,{position:u.center,children:(0,q.jsx)(Je,{size:u.size})}),t[21]=u,t[22]=m);let h;return t[23]!==f||t[24]!==p||t[25]!==m?(h=(0,q.jsxs)(`group`,{rotation:d,children:[f,p,m]}),t[23]=f,t[24]=p,t[25]=m,t[26]=h):h=t[26],h});function fn(e){let t=(0,K.c)(9),{color:n,label:r}=e,i;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(i=(0,q.jsx)(`boxGeometry`,{args:[10,10,10]}),t[0]=i):i=t[0];let a;t[1]===n?a=t[2]:(a=(0,q.jsx)(`meshStandardMaterial`,{color:n,wireframe:!0}),t[1]=n,t[2]=a);let o;t[3]!==n||t[4]!==r?(o=r?(0,q.jsx)(Xe,{color:n,children:r}):null,t[3]=n,t[4]=r,t[5]=o):o=t[5];let s;return t[6]!==a||t[7]!==o?(s=(0,q.jsxs)(`mesh`,{children:[i,a,o]}),t[6]=a,t[7]=o,t[8]=s):s=t[8],s}function pn(e){let t=(0,K.c)(3),{label:n}=e,r=l()?.debugMode??!1,i;return t[0]!==r||t[1]!==n?(i=r?(0,q.jsx)(fn,{color:`red`,label:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}var mn=(0,G.memo)(function(e){let t=(0,K.c)(27),{entity:n}=e,r=n.interiorData,i=C(n.id),a;t[0]===r.transform.position?a=t[1]:(a=pe(r.transform.position),t[0]=r.transform.position,t[1]=a);let o=a,s;t[2]===r.transform?s=t[3]:(s=me(r.transform),t[2]=r.transform,t[3]=s);let c=s,l;t[4]===r.scale?l=t[5]:(l=fe(r.scale),t[4]=r.scale,t[5]=l);let u=l,d=`${r.ghostIndex}: ${r.interiorFile}`,f;t[6]===d?f=t[7]:(f=(0,q.jsx)(pn,{label:d}),t[6]=d,t[7]=f);let p;t[8]===r.interiorFile?p=t[9]:(p=e=>{an.error(`Failed to load %s: %s`,r.interiorFile,e.message)},t[8]=r.interiorFile,t[9]=p);let m=`InteriorModel:${r.interiorFile}`,h;t[10]===Symbol.for(`react.memo_cache_sentinel`)?(h=(0,q.jsx)(fn,{color:`orange`}),t[10]=h):h=t[10];let g;t[11]!==i||t[12]!==r.ghostIndex||t[13]!==r.interiorFile?(g=(0,q.jsx)(dn,{interiorFile:r.interiorFile,ghostIndex:r.ghostIndex,isTarget:i}),t[11]=i,t[12]=r.ghostIndex,t[13]=r.interiorFile,t[14]=g):g=t[14];let _;t[15]!==m||t[16]!==g?(_=(0,q.jsx)(Ze,{name:m,fallback:h,children:g}),t[15]=m,t[16]=g,t[17]=_):_=t[17];let v;t[18]!==_||t[19]!==f||t[20]!==p?(v=(0,q.jsx)(tt,{fallback:f,onError:p,children:_}),t[18]=_,t[19]=f,t[20]=p,t[21]=v):v=t[21];let y;return t[22]!==o||t[23]!==c||t[24]!==u||t[25]!==v?(y=(0,q.jsx)(`group`,{position:o,quaternion:c,scale:u,children:v}),t[22]=o,t[23]=c,t[24]=u,t[25]=v,t[26]=y):y=t[26],y});function hn(e){let[,t]=e;return t.isMesh}function gn(e){let[t,n]=e;return(0,q.jsx)(ln,{node:n},t)}var _n=()=>{},X=5,vn=X*X,yn=.05;function bn(e,t,n){let r=e,i=t,a=n;return[a,a,a,a,a,a,i,i,i,a,a,i,r,i,a,a,i,i,i,a,a,a,a,a,a]}function xn(e,t){let n=new Float32Array(vn);for(let r=0;r<vn;r++){let i=e[r*3],a=e[r*3+2],o=1.3-Math.sqrt(i*i+a*a)/t;o<.4?o=0:o>.8&&(o=1),n[r]=o}return n}function Sn(e,t,n,r){let i=new ne,a=new Float32Array(vn*3),o=new Float32Array(vn*2),s=bn(t,n,r),c=e*2/(X-1);for(let t=0;t<X;t++)for(let n=0;n<X;n++){let r=t*X+n,i=-e+n*c,l=e-t*c,u=e*s[r];a[r*3]=i,a[r*3+1]=u,a[r*3+2]=l,o[r*2]=n,o[r*2+1]=t}Cn(a);let l=xn(a,e),u=[];for(let e=0;e<X-1;e++)for(let t=0;t<X-1;t++){let n=e*X+t,r=n+1,i=n+X,a=i+1;u.push(n,i,a),u.push(n,a,r)}return i.setIndex(u),i.setAttribute(`position`,new B(a,3)),i.setAttribute(`uv`,new B(o,2)),i.setAttribute(`alpha`,new B(l,1)),i.computeBoundingSphere(),i}function Cn(e){let t=t=>({x:e[t*3],y:e[t*3+1],z:e[t*3+2]}),n=(t,n,r,i)=>{e[t*3]=n,e[t*3+1]=r,e[t*3+2]=i},r=t(1),i=t(3),a=t(5),o=t(6),s=t(8),c=t(9),l=t(15),u=t(16),d=t(18),f=t(19),p=t(21),m=t(23),h=a.x+(r.x-a.x)*.5,g=a.y+(r.y-a.y)*.5,_=a.z+(r.z-a.z)*.5;n(0,o.x+(h-o.x)*2,o.y+(g-o.y)*2,o.z+(_-o.z)*2),h=c.x+(i.x-c.x)*.5,g=c.y+(i.y-c.y)*.5,_=c.z+(i.z-c.z)*.5,n(4,s.x+(h-s.x)*2,s.y+(g-s.y)*2,s.z+(_-s.z)*2),h=p.x+(l.x-p.x)*.5,g=p.y+(l.y-p.y)*.5,_=p.z+(l.z-p.z)*.5,n(20,u.x+(h-u.x)*2,u.y+(g-u.y)*2,u.z+(_-u.z)*2),h=m.x+(f.x-m.x)*.5,g=m.y+(f.y-m.y)*.5,_=m.z+(f.z-m.z)*.5,n(24,d.x+(h-d.x)*2,d.y+(g-d.y)*2,d.z+(_-d.z)*2)}function wn(e){return e.wrapS=P,e.wrapT=P,e.minFilter=se,e.magFilter=se,e.colorSpace=``,e.needsUpdate=!0,e}var Tn=`
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
`,En=`
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
`;function Dn({textureUrl:e,radius:t,heightPercent:n,speed:r,windDirection:i,layerIndex:o}){let{debugMode:s}=l(),{animationEnabled:u}=c(),d=(0,G.useRef)(null),f=H(e,wn),p=(0,G.useMemo)(()=>Sn(t,n,n-.05,yn),[t,n]);(0,G.useEffect)(()=>()=>{p.dispose()},[p]);let m=(0,G.useMemo)(()=>new ie({uniforms:{cloudTexture:{value:f},uvOffset:{value:new I(0,0)},debugMode:{value:s?1:0},layerIndex:{value:o}},vertexShader:Tn,fragmentShader:En,transparent:!0,depthWrite:!1,side:2}),[f,s,o]);return(0,G.useEffect)(()=>()=>{m.dispose()},[m]),a(u?(e,t)=>{let n=t*1e3/32;d.current??=new I(0,0),d.current.x+=i.x*r*n,d.current.y+=i.y*r*n,d.current.x-=Math.floor(d.current.x),d.current.y-=Math.floor(d.current.y),m.uniforms.uvOffset.value.copy(d.current)}:_n),(0,q.jsx)(`mesh`,{geometry:p,frustumCulled:!1,renderOrder:10,children:(0,q.jsx)(`primitive`,{object:m,attach:`material`})})}var On=7;function kn(e){let t=(0,K.c)(7),n,r;t[0]===e?(n=t[1],r=t[2]):(n=[`detailMapList`,e],r=()=>Be(e),t[0]=e,t[1]=n,t[2]=r);let i=!!e,a;return t[3]!==n||t[4]!==r||t[5]!==i?(a={queryKey:n,queryFn:r,enabled:i},t[3]=n,t[4]=r,t[5]=i,t[6]=a):a=t[6],u(a)}function An(e){let t=(0,K.c)(18),{scene:n}=e,{data:r}=kn(n.materialList||void 0),i=(n.visibleDistance>0?n.visibleDistance:500)*.95,o;t[0]===n.cloudLayers?o=t[1]:(o=n.cloudLayers.map(Mn),t[0]=n.cloudLayers,t[1]=o);let s=o,c;t[2]===n.cloudLayers?c=t[3]:(c=n.cloudLayers.map(jn),t[2]=n.cloudLayers,t[3]=c);let l=c,u;bb0:{let{x:e,y:r}=n.windVelocity;if(e!==0||r!==0){let n;t[4]!==e||t[5]!==r?(n=new I(r,-e).normalize(),t[4]=e,t[5]=r,t[6]=n):n=t[6],u=n;break bb0}let i;t[7]===Symbol.for(`react.memo_cache_sentinel`)?(i=new I(1,0),t[7]=i):i=t[7],u=i}let d=u,f;bb1:{if(!r){let e;t[8]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[8]=e):e=t[8],f=e;break bb1}let e;if(t[9]!==l||t[10]!==s||t[11]!==r){e=[];for(let t=0;t<3;t++){let n=r[On+t];n&&e.push({texture:n,height:l[t],speed:s[t]})}t[9]=l,t[10]=s,t[11]=r,t[12]=e}else e=t[12];f=e}let p=f,m=(0,G.useRef)(null),h;if(t[13]===Symbol.for(`react.memo_cache_sentinel`)?(h=e=>{let{camera:t}=e;m.current&&m.current.position.copy(t.position)},t[13]=h):h=t[13],a(h),!p||p.length===0)return null;let g;return t[14]!==p||t[15]!==i||t[16]!==d?(g=(0,q.jsx)(`group`,{ref:m,children:p.map((e,t)=>(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Dn,{textureUrl:U(e.texture),radius:i,heightPercent:e.height,speed:e.speed,windDirection:d,layerIndex:t})},t))}),t[14]=p,t[15]=i,t[16]=d,t[17]=g):g=t[17],g}function jn(e,t){return e.heightPercent||[.35,.25,.2][t]}function Mn(e,t){return e.speed||[1e-4,2e-4,3e-4][t]}(0,G.createContext)(null),(0,G.createContext)(null);function Nn(e){let t=e.fogDistance,n=e.visibleDistance>0?e.visibleDistance:1e3,{r,g:i,b:a}=e.fogColor,o=new R().setRGB(r,i,a).convertSRGBToLinear(),s=[];for(let t of e.fogVolumes)t.visibleDistance<=0||t.maxHeight<=t.minHeight||s.push({visibleDistance:t.visibleDistance,minHeight:t.minHeight,maxHeight:t.maxHeight,percentage:1});return{fogDistance:t,visibleDistance:n,fogColor:o,fogVolumes:s,fogLine:s.reduce((e,t)=>Math.max(e,t.maxHeight),0),enabled:n>t}}var Pn=x(`Sky`),Fn=!1;function In(e){return[new R().setRGB(e.r,e.g,e.b),new R().setRGB(e.r,e.g,e.b).convertSRGBToLinear()]}function Ln(e){let t=(0,K.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`detailMapList`,e],queryFn:()=>(Pn.debug(`Loading detail map list: %s`,e),Be(e))},t[0]=e,t[1]=n);let r=u(n),i,a;return t[2]!==e||t[3]!==r.data||t[4]!==r.error||t[5]!==r.status?(i=()=>{Pn.debug(`DML query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (${r.data.length} entries)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=e,t[3]=r.data,t[4]=r.error,t[5]=r.status,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,G.useEffect)(i,a),r}var Rn=60;function zn({skyBoxFiles:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=gt(e,{path:``}),a=!!t,s=(0,G.useMemo)(()=>r.projectionMatrixInverse,[r]),c=(0,G.useMemo)(()=>n?ot(n.fogVolumes):new Float32Array(12),[n]),l=(0,G.useRef)({skybox:{value:i},fogColor:{value:t??new R(0,0,0)},enableFog:{value:a},inverseProjectionMatrix:{value:s},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:W.cameraHeight,fogVolumeData:{value:c},horizonFogHeight:{value:.18}}),u=(0,G.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return Rn/Math.sqrt(e*e+Rn*Rn)},[n]);return(0,G.useEffect)(()=>{l.current.skybox.value=i,l.current.fogColor.value=t??new R(0,0,0),l.current.enableFog.value=a,l.current.fogVolumeData.value=c,l.current.horizonFogHeight.value=u},[i,t,a,c,u]),(0,q.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,q.jsxs)(`bufferGeometry`,{children:[(0,q.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,q.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,q.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function Bn(e){let t=(0,K.c)(13),{materialList:n,fogColor:r,fogState:i}=e,{data:a}=Ln(n),o;t[0]===a?o=t[1]:(o=a?[U(a[1]),U(a[3]),U(a[4]),U(a[5]),U(a[0]),U(a[2])]:null,t[0]=a,t[1]=o);let s=o,c;t[2]===a?.[6]?c=t[3]:(c=()=>{let e=a?.[6];if(!e)return;let t=U(e);if(t===Ve)return;let n=rt(t,Hn);return n.image&&(it(n,{noColorSpace:!0}),v(n)),Vn},t[2]=a?.[6],t[3]=c);let u;t[4]===a?u=t[5]:(u=[a],t[4]=a,t[5]=u),(0,G.useEffect)(c,u);let{debugMode:d}=l(),f,p;if(t[6]===d?(f=t[7],p=t[8]):(f=()=>{m.shapeEnvMapDebugUV.value=d},p=[d],t[6]=d,t[7]=f,t[8]=p),(0,G.useEffect)(f,p),!s)return null;let h;return t[9]!==r||t[10]!==i||t[11]!==s?(h=(0,q.jsx)(zn,{skyBoxFiles:s,fogColor:r,fogState:i}),t[9]=r,t[10]=i,t[11]=s,t[12]=h):h=t[12],h}function Vn(){return _()}function Hn(e){it(e,{noColorSpace:!0}),v(e)}function Un({skyColor:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=!!t,a=(0,G.useMemo)(()=>r.projectionMatrixInverse,[r]),s=(0,G.useMemo)(()=>n?ot(n.fogVolumes):new Float32Array(12),[n]),c=(0,G.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return Rn/Math.sqrt(e*e+Rn*Rn)},[n]),l=(0,G.useRef)({skyColor:{value:e},fogColor:{value:t??new R(0,0,0)},enableFog:{value:i},inverseProjectionMatrix:{value:a},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:W.cameraHeight,fogVolumeData:{value:s},horizonFogHeight:{value:c}});return(0,G.useEffect)(()=>{l.current.skyColor.value=e,l.current.fogColor.value=t??new R(0,0,0),l.current.enableFog.value=i,l.current.fogVolumeData.value=s,l.current.horizonFogHeight.value=c},[e,t,i,s,c]),(0,q.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,q.jsxs)(`bufferGeometry`,{children:[(0,q.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,q.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,q.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function Wn(e,t){let{fogDistance:n,visibleDistance:r}=e;return[n,r]}function Gn({fogState:e,enabled:t}){let n=o(e=>e.scene),r=o(e=>e.camera),i=(0,G.useRef)(null),s=(0,G.useMemo)(()=>ot(e.fogVolumes),[e.fogVolumes]);return(0,G.useEffect)(()=>{Fn||=(lt(),!0)},[]),(0,G.useEffect)(()=>{ct();let[t,a]=Wn(e,r.position.y),o=new re(e.fogColor,t,a);return n.fog=o,i.current=o,at(r.position.y,s),()=>{n.fog=null,i.current=null,ct()}},[n,r,e,s]),(0,G.useEffect)(()=>{let n=i.current;if(n)if(t){let[t,i]=Wn(e,r.position.y);n.near=t,n.far=i}else n.near=1e10,n.far=1e10},[t,e,r.position.y]),a(()=>{let n=i.current;if(!n)return;let a=r.position.y;if(at(a,s,t),t){let[t,r]=Wn(e,a),i=W.fogDistanceScale.value;n.near=i>1?Math.min(t,100):t,n.far=r*i,n.color.copy(e.fogColor)}}),null}var Kn=(0,G.memo)(function({entity:e}){let{skyData:t}=e;Pn.debug(`Rendering: materialList=%s, useSkyTextures=%s`,t.materialList,t.useSkyTextures);let{fogEnabled:n}=c(),r=t.materialList||void 0,i=(0,G.useMemo)(()=>In(t.skySolidColor),[t.skySolidColor]),a=t.useSkyTextures,s=(0,G.useMemo)(()=>Nn(t),[t]);Pn.debug(`fogState: fogColor=(%s, %s, %s) visibleDistance=%d fogDistance=%d enabled=%s volumes=%d`,t.fogColor.r.toFixed(3),t.fogColor.g.toFixed(3),t.fogColor.b.toFixed(3),t.visibleDistance,t.fogDistance,s.enabled,s.fogVolumes.length);let l=(0,G.useMemo)(()=>In(t.fogColor),[t.fogColor]),u=i||l,d=s.enabled&&n,f=s.fogColor,p=o(e=>e.scene),m=o(e=>e.gl);(0,G.useEffect)(()=>{if(d){let e=f.clone();p.background=e,m.setClearColor(e)}else if(u){let e=u[0].clone();p.background=e,m.setClearColor(e)}else p.background=null;return()=>{p.background=null}},[p,m,d,f,u]);let h=i?.[1];return(0,q.jsxs)(q.Fragment,{children:[r&&a&&r.length>0?(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Bn,{materialList:r,fogColor:d?f:void 0,fogState:d?s:void 0},r)}):h?(0,q.jsx)(Un,{skyColor:h,fogColor:d?f:void 0,fogState:d?s:void 0}):null,(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(An,{scene:t})}),s.enabled?(0,q.jsx)(Gn,{fogState:s,enabled:n}):null]})});function qn(e){let t=(0,K.c)(3),{children:n}=e,{audioEnabled:r}=c(),i;return t[0]!==r||t[1]!==n?(i=r?(0,q.jsx)(G.Suspense,{children:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}function Z(e,t){let n=(0,G.lazy)(()=>t().then(t=>({default:t[e]}))),r=t=>{let r=(0,K.c)(5),{entity:i}=t,a=`${e}:${i.id}`,o;r[0]===i?o=r[1]:(o=(0,q.jsx)(n,{entity:i}),r[0]=i,r[1]=o);let s;return r[2]!==a||r[3]!==o?(s=(0,q.jsx)(Ze,{name:a,children:o}),r[2]=a,r[3]=o,r[4]=s):s=r[4],s};return r.displayName=`createLazy(${e})`,r}var Jn=Z(`PlayerModel`,()=>V(()=>import(`./PlayerModel-CEkjCM3w.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34]))),Yn=Z(`ExplosionShape`,()=>V(()=>import(`./ShapeModel-DgDDL7I2.js`),__vite__mapDeps([35,1,8,9,5,10,22,2,3,4,6,7,11,12,13,14,15,16,17,18,19,23,24,25,26,27,20,21,28,29,30,33]))),Xn=Z(`TracerProjectile`,()=>V(()=>import(`./Projectiles-Dr7eZwbS.js`),__vite__mapDeps([36,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,23,22,24,25]))),Zn=Z(`SpriteProjectile`,()=>V(()=>import(`./Projectiles-Dr7eZwbS.js`),__vite__mapDeps([36,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,23,22,24,25]))),Qn=Z(`ForceFieldBare`,()=>V(()=>import(`./ForceFieldBare-BdigqQO3.js`),__vite__mapDeps([37,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,23,28,31]))),$n=Z(`AudioEmitter`,()=>V(()=>import(`./AudioEmitter-DmOXGjHe.js`),__vite__mapDeps([38,11,1,9,12,10,13,14,27,2,3,4,5,6,7,8,15,16,17,18,19,20,21,28,29]))),er=Z(`WaterBlock`,()=>V(()=>import(`./WaterBlock-C-8tx_Ud.js`),__vite__mapDeps([39,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,23,28,30,25]))),tr=Z(`WeaponModel`,()=>V(()=>import(`./ShapeModel-DgDDL7I2.js`),__vite__mapDeps([35,1,8,9,5,10,22,2,3,4,6,7,11,12,13,14,15,16,17,18,19,23,24,25,26,27,20,21,28,29,30,33]))),nr=(0,G.memo)(function(e){let t=(0,K.c)(26),{entity:n}=e;switch(n.renderType){case`Shape`:{let e;return t[0]===n?e=t[1]:(e=(0,q.jsx)(rr,{entity:n}),t[0]=n,t[1]=e),e}case`ForceFieldBare`:{let e;return t[2]===n?e=t[3]:(e=(0,q.jsx)(Qn,{entity:n}),t[2]=n,t[3]=e),e}case`Player`:{let e;return t[4]===n?e=t[5]:(e=(0,q.jsx)(Jn,{entity:n}),t[4]=n,t[5]=e),e}case`Explosion`:{let e;return t[6]===n?e=t[7]:(e=(0,q.jsx)(Yn,{entity:n}),t[6]=n,t[7]=e),e}case`Tracer`:{let e;return t[8]===n?e=t[9]:(e=(0,q.jsx)(Xn,{entity:n}),t[8]=n,t[9]=e),e}case`Sprite`:{let e;return t[10]===n?e=t[11]:(e=(0,q.jsx)(Zn,{entity:n}),t[10]=n,t[11]=e),e}case`AudioEmitter`:{let e;return t[12]===n?e=t[13]:(e=(0,q.jsx)(qn,{children:(0,q.jsx)($n,{entity:n})}),t[12]=n,t[13]=e),e}case`Camera`:{let e;return t[14]===n?e=t[15]:(e=(0,q.jsx)(Dt,{entity:n}),t[14]=n,t[15]=e),e}case`WayPoint`:{let e;return t[16]===n?e=t[17]:(e=(0,q.jsx)(Ot,{entity:n}),t[16]=n,t[17]=e),e}case`TerrainBlock`:{let e;return t[18]===n?e=t[19]:(e=(0,q.jsx)(Zt,{entity:n}),t[18]=n,t[19]=e),e}case`InteriorInstance`:{let e;return t[20]===n?e=t[21]:(e=(0,q.jsx)(mn,{entity:n}),t[20]=n,t[21]=e),e}case`Sky`:{let e;return t[22]===n?e=t[23]:(e=(0,q.jsx)(Kn,{entity:n}),t[22]=n,t[23]=e),e}case`Sun`:return null;case`WaterBlock`:{let e;return t[24]===n?e=t[25]:(e=(0,q.jsx)(er,{entity:n}),t[24]=n,t[25]=e),e}case`MissionArea`:return null;case`None`:return null;default:return null}});function rr(e){let t=(0,K.c)(26),{entity:n}=e,{animationEnabled:r}=c(),i=(0,G.useRef)(null),o;if(t[0]!==r||t[1]!==n.rotate?(o=()=>{if(!i.current||!n.rotate||!r)return;let e=performance.now()/1e3;i.current.rotation.y=e/3*Math.PI*2},t[0]=r,t[1]=n.rotate,t[2]=o):o=t[2],a(o),!n.shapeName)throw Error(`Shape entity missing shapeName: ${n.id}`);let s=n.runtimeObject,l=n.shapeType??`StaticShape`,u=n.dataBlock?.toLowerCase()===`flag`,d=n.teamId&&n.teamId>0?y[n.teamId]:null,f=u&&d?`${d} Flag`:null,m=n.shapeType===`Item`?`pink`:n.threads?`#00ff88`:`yellow`,h=n.rotate?i:void 0,g=s?void 0:n,_;t[3]===f?_=t[4]:(_=f?(0,q.jsx)(Xe,{opacity:.6,children:f}):null,t[3]=f,t[4]=_);let v;t[5]!==n.emap||t[6]!==n.id||t[7]!==m||t[8]!==g||t[9]!==_?(v=(0,q.jsx)(et,{loadingColor:m,streamEntity:g,emap:n.emap,entityId:n.id,children:_}),t[5]=n.emap,t[6]=n.id,t[7]=m,t[8]=g,t[9]=_,t[10]=v):v=t[10];let b;t[11]!==n.barrelShapeName||t[12]!==s?(b=n.barrelShapeName&&(0,q.jsx)(p,{object:s,shapeName:n.barrelShapeName,type:`Turret`,children:(0,q.jsx)(`group`,{position:[0,1.5,0],children:(0,q.jsx)(et,{})})}),t[11]=n.barrelShapeName,t[12]=s,t[13]=b):b=t[13];let x;t[14]===n?x=t[15]:(x=n.weaponShape&&(0,q.jsx)(ft,{fallback:(0,q.jsx)(nt,{color:`red`,label:n.weaponShape}),children:(0,q.jsx)(Ze,{name:`Weapon:${n.id}/${n.weaponShape}`,fallback:(0,q.jsx)(nt,{color:`cyan`,label:n.weaponShape}),children:(0,q.jsx)(tr,{entity:n})})}),t[14]=n,t[15]=x);let S;t[16]!==h||t[17]!==v||t[18]!==b||t[19]!==x?(S=(0,q.jsxs)(`group`,{ref:h,children:[v,b,x]}),t[16]=h,t[17]=v,t[18]=b,t[19]=x,t[20]=S):S=t[20];let C;return t[21]!==n.shapeName||t[22]!==l||t[23]!==S||t[24]!==s?(C=(0,q.jsx)(p,{object:s,shapeName:n.shapeName,type:l,children:S}),t[21]=n.shapeName,t[22]=l,t[23]=S,t[24]=s,t[25]=C):C=t[25],C}var ir={Root:`_Root_yuidw_1`,Distance:`_Distance_yuidw_9`,Icon:`_Icon_yuidw_18`},ar=1.5,or=U(`commander/MiniIcons/com_flag_grey`),sr=new L;function cr(e){let t=(0,K.c)(9),{entity:n}=e,r=(0,G.useRef)(null),i=(0,G.useRef)(null),s=(0,G.useRef)(null),c=o(lr),l;t[0]!==c||t[1]!==n.iffColor?(l=()=>{if(i.current&&n.iffColor){let{r:e,g:t,b:r}=n.iffColor;i.current.style.backgroundColor=`rgb(${e},${t},${r})`}if(s.current&&r.current){r.current.getWorldPosition(sr);let e=c.position.distanceTo(sr);s.current.textContent=e.toFixed(1)}},t[0]=c,t[1]=n.iffColor,t[2]=l):l=t[2],a(l);let u=n.iffColor?`rgb(${n.iffColor.r},${n.iffColor.g},${n.iffColor.b})`:`rgb(200,200,200)`,d;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(d=[0,ar,0],t[3]=d):d=t[3];let f;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,q.jsx)(`span`,{ref:s,className:ir.Distance}),t[4]=f):f=t[4];let p;t[5]===u?p=t[6]:(p={backgroundColor:u,"--flag-icon-url":`url(${or})`},t[5]=u,t[6]=p);let m=p,h;return t[7]===m?h=t[8]:(h=(0,q.jsx)(`group`,{ref:r,children:(0,q.jsx)(ge,{position:d,center:!0,children:(0,q.jsxs)(`div`,{className:ir.Root,children:[f,(0,q.jsx)(`div`,{ref:i,className:ir.Icon,style:m})]})})}),t[7]=m,t[8]=h),h}function lr(e){return e.camera}function ur(){let e=(0,K.c)(1),t=dr,n;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=(0,q.jsx)(`group`,{ref:t,children:(0,q.jsx)(fr,{})}),e[0]=n):n=e[0],n}function dr(e){$e.setState({root:e})}var fr=(0,G.memo)(function(){let e=Se(),t=(0,G.useRef)(new Map).current,n=new Set;for(let r of e)n.add(r.id),t.set(r.id,r);for(let e of t.keys())n.has(e)||t.delete(e);return(0,q.jsx)(q.Fragment,{children:[...t.values()].map(e=>(0,q.jsx)(pr,{entity:e},e.id))})}),pr=(0,G.memo)(function(e){let t=(0,K.c)(7),{entity:n}=e;if(n.debugHidden)return null;if(Qe(n)){let e;t[0]===n?e=t[1]:(e=(0,q.jsx)(nr,{entity:n}),t[0]=n,t[1]=e);let r;return t[2]!==n.id||t[3]!==e?(r=(0,q.jsx)(`group`,{name:n.id,children:e}),t[2]=n.id,t[3]=e,t[4]=r):r=t[4],r}if(n.renderType===`None`)return null;let r;return t[5]===n?r=t[6]:(r=(0,q.jsx)(hr,{entity:n}),t[5]=n,t[6]=r),r});function mr({entity:e}){let t=(0,G.useRef)(!1),[n,r]=(0,G.useState)(()=>(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0);return t.current=n,a(()=>{let n=(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0;n!==t.current&&(t.current=n,r(n))}),n?(0,q.jsx)(cr,{entity:e}):null}function hr(e){let t=(0,K.c)(35),{entity:n}=e,r=n.position,i=n.scale,a;bb0:{if(!n.rotation){a=void 0;break bb0}let e;t[0]===n.rotation?e=t[1]:(e=new O(...n.rotation),t[0]=n.rotation,t[1]=e),a=e}let o=a;if(n.renderType===`Shape`&&!n.shapeName){let e=n.id,a;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(a=(0,q.jsx)(`sphereGeometry`,{args:[.3,6,4]}),t[2]=a):a=t[2];let s;t[3]===n.className?s=t[4]:(s=h(n.className),t[3]=n.className,t[4]=s);let c;t[5]===s?c=t[6]:(c=(0,q.jsxs)(`mesh`,{children:[a,(0,q.jsx)(`meshBasicMaterial`,{color:s,wireframe:!0})]}),t[5]=s,t[6]=c);let l;t[7]===n?l=t[8]:(l=(0,q.jsx)(mr,{entity:n}),t[7]=n,t[8]=l);let u;return t[9]!==n.id||t[10]!==r||t[11]!==o||t[12]!==i||t[13]!==c||t[14]!==l?(u=(0,q.jsxs)(`group`,{name:e,position:r,quaternion:o,scale:i,children:[c,l]}),t[9]=n.id,t[10]=r,t[11]=o,t[12]=i,t[13]=c,t[14]=l,t[15]=u):u=t[15],u}let s;t[16]!==n.className||t[17]!==n.renderType?(s=n.renderType===`Explosion`?null:(0,q.jsxs)(`mesh`,{children:[(0,q.jsx)(`sphereGeometry`,{args:[.5,8,6]}),(0,q.jsx)(`meshBasicMaterial`,{color:h(n.className),wireframe:!0})]}),t[16]=n.className,t[17]=n.renderType,t[18]=s):s=t[18];let c=s,l;t[19]===n?l=t[20]:(l=(0,q.jsx)(nr,{entity:n}),t[19]=n,t[20]=l);let u;t[21]!==c||t[22]!==l?(u=(0,q.jsx)(ft,{fallback:c,children:l}),t[21]=c,t[22]=l,t[23]=u):u=t[23];let d;t[24]===n?d=t[25]:(d=(0,q.jsx)(mr,{entity:n}),t[24]=n,t[25]=d);let f;t[26]!==u||t[27]!==d?(f=(0,q.jsxs)(`group`,{name:`model`,children:[u,d]}),t[26]=u,t[27]=d,t[28]=f):f=t[28];let p;return t[29]!==n.id||t[30]!==r||t[31]!==o||t[32]!==i||t[33]!==f?(p=(0,q.jsx)(`group`,{name:n.id,position:r,quaternion:o,scale:i,children:f}),t[29]=n.id,t[30]=r,t[31]=o,t[32]=i,t[33]=f,t[34]=p):p=t[34],p}function gr(){let e=(0,K.c)(3),{fov:t}=c(),n;e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=[0,256,0],e[0]=n):n=e[0];let r;return e[1]===t?r=e[2]:(r=(0,q.jsx)(ht,{makeDefault:!0,position:n,fov:t}),e[1]=t,e[2]=r),r}function _r(e){let t=(0,K.c)(3),{children:n}=e,{debugMode:r}=l(),i;return t[0]!==n||t[1]!==r?(i=r?(0,q.jsx)(G.Suspense,{children:n}):null,t[0]=n,t[1]=r,t[2]=i):i=t[2],i}var vr=x(`InputConsumer`),yr=200,br=Math.PI/2-.01,xr=45,Sr=31,Cr=40,wr=1/32,Tr=2*Math.PI;function Er(e){return((Math.round(e/Tr*65536)|0)<<16>>16)*Tr/65536}var Dr=new L,Or=new L,kr=new L,Ar=new k(0,0,0,`YXZ`);function jr(e,t,n,r,i,a,o){if(r===0&&i===0&&a===0)return;let s=Math.sin(t),c=Math.cos(t),l=Math.sin(n),u=Math.cos(n),d=o*wr;e.x+=(c*r+s*u*i+s*l*a)*d,e.y+=(-s*r+c*u*i+c*l*a)*d,e.z+=(-l*i+u*a)*d}function Mr(){let{moveQueue:e,mode:t,setMode:n}=be(),r=Oe(e=>e.adapter),i=Oe(e=>e.gameStatus),s=Oe(e=>e.liveReady),c=Oe(e=>e.sendMoves),l=b(),u=o(e=>e.camera),f=g(),p=(0,G.useRef)(null),m=(0,G.useRef)([]),h=(0,G.useRef)(0),_=(0,G.useRef)(0),v=(0,G.useRef)(null),y=(0,G.useRef)(0),x=(0,G.useRef)(0),S=(0,G.useRef)({x:0,y:0,z:0}),C=(0,G.useRef)(0),w=(0,G.useRef)(0),E=(0,G.useRef)({x:0,y:0,z:0}),D=(0,G.useRef)(!1),ee=(0,G.useRef)({x:0,y:0,z:0}),O=(0,G.useRef)({x:0,y:0,z:0}),k=(0,G.useRef)(!1),A=(0,G.useRef)(null),j=(0,G.useRef)(0),M=(0,G.useRef)(0),N=(0,G.useRef)(0),P=(0,G.useRef)(0),F=(0,G.useRef)(0),I=(0,G.useRef)([!1,!1,!1,!1,!1,!1]),L=!!r&&(i===`connected`||i===`authenticating`);return(0,G.useEffect)(()=>{if(L&&r){if(p.current===r)return;vr.info(`wiring adapter to engine store`);let e=Ee.getState(),t={source:`live`,duration:1/0,missionName:e.mapName??null,gameType:null,serverDisplayName:e.serverName??null,recorderName:e.warriorName??null,recordingDate:null,streamingPlayback:r};l.getState().setRecording(t),l.getState().setPlaybackStatus(`playing`),p.current=r,D.current=!1,k.current=!1,A.current=null,m.current.length=0,h.current=0,_.current=0,v.current=null,n(`fly`)}else !L&&p.current&&(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),p.current=null,D.current=!1,k.current=!1,A.current=null,m.current.length=0,n(`local`))},[L,r,l,n]),(0,G.useEffect)(()=>{!s&&p.current&&(vr.info(`mission change: resetting prediction state and mode`),D.current=!1,k.current=!1,A.current=null,m.current.length=0,h.current=0,_.current=0,v.current=null,j.current=0,M.current=0,N.current=0,P.current=0,F.current=0,I.current.fill(!1),n(`fly`))},[s,n]),(0,G.useEffect)(()=>{if(!L)return $e.subscribe(e=>{n(e.cameraMode===`orbitOverride`?`follow`:`local`)})},[L,n]),d(()=>{if(!p.current||i!==`connected`||!s)return;let e=j.current,t=M.current;j.current=0,M.current=0;let n=N.current,r=P.current,a=F.current;N.current=0,P.current=0,F.current=0;let o=[...I.current];I.current.fill(!1);let l=Er(e),u=Er(t);y.current+=l-e,x.current+=u-t,C.current=y.current,w.current=x.current,E.current={...S.current};let d=Cr*2,f=y.current-l,g=x.current-u;jr(S.current,f,g,n,r,a,d),o[1]=!0;let _=h.current++,v={x:n,y:r,z:a,yaw:e,pitch:t,roll:0,trigger:o,freeLook:!1},b=m.current;b.push({moveIndex:_,move:v,yaw:l,pitch:u,x:n,y:r,z:a}),b.length>xr&&b.splice(0,b.length-xr);let T=p.current.lastMoveAck;for(;b.length>0&&b[0].moveIndex<T;)b.shift();if(b.length>0){let e=b.slice(0,Sr);c(e.map(e=>e.move),e[0].moveIndex)}let D=p.current.getSnapshot();if(D!==A.current){A.current=D;let e=D?.camera;if(e?.orbitTargetId){let t=D.entities.find(t=>t.id===e.orbitTargetId);t?.position&&(ee.current={...O.current},O.current={x:t.position[0],y:t.position[1],z:t.position[2]},k.current||=(ee.current={...O.current},!0))}}}),a((r,a)=>{let o=e.current;if(o.length>0){let t=0,n=0,r=0,a=0,c=0,l=0,d=[!1,!1,!1,!1,!1,!1];for(let e of o){t+=e.deltaYaw,n+=e.deltaPitch,Math.abs(e.x)>Math.abs(r)&&(r=e.x),Math.abs(e.y)>Math.abs(a)&&(a=e.y),Math.abs(e.z)>Math.abs(c)&&(c=e.z),l+=e.delta;for(let t=0;t<e.triggers.length;t++)e.triggers[t]&&(d[t]=!0)}if(e.current.length=0,L&&p.current&&i===`connected`&&s){j.current+=t,M.current+=n,N.current=r,P.current=a,F.current=c;for(let e=0;e<d.length;e++)d[e]&&(I.current[e]=!0);y.current+=t,x.current=Math.max(-T,Math.min(T,x.current+n))}else{let e=$e.getState();if(e.playback){e.cameraMode===`freeFly`?Nr(u,t,n,r,a,c,l):e.cameraMode===`orbitOverride`&&(e.orbitOverrideYaw+=t,e.orbitOverridePitch=Math.max(-T,Math.min(T,e.orbitOverridePitch+n)));return}Nr(u,t,n,r,a,c,l);return}}if(!L||!p.current||i!==`connected`||!s)return;let c=p.current,l=c.getSnapshot(),d=l?.camera;if(d&&d!==v.current&&typeof d.yaw==`number`&&typeof d.pitch==`number`){v.current=d;let e=c.lastMoveAck;if(e>_.current){_.current=e;let t=m.current;for(;t.length>0&&t[0].moveIndex<e;)t.shift()}y.current=d.yaw,x.current=d.pitch,S.current={x:d.position[0],y:d.position[1],z:d.position[2]};let r=Cr*2;for(let e of m.current)jr(S.current,y.current,x.current,e.x,e.y,e.z,r),y.current+=e.yaw,x.current=Math.max(-T,Math.min(T,x.current+e.pitch));y.current+=j.current,x.current=Math.max(-T,Math.min(T,x.current+M.current)),C.current=y.current,w.current=x.current,E.current={...S.current},D.current=!0;let i=d.mode===`third-person`?`follow`:`fly`;if(i!==t&&(vr.info(`server corrected observer mode: %s → %s`,t,i),n(i),p.current&&(p.current.observerMode=i),i===`fly`&&(k.current=!1,A.current=null)),d.orbitTargetId&&!k.current){let e=l.entities.find(e=>e.id===d.orbitTargetId);if(e?.position){let t={x:e.position[0],y:e.position[1],z:e.position[2]};O.current=t,ee.current={...t},k.current=!0}}}if(D.current){if(t===`fly`)Pr(r.camera,E.current,S.current,y.current,x.current,f());else if(t===`follow`){if(!k.current)return;Fr(r.camera,ee.current,O.current,y.current,x.current,f(),d?.orbitDistance??4,d?.orbitTargetId)}}}),(0,G.useEffect)(()=>()=>{p.current&&=(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),null)},[l]),null}function Nr(e,t,n,r,i,a,o){if((t!==0||n!==0)&&(Ar.setFromQuaternion(e.quaternion,`YXZ`),Ar.y-=t,Ar.x-=n,Ar.x=Math.max(-br,Math.min(br,Ar.x)),e.quaternion.setFromEuler(Ar)),r!==0||i!==0||a!==0){e.getWorldDirection(Dr),Dr.normalize(),Or.crossVectors(e.up,Dr).normalize(),kr.set(0,0,0),i!==0&&kr.addScaledVector(Dr,i),r!==0&&kr.addScaledVector(Or,-r),a!==0&&(kr.y+=a);let t=kr.length();t>0&&(kr.multiplyScalar(Math.min(1,t)/t*yr*o),e.position.add(kr))}}function Pr(e,t,n,r,i,a){let o=t.x+(n.x-t.x)*a,s=t.y+(n.y-t.y)*a,c=t.z+(n.z-t.z)*a;e.position.set(s,c,o);let[l,u,d,f]=E(r,i);e.quaternion.set(l,u,d,f)}function Fr(e,t,n,r,i,a,o,s){let c=t.x+(n.x-t.x)*a,l=t.y+(n.y-t.y)*a,u=t.z+(n.z-t.z)*a+(s!=null&&xe.getState().streamEntities.get(s)?.renderType===`Player`?1:0),d=Math.sin(i),f=Math.cos(i),p=Math.sin(r),m=Math.cos(r),h=Math.max(.1,o),g=c-p*f*h,_=l-m*f*h,v=u+d*h;e.position.set(_,v,g);let[y,b,x,S]=E(r,i);e.quaternion.set(y,b,x,S)}var Ir=x(`CameraTourConsumer`);function Lr(e){return e<.5?4*e*e*e:1-(-2*e+2)**3/2}var Rr=3,zr=10,Br=2,Vr=1.8,Hr=50,Ur=200,Wr=2,Gr=1.8,Kr=1.2,qr=.6,Jr=3/4*(2*Math.PI),Yr=Jr/qr,Xr=1.5,Zr=1.5,Qr=6,$r=180,ei=1.4,ti=new z,ni=new z,ri=new z,ii=new ce,ai=new L,oi=new L,si=new L,ci=new L,li=new L,Q=new O,ui=new O,di=new ce,fi=new k;function pi(e){if(e.orbitCenter)return li.set(e.orbitCenter[0],e.orbitCenter[1],e.orbitCenter[2]);let t=e.targets[e.currentIndex];return li.set(t.position[0],t.position[1],t.position[2])}function mi(e){return e.orbitRadius??Rr}function hi(e){return mi(e)*(Br/Rr)}function gi(e,t,n){let r=pi(e),i=mi(e),a=hi(e);return n.set(r.x+Math.cos(t)*i,r.y+a,r.z+Math.sin(t)*i)}function _i(e,t,n){let r=e.getObjectByName(t.entityId),i=!1;if(r&&r.traverse(e=>{e.geometry&&(i=!0)}),r&&!i){n.orbitCenter=[...t.position],n.orbitRadius=zr;return}if(r&&i){ti.setFromObject(r),ti.getCenter(ai),n.orbitCenter=[ai.x,ai.y,ai.z];let e=di.copy(r.matrixWorld).invert();ni.makeEmpty(),r.traverse(t=>{t.geometry&&(t.geometry.boundingBox||t.geometry.computeBoundingBox(),ri.copy(t.geometry.boundingBox),ii.multiplyMatrices(e,t.matrixWorld),ri.applyMatrix4(ii),ni.union(ri))}),ni.getSize(oi);let i=oi.y,a=Math.max(oi.x,oi.z),o=i/2+Gr,s=a/2+Kr,c=Math.max(o,s);if(c>200){n.orbitCenter=[...t.position];let e=0;r.traverse(t=>{if(e>0||!t.geometry)return;t.geometry.boundingBox||t.geometry.computeBoundingBox();let n=t.geometry.boundingBox,r=n.max.x-n.min.x,i=n.max.y-n.min.y,a=n.max.z-n.min.z;e=Math.max(r,i,a)});let i=(e/2+Kr)*.75;n.orbitRadius=Math.max(Vr,i)}else n.orbitRadius=Math.max(Vr,c);let l=o>=s?`height`:`spread`,u=c<Vr?` (clamped)`:``;Ir.debug(`%s: size=%s height→%s spread→%s driven by %s → radius=%d%s`,t.label,`${oi.x.toFixed(1)}×${oi.y.toFixed(1)}×${oi.z.toFixed(1)}`,o.toFixed(1),s.toFixed(1),l,n.orbitRadius,u)}else n.orbitCenter=null,n.orbitRadius=null,Ir.debug(`%s: no scene object, fallback radius=%d`,t.label,Rr)}function vi(e){return fi.setFromQuaternion(e,`YXZ`),fi.z=0,e.setFromEuler(fi)}function yi(e,t){return di.lookAt(e,t,ci.set(0,1,0)),ui.setFromRotationMatrix(di),vi(ui)}function bi(e,t,n){let r=pi(t),i=gi(t,n,si.clone()),a=e.distanceTo(i);if(a<20)return new te([e.clone(),i],!1,`centripetal`);let o=new L().addVectors(e,i).multiplyScalar(.5);return o.distanceTo(r)>i.distanceTo(r)&&o.lerp(r,.3),o.y+=a*.15,new te([e.clone(),o,i],!1,`centripetal`)}function xi(e,t){let n=pi(t);return Math.atan2(e.z-n.z,e.x-n.x)}function Si(e){return Math.max(Zr,Math.min(Qr,e/$r))}function Ci(e,t,n,r){let i=e.targets[e.currentIndex];if(!e.curve){e.startPos=[t.position.x,t.position.y,t.position.z],vi(Q.copy(t.quaternion)),e.startQuat=[Q.x,Q.y,Q.z,Q.w],_i(r,i,e);let n=t.position.clone();e.curve=bi(n,e,xi(n,e)),e.phaseDuration=Si(e.curve.getLength()),e.elapsed=0;return}e.elapsed+=n;let a=Math.min(1,Lr(e.elapsed/e.phaseDuration));e.curve.getPointAt(a,si),t.position.copy(si);let o=Lr(Math.min(1,e.elapsed/e.phaseDuration*ei)),s=yi(si,pi(e));o<1&&e.startQuat?(Q.set(e.startQuat[0],e.startQuat[1],e.startQuat[2],e.startQuat[3]),Q.slerp(s,o),t.quaternion.copy(Q)):t.quaternion.copy(s),e.elapsed>=e.phaseDuration&&(e.phase=`orbiting`,e.elapsed=0,e.orbitStartAngle=xi(t.position,e))}function wi(e,t,n){let r=e.targets.length===1,i=e.currentIndex>=e.targets.length-1;e.elapsed+=n;let a=e.orbitStartAngle,o=Yr+Xr,s;if(e.elapsed<=Yr)s=a+e.elapsed*qr;else{let t=e.elapsed-Yr,n=Math.min(1,t/Xr),r=t*qr*(1-n/2);s=a+Jr+r}gi(e,s,si),t.position.copy(si);let c=yi(si,pi(e));t.quaternion.copy(c),e.elapsed>=o&&(r||i?w.getState().cancel():w.getState().advanceTarget())}function Ti(){let e=(0,K.c)(3),t=o(ki),n=o(Oi),r=(0,G.useRef)(null);We(`nextStop`,Di),We(`exitTour`,Ei);let i;return e[0]!==t||e[1]!==n?(i=(e,i)=>{let a=w.getState().animation,o=a?mi(a):0,s=a&&o>=Hr?o/Ur:1,c=W.fogDistanceScale.value;if(c!==s){let e=Wr*i;s>c?W.fogDistanceScale.value=Math.min(c+e,s):W.fogDistanceScale.value=Math.max(c-e,s)}if(!a){r.current&&=(vi(t.quaternion),null);return}r.current=a,a.phase===`traveling`?Ci(a,t,i,n):wi(a,t,i)},e[0]=t,e[1]=n,e[2]=i):i=e[2],a(i),null}function Ei(){w.getState().cancel()}function Di(){let e=w.getState().animation;e&&(e.currentIndex>=e.targets.length-1?w.getState().cancel():w.getState().advanceTarget())}function Oi(e){return e.scene}function ki(e){return e.camera}var Ai=3;function $({map:e}){let t=Me,n=o(e=>e.gl.domElement),r=(0,G.useMemo)(()=>{let n=e.map(e=>{let t=Array.isArray(e.keys)?e.keys:[e.keys];return{name:e.name,bindings:t.map(ye)}}),r={};for(let e of n)r[e.name]=je(e.bindings[0]);let i=new Map,a=[],o=[],s=[],c=[],l=[];for(let e of n)for(let t of e.bindings)switch(t.type){case`key`:{let n=i.get(t.code);n||(n=[],i.set(t.code,n)),n.push({action:e,binding:t});break}case`click`:a.push({action:e,binding:t});break;case`drag`:o.push({action:e,binding:t});break;case`pointerLockMove`:s.push({action:e});break;case`scroll`:c.push({action:e});break;case`touch`:l.push({action:e});break}function u(e){return e==null?!0:e===!!document.pointerLockElement}function d(e){let{actions:n}=t.getState(),r={};for(let[,t]of i)for(let{action:i,binding:a}of t){let t=e.has(a.code)&&Ge(e,a.modifiers),o=n[i.name]?.pressed??!1;t&&!o?(r[i.name]={pressed:!0},Te(i.name)):!t&&o&&(r[i.name]={pressed:!1})}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}let f=-1,p=0,m=0,h=!1;function g(e,n){t.setState(t=>({...t,actions:{...t.actions,[e]:n}}))}function _(e){let t=!!document.pointerLockElement;for(let{action:t,binding:n}of a){if(!u(n.whenPointerLocked))continue;let r=n.button??0;e.button===r&&Ke(e,n.modifiers)&&g(t.name,{pressed:!0})}t||(f=e.button,p=e.clientX,m=e.clientY,h=!1)}function v(e){if(document.pointerLockElement){if(s.length>0){let{actions:n}=t.getState(),r={};for(let{action:t}of s){let i=n[t.name];r[t.name]={...i,deltaX:i.deltaX+e.movementX,deltaY:i.deltaY+e.movementY}}t.setState(e=>({...e,actions:{...e.actions,...r}}))}return}if(f<0)return;if(!h){let n=e.clientX-p,r=e.clientY-m;if(Math.abs(n)<Ai&&Math.abs(r)<Ai)return;h=!0;for(let{action:e,binding:n}of a)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].pressed&&g(e.name,{pressed:!1});for(let{action:e,binding:t}of o)u(t.whenPointerLocked)&&(t.button??0)===f&&g(e.name,{dragging:!0,deltaX:0,deltaY:0,startX:p,startY:m})}let{actions:n}=t.getState(),r={};for(let{action:t,binding:i}of o){if(!u(i.whenPointerLocked)||(i.button??0)!==f)continue;let a=n[t.name];r[t.name]={...a,deltaX:a.deltaX+e.movementX,deltaY:a.deltaY+e.movementY}}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}function y(e){let n=!!document.pointerLockElement;for(let{action:n,binding:r}of a){if(!u(r.whenPointerLocked))continue;let i=r.button??0;e.button===i&&t.getState().actions[n.name].pressed&&(Te(n.name),g(n.name,{pressed:!1}))}if(!n&&e.button===f){for(let{action:e,binding:n}of o)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].dragging&&g(e.name,Pe());f=-1,h=!1}}function b(e){for(let{action:t}of c)g(t.name,{deltaX:e.deltaX,deltaY:e.deltaY}),Te(t.name)}let x=null,S=0,C=0;function w(e){if(x!==null||l.length===0)return;let t=e.changedTouches[0];if(t){x=t.identifier,S=t.clientX,C=t.clientY;for(let{action:e}of l)g(e.name,{touching:!0,dragging:!1,deltaX:0,deltaY:0})}}function T(e){if(x!==null)for(let n=0;n<e.changedTouches.length;n++){let r=e.changedTouches[n];if(r.identifier!==x)continue;let i=r.clientX-S,a=r.clientY-C;S=r.clientX,C=r.clientY;for(let{action:e}of l){let n=t.getState().actions[e.name];g(e.name,{touching:!0,dragging:!0,deltaX:n.deltaX+i,deltaY:n.deltaY+a})}break}}function E(e){if(x!==null){for(let t=0;t<e.changedTouches.length;t++)if(e.changedTouches[t].identifier===x){x=null;for(let{action:e}of l)g(e.name,Ue());break}}}return{actionNames:n.map(e=>e.name),initialActions:r,deriveKeyActions:d,hasKeyBindings:i.size>0,handleMouseDown:_,handleMouseMove:v,handleMouseUp:y,handleWheel:b,handleTouchStart:w,handleTouchMove:T,handleTouchEnd:E,hasMouseBindings:a.length>0||o.length>0||s.length>0,hasScrollBindings:c.length>0,hasTouchBindings:l.length>0}},[e,t]);return(0,G.useEffect)(()=>{t.setState(e=>({...e,actions:{...e.actions,...r.initialActions}}));let e;return r.hasKeyBindings&&(r.deriveKeyActions(t.getState().keys),e=t.subscribe(e=>e.keys,e=>r.deriveKeyActions(e))),r.hasMouseBindings&&(n.addEventListener(`mousedown`,r.handleMouseDown),document.addEventListener(`mousemove`,r.handleMouseMove),document.addEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.addEventListener(`wheel`,r.handleWheel,{passive:!0}),r.hasTouchBindings&&(n.addEventListener(`touchstart`,r.handleTouchStart,{passive:!0}),document.addEventListener(`touchmove`,r.handleTouchMove,{passive:!0}),document.addEventListener(`touchend`,r.handleTouchEnd,{passive:!0}),document.addEventListener(`touchcancel`,r.handleTouchEnd,{passive:!0})),()=>{e?.(),r.hasMouseBindings&&(n.removeEventListener(`mousedown`,r.handleMouseDown),document.removeEventListener(`mousemove`,r.handleMouseMove),document.removeEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.removeEventListener(`wheel`,r.handleWheel),r.hasTouchBindings&&(n.removeEventListener(`touchstart`,r.handleTouchStart),document.removeEventListener(`touchmove`,r.handleTouchMove),document.removeEventListener(`touchend`,r.handleTouchEnd),document.removeEventListener(`touchcancel`,r.handleTouchEnd)),t.setState(e=>{let t={...e.actions};for(let e of r.actionNames)delete t[e];return{...e,actions:t}})}},[r,t,n]),null}var ji=[{name:`moveForward`,keys:[`KeyW`]},{name:`moveBackward`,keys:[`KeyS`]},{name:`moveLeft`,keys:[`KeyA`]},{name:`moveRight`,keys:[`KeyD`]},{name:`moveUp`,keys:[`KeyE`]},{name:`moveDown`,keys:[`KeyQ`]},{name:`adjustSpeed`,keys:[{type:`scroll`}]}],Mi=[{name:`lookUp`,keys:[`ArrowUp`]},{name:`lookDown`,keys:[`ArrowDown`]},{name:`lookLeft`,keys:[`ArrowLeft`]},{name:`lookRight`,keys:[`ArrowRight`]},{name:`dragLook`,keys:[{type:`drag`,button:0}]},{name:`lockedLook`,keys:[{type:`pointerLockMove`}]},{name:`touchLook`,keys:[{type:`touch`}]}],Ni=[{name:`canvasClick`,keys:[{type:`click`,button:0,whenPointerLocked:!1}]}],Pi=[{name:`camera1`,keys:[`Digit1`]},{name:`camera2`,keys:[`Digit2`]},{name:`camera3`,keys:[`Digit3`]},{name:`camera4`,keys:[`Digit4`]},{name:`camera5`,keys:[`Digit5`]},{name:`camera6`,keys:[`Digit6`]},{name:`camera7`,keys:[`Digit7`]},{name:`camera8`,keys:[`Digit8`]},{name:`camera9`,keys:[`Digit9`]}],Fi=[{name:`playPause`,keys:[`Space`]},{name:`decreasePlaybackSpeed`,keys:[`Comma`,`Shift-Comma`]},{name:`increasePlaybackSpeed`,keys:[`Period`,`Shift-Period`]}],Ii=[{name:`toggleObserverMode`,keys:[`Space`]}],Li=[{name:`nextPlayer`,keys:[{type:`click`,button:0,whenPointerLocked:!0}]}],Ri=[{name:`nextStop`,keys:[{type:`click`,button:0}]},{name:`exitTour`,keys:[`Escape`]}];function zi(){let e=(0,K.c)(27),t=De(),n=Ce(),r=S(Bi),i=t?.source===`demo`,a=t?.source===`live`,o=!t,s=o&&!r||a&&n===`fly`,c=!r,l=!r,u;e[0]===s?u=e[1]:(u=s&&(0,q.jsx)($,{map:ji}),e[0]=s,e[1]=u);let d;e[2]===c?d=e[3]:(d=c&&(0,q.jsx)($,{map:Mi}),e[2]=c,e[3]=d);let f;e[4]===l?f=e[5]:(f=l&&(0,q.jsx)($,{map:Ni}),e[4]=l,e[5]=f);let p;e[6]!==o||e[7]!==r?(p=o&&!r&&(0,q.jsx)($,{map:Pi}),e[6]=o,e[7]=r,e[8]=p):p=e[8];let m;e[9]===i?m=e[10]:(m=i&&(0,q.jsx)($,{map:Fi}),e[9]=i,e[10]=m);let h;e[11]===a?h=e[12]:(h=a&&(0,q.jsx)($,{map:Ii}),e[11]=a,e[12]=h);let g;e[13]!==n||e[14]!==a?(g=a&&n===`follow`&&(0,q.jsx)($,{map:Li}),e[13]=n,e[14]=a,e[15]=g):g=e[15];let _;e[16]===r?_=e[17]:(_=r&&(0,q.jsx)($,{map:Ri}),e[16]=r,e[17]=_);let v;return e[18]!==u||e[19]!==d||e[20]!==f||e[21]!==p||e[22]!==m||e[23]!==h||e[24]!==g||e[25]!==_?(v=(0,q.jsxs)(q.Fragment,{children:[u,d,f,p,m,h,g,_]}),e[18]=u,e[19]=d,e[20]=f,e[21]=p,e[22]=m,e[23]=h,e[24]=g,e[25]=_,e[26]=v):v=e[26],v}function Bi(e){return e.animation!==null}function Vi(e,t){return(0,G.lazy)(()=>t().then(t=>({default:t[e]})))}var Hi=Vi(`StreamingController`,()=>V(()=>import(`./StreamingController-GPefNdta.js`),__vite__mapDeps([40,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,22,23,24,25,27,20,21,28,29,0,26,30,31,32,33,34,41]))),Ui=Vi(`DebugElements`,()=>V(()=>import(`./DebugElements-CstJF6BN.js`),__vite__mapDeps([42,1,20,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,43]))),Wi=Vi(`Mission`,()=>V(()=>import(`./Mission-DyWxaKaZ2.js`),__vite__mapDeps([44,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,45,24,46]))),Gi=Vi(`ChatSoundPlayer`,()=>V(()=>import(`./ChatSoundPlayer-B7e0yCQv.js`),__vite__mapDeps([47,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,27,20,21,28,29]))),Ki=(0,G.memo)(function(e){let t=(0,K.c)(23),{dpr:n,onCreated:r,missionName:i,missionType:a,onLoadingChange:o}=e,s=De(),c=ze(),l=c===`demo`||c===`live`,u,d;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(u=(0,q.jsx)(zi,{}),d=(0,q.jsx)(Fe,{}),t[0]=u,t[1]=d):(u=t[0],d=t[1]);let p;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(p=(0,q.jsx)(bt,{}),t[2]=p):p=t[2];let m,h;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(m=(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(ur,{})}),h=(0,q.jsx)(gr,{}),t[3]=m,t[4]=h):(m=t[3],h=t[4]);let g;t[5]===Symbol.for(`react.memo_cache_sentinel`)?(g=(0,q.jsx)(qn,{children:(0,q.jsx)(Gi,{})}),t[5]=g):g=t[5];let _;t[6]===Symbol.for(`react.memo_cache_sentinel`)?(_=(0,q.jsx)(_r,{children:(0,q.jsx)(Ui,{})}),t[6]=_):_=t[6];let v;t[7]===s?v=t[8]:(v=s?(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Hi,{recording:s})}):null,t[7]=s,t[8]=v);let y;t[9]!==l||t[10]!==i||t[11]!==a||t[12]!==o?(y=l?null:(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Wi,{name:i,missionType:a,onLoadingChange:o},`${i}~${a}`)}),t[9]=l,t[10]=i,t[11]=a,t[12]=o,t[13]=y):y=t[13];let b,x;t[14]===Symbol.for(`react.memo_cache_sentinel`)?(b=(0,q.jsx)(Ti,{}),x=(0,q.jsx)(Mr,{}),t[14]=b,t[15]=x):(b=t[14],x=t[15]);let S;t[16]!==v||t[17]!==y?(S=(0,q.jsx)(f,{children:(0,q.jsxs)(ve,{children:[u,d,(0,q.jsxs)(Ye,{children:[p,m,h,g,_,v,y,b,x]})]})}),t[16]=v,t[17]=y,t[18]=S):S=t[18];let C;return t[19]!==n||t[20]!==r||t[21]!==S?(C=(0,q.jsx)(Et,{dpr:n,onCreated:r,children:S}),t[19]=n,t[20]=r,t[21]=S,t[22]=C):C=t[22],C});export{Ki as GameView};