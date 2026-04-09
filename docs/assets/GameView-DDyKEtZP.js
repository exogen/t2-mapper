const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PlayerModel-Kcb6K1_s.js","assets/PlayerModel-D8NLwrT8.js","assets/chunk-DECur_0Z.js","assets/Html-CXAi5FD_.js","assets/extends-lXRikpl0.js","assets/react-three-fiber.esm-El6vNTZj.js","assets/jsx-runtime-BpGWiA-R.js","assets/three.module-DKAirPAO.js","assets/traditional-CCqNJZlI.js","assets/useQuery-6REtM5HO.js","assets/SettingsProvider-BdqQ2Cm4.js","assets/engineStore-B1KAgiiF.js","assets/manifest-BIDT_vSa.js","assets/stringUtils-1MyeFdQ_.js","assets/logger-B058WGzf.js","assets/AudioEmitter-CJMuEzA2.js","assets/DebugBounds-CZKrvsAw.js","assets/loaders-B4T775qz.js","assets/mission-yeigCtfF.js","assets/cameraTourStore-CtH3IrnD.js","assets/AudioEmitter-DAQByNim.css","assets/DebugSuspense-ChOWTvws.js","assets/playbackUtils-DjmjN4tv.js","assets/textureUtils-Bk_jPZib.js","assets/useAnisotropy-D9othEmk.js","assets/streamPlaybackStore-D5ldcfU5.js","assets/PlayerModel-Bi7C0zGW.css","assets/ExplosionShape-CFtLb8wO.js","assets/Projectiles-D417zqjU.js","assets/Texture-BYh0PjzP.js","assets/ForceFieldBare-C_w3CfiW.js","assets/AudioEmitter-BGkO8Fbs.js","assets/WaterBlock-BoR_edBt.js","assets/scene-C20n9V3Y.js","assets/StreamingController-mmR1lAIE.js","assets/index-BnXbiEzA.js","assets/preload-helper-BPkniflS.js","assets/streamHelpers-CYLk-lCT.js","assets/iconBase-DZ3jidsI.js","assets/JoystickContext-B2sO9eYx.js","assets/index-CiZqoesx.css","assets/gameEntityTypes-CIesm-Ll.js","assets/DebugElements-CrsrzkRa.js","assets/DebugElements-BP0b5jan.css","assets/Mission-RZOaitqM.js","assets/misToScene-BfuEJI8y.js","assets/ChatSoundPlayer-BuKG-RWU.js"])))=>i.map(i=>d[i]);
import{r as e}from"./chunk-DECur_0Z.js";import{n as t,r as n,t as r}from"./jsx-runtime-BpGWiA-R.js";import{a as i,o as a,s as o,t as s}from"./react-three-fiber.esm-El6vNTZj.js";import{t as c}from"./Html-CXAi5FD_.js";import{a as l,i as u}from"./SettingsProvider-BdqQ2Cm4.js";import{t as d}from"./useQuery-6REtM5HO.js";import{A as f,C as p,Ct as m,D as h,Dt as g,Ht as _,Kt as v,N as y,Ot as b,S as x,Ut as S,Wt as C,_ as w,b as T,f as E,h as D,j as O,jt as k,k as A,kt as j,m as M,q as N,rt as P,ut as F,v as I,w as L}from"./three.module-DKAirPAO.js";import{a as ee,d as te,l as ne,o as R,s as re,u as ie}from"./PlayerModel-D8NLwrT8.js";import{S as ae,b as oe,o as se,v as ce,x as le}from"./playbackUtils-DjmjN4tv.js";import{a as z,c as ue,d as de,i as B,o as V,r as fe,s as pe,t as me,u as H}from"./textureUtils-Bk_jPZib.js";import{f as he,o as ge,p as U,s as _e,t as ve,u as ye}from"./loaders-B4T775qz.js";import{t as be}from"./logger-B058WGzf.js";import{n as xe}from"./stringUtils-1MyeFdQ_.js";import"./mission-yeigCtfF.js";import{a as Se}from"./engineStore-B1KAgiiF.js";import{t as Ce}from"./extends-lXRikpl0.js";import{t as we}from"./Texture-BYh0PjzP.js";import{t as W}from"./preload-helper-BPkniflS.js";import{t as Te}from"./useAnisotropy-D9othEmk.js";import{f as Ee,u as De}from"./AudioEmitter-CJMuEzA2.js";import{n as Oe,r as ke,t as Ae}from"./cameraTourStore-CtH3IrnD.js";import{n as je,t as Me}from"./DebugBounds-CZKrvsAw.js";import{t as Ne}from"./DebugSuspense-ChOWTvws.js";import{n as Pe}from"./streamPlaybackStore-D5ldcfU5.js";import{S as Fe,t as G}from"./streamHelpers-CYLk-lCT.js";import{n as Ie,r as Le,t as Re}from"./scene-C20n9V3Y.js";import{A as ze,D as Be,F as Ve,I as He,M as Ue,N as We,R as Ge,_ as Ke,a as qe,c as Je,g as Ye,i as Xe,j as Ze,k as Qe,l as $e,m as et,n as tt,o as nt,p as rt,r as it,s as at,t as ot,u as st,z as ct}from"./index-BnXbiEzA.js";import{t as lt}from"./gameEntityTypes-CIesm-Ll.js";var K=e(n());function ut(e,t,n){let r=o(e=>e.size),i=o(e=>e.viewport),a=typeof e==`number`?e:r.width*i.dpr,s=typeof t==`number`?t:r.height*i.dpr,c=(typeof e==`number`?n:e)||{},{samples:l=0,depth:u,...d}=c,p=u??c.depthBuffer,m=K.useMemo(()=>{let e=new v(a,s,{minFilter:N,magFilter:N,type:y,...d});return p&&(e.depthTexture=new L(a,s,f)),e.samples=l,e},[]);return K.useLayoutEffect(()=>{m.setSize(a,s),l&&(m.samples=l)},[l,m,a,s]),K.useEffect(()=>()=>m.dispose(),[]),m}var dt=e=>typeof e==`function`,ft=K.forwardRef(({envMap:e,resolution:t=256,frames:n=1/0,makeDefault:r,children:a,...s},c)=>{let l=o(({set:e})=>e),u=o(({camera:e})=>e),d=o(({size:e})=>e),f=K.useRef(null);K.useImperativeHandle(c,()=>f.current,[]);let p=K.useRef(null),m=ut(t);K.useLayoutEffect(()=>{s.manual||(f.current.aspect=d.width/d.height)},[d,s]),K.useLayoutEffect(()=>{f.current.updateProjectionMatrix()});let h=0,g=null,_=dt(a);return i(t=>{_&&(n===1/0||h<n)&&(p.current.visible=!1,t.gl.setRenderTarget(m),g=t.scene.background,e&&(t.scene.background=e),t.gl.render(t.scene,f.current),t.scene.background=g,t.gl.setRenderTarget(null),p.current.visible=!0,h++)}),K.useLayoutEffect(()=>{if(r){let e=u;return l(()=>({camera:f.current})),()=>l(()=>({camera:e}))}},[f,r,l]),K.createElement(K.Fragment,null,K.createElement(`perspectiveCamera`,Ce({ref:f},s),!_&&a),K.createElement(`group`,{ref:p},_&&a(m.texture)))});function pt(e,{path:t}){let[n]=a(x,[e],e=>e.setPath(t));return n}pt.preload=(e,{path:t})=>a.preload(x,[e],e=>e.setPath(t));var q=t(),mt={sunLightPointsDown:{value:!0}};function ht(e){mt.sunLightPointsDown.value=e}var J=r(),gt=be(`SceneLighting`);function _t(){let e=(0,q.c)(6),t=He(),n,r;if(e[0]===t?(n=e[1],r=e[2]):(n=()=>{t?gt.debug(`sunData: dir=(%s, %s, %s) color=(%s, %s, %s) ambient=(%s, %s, %s)`,t.direction.x.toFixed(3),t.direction.y.toFixed(3),t.direction.z.toFixed(3),t.color.r.toFixed(3),t.color.g.toFixed(3),t.color.b.toFixed(3),t.ambient.r.toFixed(3),t.ambient.g.toFixed(3),t.ambient.b.toFixed(3)):gt.debug(`No sunData — using fallback ambient #888`)},r=[t],e[0]=t,e[1]=n,e[2]=r),(0,K.useEffect)(n,r),!t){let t;return e[3]===Symbol.for(`react.memo_cache_sentinel`)?(t=(0,J.jsx)(`ambientLight`,{color:`#888888`,intensity:1}),e[3]=t):t=e[3],t}let i;return e[4]===t?i=e[5]:(i=(0,J.jsx)(vt,{sunData:t}),e[4]=t,e[5]=i),i}function vt(e){let t=(0,q.c)(29),{sunData:n}=e,r;t[0]===n.direction?r=t[1]:(r=Le(n.direction),t[0]=n.direction,t[1]=r);let[i,a,o]=r,s=Math.sqrt(i*i+a*a+o*o),c=i/s,l=a/s,u=o/s,d;t[2]!==c||t[3]!==l||t[4]!==u?(d=new C(c,l,u),t[2]=c,t[3]=l,t[4]=u,t[5]=d):d=t[5];let f=d,p=-f.x*5e3,m=-f.y*5e3,h=-f.z*5e3,g;t[6]!==p||t[7]!==m||t[8]!==h?(g=new C(p,m,h),t[6]=p,t[7]=m,t[8]=h,t[9]=g):g=t[9];let _=g,v;t[10]!==n.color.b||t[11]!==n.color.g||t[12]!==n.color.r?(v=new T(n.color.r,n.color.g,n.color.b),t[10]=n.color.b,t[11]=n.color.g,t[12]=n.color.r,t[13]=v):v=t[13];let y=v,b;t[14]!==n.ambient.b||t[15]!==n.ambient.g||t[16]!==n.ambient.r?(b=new T(n.ambient.r,n.ambient.g,n.ambient.b),t[14]=n.ambient.b,t[15]=n.ambient.g,t[16]=n.ambient.r,t[17]=b):b=t[17];let x=b,S=f.y<0,w,E;t[18]===S?(w=t[19],E=t[20]):(w=()=>{ht(S)},E=[S],t[18]=S,t[19]=w,t[20]=E),(0,K.useEffect)(w,E);let D;t[21]!==y||t[22]!==_?(D=(0,J.jsx)(`directionalLight`,{position:_,color:y,intensity:1,castShadow:!0,"shadow-mapSize-width":8192,"shadow-mapSize-height":8192,"shadow-camera-left":-4096,"shadow-camera-right":4096,"shadow-camera-top":4096,"shadow-camera-bottom":-4096,"shadow-camera-near":100,"shadow-camera-far":12e3,"shadow-bias":-1e-5,"shadow-normalBias":.4,"shadow-radius":2}),t[21]=y,t[22]=_,t[23]=D):D=t[23];let O;t[24]===x?O=t[25]:(O=(0,J.jsx)(`ambientLight`,{color:x,intensity:1}),t[24]=x,t[25]=O);let k;return t[26]!==D||t[27]!==O?(k=(0,J.jsxs)(J.Fragment,{children:[D,O]}),t[26]=D,t[27]=O,t[28]=k):k=t[28],k}function yt(){let e=(0,q.c)(4),{fpsLimit:t}=l(),n=o(bt),r,i;return e[0]!==t||e[1]!==n?(r=()=>{if(t==null)return;let e=1e3/t,r=0,i;function a(t){i=requestAnimationFrame(a),t-r>=e&&(r=t-(t-r)%e,n())}return i=requestAnimationFrame(a),()=>cancelAnimationFrame(i)},i=[t,n],e[0]=t,e[1]=n,e[2]=r,e[3]=i):(r=e[2],i=e[3]),(0,K.useEffect)(r,i),t}function bt(e){return e.invalidate}function xt(){return yt(),null}var St={toneMapping:0,outputColorSpace:j};function Ct(e){let t=(0,q.c)(11),{children:n,renderOnDemand:r,dpr:i,onCreated:a}=e,o=r===void 0?!1:r,{renderOnDemand:c}=u(),d=o||c,{fpsLimit:f}=l(),p=f!=null&&!d,m=d||p?`demand`:`always`,h;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(h={type:1},t[0]=h):h=t[0];let g;t[1]===n?g=t[2]:(g=(0,J.jsx)(K.Suspense,{children:n}),t[1]=n,t[2]=g);let _;t[3]===p?_=t[4]:(_=p?(0,J.jsx)(xt,{}):null,t[3]=p,t[4]=_);let v;return t[5]!==i||t[6]!==a||t[7]!==m||t[8]!==g||t[9]!==_?(v=(0,J.jsxs)(s,{frameloop:m,dpr:i,gl:St,shadows:h,onCreated:a,children:[g,_]}),t[5]=i,t[6]=a,t[7]=m,t[8]=g,t[9]=_,t[10]=v):v=t[10],v}var wt=1/32,Tt=(0,K.createContext)(null);function Et({children:e}){let t=(0,K.useRef)(void 0),n=(0,K.useRef)(0),r=(0,K.useRef)(0);i((e,i)=>{for(n.current+=i;n.current>=wt;)if(n.current-=wt,r.current++,t.current)for(let e of t.current)e(r.current)});let a=(0,K.useCallback)(e=>(t.current??=new Set,t.current.add(e),()=>{t.current.delete(e)}),[]),o=(0,K.useCallback)(()=>r.current,[]),s=(0,K.useCallback)(()=>n.current/wt,[]),c=(0,K.useMemo)(()=>({subscribe:a,getTick:o,getTickFraction:s}),[a,o,s]);return(0,J.jsx)(Tt.Provider,{value:c,children:e})}function Dt(e){let t=(0,q.c)(5),n=(0,K.useContext)(Tt);if(!n)throw Error(`useTick must be used within a TickProvider`);let r=(0,K.useEffectEvent)(e),i;t[0]!==n||t[1]!==r?(i=()=>n.subscribe(r),t[0]=n,t[1]=r,t[2]=i):i=t[2];let a;t[3]===n?a=t[4]:(a=[n],t[3]=n,t[4]=a),(0,K.useEffect)(i,a)}function Ot(){let e=(0,K.useContext)(Tt);if(!e)throw Error(`useGetTickFraction must be used within a TickProvider`);return e.getTickFraction}function kt(e){let t=(0,q.c)(14),{entity:n}=e,{registerCamera:r,unregisterCamera:i}=Ke(),a=(0,K.useId)(),o=n.cameraDataBlock,s;t[0]===n.position?s=t[1]:(s=n.position?new C(...n.position):new C,t[0]=n.position,t[1]=s);let c=s,l;t[2]===n.rotation?l=t[3]:(l=n.rotation?new m(...n.rotation):new m,t[2]=n.rotation,t[3]=l);let u=l,d,f;t[4]!==o||t[5]!==a||t[6]!==c||t[7]!==r||t[8]!==u||t[9]!==i?(d=()=>{if(o===`Observer`){let e={id:a,position:c,rotation:u};return r(e),()=>{i(e)}}},f=[a,o,r,i,c,u],t[4]=o,t[5]=a,t[6]=c,t[7]=r,t[8]=u,t[9]=i,t[10]=d,t[11]=f):(d=t[10],f=t[11]),(0,K.useEffect)(d,f);let p=ke(n.id),h;return t[12]===p?h=t[13]:(h=p?(0,J.jsx)(je,{radius:1.5}):null,t[12]=p,t[13]=h),h}function At(e){let t=(0,q.c)(7),{entity:n}=e,r=ke(n.id),i;t[0]===n.label?i=t[1]:(i=n.label?(0,J.jsx)(Ee,{opacity:.6,children:n.label}):null,t[0]=n.label,t[1]=i);let a;t[2]===r?a=t[3]:(a=r&&(0,J.jsx)(je,{radius:1.5}),t[2]=r,t[3]=a);let o;return t[4]!==i||t[5]!==a?(o=(0,J.jsxs)(J.Fragment,{children:[i,a]}),t[4]=i,t[5]=a,t[6]=o):o=t[6],o}function jt(e){let t=new Float32Array(e.length);for(let n=0;n<e.length;n++)t[n]=e[n]/65535;return t}var Mt=`
vec3 torqueLinearToSRGB(vec3 linear) {
  vec3 higher = pow(linear, vec3(1.0/2.4)) * 1.055 - 0.055;
  vec3 lower = linear * 12.92;
  return mix(lower, higher, step(vec3(0.0031308), linear));
}

vec3 torqueSRGBToLinear(vec3 srgb) {
  vec3 higher = pow((srgb + 0.055) / 1.055, vec3(2.4));
  vec3 lower = srgb / 12.92;
  return mix(lower, higher, step(vec3(0.04045), srgb));
}
`,Nt=`
float torqueDebugGrid(vec2 uv, float gridSize, float lineWidth) {
  vec2 scaledUV = uv * gridSize;
  vec2 grid = abs(fract(scaledUV - 0.5) - 0.5) / fwidth(scaledUV);
  float line = min(grid.x, grid.y);
  return 1.0 - min(line / lineWidth, 1.0);
}
`,Pt=256,Ft=512,It=64,Lt=150;function Rt({shader:e,baseTextures:t,alphaTextures:n,visibilityMask:r,tiling:i,detailTexture:a=null,lightmap:o=null}){e.uniforms.sunLightPointsDown=mt.sunLightPointsDown;let s=t.length;t.forEach((t,n)=>{e.uniforms[`albedo${n}`]={value:t}});let c=n.length;if(n.forEach((t,n)=>{e.uniforms[`maskPacked${n}`]={value:t}}),r&&(e.uniforms.visibilityMask={value:r}),t.forEach((t,n)=>{e.uniforms[`tiling${n}`]={value:i[n]??32}}),o&&(e.uniforms.terrainLightmap={value:o}),a&&(e.uniforms.detailTexture={value:a},e.uniforms.detailTiling={value:It},e.uniforms.detailFadeDistance={value:Lt},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vTerrainWorldPos;`),e.vertexShader=e.vertexShader.replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
vec4 _terrainPos = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  _terrainPos = instanceMatrix * _terrainPos;
#endif
vTerrainWorldPos = (modelMatrix * _terrainPos).xyz;`)),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec2 vTerrainUv;`),e.vertexShader=e.vertexShader.replace(`#include <uv_vertex>`,`#include <uv_vertex>
vTerrainUv = uv;`),e.fragmentShader=`
varying vec2 vTerrainUv;
${Array.from({length:s},(e,t)=>`uniform sampler2D albedo${t};`).join(`
`)}
${Array.from({length:c},(e,t)=>`uniform sampler2D maskPacked${t};`).join(`
`)}
${Array.from({length:s},(e,t)=>`uniform float tiling${t};`).join(`
`)}
${r?`uniform sampler2D visibilityMask;`:``}
${o?`uniform sampler2D terrainLightmap;`:``}
uniform bool sunLightPointsDown;
${a?`uniform sampler2D detailTexture;
uniform float detailTiling;
uniform float detailFadeDistance;
varying vec3 vTerrainWorldPos;`:``}

${Mt}
${Nt}

// Global variable to store shadow factor from RE_Direct for use in output calculation
float terrainShadowFactor = 1.0;
`+e.fragmentShader,r){let t=`#include <clipping_planes_fragment>`;e.fragmentShader=e.fragmentShader.replace(t,`${t}
  // Early discard for invisible areas (before fog/lighting)
  float visibility = texture2D(visibilityMask, vTerrainUv).r;
  if (visibility < 0.5) {
    discard;
  }
  `)}e.fragmentShader=e.fragmentShader.replace(`#include <map_fragment>`,`
  // Sample base albedo layers (sRGB textures auto-decoded to linear by Three.js)
  vec2 baseUv = vTerrainUv;
  vec3 c0 = texture2D(albedo0, baseUv * vec2(tiling0)).rgb;
  ${s>1?`vec3 c1 = texture2D(albedo1, baseUv * vec2(tiling1)).rgb;`:``}
  ${s>2?`vec3 c2 = texture2D(albedo2, baseUv * vec2(tiling2)).rgb;`:``}
  ${s>3?`vec3 c3 = texture2D(albedo3, baseUv * vec2(tiling3)).rgb;`:``}
  ${s>4?`vec3 c4 = texture2D(albedo4, baseUv * vec2(tiling4)).rgb;`:``}
  ${s>5?`vec3 c5 = texture2D(albedo5, baseUv * vec2(tiling5)).rgb;`:``}

  // Sample alpha masks from packed RGB textures (3 masks per texture).
  // Add +0.5 texel offset: Torque samples alpha at grid corners (integer indices),
  // but GPU linear filtering samples at texel centers. This offset aligns them.
  vec2 alphaUv = baseUv + vec2(0.5 / ${Pt}.0);
  vec3 maskRGB0 = texture2D(maskPacked0, alphaUv).rgb;
  float a0 = maskRGB0.r;
  ${s>1?`float a1 = maskRGB0.g;`:``}
  ${s>2?`float a2 = maskRGB0.b;`:``}
  ${s>3?`vec3 maskRGB1 = texture2D(maskPacked1, alphaUv).rgb;
  float a3 = maskRGB1.r;`:``}
  ${s>4?`float a4 = maskRGB1.g;`:``}
  ${s>5?`float a5 = maskRGB1.b;`:``}

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

`),e.fragmentShader=e.fragmentShader.replace(`#include <lights_fragment_begin>`,`vec3 terrainPreLightDirect = reflectedLight.directDiffuse;
#include <lights_fragment_begin>
// Clear indirect diffuse - we'll compute ambient in gamma space
#if defined( RE_IndirectDiffuse )
  irradiance = vec3(0.0);
#endif
`),e.fragmentShader=e.fragmentShader.replace(`#include <lights_fragment_end>`,`#include <lights_fragment_end>
  // Extract dynamic point/spot light contribution by subtracting what was
  // there before lights ran. directDiffuse now has sun + point lights;
  // terrainPreLightDirect was 0, so the difference is all lights.
  // We'll subtract the sun part below and keep just the point/spot part.
  vec3 terrainAllLightsLinear = reflectedLight.directDiffuse - terrainPreLightDirect;
  // Clear Three.js lighting - we compute sun/ambient in gamma space
  reflectedLight.directDiffuse = vec3(0.0);
  reflectedLight.indirectDiffuse = vec3(0.0);
`)),e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,`// Torque-style terrain lighting: output = clamp(lighting × texture, 0, 1) in sRGB space
{
  // Get texture in sRGB space (undo Three.js linear decode)
  vec3 textureSRGB = torqueLinearToSRGB(diffuseColor.rgb);

  ${o?`
  // Sample terrain lightmap for smooth NdotL
  vec2 lightmapUv = vTerrainUv + vec2(0.5 / ${Ft}.0);
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
  outgoingLight = torqueSRGBToLinear(resultSRGB) + totalEmissiveRadiance;
  // Add dynamic point/spot light contributions when present.
  // terrainAllLightsLinear includes both directional + point from Three.js.
  // We only add it when point/spot lights exist to avoid double-counting
  // the sun (already computed in gamma space above). The slight sun
  // double-count when points are active is acceptable — point light
  // intensity dominates near the source.
  #if ( NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
    outgoingLight += terrainAllLightsLinear;
  #endif
}
#include <opaque_fragment>`),e.fragmentShader=e.fragmentShader.replace(`#include <tonemapping_fragment>`,`#if DEBUG_MODE
  // Debug mode: overlay green grid matching terrain grid squares (256x256)
  float gridIntensity = torqueDebugGrid(vTerrainUv, 256.0, 1.5);
  vec3 gridColor = vec3(0.0, 0.8, 0.4); // Green
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gridColor, gridIntensity * 0.1);
#endif

#include <tonemapping_fragment>`)}var zt={0:32,1:32,2:32,3:32,4:32,5:32},Bt=(0,K.memo)(function({displacementMap:e,visibilityMask:t,textureNames:n,alphaTextures:r,detailTextureName:i,lightmap:a}){let{debugMode:o}=u(),s=Te(),c=we(n.map(e=>he(e)),e=>{e.forEach(e=>B(e,{anisotropy:s}))}),l=i?U(i):null,d=we(l??ve,e=>{B(e,{anisotropy:s})}),f=(0,K.useCallback)(e=>{Rt({shader:e,baseTextures:c,alphaTextures:r,visibilityMask:t,tiling:zt,detailTexture:l?d:null,lightmap:a}),H(e,z)},[c,r,t,d,l,a]),p=(0,K.useMemo)(()=>[n.join(`,`),l??`none`,a?a.id:`nolm`,c.map(e=>e.id).join(`,`)].join(`|`),[n,l,a,c]),m=(0,K.useRef)(null);return(0,K.useEffect)(()=>{let e=m.current;e&&(e.defines??={},e.defines.DEBUG_MODE=o?1:0,e.needsUpdate=!0)},[o]),(0,K.useEffect)(()=>{let e=m.current;e&&(e.customProgramCacheKey=()=>p,e.needsUpdate=!0)},[p]),(0,J.jsx)(`meshLambertMaterial`,{ref:m,depthWrite:!0,side:0,defines:{DEBUG_MODE:o?1:0},onBeforeCompile:f},`${l?`detail`:`nodetail`}-${a?`lightmap`:`nolightmap`}`)}),Vt=(0,K.memo)(function(e){let t=(0,q.c)(8),{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s}=e,c;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(c=(0,J.jsx)(`meshLambertMaterial`,{color:`rgb(0, 109, 56)`,wireframe:!0}),t[0]=c):c=t[0];let l;return t[1]!==a||t[2]!==o||t[3]!==n||t[4]!==s||t[5]!==i||t[6]!==r?(l=(0,J.jsx)(K.Suspense,{fallback:c,children:(0,J.jsx)(Bt,{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s})}),t[1]=a,t[2]=o,t[3]=n,t[4]=s,t[5]=i,t[6]=r,t[7]=l):l=t[7],l}),Ht=(0,K.memo)(function(e){let t=(0,q.c)(15),{tileX:n,tileZ:r,blockSize:i,basePosition:a,textureNames:o,geometry:s,displacementMap:c,visibilityMask:l,alphaTextures:u,detailTextureName:d,lightmap:f,visible:p}=e,m=p===void 0?!0:p,h=i/2,g=a.x+n*i+h,_=a.z+r*i+h,v;t[0]!==g||t[1]!==_?(v=[g,0,_],t[0]=g,t[1]=_,t[2]=v):v=t[2];let y=v,b;t[3]!==u||t[4]!==d||t[5]!==c||t[6]!==f||t[7]!==o||t[8]!==l?(b=(0,J.jsx)(Vt,{displacementMap:c,visibilityMask:l,textureNames:o,alphaTextures:u,detailTextureName:d,lightmap:f}),t[3]=u,t[4]=d,t[5]=c,t[6]=f,t[7]=o,t[8]=l,t[9]=b):b=t[9];let x;return t[10]!==s||t[11]!==y||t[12]!==b||t[13]!==m?(x=(0,J.jsx)(`mesh`,{position:y,geometry:s,castShadow:!0,receiveShadow:!0,visible:m,children:b}),t[10]=s,t[11]=y,t[12]=b,t[13]=m,t[14]=x):x=t[14],x}),Ut=be(`TerrainBlock`),Wt=8,Gt=600,Y=256,Kt=512,X=2048;function qt(e,t){let n=new D,r=(t+1)*(t+1),i=new Float32Array(r*3),a=new Float32Array(r*3),o=new Float32Array(r*2),s=t*t*6,c=new Uint32Array(s),l=0,u=e/t;for(let n=0;n<=t;n++)for(let r=0;r<=t;r++){let s=n*(t+1)+r;i[s*3]=r*u-e/2,i[s*3+1]=e/2-n*u,i[s*3+2]=0,a[s*3]=0,a[s*3+1]=0,a[s*3+2]=1,o[s*2]=r/t,o[s*2+1]=1-n/t}for(let e=0;e<t;e++)for(let n=0;n<t;n++){let r=e*(t+1)+n,i=r+1,a=(e+1)*(t+1)+n,o=a+1;(n^e)&1?(c[l++]=r,c[l++]=a,c[l++]=i,c[l++]=i,c[l++]=a,c[l++]=o):(c[l++]=r,c[l++]=a,c[l++]=o,c[l++]=r,c[l++]=o,c[l++]=i)}return n.setIndex(new M(c,1)),n.setAttribute(`position`,new A(i,3)),n.setAttribute(`normal`,new A(a,3)),n.setAttribute(`uv`,new A(o,2)),n.rotateX(-Math.PI/2),n.rotateY(-Math.PI/2),n}function Jt(e,t,n){let r=e.attributes.position,i=e.attributes.uv,a=e.attributes.normal,o=r.array,s=i.array,c=a.array,l=r.count,u=(e,n)=>(e=Math.max(0,Math.min(Y-1,e)),n=Math.max(0,Math.min(Y-1,n)),t[n*Y+e]/65535*X),d=(e,n)=>{e=Math.max(0,Math.min(Y-1,e)),n=Math.max(0,Math.min(Y-1,n));let r=Math.floor(e),i=Math.floor(n),a=Math.min(r+1,Y-1),o=Math.min(i+1,Y-1),s=e-r,c=n-i,l=t[i*Y+r]/65535*X,u=t[i*Y+a]/65535*X,d=t[o*Y+r]/65535*X,f=t[o*Y+a]/65535*X,p=l*(1-s)+u*s,m=d*(1-s)+f*s;return p*(1-c)+m*c};for(let e=0;e<l;e++){let t=s[e*2],r=s[e*2+1],i=u(Math.floor(t*Y)&Y-1,Math.floor(r*Y)&Y-1);o[e*3+1]=i;let a=t*(Y-1),l=r*(Y-1),f=d(a-1,l),p=d(a+1,l),m=d(a,l+1),h=d(a,l-1),g=(p-f)/2,_=(m-h)/2,v=n,y=g,b=Math.sqrt(_*_+v*v+y*y);b>0?(_/=b,v/=b,y/=b):(_=0,v=1,y=0),c[e*3]=_,c[e*3+1]=v,c[e*3+2]=y}r.needsUpdate=!0,a.needsUpdate=!0}function Yt(e,t,n,r,i,a){let o=r.z/i,s=r.x/i,c=r.y,l=Math.sqrt(o*o+s*s);if(l<1e-4)return 1;let u=.5/l,d=o*u,f=s*u,p=c*u,m=e,h=t,g=n+.1,_=Y*3;for(let e=0;e<_;e++){if(m+=d,h+=f,g+=p,m<0||m>=Y||h<0||h>=Y||g>X)return 1;let e=a(m,h);if(g<e)return 0}return 1}function Xt(e,t,n){let r=(t,n)=>{let r=Math.max(0,Math.min(Y-1,t)),i=Math.max(0,Math.min(Y-1,n)),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,Y-1),c=Math.min(o+1,Y-1),l=r-a,u=i-o,d=e[o*Y+a]/65535,f=e[o*Y+s]/65535,p=e[c*Y+a]/65535,m=e[c*Y+s]/65535,h=d*(1-l)+f*l,g=p*(1-l)+m*l;return(h*(1-u)+g*u)*X},i=new C(-t.x,-t.y,-t.z).normalize(),a=new Uint8Array(Kt*Kt),o=.5;for(let e=0;e<Kt;e++)for(let t=0;t<Kt;t++){let s=t/2+.25,c=e/2+.25,l=r(s,c),u=r(s-o,c),d=r(s+o,c),f=r(s,c-o),p=r(s,c+o),m=(d-u)/(2*o),h=-((p-f)/(2*o)),g=n,_=-m,v=Math.sqrt(h*h+g*g+_*_),y=Math.max(0,h/v*i.x+g/v*i.y+_/v*i.z),b=1;y>0&&(b=Yt(s,c,l,i,n,r)),a[e*Kt+t]=Math.floor(y*b*255)}let s=new p(a,Kt,Kt,g,_);return s.colorSpace=``,s.generateMipmaps=!0,s.wrapS=I,s.wrapT=I,s.magFilter=N,s.minFilter=N,s.needsUpdate=!0,s}function Zt(e){let t=(0,q.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`terrain`,e],queryFn:()=>(Ut.debug(`Loading terrain: %s`,e),ye(e))},t[0]=e,t[1]=n);let r=d(n),i,a;return t[2]!==r.data||t[3]!==r.error||t[4]!==r.status||t[5]!==e?(i=()=>{Ut.debug(`Query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (data ready)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=r.data,t[3]=r.error,t[4]=r.status,t[5]=e,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,K.useEffect)(i,a),r}function Qt(){let e=Ve();return e&&e.visibleDistance>0?e.visibleDistance:Gt}function $t(e){let t=new Uint8Array(Y*Y);t.fill(255);for(let n of e){let e=n&255,r=n>>8&255,i=n>>16,a=r*Y;for(let n=0;n<i;n++){let r=a+e+n;r<t.length&&(t[r]=0)}}let n=new p(t,Y,Y,g,_);return n.colorSpace=``,n.wrapS=n.wrapT=I,n.magFilter=F,n.minFilter=F,n.needsUpdate=!0,n}var en=(0,K.memo)(function(e){let t=(0,q.c)(68),{entity:n}=e,r=n.terrainData,a=ke(n.id),s=r.terrFileName,c=r.squareSize||Wt,l=r.detailTextureName||void 0,u=c*256,d=Qt(),m=o(nn),h=-c*(Y/2),_;t[0]===h?_=t[1]:(_={x:h,z:h},t[0]=h,t[1]=_);let v=_,y;t[2]===r.emptySquareRuns?y=t[3]:(y=r.emptySquareRuns??[],t[2]=r.emptySquareRuns,t[3]=y);let x=y,{data:S}=Zt(s),w;bb0:{if(!S){w=null;break bb0}let e=c*256,n;t[4]!==e||t[5]!==c||t[6]!==S.heightMap?(n=qt(e,Y),Jt(n,S.heightMap,c),t[4]=e,t[5]=c,t[6]=S.heightMap,t[7]=n):n=t[7],w=n}let T=w,E,D;t[8]!==c||t[9]!==S?(E=()=>{if(S)return ct(Ge(S.heightMap,c)),rn},D=[S,c],t[8]=c,t[9]=S,t[10]=E,t[11]=D):(E=t[10],D=t[11]),(0,K.useEffect)(E,D);let O=He(),k;bb1:{if(!O){let e;t[12]===Symbol.for(`react.memo_cache_sentinel`)?(e=new C(.57735,-.57735,.57735),t[12]=e):e=t[12],k=e;break bb1}let e;t[13]===O.direction?e=t[14]:(e=Le(O.direction),t[13]=O.direction,t[14]=e);let[n,r,i]=e,a=Math.sqrt(n*n+r*r+i*i),o=n/a,s=r/a,c=i/a,l;t[15]!==c||t[16]!==o||t[17]!==s?(l=new C(o,s,c),t[15]=c,t[16]=o,t[17]=s,t[18]=l):l=t[18],k=l}let A=k,j;bb2:{if(!S){j=null;break bb2}let e;t[19]!==c||t[20]!==A||t[21]!==S.heightMap?(e=Xt(S.heightMap,A,c),t[19]=c,t[20]=A,t[21]=S.heightMap,t[22]=e):e=t[22],j=e}let M=j,N;bb3:{if(!S){N=null;break bb3}let e;t[23]===S.heightMap?e=t[24]:(e=new p(jt(S.heightMap),Y,Y,g,f),e.colorSpace=``,e.generateMipmaps=!1,e.wrapS=b,e.wrapT=b,e.needsUpdate=!0,t[23]=S.heightMap,t[24]=e),N=e}let F=N,I;t[25]===x?I=t[26]:(I=$t(x),t[25]=x,t[26]=I);let L=I,ee;t[27]===Symbol.for(`react.memo_cache_sentinel`)?(ee=$t([]),t[27]=ee):ee=t[27];let te=ee,ne;bb4:{if(!S){ne=null;break bb4}let e;t[28]===S.alphaMaps?e=t[29]:(e=fe(S.alphaMaps),t[28]=S.alphaMaps,t[29]=e),ne=e}let R=ne,re=2*Math.ceil(d/u)+1,ie=re*re-1,ae=(0,K.useRef)(null),oe;t[30]===Symbol.for(`react.memo_cache_sentinel`)?(oe=new P,t[30]=oe):oe=t[30];let se=oe,ce;t[31]===Symbol.for(`react.memo_cache_sentinel`)?(ce={xStart:1/0,xEnd:-1/0,zStart:1/0,zEnd:-1/0},t[31]=ce):ce=t[31];let le=(0,K.useRef)(ce),z=(0,K.useRef)(null),ue;if(t[32]!==v||t[33]!==u||t[34]!==m||t[35]!==d?(ue=()=>{let e=ae.current;if(!e)return;let t=m.position.x-v.x,n=m.position.z-v.z,r=Math.floor((t-d)/u),i=Math.ceil((t+d)/u),a=Math.floor((n-d)/u),o=Math.ceil((n+d)/u),s=le.current;if(e===z.current&&r===s.xStart&&i===s.xEnd&&a===s.zStart&&o===s.zEnd)return;z.current=e,s.xStart=r,s.xEnd=i,s.zStart=a,s.zEnd=o;let c=u/2,l=0;for(let t=r;t<i;t++)for(let n=a;n<o;n++)t===0&&n===0||(se.makeTranslation(v.x+t*u+c,0,v.z+n*u+c),e.setMatrixAt(l,se),l++);e.count=l,e.instanceMatrix.needsUpdate=!0},t[32]=v,t[33]=u,t[34]=m,t[35]=d,t[36]=ue):ue=t[36],i(ue),!S||!T||!F||!R)return Ut.debug(`Not ready: terrain=%s geometry=%s displacement=%s alpha=%s`,!!S,!!T,!!F,!!R),null;let de=M??void 0,B;t[37]!==v||t[38]!==u||t[39]!==l||t[40]!==R||t[41]!==L||t[42]!==F||t[43]!==T||t[44]!==de||t[45]!==S.textureNames?(B=(0,J.jsx)(Ht,{tileX:0,tileZ:0,blockSize:u,basePosition:v,textureNames:S.textureNames,geometry:T,displacementMap:F,visibilityMask:L,alphaTextures:R,detailTextureName:l,lightmap:de}),t[37]=v,t[38]=u,t[39]=l,t[40]=R,t[41]=L,t[42]=F,t[43]=T,t[44]=de,t[45]=S.textureNames,t[46]=B):B=t[46];let V;t[47]!==ie||t[48]!==T?(V=[T,void 0,ie],t[47]=ie,t[48]=T,t[49]=V):V=t[49];let pe=M??void 0,me;t[50]!==l||t[51]!==R||t[52]!==F||t[53]!==pe||t[54]!==S.textureNames?(me=(0,J.jsx)(Vt,{displacementMap:F,visibilityMask:te,textureNames:S.textureNames,alphaTextures:R,detailTextureName:l,lightmap:pe}),t[50]=l,t[51]=R,t[52]=F,t[53]=pe,t[54]=S.textureNames,t[55]=me):me=t[55];let H;t[56]!==V||t[57]!==me?(H=(0,J.jsx)(`instancedMesh`,{ref:ae,args:V,castShadow:!0,receiveShadow:!0,frustumCulled:!1,children:me}),t[56]=V,t[57]=me,t[58]=H):H=t[58];let he;t[59]!==v||t[60]!==u||t[61]!==a||t[62]!==S?(he=a&&S&&(0,J.jsx)(tn,{heightMap:S.heightMap,blockSize:u,basePosition:v}),t[59]=v,t[60]=u,t[61]=a,t[62]=S,t[63]=he):he=t[63];let ge;return t[64]!==B||t[65]!==H||t[66]!==he?(ge=(0,J.jsxs)(J.Fragment,{children:[B,H,he]}),t[64]=B,t[65]=H,t[66]=he,t[67]=ge):ge=t[67],ge});function tn(e){let t=(0,q.c)(15),{heightMap:n,blockSize:r,basePosition:i}=e,a=0;for(let e=0;e<n.length;e++){let t=n[e]/65535*X;t>a&&(a=t)}let o=i.x+r/2,s=a/2,c=i.z+r/2,l;t[0]!==o||t[1]!==s||t[2]!==c?(l=[o,s,c],t[0]=o,t[1]=s,t[2]=c,t[3]=l):l=t[3];let u=l,d;t[4]!==r||t[5]!==a?(d=[r,a,r],t[4]=r,t[5]=a,t[6]=d):d=t[6];let f=d,p;t[7]!==u||t[8]!==f?(p={center:u,size:f},t[7]=u,t[8]=f,t[9]=p):p=t[9];let m=p,h;t[10]===m.size?h=t[11]:(h=(0,J.jsx)(Me,{size:m.size}),t[10]=m.size,t[11]=h);let g;return t[12]!==m.center||t[13]!==h?(g=(0,J.jsx)(`group`,{position:m.center,children:h}),t[12]=m.center,t[13]=h,t[14]=g):g=t[14],g}function nn(e){return e.camera}function rn(){return ct(null)}function an(e,t){let n=t.surfaceOutsideVisible??!1;e.uniforms.useSceneLighting={value:n},e.uniforms.interiorDebugColor={value:n?new C(0,.4,1):new C(1,.2,0)},e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
${Mt}
${Nt}
uniform bool useSceneLighting;
uniform vec3 interiorDebugColor;
`),e.fragmentShader=e.fragmentShader.replace(`#include <lights_fragment_maps>`,`// Lightmap handled in custom output calculation
#ifdef USE_LIGHTMAP
  vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
#endif`),e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,`// Torque-style lighting: output = clamp(lighting × texture, 0, 1) in sRGB space
// Get texture in sRGB space (undo Three.js linear decode)
vec3 textureSRGB = torqueLinearToSRGB(diffuseColor.rgb);

// Save Three.js computed direct lighting (includes sun + point/spot lights).
// We'll add it back for point/spot light contribution after our gamma-space calc.
vec3 interiorAllLightsLinear = reflectedLight.directDiffuse;

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
  lightingSRGB += torqueLinearToSRGB(lightMapTexel.rgb);
#endif
// Torque clamps the sum to [0,1] per channel (sceneLighting.cc lines 1817-1827)
lightingSRGB = clamp(lightingSRGB, 0.0, 1.0);

// Torque formula: output = clamp(lighting × texture, 0, 1) in sRGB/gamma space
vec3 resultSRGB = clamp(lightingSRGB * textureSRGB, 0.0, 1.0);

// Convert back to linear for Three.js output pipeline
vec3 resultLinear = torqueSRGBToLinear(resultSRGB);

// Reassign outgoingLight before opaque_fragment consumes it
// Add dynamic point/spot lights when present (avoid sun double-count otherwise)
outgoingLight = resultLinear + totalEmissiveRadiance;
#if ( NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
  outgoingLight += interiorAllLightsLinear;
#endif

#include <opaque_fragment>`),e.fragmentShader=e.fragmentShader.replace(`#include <tonemapping_fragment>`,`// Debug mode: overlay colored grid on top of normal rendering
// Blue grid = SurfaceOutsideVisible (receives scene ambient light)
// Red grid = inside surface (no scene ambient light)
#if DEBUG_MODE && defined(USE_MAP)
  // gridSize=4 creates 4x4 grid per UV tile, lineWidth=1.5 is ~1.5 pixels wide
  float gridIntensity = torqueDebugGrid(vMapUv, 4.0, 1.5);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, interiorDebugColor, gridIntensity * 0.1);
#endif

#include <tonemapping_fragment>`)}var on=be(`InteriorInstance`);function sn(e){let t=(0,q.c)(2),n;return t[0]===e?n=t[1]:(n=ge(e),t[0]=e,t[1]=n),ie(n)}function cn({materialName:e,material:t,lightMap:n}){let r=u()?.debugMode??!1,i=Te(),a=we(U(e),e=>B(e,{anisotropy:i})),o=new Set(t?.userData?.flag_names??[]).has(`SelfIlluminating`),s=new Set(t?.userData?.surface_flag_names??[]).has(`SurfaceOutsideVisible`),c=(0,K.useCallback)(e=>{H(e,z),an(e,{surfaceOutsideVisible:s})},[s]),l=(0,K.useRef)(null),d=(0,K.useRef)(null);(0,K.useEffect)(()=>{let e=l.current??d.current;e&&(e.defines??={},e.defines.DEBUG_MODE=r?1:0,e.needsUpdate=!0)},[r]);let f={DEBUG_MODE:r?1:0},p=`${s}`;return o?(0,J.jsx)(`meshBasicMaterial`,{ref:l,map:a,toneMapped:!1,defines:f,onBeforeCompile:c},p):(0,J.jsx)(`meshLambertMaterial`,{ref:d,map:a,lightMap:n,toneMapped:!1,defines:f,onBeforeCompile:c},p)}function ln(e){if(!e)return null;let t=e.emissiveMap;return t&&(t.colorSpace=j),t??null}function un(e){let t=(0,q.c)(13),{node:n}=e,r;bb0:{if(!n.material){let e;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[0]=e):e=t[0],r=e;break bb0}if(Array.isArray(n.material)){let e;t[1]===n.material?e=t[2]:(e=n.material.map(dn),t[1]=n.material,t[2]=e),r=e;break bb0}let e;t[3]===n.material?e=t[4]:(e=ln(n.material),t[3]=n.material,t[4]=e);let i;t[5]===e?i=t[6]:(i=[e],t[5]=e,t[6]=i),r=i}let i=r,a;t[7]!==i||t[8]!==n.material?(a=n.material?(0,J.jsx)(Ne,{name:`InteriorTexture:${Array.isArray(n.material)?n.material[0]?.userData?.resource_path:n.material?.userData?.resource_path??`?`}`,fallback:(0,J.jsx)(`meshStandardMaterial`,{color:`yellow`,wireframe:!0}),children:Array.isArray(n.material)?n.material.map((e,t)=>(0,J.jsx)(cn,{materialName:e.userData.resource_path,material:e,lightMap:i[t]},t)):(0,J.jsx)(cn,{materialName:n.material.userData.resource_path,material:n.material,lightMap:i[0]})}):null,t[7]=i,t[8]=n.material,t[9]=a):a=t[9];let o;return t[10]!==n.geometry||t[11]!==a?(o=(0,J.jsx)(`mesh`,{geometry:n.geometry,castShadow:!0,receiveShadow:!0,children:a}),t[10]=n.geometry,t[11]=a,t[12]=o):o=t[12],o}function dn(e){return ln(e)}var fn=(0,K.memo)(function(e){let t=(0,q.c)(27),{interiorFile:n,ghostIndex:r,isTarget:i}=e,a=sn(n),{nodes:o}=a,s=u()?.debugMode??!1,c;bb0:{if(!i){c=null;break bb0}let e,n;if(t[0]!==a.scene){let r=new E().setFromObject(a.scene);e=new C,n=new C,r.getCenter(e),r.getSize(n),t[0]=a.scene,t[1]=e,t[2]=n}else e=t[1],n=t[2];let r;t[3]!==e.x||t[4]!==e.y||t[5]!==e.z?(r=[e.x,e.y,e.z],t[3]=e.x,t[4]=e.y,t[5]=e.z,t[6]=r):r=t[6];let o=r,s;t[7]!==n.x||t[8]!==n.y||t[9]!==n.z?(s=[n.x,n.y,n.z],t[7]=n.x,t[8]=n.y,t[9]=n.z,t[10]=s):s=t[10];let l=s,u;t[11]!==o||t[12]!==l?(u={center:o,size:l},t[11]=o,t[12]=l,t[13]=u):u=t[13],c=u}let l=c,d;t[14]===Symbol.for(`react.memo_cache_sentinel`)?(d=[0,-Math.PI/2,0],t[14]=d):d=t[14];let f;t[15]===o?f=t[16]:(f=Object.entries(o).filter(gn).map(_n),t[15]=o,t[16]=f);let p;t[17]!==s||t[18]!==r||t[19]!==n?(p=s?(0,J.jsxs)(Ee,{children:[r,`: `,n]}):null,t[17]=s,t[18]=r,t[19]=n,t[20]=p):p=t[20];let m;t[21]===l?m=t[22]:(m=l&&(0,J.jsx)(`group`,{position:l.center,children:(0,J.jsx)(Me,{size:l.size})}),t[21]=l,t[22]=m);let h;return t[23]!==f||t[24]!==p||t[25]!==m?(h=(0,J.jsxs)(`group`,{rotation:d,children:[f,p,m]}),t[23]=f,t[24]=p,t[25]=m,t[26]=h):h=t[26],h});function pn(e){let t=(0,q.c)(9),{color:n,label:r}=e,i;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(i=(0,J.jsx)(`boxGeometry`,{args:[10,10,10]}),t[0]=i):i=t[0];let a;t[1]===n?a=t[2]:(a=(0,J.jsx)(`meshStandardMaterial`,{color:n,wireframe:!0}),t[1]=n,t[2]=a);let o;t[3]!==n||t[4]!==r?(o=r?(0,J.jsx)(Ee,{color:n,children:r}):null,t[3]=n,t[4]=r,t[5]=o):o=t[5];let s;return t[6]!==a||t[7]!==o?(s=(0,J.jsxs)(`mesh`,{children:[i,a,o]}),t[6]=a,t[7]=o,t[8]=s):s=t[8],s}function mn(e){let t=(0,q.c)(3),{label:n}=e,r=u()?.debugMode??!1,i;return t[0]!==r||t[1]!==n?(i=r?(0,J.jsx)(pn,{color:`red`,label:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}var hn=(0,K.memo)(function(e){let t=(0,q.c)(27),{entity:n}=e,r=n.interiorData,i=ke(n.id),a;t[0]===r.transform.position?a=t[1]:(a=Le(r.transform.position),t[0]=r.transform.position,t[1]=a);let o=a,s;t[2]===r.transform?s=t[3]:(s=Re(r.transform),t[2]=r.transform,t[3]=s);let c=s,l;t[4]===r.scale?l=t[5]:(l=Ie(r.scale),t[4]=r.scale,t[5]=l);let u=l,d=`${r.ghostIndex}: ${r.interiorFile}`,f;t[6]===d?f=t[7]:(f=(0,J.jsx)(mn,{label:d}),t[6]=d,t[7]=f);let p;t[8]===r.interiorFile?p=t[9]:(p=e=>{on.error(`Failed to load %s: %s`,r.interiorFile,e.message)},t[8]=r.interiorFile,t[9]=p);let m=`InteriorModel:${r.interiorFile}`,h;t[10]===Symbol.for(`react.memo_cache_sentinel`)?(h=(0,J.jsx)(pn,{color:`orange`}),t[10]=h):h=t[10];let g;t[11]!==i||t[12]!==r.ghostIndex||t[13]!==r.interiorFile?(g=(0,J.jsx)(fn,{interiorFile:r.interiorFile,ghostIndex:r.ghostIndex,isTarget:i}),t[11]=i,t[12]=r.ghostIndex,t[13]=r.interiorFile,t[14]=g):g=t[14];let _;t[15]!==m||t[16]!==g?(_=(0,J.jsx)(Ne,{name:m,fallback:h,children:g}),t[15]=m,t[16]=g,t[17]=_):_=t[17];let v;t[18]!==_||t[19]!==f||t[20]!==p?(v=(0,J.jsx)(te,{fallback:f,onError:p,children:_}),t[18]=_,t[19]=f,t[20]=p,t[21]=v):v=t[21];let y;return t[22]!==o||t[23]!==c||t[24]!==u||t[25]!==v?(y=(0,J.jsx)(`group`,{position:o,quaternion:c,scale:u,children:v}),t[22]=o,t[23]=c,t[24]=u,t[25]=v,t[26]=y):y=t[26],y});function gn(e){let[,t]=e;return t.isMesh}function _n(e){let[t,n]=e;return(0,J.jsx)(un,{node:n},t)}var vn=()=>{},Z=5,yn=Z*Z,bn=.05;function xn(e,t,n){let r=e,i=t,a=n;return[a,a,a,a,a,a,i,i,i,a,a,i,r,i,a,a,i,i,i,a,a,a,a,a,a]}function Sn(e,t){let n=new Float32Array(yn);for(let r=0;r<yn;r++){let i=e[r*3],a=e[r*3+2],o=1.3-Math.sqrt(i*i+a*a)/t;o<.4?o=0:o>.8&&(o=1),n[r]=o}return n}function Cn(e,t,n,r){let i=new D,a=new Float32Array(yn*3),o=new Float32Array(yn*2),s=xn(t,n,r),c=e*2/(Z-1);for(let t=0;t<Z;t++)for(let n=0;n<Z;n++){let r=t*Z+n,i=-e+n*c,l=e-t*c,u=e*s[r];a[r*3]=i,a[r*3+1]=u,a[r*3+2]=l,o[r*2]=n,o[r*2+1]=t}wn(a);let l=Sn(a,e),u=[];for(let e=0;e<Z-1;e++)for(let t=0;t<Z-1;t++){let n=e*Z+t,r=n+1,i=n+Z,a=i+1;u.push(n,i,a),u.push(n,a,r)}return i.setIndex(u),i.setAttribute(`position`,new A(a,3)),i.setAttribute(`uv`,new A(o,2)),i.setAttribute(`alpha`,new A(l,1)),i.computeBoundingSphere(),i}function wn(e){let t=t=>({x:e[t*3],y:e[t*3+1],z:e[t*3+2]}),n=(t,n,r,i)=>{e[t*3]=n,e[t*3+1]=r,e[t*3+2]=i},r=t(1),i=t(3),a=t(5),o=t(6),s=t(8),c=t(9),l=t(15),u=t(16),d=t(18),f=t(19),p=t(21),m=t(23),h=a.x+(r.x-a.x)*.5,g=a.y+(r.y-a.y)*.5,_=a.z+(r.z-a.z)*.5;n(0,o.x+(h-o.x)*2,o.y+(g-o.y)*2,o.z+(_-o.z)*2),h=c.x+(i.x-c.x)*.5,g=c.y+(i.y-c.y)*.5,_=c.z+(i.z-c.z)*.5,n(4,s.x+(h-s.x)*2,s.y+(g-s.y)*2,s.z+(_-s.z)*2),h=p.x+(l.x-p.x)*.5,g=p.y+(l.y-p.y)*.5,_=p.z+(l.z-p.z)*.5,n(20,u.x+(h-u.x)*2,u.y+(g-u.y)*2,u.z+(_-u.z)*2),h=m.x+(f.x-m.x)*.5,g=m.y+(f.y-m.y)*.5,_=m.z+(f.z-m.z)*.5,n(24,d.x+(h-d.x)*2,d.y+(g-d.y)*2,d.z+(_-d.z)*2)}function Tn(e){return e.wrapS=b,e.wrapT=b,e.minFilter=N,e.magFilter=N,e.colorSpace=``,e.needsUpdate=!0,e}var En=`
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
`,Dn=`
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
`;function On({textureUrl:e,radius:t,heightPercent:n,speed:r,windDirection:a,layerIndex:o}){let{debugMode:s}=u(),{animationEnabled:c}=l(),d=(0,K.useRef)(null),f=we(e,Tn),p=(0,K.useMemo)(()=>Cn(t,n,n-.05,bn),[t,n]);(0,K.useEffect)(()=>()=>{p.dispose()},[p]);let m=(0,K.useMemo)(()=>new k({uniforms:{cloudTexture:{value:f},uvOffset:{value:new S(0,0)},debugMode:{value:s?1:0},layerIndex:{value:o}},vertexShader:En,fragmentShader:Dn,transparent:!0,depthWrite:!1,side:2}),[f,s,o]);return(0,K.useEffect)(()=>()=>{m.dispose()},[m]),i(c?(e,t)=>{let n=t*1e3/32;d.current??=new S(0,0),d.current.x+=a.x*r*n,d.current.y+=a.y*r*n,d.current.x-=Math.floor(d.current.x),d.current.y-=Math.floor(d.current.y),m.uniforms.uvOffset.value.copy(d.current)}:vn),(0,J.jsx)(`mesh`,{geometry:p,frustumCulled:!1,renderOrder:10,children:(0,J.jsx)(`primitive`,{object:m,attach:`material`})})}var kn=7;function An(e){let t=(0,q.c)(7),n,r;t[0]===e?(n=t[1],r=t[2]):(n=[`detailMapList`,e],r=()=>_e(e),t[0]=e,t[1]=n,t[2]=r);let i=!!e,a;return t[3]!==n||t[4]!==r||t[5]!==i?(a={queryKey:n,queryFn:r,enabled:i},t[3]=n,t[4]=r,t[5]=i,t[6]=a):a=t[6],d(a)}function jn(e){let t=(0,q.c)(18),{scene:n}=e,{data:r}=An(n.materialList||void 0),a=(n.visibleDistance>0?n.visibleDistance:500)*.95,o;t[0]===n.cloudLayers?o=t[1]:(o=n.cloudLayers.map(Nn),t[0]=n.cloudLayers,t[1]=o);let s=o,c;t[2]===n.cloudLayers?c=t[3]:(c=n.cloudLayers.map(Mn),t[2]=n.cloudLayers,t[3]=c);let l=c,u;bb0:{let{x:e,y:r}=n.windVelocity;if(e!==0||r!==0){let n;t[4]!==e||t[5]!==r?(n=new S(r,-e).normalize(),t[4]=e,t[5]=r,t[6]=n):n=t[6],u=n;break bb0}let i;t[7]===Symbol.for(`react.memo_cache_sentinel`)?(i=new S(1,0),t[7]=i):i=t[7],u=i}let d=u,f;bb1:{if(!r){let e;t[8]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[8]=e):e=t[8],f=e;break bb1}let e;if(t[9]!==l||t[10]!==s||t[11]!==r){e=[];for(let t=0;t<3;t++){let n=r[kn+t];n&&e.push({texture:n,height:l[t],speed:s[t]})}t[9]=l,t[10]=s,t[11]=r,t[12]=e}else e=t[12];f=e}let p=f,m=(0,K.useRef)(null),h;if(t[13]===Symbol.for(`react.memo_cache_sentinel`)?(h=e=>{let{camera:t}=e;m.current&&m.current.position.copy(t.position)},t[13]=h):h=t[13],i(h),!p||p.length===0)return null;let g;return t[14]!==p||t[15]!==a||t[16]!==d?(g=(0,J.jsx)(`group`,{ref:m,children:p.map((e,t)=>(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(On,{textureUrl:U(e.texture),radius:a,heightPercent:e.height,speed:e.speed,windDirection:d,layerIndex:t})},t))}),t[14]=p,t[15]=a,t[16]=d,t[17]=g):g=t[17],g}function Mn(e,t){return e.heightPercent||[.35,.25,.2][t]}function Nn(e,t){return e.speed||[1e-4,2e-4,3e-4][t]}(0,K.createContext)(null),(0,K.createContext)(null);function Pn(e){let t=e.fogDistance,n=e.visibleDistance>0?e.visibleDistance:1e3,{r,g:i,b:a}=e.fogColor,o=new T().setRGB(r,i,a).convertSRGBToLinear(),s=[];for(let t of e.fogVolumes)t.visibleDistance<=0||t.maxHeight<=t.minHeight||s.push({visibleDistance:t.visibleDistance,minHeight:t.minHeight,maxHeight:t.maxHeight,percentage:1});return{fogDistance:t,visibleDistance:n,fogColor:o,fogVolumes:s,fogLine:s.reduce((e,t)=>Math.max(e,t.maxHeight),0),enabled:n>t}}var Fn=be(`Sky`),In=!1;function Ln(e){return[new T().setRGB(e.r,e.g,e.b),new T().setRGB(e.r,e.g,e.b).convertSRGBToLinear()]}function Rn(e){let t=(0,q.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`detailMapList`,e],queryFn:()=>(Fn.debug(`Loading detail map list: %s`,e),_e(e))},t[0]=e,t[1]=n);let r=d(n),i,a;return t[2]!==e||t[3]!==r.data||t[4]!==r.error||t[5]!==r.status?(i=()=>{Fn.debug(`DML query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (${r.data.length} entries)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=e,t[3]=r.data,t[4]=r.error,t[5]=r.status,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,K.useEffect)(i,a),r}var zn=60;function Bn({skyBoxFiles:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=pt(e,{path:``}),a=!!t,s=(0,K.useMemo)(()=>r.projectionMatrixInverse,[r]),c=(0,K.useMemo)(()=>n?V(n.fogVolumes):new Float32Array(12),[n]),l=(0,K.useRef)({skybox:{value:i},fogColor:{value:t??new T(0,0,0)},enableFog:{value:a},inverseProjectionMatrix:{value:s},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:z.cameraHeight,fogVolumeData:{value:c},horizonFogHeight:{value:.18}}),u=(0,K.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return zn/Math.sqrt(e*e+zn*zn)},[n]);return(0,K.useEffect)(()=>{l.current.skybox.value=i,l.current.fogColor.value=t??new T(0,0,0),l.current.enableFog.value=a,l.current.fogVolumeData.value=c,l.current.horizonFogHeight.value=u},[i,t,a,c,u]),(0,J.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,J.jsxs)(`bufferGeometry`,{children:[(0,J.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,J.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,J.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function Vn(e){let t=(0,q.c)(13),{materialList:n,fogColor:r,fogState:i}=e,{data:a}=Rn(n),o;t[0]===a?o=t[1]:(o=a?[U(a[1]),U(a[3]),U(a[4]),U(a[5]),U(a[0]),U(a[2])]:null,t[0]=a,t[1]=o);let s=o,c;t[2]===a?.[6]?c=t[3]:(c=()=>{let e=a?.[6];if(!e)return;let t=U(e);if(t===ve)return;let n=me(t,Un);return n.image&&(B(n,{noColorSpace:!0}),le(n)),Hn},t[2]=a?.[6],t[3]=c);let l;t[4]===a?l=t[5]:(l=[a],t[4]=a,t[5]=l),(0,K.useEffect)(c,l);let{debugMode:d}=u(),f,p;if(t[6]===d?(f=t[7],p=t[8]):(f=()=>{ae.shapeEnvMapDebugUV.value=d},p=[d],t[6]=d,t[7]=f,t[8]=p),(0,K.useEffect)(f,p),!s)return null;let m;return t[9]!==r||t[10]!==i||t[11]!==s?(m=(0,J.jsx)(Bn,{skyBoxFiles:s,fogColor:r,fogState:i}),t[9]=r,t[10]=i,t[11]=s,t[12]=m):m=t[12],m}function Hn(){return oe()}function Un(e){B(e,{noColorSpace:!0}),le(e)}function Wn({skyColor:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=!!t,a=(0,K.useMemo)(()=>r.projectionMatrixInverse,[r]),s=(0,K.useMemo)(()=>n?V(n.fogVolumes):new Float32Array(12),[n]),c=(0,K.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return zn/Math.sqrt(e*e+zn*zn)},[n]),l=(0,K.useRef)({skyColor:{value:e},fogColor:{value:t??new T(0,0,0)},enableFog:{value:i},inverseProjectionMatrix:{value:a},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:z.cameraHeight,fogVolumeData:{value:s},horizonFogHeight:{value:c}});return(0,K.useEffect)(()=>{l.current.skyColor.value=e,l.current.fogColor.value=t??new T(0,0,0),l.current.enableFog.value=i,l.current.fogVolumeData.value=s,l.current.horizonFogHeight.value=c},[e,t,i,s,c]),(0,J.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,J.jsxs)(`bufferGeometry`,{children:[(0,J.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,J.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,J.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function Gn(e,t){let{fogDistance:n,visibleDistance:r}=e;return[n,r]}function Kn({fogState:e,enabled:t}){let n=o(e=>e.scene),r=o(e=>e.camera),a=(0,K.useRef)(null),s=(0,K.useMemo)(()=>V(e.fogVolumes),[e.fogVolumes]);return(0,K.useEffect)(()=>{In||=(de(),!0)},[]),(0,K.useEffect)(()=>{pe();let[t,i]=Gn(e,r.position.y),o=new O(e.fogColor,t,i);return n.fog=o,a.current=o,ue(r.position.y,s),()=>{n.fog=null,a.current=null,pe()}},[n,r,e,s]),(0,K.useEffect)(()=>{let n=a.current;if(n)if(t){let[t,i]=Gn(e,r.position.y);n.near=t,n.far=i}else n.near=1e10,n.far=1e10},[t,e,r.position.y]),i(()=>{let n=a.current;if(!n)return;let i=r.position.y;if(ue(i,s,t),t){let[t,r]=Gn(e,i),a=z.fogDistanceScale.value;n.near=a>1?Math.min(t,100):t,n.far=r*a,n.color.copy(e.fogColor)}}),null}var qn=(0,K.memo)(function({entity:e}){let{skyData:t}=e;Fn.debug(`Rendering: materialList=%s, useSkyTextures=%s`,t.materialList,t.useSkyTextures);let{fogEnabled:n}=l(),r=t.materialList||void 0,i=(0,K.useMemo)(()=>Ln(t.skySolidColor),[t.skySolidColor]),a=t.useSkyTextures,s=(0,K.useMemo)(()=>Pn(t),[t]);Fn.debug(`fogState: fogColor=(%s, %s, %s) visibleDistance=%d fogDistance=%d enabled=%s volumes=%d`,t.fogColor.r.toFixed(3),t.fogColor.g.toFixed(3),t.fogColor.b.toFixed(3),t.visibleDistance,t.fogDistance,s.enabled,s.fogVolumes.length);let c=(0,K.useMemo)(()=>Ln(t.fogColor),[t.fogColor]),u=i||c,d=s.enabled&&n,f=s.fogColor,p=o(e=>e.scene),m=o(e=>e.gl);(0,K.useEffect)(()=>{if(d){let e=f.clone();p.background=e,m.setClearColor(e)}else if(u){let e=u[0].clone();p.background=e,m.setClearColor(e)}else p.background=null;return()=>{p.background=null}},[p,m,d,f,u]);let h=i?.[1];return(0,J.jsxs)(J.Fragment,{children:[r&&a&&r.length>0?(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(Vn,{materialList:r,fogColor:d?f:void 0,fogState:d?s:void 0},r)}):h?(0,J.jsx)(Wn,{skyColor:h,fogColor:d?f:void 0,fogState:d?s:void 0}):null,(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(jn,{scene:t})}),s.enabled?(0,J.jsx)(Kn,{fogState:s,enabled:n}):null]})});function Jn(e){let t=(0,q.c)(3),{children:n}=e,{audioEnabled:r}=l(),i;return t[0]!==r||t[1]!==n?(i=r?(0,J.jsx)(K.Suspense,{children:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}var Yn=()=>{};function Xn(e,t){let n=(0,q.c)(4),{animationEnabled:r}=l(),a;n[0]!==r||n[1]!==e.rotate||n[2]!==t?(a=e.rotate&&r?()=>{if(t.current){let e=performance.now()/1e3;t.current.rotation.y=e/3*Math.PI*2}}:Yn,n[0]=r,n[1]=e.rotate,n[2]=t,n[3]=a):a=n[3],i(a)}function Zn(e,t){let n=(0,K.lazy)(()=>t().then(t=>({default:t[e]}))),r=t=>{let r=(0,q.c)(5),{entity:i}=t,a=`${e}:${i.id}`,o;r[0]===i?o=r[1]:(o=(0,J.jsx)(n,{entity:i}),r[0]=i,r[1]=o);let s;return r[2]!==a||r[3]!==o?(s=(0,J.jsx)(Ne,{name:a,children:o}),r[2]=a,r[3]=o,r[4]=s):s=r[4],s};return r.displayName=`createLazy(${e})`,r}var Qn=Zn(`PlayerModel`,()=>W(()=>import(`./PlayerModel-Kcb6K1_s.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]))),$n=Zn(`ExplosionShape`,()=>W(()=>import(`./ExplosionShape-CFtLb8wO.js`),__vite__mapDeps([27,2,1,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]))),er=Zn(`TracerProjectile`,()=>W(()=>import(`./Projectiles-D417zqjU.js`),__vite__mapDeps([28,2,29,5,6,7,8,22,23,17,18,14,12,13]))),tr=Zn(`SpriteProjectile`,()=>W(()=>import(`./Projectiles-D417zqjU.js`),__vite__mapDeps([28,2,29,5,6,7,8,22,23,17,18,14,12,13]))),nr=Zn(`ForceFieldBare`,()=>W(()=>import(`./ForceFieldBare-C_w3CfiW.js`),__vite__mapDeps([30,2,29,5,6,7,8,10,11,12,13,16,21,14,17,18,19]))),rr=Zn(`AudioEmitter`,()=>W(()=>import(`./AudioEmitter-BGkO8Fbs.js`),__vite__mapDeps([31,10,2,6,11,8,12,13,15,3,4,5,7,14,16,17,18,19,20]))),ir=Zn(`WaterBlock`,()=>W(()=>import(`./WaterBlock-BoR_edBt.js`),__vite__mapDeps([32,2,4,29,5,6,7,8,10,11,12,13,16,24,23,17,18,14,33,19]))),ar=(0,K.memo)(function(e){let t=(0,q.c)(27),{entity:n,objectMounts:r}=e;switch(n.renderType){case`Shape`:{let e;return t[0]!==n||t[1]!==r?(e=(0,J.jsx)(or,{entity:n,objectMounts:r}),t[0]=n,t[1]=r,t[2]=e):e=t[2],e}case`ForceFieldBare`:{let e;return t[3]===n?e=t[4]:(e=(0,J.jsx)(nr,{entity:n}),t[3]=n,t[4]=e),e}case`Player`:{let e;return t[5]===n?e=t[6]:(e=(0,J.jsx)(Qn,{entity:n}),t[5]=n,t[6]=e),e}case`Explosion`:{let e;return t[7]===n?e=t[8]:(e=(0,J.jsx)($n,{entity:n}),t[7]=n,t[8]=e),e}case`Tracer`:{let e;return t[9]===n?e=t[10]:(e=(0,J.jsx)(er,{entity:n}),t[9]=n,t[10]=e),e}case`Sprite`:{let e;return t[11]===n?e=t[12]:(e=(0,J.jsx)(tr,{entity:n}),t[11]=n,t[12]=e),e}case`AudioEmitter`:{let e;return t[13]===n?e=t[14]:(e=(0,J.jsx)(Jn,{children:(0,J.jsx)(rr,{entity:n})}),t[13]=n,t[14]=e),e}case`Camera`:{let e;return t[15]===n?e=t[16]:(e=(0,J.jsx)(kt,{entity:n}),t[15]=n,t[16]=e),e}case`WayPoint`:{let e;return t[17]===n?e=t[18]:(e=(0,J.jsx)(At,{entity:n}),t[17]=n,t[18]=e),e}case`TerrainBlock`:{let e;return t[19]===n?e=t[20]:(e=(0,J.jsx)(en,{entity:n}),t[19]=n,t[20]=e),e}case`InteriorInstance`:{let e;return t[21]===n?e=t[22]:(e=(0,J.jsx)(hn,{entity:n}),t[21]=n,t[22]=e),e}case`Sky`:{let e;return t[23]===n?e=t[24]:(e=(0,J.jsx)(qn,{entity:n}),t[23]=n,t[24]=e),e}case`Sun`:return null;case`WaterBlock`:{let e;return t[25]===n?e=t[26]:(e=(0,J.jsx)(ir,{entity:n}),t[25]=n,t[26]=e),e}case`MissionArea`:return null;case`None`:return null;default:return null}});function or({entity:e,objectMounts:t}){let n=We(),r=n===`demo`||n===`live`,i=(0,K.useRef)(null);if(Xn(e,i),!e.shapeName)throw Error(`Shape entity missing shapeName: ${e.id}`);let a=e.shapeType??`StaticShape`,o=(0,K.useMemo)(()=>ne(e.dataBlockId,e.dataBlock),[e.dataBlockId,e.dataBlock]),s=e.dataBlock?.toLowerCase()===`flag`,c=e.teamId&&e.teamId>0?xe[e.teamId]:null,l=s&&c?`${c} Flag`:null,u=e.shapeType===`Item`?`pink`:e.threads?`#00ff88`:`yellow`,d=(0,K.useMemo)(()=>{let n={...t},r=e.imageSlots;if(r)for(let t=0;t<r.length;t++){let i=r[t];!i?.shapeName||i.mountPoint in n||(n[i.mountPoint]=(0,J.jsx)(R,{shapeName:i.shapeName,imageDataBlockId:i.dataBlockId,entityId:e.id,skinName:i.skinName}))}return Object.keys(n).length>0?n:void 0},[t,e.imageSlots,e.id]),f=(0,K.useMemo)(()=>{if(e.lightType)return{type:e.lightType,color:e.lightColor??[1,1,1,1],time:e.lightTime??1e3,radius:e.lightRadius??10,onlyStatic:!!e.lightOnlyStatic,isStatic:!!e.isStaticItem}},[e.lightType]);return(0,J.jsx)(ce,{object:e.runtimeObject,shapeName:e.shapeName,type:a,children:(0,J.jsx)(`group`,{ref:e.rotate?i:void 0,children:(0,J.jsx)(re,{loadingColor:u,streamEntity:r?e:void 0,emap:o,entityId:e.id,skinName:e.skinName,mounted:d,lightConfig:f,children:l?(0,J.jsx)(Ee,{opacity:.6,children:l}):null})})})}var sr={Root:`_Root_yuidw_1`,Distance:`_Distance_yuidw_9`,Icon:`_Icon_yuidw_18`},cr=1.5,lr=U(`commander/MiniIcons/com_flag_grey`),ur=new C;function dr(e){let t=(0,q.c)(9),{entity:n}=e,r=(0,K.useRef)(null),a=(0,K.useRef)(null),s=(0,K.useRef)(null),l=o(fr),u;t[0]!==l||t[1]!==n.iffColor?(u=()=>{if(a.current&&n.iffColor){let{r:e,g:t,b:r}=n.iffColor;a.current.style.backgroundColor=`rgb(${e},${t},${r})`}if(s.current&&r.current){r.current.getWorldPosition(ur);let e=l.position.distanceTo(ur);s.current.textContent=e.toFixed(1)}},t[0]=l,t[1]=n.iffColor,t[2]=u):u=t[2],i(u);let d=n.iffColor?`rgb(${n.iffColor.r},${n.iffColor.g},${n.iffColor.b})`:`rgb(200,200,200)`,f;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(f=[0,cr,0],t[3]=f):f=t[3];let p;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(p=(0,J.jsx)(`span`,{ref:s,className:sr.Distance}),t[4]=p):p=t[4];let m;t[5]===d?m=t[6]:(m={backgroundColor:d,"--flag-icon-url":`url(${lr})`},t[5]=d,t[6]=m);let h=m,g;return t[7]===h?g=t[8]:(g=(0,J.jsx)(`group`,{ref:r,children:(0,J.jsx)(c,{position:f,center:!0,children:(0,J.jsxs)(`div`,{className:sr.Root,children:[p,(0,J.jsx)(`div`,{ref:a,className:sr.Icon,style:h})]})})}),t[7]=h,t[8]=g),g}function fr(e){return e.camera}function pr(){let e=(0,q.c)(1),t=mr,n;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=(0,J.jsx)(`group`,{ref:t,children:(0,J.jsx)(hr,{})}),e[0]=n):n=e[0],n}function mr(e){Pe.setState({root:e})}var hr=(0,K.memo)(function(){let e=Ue(),t=(0,K.useRef)(new Map).current,n=new Set;for(let r of e)n.add(r.id),t.set(r.id,r);for(let e of t.keys())n.has(e)||t.delete(e);let r=new Set,i=new Map;for(let e of t.values()){let n=e.mountObjectId;if(n&&t.has(n)){r.add(e.id);let t=i.get(n);t||(t=new Map,i.set(n,t)),t.set(e.mountNode??0,e)}}return(0,J.jsx)(J.Fragment,{children:[...t.values()].filter(e=>!r.has(e.id)).map(e=>(0,J.jsx)(gr,{entity:e,mountChildren:i.get(e.id)},e.id))})}),gr=(0,K.memo)(function(e){let t=(0,q.c)(8),{entity:n,mountChildren:r}=e;if(n.debugHidden)return null;if(lt(n)){let e;t[0]===n?e=t[1]:(e=(0,J.jsx)(ar,{entity:n}),t[0]=n,t[1]=e);let r;return t[2]!==n.id||t[3]!==e?(r=(0,J.jsx)(`group`,{name:n.id,children:e}),t[2]=n.id,t[3]=e,t[4]=r):r=t[4],r}if(n.renderType===`None`)return null;let i;return t[5]!==n||t[6]!==r?(i=(0,J.jsx)(vr,{entity:n,mountChildren:r}),t[5]=n,t[6]=r,t[7]=i):i=t[7],i});function _r({entity:e}){let t=(0,K.useRef)(!1),[n,r]=(0,K.useState)(()=>(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0);return t.current=n,i(()=>{let n=(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0;n!==t.current&&(t.current=n,r(n))}),n?(0,J.jsx)(dr,{entity:e}):null}function vr(e){let t=(0,q.c)(38),{entity:n,mountChildren:r}=e,i=n.position,a=n.scale,o;bb0:{if(!n.rotation){o=void 0;break bb0}let e;t[0]===n.rotation?e=t[1]:(e=new m(...n.rotation),t[0]=n.rotation,t[1]=e),o=e}let s=o,c;bb1:{if(!r||r.size===0){c=void 0;break bb1}let e;if(t[2]!==r){e={};for(let[t,n]of r)e[t]=(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(`group`,{rotation:[Math.PI/2,-Math.PI/2,0],children:(0,J.jsx)(ar,{entity:n})})},n.id);t[2]=r,t[3]=e}else e=t[3];c=e}let l=c;if(n.renderType===`Shape`&&!n.shapeName){let e=n.id,r;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(r=(0,J.jsx)(`sphereGeometry`,{args:[.3,6,4]}),t[4]=r):r=t[4];let o;t[5]===n.className?o=t[6]:(o=se(n.className),t[5]=n.className,t[6]=o);let c;t[7]===o?c=t[8]:(c=(0,J.jsxs)(`mesh`,{children:[r,(0,J.jsx)(`meshBasicMaterial`,{color:o,wireframe:!0})]}),t[7]=o,t[8]=c);let l;t[9]===n?l=t[10]:(l=(0,J.jsx)(_r,{entity:n}),t[9]=n,t[10]=l);let u;return t[11]!==n.id||t[12]!==i||t[13]!==s||t[14]!==a||t[15]!==c||t[16]!==l?(u=(0,J.jsxs)(`group`,{name:e,position:i,quaternion:s,scale:a,children:[c,l]}),t[11]=n.id,t[12]=i,t[13]=s,t[14]=a,t[15]=c,t[16]=l,t[17]=u):u=t[17],u}let u;t[18]!==n.className||t[19]!==n.renderType?(u=n.renderType===`Explosion`?null:(0,J.jsxs)(`mesh`,{children:[(0,J.jsx)(`sphereGeometry`,{args:[.5,8,6]}),(0,J.jsx)(`meshBasicMaterial`,{color:se(n.className),wireframe:!0})]}),t[18]=n.className,t[19]=n.renderType,t[20]=u):u=t[20];let d=u,f;t[21]!==n||t[22]!==l?(f=(0,J.jsx)(ar,{entity:n,objectMounts:l}),t[21]=n,t[22]=l,t[23]=f):f=t[23];let p;t[24]!==d||t[25]!==f?(p=(0,J.jsx)(ee,{fallback:d,children:f}),t[24]=d,t[25]=f,t[26]=p):p=t[26];let h;t[27]===n?h=t[28]:(h=(0,J.jsx)(_r,{entity:n}),t[27]=n,t[28]=h);let g;t[29]!==p||t[30]!==h?(g=(0,J.jsxs)(`group`,{name:`model`,children:[p,h]}),t[29]=p,t[30]=h,t[31]=g):g=t[31];let _;return t[32]!==n.id||t[33]!==i||t[34]!==s||t[35]!==a||t[36]!==g?(_=(0,J.jsx)(`group`,{name:n.id,position:i,quaternion:s,scale:a,children:g}),t[32]=n.id,t[33]=i,t[34]=s,t[35]=a,t[36]=g,t[37]=_):_=t[37],_}function yr(){let e=(0,q.c)(3),{fov:t}=l(),n;e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=[0,256,0],e[0]=n):n=e[0];let r;return e[1]===t?r=e[2]:(r=(0,J.jsx)(ft,{makeDefault:!0,position:n,fov:t}),e[1]=t,e[2]=r),r}function br(e){let t=(0,q.c)(3),{children:n}=e,{debugMode:r}=u(),i;return t[0]!==n||t[1]!==r?(i=r?(0,J.jsx)(K.Suspense,{children:n}):null,t[0]=n,t[1]=r,t[2]=i):i=t[2],i}var xr=be(`InputConsumer`),Sr=200,Cr=Math.PI/2-.01,wr=45,Tr=31,Er=40,Dr=1/32,Or=2*Math.PI;function kr(e){return((Math.round(e/Or*65536)|0)<<16>>16)*Or/65536}var Ar=new C,jr=new C,Mr=new C,Nr=new h(0,0,0,`YXZ`);function Pr(e,t,n,r,i,a,o){if(r===0&&i===0&&a===0)return;let s=Math.sin(t),c=Math.cos(t),l=Math.sin(n),u=Math.cos(n),d=o*Dr;e.x+=(c*r+s*u*i+s*l*a)*d,e.y+=(-s*r+c*u*i+c*l*a)*d,e.z+=(-l*i+u*a)*d}function Fr(){let{moveQueue:e,mode:t,setMode:n}=rt(),r=ze(e=>e.adapter),a=ze(e=>e.gameStatus),s=ze(e=>e.liveReady),c=ze(e=>e.sendMoves),l=Se(),u=o(e=>e.camera),d=Ot(),f=(0,K.useRef)(null),p=(0,K.useRef)([]),m=(0,K.useRef)(0),h=(0,K.useRef)(0),g=(0,K.useRef)(null),_=(0,K.useRef)(0),v=(0,K.useRef)(0),y=(0,K.useRef)({x:0,y:0,z:0}),b=(0,K.useRef)(0),x=(0,K.useRef)(0),S=(0,K.useRef)({x:0,y:0,z:0}),C=(0,K.useRef)(!1),w=(0,K.useRef)({x:0,y:0,z:0}),T=(0,K.useRef)({x:0,y:0,z:0}),E=(0,K.useRef)(!1),D=(0,K.useRef)(null),O=(0,K.useRef)(0),k=(0,K.useRef)(0),A=(0,K.useRef)(0),j=(0,K.useRef)(0),M=(0,K.useRef)(0),N=(0,K.useRef)([!1,!1,!1,!1,!1,!1]),P=!!r&&(a===`connected`||a===`authenticating`);return(0,K.useEffect)(()=>{if(P&&r){if(f.current===r)return;xr.info(`wiring adapter to engine store`);let e=Qe.getState(),t={source:`live`,duration:1/0,missionName:e.mapName??null,gameType:null,serverDisplayName:e.serverName??null,recorderName:e.warriorName??null,recordingDate:null,streamingPlayback:r};l.getState().setRecording(t),l.getState().setPlaybackStatus(`playing`),f.current=r,C.current=!1,E.current=!1,D.current=null,p.current.length=0,m.current=0,h.current=0,g.current=null,n(`fly`)}else !P&&f.current&&(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),f.current=null,C.current=!1,E.current=!1,D.current=null,p.current.length=0,n(`local`))},[P,r,l,n]),(0,K.useEffect)(()=>{!s&&f.current&&(xr.info(`mission change: resetting prediction state and mode`),C.current=!1,E.current=!1,D.current=null,p.current.length=0,m.current=0,h.current=0,g.current=null,O.current=0,k.current=0,A.current=0,j.current=0,M.current=0,N.current.fill(!1),n(`fly`))},[s,n]),(0,K.useEffect)(()=>{if(!P)return Pe.subscribe(e=>{n(e.cameraMode===`orbitOverride`?`follow`:`local`)})},[P,n]),Dt(()=>{if(!f.current||a!==`connected`||!s)return;let e=O.current,t=k.current;O.current=0,k.current=0;let n=A.current,r=j.current,i=M.current;A.current=0,j.current=0,M.current=0;let o=[...N.current];N.current.fill(!1);let l=kr(e),u=kr(t);_.current+=l-e,v.current+=u-t,b.current=_.current,x.current=v.current,S.current={...y.current};let d=Er*2,h=_.current-l,g=v.current-u;Pr(y.current,h,g,n,r,i,d),o[1]=!0;let C=m.current++,P={x:n,y:r,z:i,yaw:e,pitch:t,roll:0,trigger:o,freeLook:!1},F=p.current;F.push({moveIndex:C,move:P,yaw:l,pitch:u,x:n,y:r,z:i}),F.length>wr&&F.splice(0,F.length-wr);let I=f.current.lastMoveAck;for(;F.length>0&&F[0].moveIndex<I;)F.shift();if(F.length>0){let e=F.slice(0,Tr);c(e.map(e=>e.move),e[0].moveIndex)}let L=f.current.getSnapshot();if(L!==D.current){D.current=L;let e=L?.camera;if(e?.orbitTargetId){let t=L.entities.find(t=>t.id===e.orbitTargetId);t?.position&&(w.current={...T.current},T.current={x:t.position[0],y:t.position[1],z:t.position[2]},E.current||=(w.current={...T.current},!0))}}}),i((r,i)=>{let o=e.current;if(o.length>0){let t=0,n=0,r=0,i=0,c=0,l=0,d=[!1,!1,!1,!1,!1,!1];for(let e of o){t+=e.deltaYaw,n+=e.deltaPitch,Math.abs(e.x)>Math.abs(r)&&(r=e.x),Math.abs(e.y)>Math.abs(i)&&(i=e.y),Math.abs(e.z)>Math.abs(c)&&(c=e.z),l+=e.delta;for(let t=0;t<e.triggers.length;t++)e.triggers[t]&&(d[t]=!0)}if(e.current.length=0,P&&f.current&&a===`connected`&&s){O.current+=t,k.current+=n,A.current=r,j.current=i,M.current=c;for(let e=0;e<d.length;e++)d[e]&&(N.current[e]=!0);_.current+=t,v.current=Math.max(-G,Math.min(G,v.current+n))}else{let e=Pe.getState();if(e.playback){e.cameraMode===`freeFly`?Ir(u,t,n,r,i,c,l):e.cameraMode===`orbitOverride`&&(e.orbitOverrideYaw+=t,e.orbitOverridePitch=Math.max(-G,Math.min(G,e.orbitOverridePitch+n)));return}Ir(u,t,n,r,i,c,l);return}}if(!P||!f.current||a!==`connected`||!s)return;let c=f.current,l=c.getSnapshot(),m=l?.camera;if(m&&m!==g.current&&typeof m.yaw==`number`&&typeof m.pitch==`number`){g.current=m;let e=c.lastMoveAck;if(e>h.current){h.current=e;let t=p.current;for(;t.length>0&&t[0].moveIndex<e;)t.shift()}_.current=m.yaw,v.current=m.pitch,y.current={x:m.position[0],y:m.position[1],z:m.position[2]};let r=Er*2;for(let e of p.current)Pr(y.current,_.current,v.current,e.x,e.y,e.z,r),_.current+=e.yaw,v.current=Math.max(-G,Math.min(G,v.current+e.pitch));_.current+=O.current,v.current=Math.max(-G,Math.min(G,v.current+k.current)),b.current=_.current,x.current=v.current,S.current={...y.current},C.current=!0;let i=m.mode===`third-person`?`follow`:`fly`;if(i!==t&&(xr.info(`server corrected observer mode: %s → %s`,t,i),n(i),f.current&&(f.current.observerMode=i),i===`fly`&&(E.current=!1,D.current=null)),m.orbitTargetId&&!E.current){let e=l.entities.find(e=>e.id===m.orbitTargetId);if(e?.position){let t={x:e.position[0],y:e.position[1],z:e.position[2]};T.current=t,w.current={...t},E.current=!0}}}if(C.current){if(t===`fly`)Lr(r.camera,S.current,y.current,_.current,v.current,d());else if(t===`follow`){if(!E.current)return;Rr(r.camera,w.current,T.current,_.current,v.current,d(),m?.orbitDistance??4,m?.orbitTargetId)}}}),(0,K.useEffect)(()=>()=>{f.current&&=(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),null)},[l]),null}function Ir(e,t,n,r,i,a,o){if((t!==0||n!==0)&&(Nr.setFromQuaternion(e.quaternion,`YXZ`),Nr.y-=t,Nr.x-=n,Nr.x=Math.max(-Cr,Math.min(Cr,Nr.x)),e.quaternion.setFromEuler(Nr)),r!==0||i!==0||a!==0){e.getWorldDirection(Ar),Ar.normalize(),jr.crossVectors(e.up,Ar).normalize(),Mr.set(0,0,0),i!==0&&Mr.addScaledVector(Ar,i),r!==0&&Mr.addScaledVector(jr,-r),a!==0&&(Mr.y+=a);let t=Mr.length();t>0&&(Mr.multiplyScalar(Math.min(1,t)/t*Sr*o),e.position.add(Mr))}}function Lr(e,t,n,r,i,a){let o=t.x+(n.x-t.x)*a,s=t.y+(n.y-t.y)*a,c=t.z+(n.z-t.z)*a;e.position.set(s,c,o);let[l,u,d,f]=Fe(r,i);e.quaternion.set(l,u,d,f)}function Rr(e,t,n,r,i,a,o,s){let c=t.x+(n.x-t.x)*a,l=t.y+(n.y-t.y)*a,u=t.z+(n.z-t.z)*a+(s!=null&&Ze.getState().streamEntities.get(s)?.renderType===`Player`?1:0),d=Math.sin(i),f=Math.cos(i),p=Math.sin(r),m=Math.cos(r),h=Math.max(.1,o),g=c-p*f*h,_=l-m*f*h,v=u+d*h;e.position.set(_,v,g);let[y,b,x,S]=Fe(r,i);e.quaternion.set(y,b,x,S)}var zr=be(`CameraTourConsumer`);function Br(e){return e<.5?4*e*e*e:1-(-2*e+2)**3/2}var Vr=3,Hr=10,Ur=2,Wr=1.8,Gr=50,Kr=200,qr=2,Jr=1.8,Yr=1.2,Xr=.6,Zr=3/4*(2*Math.PI),Qr=Zr/Xr,$r=1.5,ei=1.5,ti=6,ni=180,ri=1.4,ii=new E,ai=new E,oi=new E,si=new P,ci=new C,li=new C,ui=new C,di=new C,fi=new C,Q=new m,pi=new m,mi=new P,hi=new h;function gi(e){if(e.orbitCenter)return fi.set(e.orbitCenter[0],e.orbitCenter[1],e.orbitCenter[2]);let t=e.targets[e.currentIndex];return fi.set(t.position[0],t.position[1],t.position[2])}function _i(e){return e.orbitRadius??Vr}function vi(e){return _i(e)*(Ur/Vr)}function yi(e,t,n){let r=gi(e),i=_i(e),a=vi(e);return n.set(r.x+Math.cos(t)*i,r.y+a,r.z+Math.sin(t)*i)}function bi(e,t,n){let r=e.getObjectByName(t.entityId),i=!1;if(r&&r.traverse(e=>{e.geometry&&(i=!0)}),r&&!i){n.orbitCenter=[...t.position],n.orbitRadius=Hr;return}if(r&&i){ii.setFromObject(r),ii.getCenter(ci),n.orbitCenter=[ci.x,ci.y,ci.z];let e=mi.copy(r.matrixWorld).invert();ai.makeEmpty(),r.traverse(t=>{t.geometry&&(t.geometry.boundingBox||t.geometry.computeBoundingBox(),oi.copy(t.geometry.boundingBox),si.multiplyMatrices(e,t.matrixWorld),oi.applyMatrix4(si),ai.union(oi))}),ai.getSize(li);let i=li.y,a=Math.max(li.x,li.z),o=i/2+Jr,s=a/2+Yr,c=Math.max(o,s);if(c>200){n.orbitCenter=[...t.position];let e=0;r.traverse(t=>{if(e>0||!t.geometry)return;t.geometry.boundingBox||t.geometry.computeBoundingBox();let n=t.geometry.boundingBox,r=n.max.x-n.min.x,i=n.max.y-n.min.y,a=n.max.z-n.min.z;e=Math.max(r,i,a)});let i=(e/2+Yr)*.75;n.orbitRadius=Math.max(Wr,i)}else n.orbitRadius=Math.max(Wr,c);let l=o>=s?`height`:`spread`,u=c<Wr?` (clamped)`:``;zr.debug(`%s: size=%s height→%s spread→%s driven by %s → radius=%d%s`,t.label,`${li.x.toFixed(1)}×${li.y.toFixed(1)}×${li.z.toFixed(1)}`,o.toFixed(1),s.toFixed(1),l,n.orbitRadius,u)}else n.orbitCenter=null,n.orbitRadius=null,zr.debug(`%s: no scene object, fallback radius=%d`,t.label,Vr)}function xi(e){return hi.setFromQuaternion(e,`YXZ`),hi.z=0,e.setFromEuler(hi)}function Si(e,t){return mi.lookAt(e,t,di.set(0,1,0)),pi.setFromRotationMatrix(mi),xi(pi)}function Ci(e,t,n){let r=gi(t),i=yi(t,n,ui.clone()),a=e.distanceTo(i);if(a<20)return new w([e.clone(),i],!1,`centripetal`);let o=new C().addVectors(e,i).multiplyScalar(.5);return o.distanceTo(r)>i.distanceTo(r)&&o.lerp(r,.3),o.y+=a*.15,new w([e.clone(),o,i],!1,`centripetal`)}function wi(e,t){let n=gi(t);return Math.atan2(e.z-n.z,e.x-n.x)}function Ti(e){return Math.max(ei,Math.min(ti,e/ni))}function Ei(e,t,n,r){let i=e.targets[e.currentIndex];if(!e.curve){e.startPos=[t.position.x,t.position.y,t.position.z],xi(Q.copy(t.quaternion)),e.startQuat=[Q.x,Q.y,Q.z,Q.w],bi(r,i,e);let n=t.position.clone();e.curve=Ci(n,e,wi(n,e)),e.phaseDuration=Ti(e.curve.getLength()),e.elapsed=0;return}e.elapsed+=n;let a=Math.min(1,Br(e.elapsed/e.phaseDuration));e.curve.getPointAt(a,ui),t.position.copy(ui);let o=Br(Math.min(1,e.elapsed/e.phaseDuration*ri)),s=Si(ui,gi(e));o<1&&e.startQuat?(Q.set(e.startQuat[0],e.startQuat[1],e.startQuat[2],e.startQuat[3]),Q.slerp(s,o),t.quaternion.copy(Q)):t.quaternion.copy(s),e.elapsed>=e.phaseDuration&&(e.phase=`orbiting`,e.elapsed=0,e.orbitStartAngle=wi(t.position,e))}function Di(e,t,n){let r=e.targets.length===1,i=e.currentIndex>=e.targets.length-1;e.elapsed+=n;let a=e.orbitStartAngle,o=Qr+$r,s;if(e.elapsed<=Qr)s=a+e.elapsed*Xr;else{let t=e.elapsed-Qr,n=Math.min(1,t/$r),r=t*Xr*(1-n/2);s=a+Zr+r}yi(e,s,ui),t.position.copy(ui);let c=Si(ui,gi(e));t.quaternion.copy(c),e.elapsed>=o&&(r||i?Ae.getState().cancel():Ae.getState().advanceTarget())}function Oi(){let e=(0,q.c)(3),t=o(Mi),n=o(ji),r=(0,K.useRef)(null);st(`nextStop`,Ai),st(`exitTour`,ki);let a;return e[0]!==t||e[1]!==n?(a=(e,i)=>{let a=Ae.getState().animation,o=a?_i(a):0,s=a&&o>=Gr?Math.max(1,o/Kr):1,c=z.fogDistanceScale.value;if(c!==s){let e=qr*i;s>c?z.fogDistanceScale.value=Math.min(c+e,s):z.fogDistanceScale.value=Math.max(c-e,s)}if(!a){r.current&&=(xi(t.quaternion),null);return}r.current=a,a.phase===`traveling`?Ei(a,t,i,n):Di(a,t,i)},e[0]=t,e[1]=n,e[2]=a):a=e[2],i(a),null}function ki(){Ae.getState().cancel()}function Ai(){let e=Ae.getState().animation;e&&(e.currentIndex>=e.targets.length-1?Ae.getState().cancel():Ae.getState().advanceTarget())}function ji(e){return e.scene}function Mi(e){return e.camera}var Ni=3;function $({map:e}){let t=nt,n=o(e=>e.gl.domElement),r=(0,K.useMemo)(()=>{let n=e.map(e=>{let t=Array.isArray(e.keys)?e.keys:[e.keys];return{name:e.name,bindings:t.map($e)}}),r={};for(let e of n)r[e.name]=it(e.bindings[0]);let i=new Map,a=[],o=[],s=[],c=[],l=[];for(let e of n)for(let t of e.bindings)switch(t.type){case`key`:{let n=i.get(t.code);n||(n=[],i.set(t.code,n)),n.push({action:e,binding:t});break}case`click`:a.push({action:e,binding:t});break;case`drag`:o.push({action:e,binding:t});break;case`pointerLockMove`:s.push({action:e});break;case`scroll`:c.push({action:e});break;case`touch`:l.push({action:e});break}function u(e){return e==null?!0:e===!!document.pointerLockElement}function d(e){let{actions:n}=t.getState(),r={};for(let[,t]of i)for(let{action:i,binding:a}of t){let t=e.has(a.code)&&at(e,a.modifiers),o=n[i.name]?.pressed??!1;t&&!o?(r[i.name]={pressed:!0},Je(i.name)):!t&&o&&(r[i.name]={pressed:!1})}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}let f=-1,p=0,m=0,h=!1;function g(e,n){t.setState(t=>({...t,actions:{...t.actions,[e]:n}}))}function _(e){let t=!!document.pointerLockElement;for(let{action:t,binding:n}of a){if(!u(n.whenPointerLocked))continue;let r=n.button??0;e.button===r&&qe(e,n.modifiers)&&g(t.name,{pressed:!0})}t||(f=e.button,p=e.clientX,m=e.clientY,h=!1)}function v(e){if(document.pointerLockElement){if(s.length>0){let{actions:n}=t.getState(),r={};for(let{action:t}of s){let i=n[t.name];r[t.name]={...i,deltaX:i.deltaX+e.movementX,deltaY:i.deltaY+e.movementY}}t.setState(e=>({...e,actions:{...e.actions,...r}}))}return}if(f<0)return;if(!h){let n=e.clientX-p,r=e.clientY-m;if(Math.abs(n)<Ni&&Math.abs(r)<Ni)return;h=!0;for(let{action:e,binding:n}of a)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].pressed&&g(e.name,{pressed:!1});for(let{action:e,binding:t}of o)u(t.whenPointerLocked)&&(t.button??0)===f&&g(e.name,{dragging:!0,deltaX:0,deltaY:0,startX:p,startY:m})}let{actions:n}=t.getState(),r={};for(let{action:t,binding:i}of o){if(!u(i.whenPointerLocked)||(i.button??0)!==f)continue;let a=n[t.name];r[t.name]={...a,deltaX:a.deltaX+e.movementX,deltaY:a.deltaY+e.movementY}}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}function y(e){let n=!!document.pointerLockElement;for(let{action:n,binding:r}of a){if(!u(r.whenPointerLocked))continue;let i=r.button??0;e.button===i&&t.getState().actions[n.name].pressed&&(Je(n.name),g(n.name,{pressed:!1}))}if(!n&&e.button===f){for(let{action:e,binding:n}of o)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].dragging&&g(e.name,tt());f=-1,h=!1}}function b(e){for(let{action:t}of c)g(t.name,{deltaX:e.deltaX,deltaY:e.deltaY}),Je(t.name)}let x=null,S=0,C=0;function w(e){if(x!==null||l.length===0)return;let t=e.changedTouches[0];if(t){x=t.identifier,S=t.clientX,C=t.clientY;for(let{action:e}of l)g(e.name,{touching:!0,dragging:!1,deltaX:0,deltaY:0})}}function T(e){if(x!==null)for(let n=0;n<e.changedTouches.length;n++){let r=e.changedTouches[n];if(r.identifier!==x)continue;let i=r.clientX-S,a=r.clientY-C;S=r.clientX,C=r.clientY;for(let{action:e}of l){let n=t.getState().actions[e.name];g(e.name,{touching:!0,dragging:!0,deltaX:n.deltaX+i,deltaY:n.deltaY+a})}break}}function E(e){if(x!==null){for(let t=0;t<e.changedTouches.length;t++)if(e.changedTouches[t].identifier===x){x=null;for(let{action:e}of l)g(e.name,Xe());break}}}return{actionNames:n.map(e=>e.name),initialActions:r,deriveKeyActions:d,hasKeyBindings:i.size>0,handleMouseDown:_,handleMouseMove:v,handleMouseUp:y,handleWheel:b,handleTouchStart:w,handleTouchMove:T,handleTouchEnd:E,hasMouseBindings:a.length>0||o.length>0||s.length>0,hasScrollBindings:c.length>0,hasTouchBindings:l.length>0}},[e,t]);return(0,K.useEffect)(()=>{t.setState(e=>({...e,actions:{...e.actions,...r.initialActions}}));let e;return r.hasKeyBindings&&(r.deriveKeyActions(t.getState().keys),e=t.subscribe(e=>e.keys,e=>r.deriveKeyActions(e))),r.hasMouseBindings&&(n.addEventListener(`mousedown`,r.handleMouseDown),document.addEventListener(`mousemove`,r.handleMouseMove),document.addEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.addEventListener(`wheel`,r.handleWheel,{passive:!0}),r.hasTouchBindings&&(n.addEventListener(`touchstart`,r.handleTouchStart,{passive:!0}),document.addEventListener(`touchmove`,r.handleTouchMove,{passive:!0}),document.addEventListener(`touchend`,r.handleTouchEnd,{passive:!0}),document.addEventListener(`touchcancel`,r.handleTouchEnd,{passive:!0})),()=>{e?.(),r.hasMouseBindings&&(n.removeEventListener(`mousedown`,r.handleMouseDown),document.removeEventListener(`mousemove`,r.handleMouseMove),document.removeEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.removeEventListener(`wheel`,r.handleWheel),r.hasTouchBindings&&(n.removeEventListener(`touchstart`,r.handleTouchStart),document.removeEventListener(`touchmove`,r.handleTouchMove),document.removeEventListener(`touchend`,r.handleTouchEnd),document.removeEventListener(`touchcancel`,r.handleTouchEnd)),t.setState(e=>{let t={...e.actions};for(let e of r.actionNames)delete t[e];return{...e,actions:t}})}},[r,t,n]),null}var Pi=[{name:`moveForward`,keys:[`KeyW`]},{name:`moveBackward`,keys:[`KeyS`]},{name:`moveLeft`,keys:[`KeyA`]},{name:`moveRight`,keys:[`KeyD`]},{name:`moveUp`,keys:[`KeyE`]},{name:`moveDown`,keys:[`KeyQ`]},{name:`adjustSpeed`,keys:[{type:`scroll`}]}],Fi=[{name:`lookUp`,keys:[`ArrowUp`]},{name:`lookDown`,keys:[`ArrowDown`]},{name:`lookLeft`,keys:[`ArrowLeft`]},{name:`lookRight`,keys:[`ArrowRight`]},{name:`dragLook`,keys:[{type:`drag`,button:0}]},{name:`lockedLook`,keys:[{type:`pointerLockMove`}]},{name:`touchLook`,keys:[{type:`touch`}]}],Ii=[{name:`canvasClick`,keys:[{type:`click`,button:0,whenPointerLocked:!1}]}],Li=[{name:`camera1`,keys:[`Digit1`]},{name:`camera2`,keys:[`Digit2`]},{name:`camera3`,keys:[`Digit3`]},{name:`camera4`,keys:[`Digit4`]},{name:`camera5`,keys:[`Digit5`]},{name:`camera6`,keys:[`Digit6`]},{name:`camera7`,keys:[`Digit7`]},{name:`camera8`,keys:[`Digit8`]},{name:`camera9`,keys:[`Digit9`]}],Ri=[{name:`playPause`,keys:[`Space`]},{name:`decreasePlaybackSpeed`,keys:[`Comma`,`Shift-Comma`]},{name:`increasePlaybackSpeed`,keys:[`Period`,`Shift-Period`]}],zi=[{name:`toggleObserverMode`,keys:[`Space`]}],Bi=[{name:`nextPlayer`,keys:[{type:`click`,button:0,whenPointerLocked:!0}]}],Vi=[{name:`nextStop`,keys:[{type:`click`,button:0}]},{name:`exitTour`,keys:[`Escape`]}];function Hi(){let e=(0,q.c)(27),t=Be(),n=et(),r=Oe(Ui),i=t?.source===`demo`,a=t?.source===`live`,o=!t,s=o&&!r||a&&n===`fly`,c=!r,l=!r,u;e[0]===s?u=e[1]:(u=s&&(0,J.jsx)($,{map:Pi}),e[0]=s,e[1]=u);let d;e[2]===c?d=e[3]:(d=c&&(0,J.jsx)($,{map:Fi}),e[2]=c,e[3]=d);let f;e[4]===l?f=e[5]:(f=l&&(0,J.jsx)($,{map:Ii}),e[4]=l,e[5]=f);let p;e[6]!==o||e[7]!==r?(p=o&&!r&&(0,J.jsx)($,{map:Li}),e[6]=o,e[7]=r,e[8]=p):p=e[8];let m;e[9]===i?m=e[10]:(m=i&&(0,J.jsx)($,{map:Ri}),e[9]=i,e[10]=m);let h;e[11]===a?h=e[12]:(h=a&&(0,J.jsx)($,{map:zi}),e[11]=a,e[12]=h);let g;e[13]!==n||e[14]!==a?(g=a&&n===`follow`&&(0,J.jsx)($,{map:Bi}),e[13]=n,e[14]=a,e[15]=g):g=e[15];let _;e[16]===r?_=e[17]:(_=r&&(0,J.jsx)($,{map:Vi}),e[16]=r,e[17]=_);let v;return e[18]!==u||e[19]!==d||e[20]!==f||e[21]!==p||e[22]!==m||e[23]!==h||e[24]!==g||e[25]!==_?(v=(0,J.jsxs)(J.Fragment,{children:[u,d,f,p,m,h,g,_]}),e[18]=u,e[19]=d,e[20]=f,e[21]=p,e[22]=m,e[23]=h,e[24]=g,e[25]=_,e[26]=v):v=e[26],v}function Ui(e){return e.animation!==null}function Wi(e,t){return(0,K.lazy)(()=>t().then(t=>({default:t[e]})))}var Gi=Wi(`StreamingController`,()=>W(()=>import(`./StreamingController-mmR1lAIE.js`),__vite__mapDeps([34,2,35,36,18,14,1,3,4,5,6,7,8,9,10,11,12,13,15,16,17,19,20,21,22,23,24,25,26,37,38,39,33,40,41]))),Ki=Wi(`DebugElements`,()=>W(()=>import(`./DebugElements-CrsrzkRa.js`),__vite__mapDeps([42,2,3,4,5,6,7,8,43]))),qi=Wi(`Mission`,()=>W(()=>import(`./Mission-RZOaitqM.js`),__vite__mapDeps([44,2,35,36,18,14,1,3,4,5,6,7,8,9,10,11,12,13,15,16,17,19,20,21,22,23,24,25,26,37,38,39,33,40,45]))),Ji=Wi(`ChatSoundPlayer`,()=>W(()=>import(`./ChatSoundPlayer-BuKG-RWU.js`),__vite__mapDeps([46,2,10,6,11,8,12,13,7,15,3,4,5,14,16,17,18,19,20]))),Yi=(0,K.memo)(function(e){let t=(0,q.c)(23),{dpr:n,onCreated:r,missionName:i,missionType:a,onLoadingChange:o}=e,s=Be(),c=We(),l=c===`demo`||c===`live`,u,d;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(u=(0,J.jsx)(Hi,{}),d=(0,J.jsx)(ot,{}),t[0]=u,t[1]=d):(u=t[0],d=t[1]);let f;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,J.jsx)(_t,{}),t[2]=f):f=t[2];let p,m;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(p=(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(pr,{})}),m=(0,J.jsx)(yr,{}),t[3]=p,t[4]=m):(p=t[3],m=t[4]);let h;t[5]===Symbol.for(`react.memo_cache_sentinel`)?(h=(0,J.jsx)(Jn,{children:(0,J.jsx)(Ji,{})}),t[5]=h):h=t[5];let g;t[6]===Symbol.for(`react.memo_cache_sentinel`)?(g=(0,J.jsx)(br,{children:(0,J.jsx)(Ki,{})}),t[6]=g):g=t[6];let _;t[7]===s?_=t[8]:(_=s?(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(Gi,{recording:s})}):null,t[7]=s,t[8]=_);let v;t[9]!==l||t[10]!==i||t[11]!==a||t[12]!==o?(v=l?null:(0,J.jsx)(K.Suspense,{children:(0,J.jsx)(qi,{name:i,missionType:a,onLoadingChange:o},`${i}~${a}`)}),t[9]=l,t[10]=i,t[11]=a,t[12]=o,t[13]=v):v=t[13];let y,b;t[14]===Symbol.for(`react.memo_cache_sentinel`)?(y=(0,J.jsx)(Oi,{}),b=(0,J.jsx)(Fr,{}),t[14]=y,t[15]=b):(y=t[14],b=t[15]);let x;t[16]!==_||t[17]!==v?(x=(0,J.jsx)(Et,{children:(0,J.jsxs)(Ye,{children:[u,d,(0,J.jsxs)(De,{children:[f,p,m,h,g,_,v,y,b]})]})}),t[16]=_,t[17]=v,t[18]=x):x=t[18];let S;return t[19]!==n||t[20]!==r||t[21]!==x?(S=(0,J.jsx)(Ct,{dpr:n,onCreated:r,children:x}),t[19]=n,t[20]=r,t[21]=x,t[22]=S):S=t[22],S});export{Yi as GameView};