const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PlayerModel-CxZbg1mL.js","assets/chunk-DECur_0Z.js","assets/index-BEehCpzM.js","assets/preload-helper-CnJ98jGT.js","assets/mission-yBcX4xit.js","assets/logger-CySD1nLn.js","assets/react-three-fiber.esm-B4ybsNEe.js","assets/jsx-runtime-BpGWiA-R.js","assets/three.module-DeDv86YO.js","assets/traditional-DPdbI9gv.js","assets/streamHelpers-DZp0O0LI.js","assets/SettingsProvider-BeB5OnG9.js","assets/engineStore-DXFfg1NG.js","assets/manifest-DDCwpSLV.js","assets/stringUtils-Bvtx11IK.js","assets/iconBase-DjT_EJem.js","assets/JoystickContext-BKqyiaNN.js","assets/scene-KKwVL-xq.js","assets/cameraTourStore-CfKPrs02.js","assets/index-BONY_dmA.css","assets/Html-BMPGAmIZ.js","assets/extends-C_PM0Yom.js","assets/useQuery-C-bcqv6a.js","assets/GenericShape-Disamruh.js","assets/AudioEmitter-Cdm9ofcT.js","assets/DebugBounds-DUxS5ppE.js","assets/AudioEmitter-DAQByNim.css","assets/playbackUtils-D5VkIMBR.js","assets/textureUtils-CPnadKO3.js","assets/useAnisotropy-D9b509fd.js","assets/DebugSuspense-DmIsfY-y.js","assets/ShapeErrorBoundary-BY2rpKOZ.js","assets/streamPlaybackStore-CGokDWAy.js","assets/PlayerModel-Bi7C0zGW.css","assets/ExplosionShape-Cg4WaJEo.js","assets/Projectiles-BCT2RoKl.js","assets/Texture-DuIJU_zO.js","assets/ForceFieldBare-fBoN9xbh.js","assets/AudioEmitter-BFJlCuJ2.js","assets/WaterBlock-ySBkT2CY.js","assets/StreamingController-DAyX4exD.js","assets/gameEntityTypes-CHmhN1q6.js","assets/DebugElements-Cxvdw7IG.js","assets/DebugElements-BP0b5jan.css","assets/Mission-B47ZUclM.js","assets/misToScene-CyIRZbyS.js","assets/ChatSoundPlayer-D2IMvzlM.js"])))=>i.map(i=>d[i]);
import{r as e}from"./chunk-DECur_0Z.js";import{n as t,r as n,t as r}from"./jsx-runtime-BpGWiA-R.js";import{a as i,o as a,s as o,t as s}from"./react-three-fiber.esm-B4ybsNEe.js";import{a as c,i as l}from"./SettingsProvider-BeB5OnG9.js";import{t as u}from"./useQuery-C-bcqv6a.js";import{n as d}from"./stringUtils-Bvtx11IK.js";import{a as f}from"./engineStore-DXFfg1NG.js";import{t as p}from"./logger-CySD1nLn.js";import{n as m,r as h,t as g}from"./cameraTourStore-CfKPrs02.js";import{S as _,t as v}from"./streamHelpers-DZp0O0LI.js";import{A as y,C as b,Ct as x,D as S,Dt as C,Ht as w,Kt as T,N as E,Ot as D,S as O,Ut as k,Wt as A,_ as j,b as M,f as N,h as P,j as F,jt as I,k as L,kt as ee,m as te,q as R,rt as ne,ut as z,v as re,w as ie}from"./three.module-DeDv86YO.js";import{n as ae,r as oe,t as se}from"./scene-KKwVL-xq.js";import"./mission-yBcX4xit.js";import{t as B}from"./preload-helper-CnJ98jGT.js";import{t as ce}from"./extends-C_PM0Yom.js";import{t as le}from"./Html-BMPGAmIZ.js";import{t as ue}from"./Texture-DuIJU_zO.js";import{$ as de,A as fe,C as pe,D as me,G as V,K as he,O as ge,Q as _e,S as H,U as ve,V as ye,W as be,X as xe,Y as Se,_ as Ce,b as we,f as Te,g as Ee,h as De,j as Oe,m as ke,o as Ae,p as U,q as je,s as Me,t as Ne,u as Pe,v as Fe,w as Ie,x as Le,y as Re}from"./index-BEehCpzM.js";import{n as ze,t as Be}from"./DebugBounds-DUxS5ppE.js";import{f as Ve,u as He}from"./AudioEmitter-Cdm9ofcT.js";import{a as Ue,c as We,r as Ge,t as Ke}from"./GenericShape-Disamruh.js";import{S as qe,b as Je,o as Ye,v as Xe,x as Ze}from"./playbackUtils-D5VkIMBR.js";import{a as W,c as Qe,d as $e,i as et,o as tt,r as nt,s as rt,t as it,u as at}from"./textureUtils-CPnadKO3.js";import{t as ot}from"./useAnisotropy-D9b509fd.js";import{n as st}from"./streamPlaybackStore-CGokDWAy.js";import{t as ct}from"./DebugSuspense-DmIsfY-y.js";import{t as lt}from"./gameEntityTypes-CHmhN1q6.js";import{t as ut}from"./ShapeErrorBoundary-BY2rpKOZ.js";var G=e(n());function dt(e,t,n){let r=o(e=>e.size),i=o(e=>e.viewport),a=typeof e==`number`?e:r.width*i.dpr,s=typeof t==`number`?t:r.height*i.dpr,c=(typeof e==`number`?n:e)||{},{samples:l=0,depth:u,...d}=c,f=u??c.depthBuffer,p=G.useMemo(()=>{let e=new T(a,s,{minFilter:R,magFilter:R,type:E,...d});return f&&(e.depthTexture=new ie(a,s,y)),e.samples=l,e},[]);return G.useLayoutEffect(()=>{p.setSize(a,s),l&&(p.samples=l)},[l,p,a,s]),G.useEffect(()=>()=>p.dispose(),[]),p}var ft=e=>typeof e==`function`,pt=G.forwardRef(({envMap:e,resolution:t=256,frames:n=1/0,makeDefault:r,children:a,...s},c)=>{let l=o(({set:e})=>e),u=o(({camera:e})=>e),d=o(({size:e})=>e),f=G.useRef(null);G.useImperativeHandle(c,()=>f.current,[]);let p=G.useRef(null),m=dt(t);G.useLayoutEffect(()=>{s.manual||(f.current.aspect=d.width/d.height)},[d,s]),G.useLayoutEffect(()=>{f.current.updateProjectionMatrix()});let h=0,g=null,_=ft(a);return i(t=>{_&&(n===1/0||h<n)&&(p.current.visible=!1,t.gl.setRenderTarget(m),g=t.scene.background,e&&(t.scene.background=e),t.gl.render(t.scene,f.current),t.scene.background=g,t.gl.setRenderTarget(null),p.current.visible=!0,h++)}),G.useLayoutEffect(()=>{if(r){let e=u;return l(()=>({camera:f.current})),()=>l(()=>({camera:e}))}},[f,r,l]),G.createElement(G.Fragment,null,G.createElement(`perspectiveCamera`,ce({ref:f},s),!_&&a),G.createElement(`group`,{ref:p},_&&a(m.texture)))});function mt(e,{path:t}){let[n]=a(O,[e],e=>e.setPath(t));return n}mt.preload=(e,{path:t})=>a.preload(O,[e],e=>e.setPath(t));var K=t(),ht={sunLightPointsDown:{value:!0}};function gt(e){ht.sunLightPointsDown.value=e}var q=r(),_t=p(`SceneLighting`);function vt(){let e=(0,K.c)(6),t=xe(),n,r;if(e[0]===t?(n=e[1],r=e[2]):(n=()=>{t?_t.debug(`sunData: dir=(%s, %s, %s) color=(%s, %s, %s) ambient=(%s, %s, %s)`,t.direction.x.toFixed(3),t.direction.y.toFixed(3),t.direction.z.toFixed(3),t.color.r.toFixed(3),t.color.g.toFixed(3),t.color.b.toFixed(3),t.ambient.r.toFixed(3),t.ambient.g.toFixed(3),t.ambient.b.toFixed(3)):_t.debug(`No sunData — using fallback ambient #888`)},r=[t],e[0]=t,e[1]=n,e[2]=r),(0,G.useEffect)(n,r),!t){let t;return e[3]===Symbol.for(`react.memo_cache_sentinel`)?(t=(0,q.jsx)(`ambientLight`,{color:`#888888`,intensity:1}),e[3]=t):t=e[3],t}let i;return e[4]===t?i=e[5]:(i=(0,q.jsx)(yt,{sunData:t}),e[4]=t,e[5]=i),i}function yt(e){let t=(0,K.c)(29),{sunData:n}=e,r;t[0]===n.direction?r=t[1]:(r=oe(n.direction),t[0]=n.direction,t[1]=r);let[i,a,o]=r,s=Math.sqrt(i*i+a*a+o*o),c=i/s,l=a/s,u=o/s,d;t[2]!==c||t[3]!==l||t[4]!==u?(d=new A(c,l,u),t[2]=c,t[3]=l,t[4]=u,t[5]=d):d=t[5];let f=d,p=-f.x*5e3,m=-f.y*5e3,h=-f.z*5e3,g;t[6]!==p||t[7]!==m||t[8]!==h?(g=new A(p,m,h),t[6]=p,t[7]=m,t[8]=h,t[9]=g):g=t[9];let _=g,v;t[10]!==n.color.b||t[11]!==n.color.g||t[12]!==n.color.r?(v=new M(n.color.r,n.color.g,n.color.b),t[10]=n.color.b,t[11]=n.color.g,t[12]=n.color.r,t[13]=v):v=t[13];let y=v,b;t[14]!==n.ambient.b||t[15]!==n.ambient.g||t[16]!==n.ambient.r?(b=new M(n.ambient.r,n.ambient.g,n.ambient.b),t[14]=n.ambient.b,t[15]=n.ambient.g,t[16]=n.ambient.r,t[17]=b):b=t[17];let x=b,S=f.y<0,C,w;t[18]===S?(C=t[19],w=t[20]):(C=()=>{gt(S)},w=[S],t[18]=S,t[19]=C,t[20]=w),(0,G.useEffect)(C,w);let T;t[21]!==y||t[22]!==_?(T=(0,q.jsx)(`directionalLight`,{position:_,color:y,intensity:1,castShadow:!0,"shadow-mapSize-width":8192,"shadow-mapSize-height":8192,"shadow-camera-left":-4096,"shadow-camera-right":4096,"shadow-camera-top":4096,"shadow-camera-bottom":-4096,"shadow-camera-near":100,"shadow-camera-far":12e3,"shadow-bias":-1e-5,"shadow-normalBias":.4,"shadow-radius":2}),t[21]=y,t[22]=_,t[23]=T):T=t[23];let E;t[24]===x?E=t[25]:(E=(0,q.jsx)(`ambientLight`,{color:x,intensity:1}),t[24]=x,t[25]=E);let D;return t[26]!==T||t[27]!==E?(D=(0,q.jsxs)(q.Fragment,{children:[T,E]}),t[26]=T,t[27]=E,t[28]=D):D=t[28],D}function bt(){let e=(0,K.c)(4),{fpsLimit:t}=c(),n=o(xt),r,i;return e[0]!==t||e[1]!==n?(r=()=>{if(t==null)return;let e=1e3/t,r=0,i;function a(t){i=requestAnimationFrame(a),t-r>=e&&(r=t-(t-r)%e,n())}return i=requestAnimationFrame(a),()=>cancelAnimationFrame(i)},i=[t,n],e[0]=t,e[1]=n,e[2]=r,e[3]=i):(r=e[2],i=e[3]),(0,G.useEffect)(r,i),t}function xt(e){return e.invalidate}function St(){return bt(),null}var Ct={toneMapping:0,outputColorSpace:ee};function wt(e){let t=(0,K.c)(11),{children:n,renderOnDemand:r,dpr:i,onCreated:a}=e,o=r===void 0?!1:r,{renderOnDemand:u}=l(),d=o||u,{fpsLimit:f}=c(),p=f!=null&&!d,m=d||p?`demand`:`always`,h;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(h={type:1},t[0]=h):h=t[0];let g;t[1]===n?g=t[2]:(g=(0,q.jsx)(G.Suspense,{children:n}),t[1]=n,t[2]=g);let _;t[3]===p?_=t[4]:(_=p?(0,q.jsx)(St,{}):null,t[3]=p,t[4]=_);let v;return t[5]!==i||t[6]!==a||t[7]!==m||t[8]!==g||t[9]!==_?(v=(0,q.jsxs)(s,{frameloop:m,dpr:i,gl:Ct,shadows:h,onCreated:a,children:[g,_]}),t[5]=i,t[6]=a,t[7]=m,t[8]=g,t[9]=_,t[10]=v):v=t[10],v}var Tt=1/32,Et=(0,G.createContext)(null);function Dt({children:e}){let t=(0,G.useRef)(void 0),n=(0,G.useRef)(0),r=(0,G.useRef)(0);i((e,i)=>{for(n.current+=i;n.current>=Tt;)if(n.current-=Tt,r.current++,t.current)for(let e of t.current)e(r.current)});let a=(0,G.useCallback)(e=>(t.current??=new Set,t.current.add(e),()=>{t.current.delete(e)}),[]),o=(0,G.useCallback)(()=>r.current,[]),s=(0,G.useCallback)(()=>n.current/Tt,[]),c=(0,G.useMemo)(()=>({subscribe:a,getTick:o,getTickFraction:s}),[a,o,s]);return(0,q.jsx)(Et.Provider,{value:c,children:e})}function Ot(e){let t=(0,K.c)(5),n=(0,G.useContext)(Et);if(!n)throw Error(`useTick must be used within a TickProvider`);let r=(0,G.useEffectEvent)(e),i;t[0]!==n||t[1]!==r?(i=()=>n.subscribe(r),t[0]=n,t[1]=r,t[2]=i):i=t[2];let a;t[3]===n?a=t[4]:(a=[n],t[3]=n,t[4]=a),(0,G.useEffect)(i,a)}function kt(){let e=(0,G.useContext)(Et);if(!e)throw Error(`useGetTickFraction must be used within a TickProvider`);return e.getTickFraction}function At(e){let t=(0,K.c)(14),{entity:n}=e,{registerCamera:r,unregisterCamera:i}=Oe(),a=(0,G.useId)(),o=n.cameraDataBlock,s;t[0]===n.position?s=t[1]:(s=n.position?new A(...n.position):new A,t[0]=n.position,t[1]=s);let c=s,l;t[2]===n.rotation?l=t[3]:(l=n.rotation?new x(...n.rotation):new x,t[2]=n.rotation,t[3]=l);let u=l,d,f;t[4]!==o||t[5]!==a||t[6]!==c||t[7]!==r||t[8]!==u||t[9]!==i?(d=()=>{if(o===`Observer`){let e={id:a,position:c,rotation:u};return r(e),()=>{i(e)}}},f=[a,o,r,i,c,u],t[4]=o,t[5]=a,t[6]=c,t[7]=r,t[8]=u,t[9]=i,t[10]=d,t[11]=f):(d=t[10],f=t[11]),(0,G.useEffect)(d,f);let p=h(n.id),m;return t[12]===p?m=t[13]:(m=p?(0,q.jsx)(ze,{radius:1.5}):null,t[12]=p,t[13]=m),m}function jt(e){let t=(0,K.c)(7),{entity:n}=e,r=h(n.id),i;t[0]===n.label?i=t[1]:(i=n.label?(0,q.jsx)(He,{opacity:.6,children:n.label}):null,t[0]=n.label,t[1]=i);let a;t[2]===r?a=t[3]:(a=r&&(0,q.jsx)(ze,{radius:1.5}),t[2]=r,t[3]=a);let o;return t[4]!==i||t[5]!==a?(o=(0,q.jsxs)(q.Fragment,{children:[i,a]}),t[4]=i,t[5]=a,t[6]=o):o=t[6],o}function Mt(e){let t=new Float32Array(e.length);for(let n=0;n<e.length;n++)t[n]=e[n]/65535;return t}var Nt=256,Pt=512,Ft=64,It=150,Lt=`
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
`;function Rt({shader:e,baseTextures:t,alphaTextures:n,visibilityMask:r,tiling:i,detailTexture:a=null,lightmap:o=null}){e.uniforms.sunLightPointsDown=ht.sunLightPointsDown;let s=t.length;if(t.forEach((t,n)=>{e.uniforms[`albedo${n}`]={value:t}}),n.forEach((t,n)=>{e.uniforms[`mask${n}`]={value:t}}),r&&(e.uniforms.visibilityMask={value:r}),t.forEach((t,n)=>{e.uniforms[`tiling${n}`]={value:i[n]??32}}),o&&(e.uniforms.terrainLightmap={value:o}),a&&(e.uniforms.detailTexture={value:a},e.uniforms.detailTiling={value:Ft},e.uniforms.detailFadeDistance={value:It},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
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

${Lt}

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
  vec2 alphaUv = baseUv + vec2(0.5 / ${Nt}.0);
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
  vec2 lightmapUv = vMapUv + vec2(0.5 / ${Pt}.0);
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

#include <tonemapping_fragment>`)}var zt={0:32,1:32,2:32,3:32,4:32,5:32},Bt=(0,G.memo)(function({displacementMap:e,visibilityMask:t,textureNames:n,alphaTextures:r,detailTextureName:i,lightmap:a}){let{debugMode:o}=l(),s=ot(),c=ue(n.map(e=>Te(e)),e=>{e.forEach(e=>et(e,{anisotropy:s}))}),u=i?U(i):null,d=ue(u??Ne,e=>{et(e,{anisotropy:s})}),f=(0,G.useCallback)(e=>{Rt({shader:e,baseTextures:c,alphaTextures:r,visibilityMask:t,tiling:zt,detailTexture:u?d:null,lightmap:a}),at(e,W)},[c,r,t,d,u,a]),p=(0,G.useMemo)(()=>[n.join(`,`),u??`none`,a?a.id:`nolm`,c.map(e=>e.id).join(`,`)].join(`|`),[n,u,a,c]),m=(0,G.useRef)(null);return(0,G.useEffect)(()=>{let e=m.current;e&&(e.defines??={},e.defines.DEBUG_MODE=o?1:0,e.needsUpdate=!0)},[o]),(0,G.useEffect)(()=>{let e=m.current;e&&(e.customProgramCacheKey=()=>p,e.needsUpdate=!0)},[p]),(0,q.jsx)(`meshLambertMaterial`,{ref:m,map:e,depthWrite:!0,side:0,defines:{DEBUG_MODE:o?1:0},onBeforeCompile:f},`${u?`detail`:`nodetail`}-${a?`lightmap`:`nolightmap`}`)}),Vt=(0,G.memo)(function(e){let t=(0,K.c)(8),{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s}=e,c;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(c=(0,q.jsx)(`meshLambertMaterial`,{color:`rgb(0, 109, 56)`,wireframe:!0}),t[0]=c):c=t[0];let l;return t[1]!==a||t[2]!==o||t[3]!==n||t[4]!==s||t[5]!==i||t[6]!==r?(l=(0,q.jsx)(G.Suspense,{fallback:c,children:(0,q.jsx)(Bt,{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s})}),t[1]=a,t[2]=o,t[3]=n,t[4]=s,t[5]=i,t[6]=r,t[7]=l):l=t[7],l}),Ht=(0,G.memo)(function(e){let t=(0,K.c)(15),{tileX:n,tileZ:r,blockSize:i,basePosition:a,textureNames:o,geometry:s,displacementMap:c,visibilityMask:l,alphaTextures:u,detailTextureName:d,lightmap:f,visible:p}=e,m=p===void 0?!0:p,h=i/2,g=a.x+n*i+h,_=a.z+r*i+h,v;t[0]!==g||t[1]!==_?(v=[g,0,_],t[0]=g,t[1]=_,t[2]=v):v=t[2];let y=v,b;t[3]!==u||t[4]!==d||t[5]!==c||t[6]!==f||t[7]!==o||t[8]!==l?(b=(0,q.jsx)(Vt,{displacementMap:c,visibilityMask:l,textureNames:o,alphaTextures:u,detailTextureName:d,lightmap:f}),t[3]=u,t[4]=d,t[5]=c,t[6]=f,t[7]=o,t[8]=l,t[9]=b):b=t[9];let x;return t[10]!==s||t[11]!==y||t[12]!==b||t[13]!==m?(x=(0,q.jsx)(`mesh`,{position:y,geometry:s,castShadow:!0,receiveShadow:!0,visible:m,children:b}),t[10]=s,t[11]=y,t[12]=b,t[13]=m,t[14]=x):x=t[14],x}),Ut=p(`TerrainBlock`),Wt=8,Gt=600,J=256,Kt=512,Y=2048;function qt(e,t){let n=new P,r=(t+1)*(t+1),i=new Float32Array(r*3),a=new Float32Array(r*3),o=new Float32Array(r*2),s=t*t*6,c=new Uint32Array(s),l=0,u=e/t;for(let n=0;n<=t;n++)for(let r=0;r<=t;r++){let s=n*(t+1)+r;i[s*3]=r*u-e/2,i[s*3+1]=e/2-n*u,i[s*3+2]=0,a[s*3]=0,a[s*3+1]=0,a[s*3+2]=1,o[s*2]=r/t,o[s*2+1]=1-n/t}for(let e=0;e<t;e++)for(let n=0;n<t;n++){let r=e*(t+1)+n,i=r+1,a=(e+1)*(t+1)+n,o=a+1;(n^e)&1?(c[l++]=r,c[l++]=a,c[l++]=i,c[l++]=i,c[l++]=a,c[l++]=o):(c[l++]=r,c[l++]=a,c[l++]=o,c[l++]=r,c[l++]=o,c[l++]=i)}return n.setIndex(new te(c,1)),n.setAttribute(`position`,new L(i,3)),n.setAttribute(`normal`,new L(a,3)),n.setAttribute(`uv`,new L(o,2)),n.rotateX(-Math.PI/2),n.rotateY(-Math.PI/2),n}function Jt(e,t,n){let r=e.attributes.position,i=e.attributes.uv,a=e.attributes.normal,o=r.array,s=i.array,c=a.array,l=r.count,u=(e,n)=>(e=Math.max(0,Math.min(J-1,e)),n=Math.max(0,Math.min(J-1,n)),t[n*J+e]/65535*Y),d=(e,n)=>{e=Math.max(0,Math.min(J-1,e)),n=Math.max(0,Math.min(J-1,n));let r=Math.floor(e),i=Math.floor(n),a=Math.min(r+1,J-1),o=Math.min(i+1,J-1),s=e-r,c=n-i,l=t[i*J+r]/65535*Y,u=t[i*J+a]/65535*Y,d=t[o*J+r]/65535*Y,f=t[o*J+a]/65535*Y,p=l*(1-s)+u*s,m=d*(1-s)+f*s;return p*(1-c)+m*c};for(let e=0;e<l;e++){let t=s[e*2],r=s[e*2+1],i=u(Math.floor(t*J)&J-1,Math.floor(r*J)&J-1);o[e*3+1]=i;let a=t*(J-1),l=r*(J-1),f=d(a-1,l),p=d(a+1,l),m=d(a,l+1),h=d(a,l-1),g=(p-f)/2,_=(m-h)/2,v=n,y=g,b=Math.sqrt(_*_+v*v+y*y);b>0?(_/=b,v/=b,y/=b):(_=0,v=1,y=0),c[e*3]=_,c[e*3+1]=v,c[e*3+2]=y}r.needsUpdate=!0,a.needsUpdate=!0}function Yt(e,t,n,r,i,a){let o=r.z/i,s=r.x/i,c=r.y,l=Math.sqrt(o*o+s*s);if(l<1e-4)return 1;let u=.5/l,d=o*u,f=s*u,p=c*u,m=e,h=t,g=n+.1,_=J*3;for(let e=0;e<_;e++){if(m+=d,h+=f,g+=p,m<0||m>=J||h<0||h>=J||g>Y)return 1;let e=a(m,h);if(g<e)return 0}return 1}function Xt(e,t,n){let r=(t,n)=>{let r=Math.max(0,Math.min(J-1,t)),i=Math.max(0,Math.min(J-1,n)),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,J-1),c=Math.min(o+1,J-1),l=r-a,u=i-o,d=e[o*J+a]/65535,f=e[o*J+s]/65535,p=e[c*J+a]/65535,m=e[c*J+s]/65535,h=d*(1-l)+f*l,g=p*(1-l)+m*l;return(h*(1-u)+g*u)*Y},i=new A(-t.x,-t.y,-t.z).normalize(),a=new Uint8Array(Kt*Kt),o=.5;for(let e=0;e<Kt;e++)for(let t=0;t<Kt;t++){let s=t/2+.25,c=e/2+.25,l=r(s,c),u=r(s-o,c),d=r(s+o,c),f=r(s,c-o),p=r(s,c+o),m=(d-u)/(2*o),h=-((p-f)/(2*o)),g=n,_=-m,v=Math.sqrt(h*h+g*g+_*_),y=Math.max(0,h/v*i.x+g/v*i.y+_/v*i.z),b=1;y>0&&(b=Yt(s,c,l,i,n,r)),a[e*Kt+t]=Math.floor(y*b*255)}let s=new b(a,Kt,Kt,C,w);return s.colorSpace=``,s.generateMipmaps=!0,s.wrapS=re,s.wrapT=re,s.magFilter=R,s.minFilter=R,s.needsUpdate=!0,s}function Zt(e){let t=(0,K.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`terrain`,e],queryFn:()=>(Ut.debug(`Loading terrain: %s`,e),Pe(e))},t[0]=e,t[1]=n);let r=u(n),i,a;return t[2]!==r.data||t[3]!==r.error||t[4]!==r.status||t[5]!==e?(i=()=>{Ut.debug(`Query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (data ready)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=r.data,t[3]=r.error,t[4]=r.status,t[5]=e,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,G.useEffect)(i,a),r}function Qt(){let e=Se();return e&&e.visibleDistance>0?e.visibleDistance:Gt}function $t(e){let t=new Uint8Array(J*J);t.fill(255);for(let n of e){let e=n&255,r=n>>8&255,i=n>>16,a=r*J;for(let n=0;n<i;n++){let r=a+e+n;r<t.length&&(t[r]=0)}}let n=new b(t,J,J,C,w);return n.colorSpace=``,n.wrapS=n.wrapT=re,n.magFilter=z,n.minFilter=z,n.needsUpdate=!0,n}var en=(0,G.memo)(function(e){let t=(0,K.c)(68),{entity:n}=e,r=n.terrainData,a=h(n.id),s=r.terrFileName,c=r.squareSize||Wt,l=r.detailTextureName||void 0,u=c*256,d=Qt(),f=o(nn),p=-c*(J/2),m;t[0]===p?m=t[1]:(m={x:p,z:p},t[0]=p,t[1]=m);let g=m,_;t[2]===r.emptySquareRuns?_=t[3]:(_=r.emptySquareRuns??[],t[2]=r.emptySquareRuns,t[3]=_);let v=_,{data:x}=Zt(s),S;bb0:{if(!x){S=null;break bb0}let e=c*256,n;t[4]!==e||t[5]!==c||t[6]!==x.heightMap?(n=qt(e,J),Jt(n,x.heightMap,c),t[4]=e,t[5]=c,t[6]=x.heightMap,t[7]=n):n=t[7],S=n}let w=S,T,E;t[8]!==c||t[9]!==x?(T=()=>{if(x)return de(_e(x.heightMap,c)),rn},E=[x,c],t[8]=c,t[9]=x,t[10]=T,t[11]=E):(T=t[10],E=t[11]),(0,G.useEffect)(T,E);let O=xe(),k;bb1:{if(!O){let e;t[12]===Symbol.for(`react.memo_cache_sentinel`)?(e=new A(.57735,-.57735,.57735),t[12]=e):e=t[12],k=e;break bb1}let e;t[13]===O.direction?e=t[14]:(e=oe(O.direction),t[13]=O.direction,t[14]=e);let[n,r,i]=e,a=Math.sqrt(n*n+r*r+i*i),o=n/a,s=r/a,c=i/a,l;t[15]!==c||t[16]!==o||t[17]!==s?(l=new A(o,s,c),t[15]=c,t[16]=o,t[17]=s,t[18]=l):l=t[18],k=l}let j=k,M;bb2:{if(!x){M=null;break bb2}let e;t[19]!==c||t[20]!==j||t[21]!==x.heightMap?(e=Xt(x.heightMap,j,c),t[19]=c,t[20]=j,t[21]=x.heightMap,t[22]=e):e=t[22],M=e}let N=M,P;bb3:{if(!x){P=null;break bb3}let e;t[23]===x.heightMap?e=t[24]:(e=new b(Mt(x.heightMap),J,J,C,y),e.colorSpace=``,e.generateMipmaps=!1,e.wrapS=D,e.wrapT=D,e.needsUpdate=!0,t[23]=x.heightMap,t[24]=e),P=e}let F=P,I;t[25]===v?I=t[26]:(I=$t(v),t[25]=v,t[26]=I);let L=I,ee;t[27]===Symbol.for(`react.memo_cache_sentinel`)?(ee=$t([]),t[27]=ee):ee=t[27];let te=ee,R;bb4:{if(!x){R=null;break bb4}let e;t[28]===x.alphaMaps?e=t[29]:(e=x.alphaMaps.map(an),t[28]=x.alphaMaps,t[29]=e),R=e}let z=R,re=2*Math.ceil(d/u)+1,ie=re*re-1,ae=(0,G.useRef)(null),se;t[30]===Symbol.for(`react.memo_cache_sentinel`)?(se=new ne,t[30]=se):se=t[30];let B=se,ce;t[31]===Symbol.for(`react.memo_cache_sentinel`)?(ce={xStart:1/0,xEnd:-1/0,zStart:1/0,zEnd:-1/0},t[31]=ce):ce=t[31];let le=(0,G.useRef)(ce),ue=(0,G.useRef)(null),fe;if(t[32]!==g||t[33]!==u||t[34]!==f||t[35]!==d?(fe=()=>{let e=ae.current;if(!e)return;let t=f.position.x-g.x,n=f.position.z-g.z,r=Math.floor((t-d)/u),i=Math.ceil((t+d)/u),a=Math.floor((n-d)/u),o=Math.ceil((n+d)/u),s=le.current;if(e===ue.current&&r===s.xStart&&i===s.xEnd&&a===s.zStart&&o===s.zEnd)return;ue.current=e,s.xStart=r,s.xEnd=i,s.zStart=a,s.zEnd=o;let c=u/2,l=0;for(let t=r;t<i;t++)for(let n=a;n<o;n++)t===0&&n===0||(B.makeTranslation(g.x+t*u+c,0,g.z+n*u+c),e.setMatrixAt(l,B),l++);e.count=l,e.instanceMatrix.needsUpdate=!0},t[32]=g,t[33]=u,t[34]=f,t[35]=d,t[36]=fe):fe=t[36],i(fe),!x||!w||!F||!z)return Ut.debug(`Not ready: terrain=%s geometry=%s displacement=%s alpha=%s`,!!x,!!w,!!F,!!z),null;let pe=N??void 0,me;t[37]!==g||t[38]!==u||t[39]!==l||t[40]!==L||t[41]!==z||t[42]!==F||t[43]!==w||t[44]!==pe||t[45]!==x.textureNames?(me=(0,q.jsx)(Ht,{tileX:0,tileZ:0,blockSize:u,basePosition:g,textureNames:x.textureNames,geometry:w,displacementMap:F,visibilityMask:L,alphaTextures:z,detailTextureName:l,lightmap:pe}),t[37]=g,t[38]=u,t[39]=l,t[40]=L,t[41]=z,t[42]=F,t[43]=w,t[44]=pe,t[45]=x.textureNames,t[46]=me):me=t[46];let V;t[47]!==ie||t[48]!==w?(V=[w,void 0,ie],t[47]=ie,t[48]=w,t[49]=V):V=t[49];let he=N??void 0,ge;t[50]!==l||t[51]!==z||t[52]!==F||t[53]!==he||t[54]!==x.textureNames?(ge=(0,q.jsx)(Vt,{displacementMap:F,visibilityMask:te,textureNames:x.textureNames,alphaTextures:z,detailTextureName:l,lightmap:he}),t[50]=l,t[51]=z,t[52]=F,t[53]=he,t[54]=x.textureNames,t[55]=ge):ge=t[55];let H;t[56]!==V||t[57]!==ge?(H=(0,q.jsx)(`instancedMesh`,{ref:ae,args:V,castShadow:!0,receiveShadow:!0,frustumCulled:!1,children:ge}),t[56]=V,t[57]=ge,t[58]=H):H=t[58];let ve;t[59]!==g||t[60]!==u||t[61]!==a||t[62]!==x?(ve=a&&x&&(0,q.jsx)(tn,{heightMap:x.heightMap,blockSize:u,basePosition:g}),t[59]=g,t[60]=u,t[61]=a,t[62]=x,t[63]=ve):ve=t[63];let ye;return t[64]!==me||t[65]!==H||t[66]!==ve?(ye=(0,q.jsxs)(q.Fragment,{children:[me,H,ve]}),t[64]=me,t[65]=H,t[66]=ve,t[67]=ye):ye=t[67],ye});function tn(e){let t=(0,K.c)(15),{heightMap:n,blockSize:r,basePosition:i}=e,a=0;for(let e=0;e<n.length;e++){let t=n[e]/65535*Y;t>a&&(a=t)}let o=i.x+r/2,s=a/2,c=i.z+r/2,l;t[0]!==o||t[1]!==s||t[2]!==c?(l=[o,s,c],t[0]=o,t[1]=s,t[2]=c,t[3]=l):l=t[3];let u=l,d;t[4]!==r||t[5]!==a?(d=[r,a,r],t[4]=r,t[5]=a,t[6]=d):d=t[6];let f=d,p;t[7]!==u||t[8]!==f?(p={center:u,size:f},t[7]=u,t[8]=f,t[9]=p):p=t[9];let m=p,h;t[10]===m.size?h=t[11]:(h=(0,q.jsx)(Be,{size:m.size}),t[10]=m.size,t[11]=h);let g;return t[12]!==m.center||t[13]!==h?(g=(0,q.jsx)(`group`,{position:m.center,children:h}),t[12]=m.center,t[13]=h,t[14]=g):g=t[14],g}function nn(e){return e.camera}function rn(){return de(null)}function an(e){return nt(e)}var on=`
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
`;function sn(e,t){let n=t.surfaceOutsideVisible??!1;e.uniforms.useSceneLighting={value:n},e.uniforms.interiorDebugColor={value:n?new A(0,.4,1):new A(1,.2,0)},e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
${on}
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

#include <tonemapping_fragment>`)}var cn=p(`InteriorInstance`);function ln(e){let t=(0,K.c)(2),n;return t[0]===e?n=t[1]:(n=Ae(e),t[0]=e,t[1]=n),ke(n)}function un({materialName:e,material:t,lightMap:n}){let r=l()?.debugMode??!1,i=ot(),a=ue(U(e),e=>et(e,{anisotropy:i})),o=new Set(t?.userData?.flag_names??[]).has(`SelfIlluminating`),s=new Set(t?.userData?.surface_flag_names??[]).has(`SurfaceOutsideVisible`),c=(0,G.useCallback)(e=>{at(e,W),sn(e,{surfaceOutsideVisible:s})},[s]),u=(0,G.useRef)(null),d=(0,G.useRef)(null);(0,G.useEffect)(()=>{let e=u.current??d.current;e&&(e.defines??={},e.defines.DEBUG_MODE=r?1:0,e.needsUpdate=!0)},[r]);let f={DEBUG_MODE:r?1:0},p=`${s}`;return o?(0,q.jsx)(`meshBasicMaterial`,{ref:u,map:a,toneMapped:!1,defines:f,onBeforeCompile:c},p):(0,q.jsx)(`meshLambertMaterial`,{ref:d,map:a,lightMap:n,toneMapped:!1,defines:f,onBeforeCompile:c},p)}function dn(e){if(!e)return null;let t=e.emissiveMap;return t&&(t.colorSpace=ee),t??null}function fn(e){let t=(0,K.c)(13),{node:n}=e,r;bb0:{if(!n.material){let e;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[0]=e):e=t[0],r=e;break bb0}if(Array.isArray(n.material)){let e;t[1]===n.material?e=t[2]:(e=n.material.map(pn),t[1]=n.material,t[2]=e),r=e;break bb0}let e;t[3]===n.material?e=t[4]:(e=dn(n.material),t[3]=n.material,t[4]=e);let i;t[5]===e?i=t[6]:(i=[e],t[5]=e,t[6]=i),r=i}let i=r,a;t[7]!==i||t[8]!==n.material?(a=n.material?(0,q.jsx)(ct,{name:`InteriorTexture:${Array.isArray(n.material)?n.material[0]?.userData?.resource_path:n.material?.userData?.resource_path??`?`}`,fallback:(0,q.jsx)(`meshStandardMaterial`,{color:`yellow`,wireframe:!0}),children:Array.isArray(n.material)?n.material.map((e,t)=>(0,q.jsx)(un,{materialName:e.userData.resource_path,material:e,lightMap:i[t]},t)):(0,q.jsx)(un,{materialName:n.material.userData.resource_path,material:n.material,lightMap:i[0]})}):null,t[7]=i,t[8]=n.material,t[9]=a):a=t[9];let o;return t[10]!==n.geometry||t[11]!==a?(o=(0,q.jsx)(`mesh`,{geometry:n.geometry,castShadow:!0,receiveShadow:!0,children:a}),t[10]=n.geometry,t[11]=a,t[12]=o):o=t[12],o}function pn(e){return dn(e)}var mn=(0,G.memo)(function(e){let t=(0,K.c)(27),{interiorFile:n,ghostIndex:r,isTarget:i}=e,a=ln(n),{nodes:o}=a,s=l()?.debugMode??!1,c;bb0:{if(!i){c=null;break bb0}let e,n;if(t[0]!==a.scene){let r=new N().setFromObject(a.scene);e=new A,n=new A,r.getCenter(e),r.getSize(n),t[0]=a.scene,t[1]=e,t[2]=n}else e=t[1],n=t[2];let r;t[3]!==e.x||t[4]!==e.y||t[5]!==e.z?(r=[e.x,e.y,e.z],t[3]=e.x,t[4]=e.y,t[5]=e.z,t[6]=r):r=t[6];let o=r,s;t[7]!==n.x||t[8]!==n.y||t[9]!==n.z?(s=[n.x,n.y,n.z],t[7]=n.x,t[8]=n.y,t[9]=n.z,t[10]=s):s=t[10];let l=s,u;t[11]!==o||t[12]!==l?(u={center:o,size:l},t[11]=o,t[12]=l,t[13]=u):u=t[13],c=u}let u=c,d;t[14]===Symbol.for(`react.memo_cache_sentinel`)?(d=[0,-Math.PI/2,0],t[14]=d):d=t[14];let f;t[15]===o?f=t[16]:(f=Object.entries(o).filter(vn).map(yn),t[15]=o,t[16]=f);let p;t[17]!==s||t[18]!==r||t[19]!==n?(p=s?(0,q.jsxs)(He,{children:[r,`: `,n]}):null,t[17]=s,t[18]=r,t[19]=n,t[20]=p):p=t[20];let m;t[21]===u?m=t[22]:(m=u&&(0,q.jsx)(`group`,{position:u.center,children:(0,q.jsx)(Be,{size:u.size})}),t[21]=u,t[22]=m);let h;return t[23]!==f||t[24]!==p||t[25]!==m?(h=(0,q.jsxs)(`group`,{rotation:d,children:[f,p,m]}),t[23]=f,t[24]=p,t[25]=m,t[26]=h):h=t[26],h});function hn(e){let t=(0,K.c)(9),{color:n,label:r}=e,i;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(i=(0,q.jsx)(`boxGeometry`,{args:[10,10,10]}),t[0]=i):i=t[0];let a;t[1]===n?a=t[2]:(a=(0,q.jsx)(`meshStandardMaterial`,{color:n,wireframe:!0}),t[1]=n,t[2]=a);let o;t[3]!==n||t[4]!==r?(o=r?(0,q.jsx)(He,{color:n,children:r}):null,t[3]=n,t[4]=r,t[5]=o):o=t[5];let s;return t[6]!==a||t[7]!==o?(s=(0,q.jsxs)(`mesh`,{children:[i,a,o]}),t[6]=a,t[7]=o,t[8]=s):s=t[8],s}function gn(e){let t=(0,K.c)(3),{label:n}=e,r=l()?.debugMode??!1,i;return t[0]!==r||t[1]!==n?(i=r?(0,q.jsx)(hn,{color:`red`,label:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}var _n=(0,G.memo)(function(e){let t=(0,K.c)(27),{entity:n}=e,r=n.interiorData,i=h(n.id),a;t[0]===r.transform.position?a=t[1]:(a=oe(r.transform.position),t[0]=r.transform.position,t[1]=a);let o=a,s;t[2]===r.transform?s=t[3]:(s=se(r.transform),t[2]=r.transform,t[3]=s);let c=s,l;t[4]===r.scale?l=t[5]:(l=ae(r.scale),t[4]=r.scale,t[5]=l);let u=l,d=`${r.ghostIndex}: ${r.interiorFile}`,f;t[6]===d?f=t[7]:(f=(0,q.jsx)(gn,{label:d}),t[6]=d,t[7]=f);let p;t[8]===r.interiorFile?p=t[9]:(p=e=>{cn.error(`Failed to load %s: %s`,r.interiorFile,e.message)},t[8]=r.interiorFile,t[9]=p);let m=`InteriorModel:${r.interiorFile}`,g;t[10]===Symbol.for(`react.memo_cache_sentinel`)?(g=(0,q.jsx)(hn,{color:`orange`}),t[10]=g):g=t[10];let _;t[11]!==i||t[12]!==r.ghostIndex||t[13]!==r.interiorFile?(_=(0,q.jsx)(mn,{interiorFile:r.interiorFile,ghostIndex:r.ghostIndex,isTarget:i}),t[11]=i,t[12]=r.ghostIndex,t[13]=r.interiorFile,t[14]=_):_=t[14];let v;t[15]!==m||t[16]!==_?(v=(0,q.jsx)(ct,{name:m,fallback:g,children:_}),t[15]=m,t[16]=_,t[17]=v):v=t[17];let y;t[18]!==v||t[19]!==f||t[20]!==p?(y=(0,q.jsx)(We,{fallback:f,onError:p,children:v}),t[18]=v,t[19]=f,t[20]=p,t[21]=y):y=t[21];let b;return t[22]!==o||t[23]!==c||t[24]!==u||t[25]!==y?(b=(0,q.jsx)(`group`,{position:o,quaternion:c,scale:u,children:y}),t[22]=o,t[23]=c,t[24]=u,t[25]=y,t[26]=b):b=t[26],b});function vn(e){let[,t]=e;return t.isMesh}function yn(e){let[t,n]=e;return(0,q.jsx)(fn,{node:n},t)}var bn=()=>{},X=5,xn=X*X,Sn=.05;function Cn(e,t,n){let r=e,i=t,a=n;return[a,a,a,a,a,a,i,i,i,a,a,i,r,i,a,a,i,i,i,a,a,a,a,a,a]}function wn(e,t){let n=new Float32Array(xn);for(let r=0;r<xn;r++){let i=e[r*3],a=e[r*3+2],o=1.3-Math.sqrt(i*i+a*a)/t;o<.4?o=0:o>.8&&(o=1),n[r]=o}return n}function Tn(e,t,n,r){let i=new P,a=new Float32Array(xn*3),o=new Float32Array(xn*2),s=Cn(t,n,r),c=e*2/(X-1);for(let t=0;t<X;t++)for(let n=0;n<X;n++){let r=t*X+n,i=-e+n*c,l=e-t*c,u=e*s[r];a[r*3]=i,a[r*3+1]=u,a[r*3+2]=l,o[r*2]=n,o[r*2+1]=t}En(a);let l=wn(a,e),u=[];for(let e=0;e<X-1;e++)for(let t=0;t<X-1;t++){let n=e*X+t,r=n+1,i=n+X,a=i+1;u.push(n,i,a),u.push(n,a,r)}return i.setIndex(u),i.setAttribute(`position`,new L(a,3)),i.setAttribute(`uv`,new L(o,2)),i.setAttribute(`alpha`,new L(l,1)),i.computeBoundingSphere(),i}function En(e){let t=t=>({x:e[t*3],y:e[t*3+1],z:e[t*3+2]}),n=(t,n,r,i)=>{e[t*3]=n,e[t*3+1]=r,e[t*3+2]=i},r=t(1),i=t(3),a=t(5),o=t(6),s=t(8),c=t(9),l=t(15),u=t(16),d=t(18),f=t(19),p=t(21),m=t(23),h=a.x+(r.x-a.x)*.5,g=a.y+(r.y-a.y)*.5,_=a.z+(r.z-a.z)*.5;n(0,o.x+(h-o.x)*2,o.y+(g-o.y)*2,o.z+(_-o.z)*2),h=c.x+(i.x-c.x)*.5,g=c.y+(i.y-c.y)*.5,_=c.z+(i.z-c.z)*.5,n(4,s.x+(h-s.x)*2,s.y+(g-s.y)*2,s.z+(_-s.z)*2),h=p.x+(l.x-p.x)*.5,g=p.y+(l.y-p.y)*.5,_=p.z+(l.z-p.z)*.5,n(20,u.x+(h-u.x)*2,u.y+(g-u.y)*2,u.z+(_-u.z)*2),h=m.x+(f.x-m.x)*.5,g=m.y+(f.y-m.y)*.5,_=m.z+(f.z-m.z)*.5,n(24,d.x+(h-d.x)*2,d.y+(g-d.y)*2,d.z+(_-d.z)*2)}function Dn(e){return e.wrapS=D,e.wrapT=D,e.minFilter=R,e.magFilter=R,e.colorSpace=``,e.needsUpdate=!0,e}var On=`
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
`,kn=`
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
`;function An({textureUrl:e,radius:t,heightPercent:n,speed:r,windDirection:a,layerIndex:o}){let{debugMode:s}=l(),{animationEnabled:u}=c(),d=(0,G.useRef)(null),f=ue(e,Dn),p=(0,G.useMemo)(()=>Tn(t,n,n-.05,Sn),[t,n]);(0,G.useEffect)(()=>()=>{p.dispose()},[p]);let m=(0,G.useMemo)(()=>new I({uniforms:{cloudTexture:{value:f},uvOffset:{value:new k(0,0)},debugMode:{value:s?1:0},layerIndex:{value:o}},vertexShader:On,fragmentShader:kn,transparent:!0,depthWrite:!1,side:2}),[f,s,o]);return(0,G.useEffect)(()=>()=>{m.dispose()},[m]),i(u?(e,t)=>{let n=t*1e3/32;d.current??=new k(0,0),d.current.x+=a.x*r*n,d.current.y+=a.y*r*n,d.current.x-=Math.floor(d.current.x),d.current.y-=Math.floor(d.current.y),m.uniforms.uvOffset.value.copy(d.current)}:bn),(0,q.jsx)(`mesh`,{geometry:p,frustumCulled:!1,renderOrder:10,children:(0,q.jsx)(`primitive`,{object:m,attach:`material`})})}var jn=7;function Mn(e){let t=(0,K.c)(7),n,r;t[0]===e?(n=t[1],r=t[2]):(n=[`detailMapList`,e],r=()=>Me(e),t[0]=e,t[1]=n,t[2]=r);let i=!!e,a;return t[3]!==n||t[4]!==r||t[5]!==i?(a={queryKey:n,queryFn:r,enabled:i},t[3]=n,t[4]=r,t[5]=i,t[6]=a):a=t[6],u(a)}function Nn(e){let t=(0,K.c)(18),{scene:n}=e,{data:r}=Mn(n.materialList||void 0),a=(n.visibleDistance>0?n.visibleDistance:500)*.95,o;t[0]===n.cloudLayers?o=t[1]:(o=n.cloudLayers.map(Fn),t[0]=n.cloudLayers,t[1]=o);let s=o,c;t[2]===n.cloudLayers?c=t[3]:(c=n.cloudLayers.map(Pn),t[2]=n.cloudLayers,t[3]=c);let l=c,u;bb0:{let{x:e,y:r}=n.windVelocity;if(e!==0||r!==0){let n;t[4]!==e||t[5]!==r?(n=new k(r,-e).normalize(),t[4]=e,t[5]=r,t[6]=n):n=t[6],u=n;break bb0}let i;t[7]===Symbol.for(`react.memo_cache_sentinel`)?(i=new k(1,0),t[7]=i):i=t[7],u=i}let d=u,f;bb1:{if(!r){let e;t[8]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[8]=e):e=t[8],f=e;break bb1}let e;if(t[9]!==l||t[10]!==s||t[11]!==r){e=[];for(let t=0;t<3;t++){let n=r[jn+t];n&&e.push({texture:n,height:l[t],speed:s[t]})}t[9]=l,t[10]=s,t[11]=r,t[12]=e}else e=t[12];f=e}let p=f,m=(0,G.useRef)(null),h;if(t[13]===Symbol.for(`react.memo_cache_sentinel`)?(h=e=>{let{camera:t}=e;m.current&&m.current.position.copy(t.position)},t[13]=h):h=t[13],i(h),!p||p.length===0)return null;let g;return t[14]!==p||t[15]!==a||t[16]!==d?(g=(0,q.jsx)(`group`,{ref:m,children:p.map((e,t)=>(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(An,{textureUrl:U(e.texture),radius:a,heightPercent:e.height,speed:e.speed,windDirection:d,layerIndex:t})},t))}),t[14]=p,t[15]=a,t[16]=d,t[17]=g):g=t[17],g}function Pn(e,t){return e.heightPercent||[.35,.25,.2][t]}function Fn(e,t){return e.speed||[1e-4,2e-4,3e-4][t]}(0,G.createContext)(null),(0,G.createContext)(null);function In(e){let t=e.fogDistance,n=e.visibleDistance>0?e.visibleDistance:1e3,{r,g:i,b:a}=e.fogColor,o=new M().setRGB(r,i,a).convertSRGBToLinear(),s=[];for(let t of e.fogVolumes)t.visibleDistance<=0||t.maxHeight<=t.minHeight||s.push({visibleDistance:t.visibleDistance,minHeight:t.minHeight,maxHeight:t.maxHeight,percentage:1});return{fogDistance:t,visibleDistance:n,fogColor:o,fogVolumes:s,fogLine:s.reduce((e,t)=>Math.max(e,t.maxHeight),0),enabled:n>t}}var Ln=p(`Sky`),Rn=!1;function zn(e){return[new M().setRGB(e.r,e.g,e.b),new M().setRGB(e.r,e.g,e.b).convertSRGBToLinear()]}function Bn(e){let t=(0,K.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`detailMapList`,e],queryFn:()=>(Ln.debug(`Loading detail map list: %s`,e),Me(e))},t[0]=e,t[1]=n);let r=u(n),i,a;return t[2]!==e||t[3]!==r.data||t[4]!==r.error||t[5]!==r.status?(i=()=>{Ln.debug(`DML query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (${r.data.length} entries)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=e,t[3]=r.data,t[4]=r.error,t[5]=r.status,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,G.useEffect)(i,a),r}var Vn=60;function Hn({skyBoxFiles:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=mt(e,{path:``}),a=!!t,s=(0,G.useMemo)(()=>r.projectionMatrixInverse,[r]),c=(0,G.useMemo)(()=>n?tt(n.fogVolumes):new Float32Array(12),[n]),l=(0,G.useRef)({skybox:{value:i},fogColor:{value:t??new M(0,0,0)},enableFog:{value:a},inverseProjectionMatrix:{value:s},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:W.cameraHeight,fogVolumeData:{value:c},horizonFogHeight:{value:.18}}),u=(0,G.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return Vn/Math.sqrt(e*e+Vn*Vn)},[n]);return(0,G.useEffect)(()=>{l.current.skybox.value=i,l.current.fogColor.value=t??new M(0,0,0),l.current.enableFog.value=a,l.current.fogVolumeData.value=c,l.current.horizonFogHeight.value=u},[i,t,a,c,u]),(0,q.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,q.jsxs)(`bufferGeometry`,{children:[(0,q.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,q.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,q.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function Un(e){let t=(0,K.c)(13),{materialList:n,fogColor:r,fogState:i}=e,{data:a}=Bn(n),o;t[0]===a?o=t[1]:(o=a?[U(a[1]),U(a[3]),U(a[4]),U(a[5]),U(a[0]),U(a[2])]:null,t[0]=a,t[1]=o);let s=o,c;t[2]===a?.[6]?c=t[3]:(c=()=>{let e=a?.[6];if(!e)return;let t=U(e);if(t===Ne)return;let n=it(t,Gn);return n.image&&(et(n,{noColorSpace:!0}),Ze(n)),Wn},t[2]=a?.[6],t[3]=c);let u;t[4]===a?u=t[5]:(u=[a],t[4]=a,t[5]=u),(0,G.useEffect)(c,u);let{debugMode:d}=l(),f,p;if(t[6]===d?(f=t[7],p=t[8]):(f=()=>{qe.shapeEnvMapDebugUV.value=d},p=[d],t[6]=d,t[7]=f,t[8]=p),(0,G.useEffect)(f,p),!s)return null;let m;return t[9]!==r||t[10]!==i||t[11]!==s?(m=(0,q.jsx)(Hn,{skyBoxFiles:s,fogColor:r,fogState:i}),t[9]=r,t[10]=i,t[11]=s,t[12]=m):m=t[12],m}function Wn(){return Je()}function Gn(e){et(e,{noColorSpace:!0}),Ze(e)}function Kn({skyColor:e,fogColor:t,fogState:n}){let r=o(e=>e.camera),i=!!t,a=(0,G.useMemo)(()=>r.projectionMatrixInverse,[r]),s=(0,G.useMemo)(()=>n?tt(n.fogVolumes):new Float32Array(12),[n]),c=(0,G.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return Vn/Math.sqrt(e*e+Vn*Vn)},[n]),l=(0,G.useRef)({skyColor:{value:e},fogColor:{value:t??new M(0,0,0)},enableFog:{value:i},inverseProjectionMatrix:{value:a},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:W.cameraHeight,fogVolumeData:{value:s},horizonFogHeight:{value:c}});return(0,G.useEffect)(()=>{l.current.skyColor.value=e,l.current.fogColor.value=t??new M(0,0,0),l.current.enableFog.value=i,l.current.fogVolumeData.value=s,l.current.horizonFogHeight.value=c},[e,t,i,s,c]),(0,q.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,q.jsxs)(`bufferGeometry`,{children:[(0,q.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,q.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,q.jsx)(`shaderMaterial`,{uniforms:l.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function qn(e,t){let{fogDistance:n,visibleDistance:r}=e;return[n,r]}function Jn({fogState:e,enabled:t}){let n=o(e=>e.scene),r=o(e=>e.camera),a=(0,G.useRef)(null),s=(0,G.useMemo)(()=>tt(e.fogVolumes),[e.fogVolumes]);return(0,G.useEffect)(()=>{Rn||=($e(),!0)},[]),(0,G.useEffect)(()=>{rt();let[t,i]=qn(e,r.position.y),o=new F(e.fogColor,t,i);return n.fog=o,a.current=o,Qe(r.position.y,s),()=>{n.fog=null,a.current=null,rt()}},[n,r,e,s]),(0,G.useEffect)(()=>{let n=a.current;if(n)if(t){let[t,i]=qn(e,r.position.y);n.near=t,n.far=i}else n.near=1e10,n.far=1e10},[t,e,r.position.y]),i(()=>{let n=a.current;if(!n)return;let i=r.position.y;if(Qe(i,s,t),t){let[t,r]=qn(e,i),a=W.fogDistanceScale.value;n.near=a>1?Math.min(t,100):t,n.far=r*a,n.color.copy(e.fogColor)}}),null}var Yn=(0,G.memo)(function({entity:e}){let{skyData:t}=e;Ln.debug(`Rendering: materialList=%s, useSkyTextures=%s`,t.materialList,t.useSkyTextures);let{fogEnabled:n}=c(),r=t.materialList||void 0,i=(0,G.useMemo)(()=>zn(t.skySolidColor),[t.skySolidColor]),a=t.useSkyTextures,s=(0,G.useMemo)(()=>In(t),[t]);Ln.debug(`fogState: fogColor=(%s, %s, %s) visibleDistance=%d fogDistance=%d enabled=%s volumes=%d`,t.fogColor.r.toFixed(3),t.fogColor.g.toFixed(3),t.fogColor.b.toFixed(3),t.visibleDistance,t.fogDistance,s.enabled,s.fogVolumes.length);let l=(0,G.useMemo)(()=>zn(t.fogColor),[t.fogColor]),u=i||l,d=s.enabled&&n,f=s.fogColor,p=o(e=>e.scene),m=o(e=>e.gl);(0,G.useEffect)(()=>{if(d){let e=f.clone();p.background=e,m.setClearColor(e)}else if(u){let e=u[0].clone();p.background=e,m.setClearColor(e)}else p.background=null;return()=>{p.background=null}},[p,m,d,f,u]);let h=i?.[1];return(0,q.jsxs)(q.Fragment,{children:[r&&a&&r.length>0?(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Un,{materialList:r,fogColor:d?f:void 0,fogState:d?s:void 0},r)}):h?(0,q.jsx)(Kn,{skyColor:h,fogColor:d?f:void 0,fogState:d?s:void 0}):null,(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Nn,{scene:t})}),s.enabled?(0,q.jsx)(Jn,{fogState:s,enabled:n}):null]})});function Xn(e){let t=(0,K.c)(3),{children:n}=e,{audioEnabled:r}=c(),i;return t[0]!==r||t[1]!==n?(i=r?(0,q.jsx)(G.Suspense,{children:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}var Zn=()=>{};function Qn(e,t){let n=(0,K.c)(4),{animationEnabled:r}=c(),a;n[0]!==r||n[1]!==e.rotate||n[2]!==t?(a=e.rotate&&r?()=>{if(t.current){let e=performance.now()/1e3;t.current.rotation.y=e/3*Math.PI*2}}:Zn,n[0]=r,n[1]=e.rotate,n[2]=t,n[3]=a):a=n[3],i(a)}function Z(e,t){let n=(0,G.lazy)(()=>t().then(t=>({default:t[e]}))),r=t=>{let r=(0,K.c)(5),{entity:i}=t,a=`${e}:${i.id}`,o;r[0]===i?o=r[1]:(o=(0,q.jsx)(n,{entity:i}),r[0]=i,r[1]=o);let s;return r[2]!==a||r[3]!==o?(s=(0,q.jsx)(ct,{name:a,children:o}),r[2]=a,r[3]=o,r[4]=s):s=r[4],s};return r.displayName=`createLazy(${e})`,r}var $n=Z(`PlayerModel`,()=>B(()=>import(`./PlayerModel-CxZbg1mL.js`),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33]))),er=Z(`ExplosionShape`,()=>B(()=>import(`./ExplosionShape-Cg4WaJEo.js`),__vite__mapDeps([34,1,6,7,8,9,23,2,3,4,5,10,11,12,13,14,15,16,17,18,19,24,20,21,25,26,27,28,29,32]))),tr=Z(`TracerProjectile`,()=>B(()=>import(`./Projectiles-BCT2RoKl.js`),__vite__mapDeps([35,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,36,27,28]))),nr=Z(`SpriteProjectile`,()=>B(()=>import(`./Projectiles-BCT2RoKl.js`),__vite__mapDeps([35,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,36,27,28]))),rr=Z(`ForceFieldBare`,()=>B(()=>import(`./ForceFieldBare-fBoN9xbh.js`),__vite__mapDeps([37,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,36,25,30]))),ir=Z(`AudioEmitter`,()=>B(()=>import(`./AudioEmitter-BFJlCuJ2.js`),__vite__mapDeps([38,11,1,7,12,9,13,14,24,2,3,4,5,6,8,10,15,16,17,18,19,20,21,25,26]))),ar=Z(`WaterBlock`,()=>B(()=>import(`./WaterBlock-ySBkT2CY.js`),__vite__mapDeps([39,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,36,25,29,28]))),or=(0,G.memo)(function(e){let t=(0,K.c)(26),{entity:n}=e;switch(n.renderType){case`Shape`:{let e;return t[0]===n?e=t[1]:(e=(0,q.jsx)(sr,{entity:n}),t[0]=n,t[1]=e),e}case`ForceFieldBare`:{let e;return t[2]===n?e=t[3]:(e=(0,q.jsx)(rr,{entity:n}),t[2]=n,t[3]=e),e}case`Player`:{let e;return t[4]===n?e=t[5]:(e=(0,q.jsx)($n,{entity:n}),t[4]=n,t[5]=e),e}case`Explosion`:{let e;return t[6]===n?e=t[7]:(e=(0,q.jsx)(er,{entity:n}),t[6]=n,t[7]=e),e}case`Tracer`:{let e;return t[8]===n?e=t[9]:(e=(0,q.jsx)(tr,{entity:n}),t[8]=n,t[9]=e),e}case`Sprite`:{let e;return t[10]===n?e=t[11]:(e=(0,q.jsx)(nr,{entity:n}),t[10]=n,t[11]=e),e}case`AudioEmitter`:{let e;return t[12]===n?e=t[13]:(e=(0,q.jsx)(Xn,{children:(0,q.jsx)(ir,{entity:n})}),t[12]=n,t[13]=e),e}case`Camera`:{let e;return t[14]===n?e=t[15]:(e=(0,q.jsx)(At,{entity:n}),t[14]=n,t[15]=e),e}case`WayPoint`:{let e;return t[16]===n?e=t[17]:(e=(0,q.jsx)(jt,{entity:n}),t[16]=n,t[17]=e),e}case`TerrainBlock`:{let e;return t[18]===n?e=t[19]:(e=(0,q.jsx)(en,{entity:n}),t[18]=n,t[19]=e),e}case`InteriorInstance`:{let e;return t[20]===n?e=t[21]:(e=(0,q.jsx)(_n,{entity:n}),t[20]=n,t[21]=e),e}case`Sky`:{let e;return t[22]===n?e=t[23]:(e=(0,q.jsx)(Yn,{entity:n}),t[22]=n,t[23]=e),e}case`Sun`:return null;case`WaterBlock`:{let e;return t[24]===n?e=t[25]:(e=(0,q.jsx)(ar,{entity:n}),t[24]=n,t[25]=e),e}case`MissionArea`:return null;case`None`:return null;default:return null}});function sr(e){let t=(0,K.c)(25),{entity:n}=e,r=je(),i=r===`demo`||r===`live`,a=(0,G.useRef)(null);if(Qn(n,a),!n.shapeName)throw Error(`Shape entity missing shapeName: ${n.id}`);let o=n.shapeType??`StaticShape`,s;t[0]!==n.dataBlock||t[1]!==n.dataBlockId?(s=Ue(n.dataBlockId,n.dataBlock),t[0]=n.dataBlock,t[1]=n.dataBlockId,t[2]=s):s=t[2];let c=s,l=n.dataBlock?.toLowerCase()===`flag`,u=n.teamId&&n.teamId>0?d[n.teamId]:null,f=l&&u?`${u} Flag`:null,p=n.shapeType===`Item`?`pink`:n.threads?`#00ff88`:`yellow`,m=n.runtimeObject,h=n.rotate?a:void 0,g=i?n:void 0,_;t[3]!==n.id||t[4]!==n.imageDataBlockIds?.[0]||t[5]!==n.weaponShape?(_=n.weaponShape?{0:(0,q.jsx)(Ke,{shapeName:n.weaponShape,imageDataBlockId:n.imageDataBlockIds?.[0],entityId:n.id})}:void 0,t[3]=n.id,t[4]=n.imageDataBlockIds?.[0],t[5]=n.weaponShape,t[6]=_):_=t[6];let v;t[7]===f?v=t[8]:(v=f?(0,q.jsx)(He,{opacity:.6,children:f}):null,t[7]=f,t[8]=v);let y;t[9]!==c||t[10]!==n.id||t[11]!==n.skinName||t[12]!==p||t[13]!==g||t[14]!==_||t[15]!==v?(y=(0,q.jsx)(Ge,{loadingColor:p,streamEntity:g,emap:c,entityId:n.id,skinName:n.skinName,mounted:_,children:v}),t[9]=c,t[10]=n.id,t[11]=n.skinName,t[12]=p,t[13]=g,t[14]=_,t[15]=v,t[16]=y):y=t[16];let b;t[17]!==h||t[18]!==y?(b=(0,q.jsx)(`group`,{ref:h,children:y}),t[17]=h,t[18]=y,t[19]=b):b=t[19];let x;return t[20]!==n.shapeName||t[21]!==o||t[22]!==m||t[23]!==b?(x=(0,q.jsx)(Xe,{object:m,shapeName:n.shapeName,type:o,children:b}),t[20]=n.shapeName,t[21]=o,t[22]=m,t[23]=b,t[24]=x):x=t[24],x}var cr={Root:`_Root_yuidw_1`,Distance:`_Distance_yuidw_9`,Icon:`_Icon_yuidw_18`},lr=1.5,ur=U(`commander/MiniIcons/com_flag_grey`),dr=new A;function fr(e){let t=(0,K.c)(9),{entity:n}=e,r=(0,G.useRef)(null),a=(0,G.useRef)(null),s=(0,G.useRef)(null),c=o(pr),l;t[0]!==c||t[1]!==n.iffColor?(l=()=>{if(a.current&&n.iffColor){let{r:e,g:t,b:r}=n.iffColor;a.current.style.backgroundColor=`rgb(${e},${t},${r})`}if(s.current&&r.current){r.current.getWorldPosition(dr);let e=c.position.distanceTo(dr);s.current.textContent=e.toFixed(1)}},t[0]=c,t[1]=n.iffColor,t[2]=l):l=t[2],i(l);let u=n.iffColor?`rgb(${n.iffColor.r},${n.iffColor.g},${n.iffColor.b})`:`rgb(200,200,200)`,d;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(d=[0,lr,0],t[3]=d):d=t[3];let f;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,q.jsx)(`span`,{ref:s,className:cr.Distance}),t[4]=f):f=t[4];let p;t[5]===u?p=t[6]:(p={backgroundColor:u,"--flag-icon-url":`url(${ur})`},t[5]=u,t[6]=p);let m=p,h;return t[7]===m?h=t[8]:(h=(0,q.jsx)(`group`,{ref:r,children:(0,q.jsx)(le,{position:d,center:!0,children:(0,q.jsxs)(`div`,{className:cr.Root,children:[f,(0,q.jsx)(`div`,{ref:a,className:cr.Icon,style:m})]})})}),t[7]=m,t[8]=h),h}function pr(e){return e.camera}function mr(){let e=(0,K.c)(1),t=hr,n;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=(0,q.jsx)(`group`,{ref:t,children:(0,q.jsx)(gr,{})}),e[0]=n):n=e[0],n}function hr(e){st.setState({root:e})}var gr=(0,G.memo)(function(){let e=he(),t=(0,G.useRef)(new Map).current,n=new Set;for(let r of e)n.add(r.id),t.set(r.id,r);for(let e of t.keys())n.has(e)||t.delete(e);return(0,q.jsx)(q.Fragment,{children:[...t.values()].map(e=>(0,q.jsx)(_r,{entity:e},e.id))})}),_r=(0,G.memo)(function(e){let t=(0,K.c)(7),{entity:n}=e;if(n.debugHidden)return null;if(lt(n)){let e;t[0]===n?e=t[1]:(e=(0,q.jsx)(or,{entity:n}),t[0]=n,t[1]=e);let r;return t[2]!==n.id||t[3]!==e?(r=(0,q.jsx)(`group`,{name:n.id,children:e}),t[2]=n.id,t[3]=e,t[4]=r):r=t[4],r}if(n.renderType===`None`)return null;let r;return t[5]===n?r=t[6]:(r=(0,q.jsx)(yr,{entity:n}),t[5]=n,t[6]=r),r});function vr({entity:e}){let t=(0,G.useRef)(!1),[n,r]=(0,G.useState)(()=>(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0);return t.current=n,i(()=>{let n=(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2)!=0;n!==t.current&&(t.current=n,r(n))}),n?(0,q.jsx)(fr,{entity:e}):null}function yr(e){let t=(0,K.c)(35),{entity:n}=e,r=n.position,i=n.scale,a;bb0:{if(!n.rotation){a=void 0;break bb0}let e;t[0]===n.rotation?e=t[1]:(e=new x(...n.rotation),t[0]=n.rotation,t[1]=e),a=e}let o=a;if(n.renderType===`Shape`&&!n.shapeName){let e=n.id,a;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(a=(0,q.jsx)(`sphereGeometry`,{args:[.3,6,4]}),t[2]=a):a=t[2];let s;t[3]===n.className?s=t[4]:(s=Ye(n.className),t[3]=n.className,t[4]=s);let c;t[5]===s?c=t[6]:(c=(0,q.jsxs)(`mesh`,{children:[a,(0,q.jsx)(`meshBasicMaterial`,{color:s,wireframe:!0})]}),t[5]=s,t[6]=c);let l;t[7]===n?l=t[8]:(l=(0,q.jsx)(vr,{entity:n}),t[7]=n,t[8]=l);let u;return t[9]!==n.id||t[10]!==r||t[11]!==o||t[12]!==i||t[13]!==c||t[14]!==l?(u=(0,q.jsxs)(`group`,{name:e,position:r,quaternion:o,scale:i,children:[c,l]}),t[9]=n.id,t[10]=r,t[11]=o,t[12]=i,t[13]=c,t[14]=l,t[15]=u):u=t[15],u}let s;t[16]!==n.className||t[17]!==n.renderType?(s=n.renderType===`Explosion`?null:(0,q.jsxs)(`mesh`,{children:[(0,q.jsx)(`sphereGeometry`,{args:[.5,8,6]}),(0,q.jsx)(`meshBasicMaterial`,{color:Ye(n.className),wireframe:!0})]}),t[16]=n.className,t[17]=n.renderType,t[18]=s):s=t[18];let c=s,l;t[19]===n?l=t[20]:(l=(0,q.jsx)(or,{entity:n}),t[19]=n,t[20]=l);let u;t[21]!==c||t[22]!==l?(u=(0,q.jsx)(ut,{fallback:c,children:l}),t[21]=c,t[22]=l,t[23]=u):u=t[23];let d;t[24]===n?d=t[25]:(d=(0,q.jsx)(vr,{entity:n}),t[24]=n,t[25]=d);let f;t[26]!==u||t[27]!==d?(f=(0,q.jsxs)(`group`,{name:`model`,children:[u,d]}),t[26]=u,t[27]=d,t[28]=f):f=t[28];let p;return t[29]!==n.id||t[30]!==r||t[31]!==o||t[32]!==i||t[33]!==f?(p=(0,q.jsx)(`group`,{name:n.id,position:r,quaternion:o,scale:i,children:f}),t[29]=n.id,t[30]=r,t[31]=o,t[32]=i,t[33]=f,t[34]=p):p=t[34],p}function br(){let e=(0,K.c)(3),{fov:t}=c(),n;e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=[0,256,0],e[0]=n):n=e[0];let r;return e[1]===t?r=e[2]:(r=(0,q.jsx)(pt,{makeDefault:!0,position:n,fov:t}),e[1]=t,e[2]=r),r}function xr(e){let t=(0,K.c)(3),{children:n}=e,{debugMode:r}=l(),i;return t[0]!==n||t[1]!==r?(i=r?(0,q.jsx)(G.Suspense,{children:n}):null,t[0]=n,t[1]=r,t[2]=i):i=t[2],i}var Sr=p(`InputConsumer`),Cr=200,wr=Math.PI/2-.01,Tr=45,Er=31,Dr=40,Or=1/32,kr=2*Math.PI;function Ar(e){return((Math.round(e/kr*65536)|0)<<16>>16)*kr/65536}var jr=new A,Mr=new A,Nr=new A,Pr=new S(0,0,0,`YXZ`);function Fr(e,t,n,r,i,a,o){if(r===0&&i===0&&a===0)return;let s=Math.sin(t),c=Math.cos(t),l=Math.sin(n),u=Math.cos(n),d=o*Or;e.x+=(c*r+s*u*i+s*l*a)*d,e.y+=(-s*r+c*u*i+c*l*a)*d,e.z+=(-l*i+u*a)*d}function Ir(){let{moveQueue:e,mode:t,setMode:n}=me(),r=be(e=>e.adapter),a=be(e=>e.gameStatus),s=be(e=>e.liveReady),c=be(e=>e.sendMoves),l=f(),u=o(e=>e.camera),d=kt(),p=(0,G.useRef)(null),m=(0,G.useRef)([]),h=(0,G.useRef)(0),g=(0,G.useRef)(0),_=(0,G.useRef)(null),y=(0,G.useRef)(0),b=(0,G.useRef)(0),x=(0,G.useRef)({x:0,y:0,z:0}),S=(0,G.useRef)(0),C=(0,G.useRef)(0),w=(0,G.useRef)({x:0,y:0,z:0}),T=(0,G.useRef)(!1),E=(0,G.useRef)({x:0,y:0,z:0}),D=(0,G.useRef)({x:0,y:0,z:0}),O=(0,G.useRef)(!1),k=(0,G.useRef)(null),A=(0,G.useRef)(0),j=(0,G.useRef)(0),M=(0,G.useRef)(0),N=(0,G.useRef)(0),P=(0,G.useRef)(0),F=(0,G.useRef)([!1,!1,!1,!1,!1,!1]),I=!!r&&(a===`connected`||a===`authenticating`);return(0,G.useEffect)(()=>{if(I&&r){if(p.current===r)return;Sr.info(`wiring adapter to engine store`);let e=ve.getState(),t={source:`live`,duration:1/0,missionName:e.mapName??null,gameType:null,serverDisplayName:e.serverName??null,recorderName:e.warriorName??null,recordingDate:null,streamingPlayback:r};l.getState().setRecording(t),l.getState().setPlaybackStatus(`playing`),p.current=r,T.current=!1,O.current=!1,k.current=null,m.current.length=0,h.current=0,g.current=0,_.current=null,n(`fly`)}else !I&&p.current&&(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),p.current=null,T.current=!1,O.current=!1,k.current=null,m.current.length=0,n(`local`))},[I,r,l,n]),(0,G.useEffect)(()=>{!s&&p.current&&(Sr.info(`mission change: resetting prediction state and mode`),T.current=!1,O.current=!1,k.current=null,m.current.length=0,h.current=0,g.current=0,_.current=null,A.current=0,j.current=0,M.current=0,N.current=0,P.current=0,F.current.fill(!1),n(`fly`))},[s,n]),(0,G.useEffect)(()=>{if(!I)return st.subscribe(e=>{n(e.cameraMode===`orbitOverride`?`follow`:`local`)})},[I,n]),Ot(()=>{if(!p.current||a!==`connected`||!s)return;let e=A.current,t=j.current;A.current=0,j.current=0;let n=M.current,r=N.current,i=P.current;M.current=0,N.current=0,P.current=0;let o=[...F.current];F.current.fill(!1);let l=Ar(e),u=Ar(t);y.current+=l-e,b.current+=u-t,S.current=y.current,C.current=b.current,w.current={...x.current};let d=Dr*2,f=y.current-l,g=b.current-u;Fr(x.current,f,g,n,r,i,d),o[1]=!0;let _=h.current++,v={x:n,y:r,z:i,yaw:e,pitch:t,roll:0,trigger:o,freeLook:!1},T=m.current;T.push({moveIndex:_,move:v,yaw:l,pitch:u,x:n,y:r,z:i}),T.length>Tr&&T.splice(0,T.length-Tr);let I=p.current.lastMoveAck;for(;T.length>0&&T[0].moveIndex<I;)T.shift();if(T.length>0){let e=T.slice(0,Er);c(e.map(e=>e.move),e[0].moveIndex)}let L=p.current.getSnapshot();if(L!==k.current){k.current=L;let e=L?.camera;if(e?.orbitTargetId){let t=L.entities.find(t=>t.id===e.orbitTargetId);t?.position&&(E.current={...D.current},D.current={x:t.position[0],y:t.position[1],z:t.position[2]},O.current||=(E.current={...D.current},!0))}}}),i((r,i)=>{let o=e.current;if(o.length>0){let t=0,n=0,r=0,i=0,c=0,l=0,d=[!1,!1,!1,!1,!1,!1];for(let e of o){t+=e.deltaYaw,n+=e.deltaPitch,Math.abs(e.x)>Math.abs(r)&&(r=e.x),Math.abs(e.y)>Math.abs(i)&&(i=e.y),Math.abs(e.z)>Math.abs(c)&&(c=e.z),l+=e.delta;for(let t=0;t<e.triggers.length;t++)e.triggers[t]&&(d[t]=!0)}if(e.current.length=0,I&&p.current&&a===`connected`&&s){A.current+=t,j.current+=n,M.current=r,N.current=i,P.current=c;for(let e=0;e<d.length;e++)d[e]&&(F.current[e]=!0);y.current+=t,b.current=Math.max(-v,Math.min(v,b.current+n))}else{let e=st.getState();if(e.playback){e.cameraMode===`freeFly`?Lr(u,t,n,r,i,c,l):e.cameraMode===`orbitOverride`&&(e.orbitOverrideYaw+=t,e.orbitOverridePitch=Math.max(-v,Math.min(v,e.orbitOverridePitch+n)));return}Lr(u,t,n,r,i,c,l);return}}if(!I||!p.current||a!==`connected`||!s)return;let c=p.current,l=c.getSnapshot(),f=l?.camera;if(f&&f!==_.current&&typeof f.yaw==`number`&&typeof f.pitch==`number`){_.current=f;let e=c.lastMoveAck;if(e>g.current){g.current=e;let t=m.current;for(;t.length>0&&t[0].moveIndex<e;)t.shift()}y.current=f.yaw,b.current=f.pitch,x.current={x:f.position[0],y:f.position[1],z:f.position[2]};let r=Dr*2;for(let e of m.current)Fr(x.current,y.current,b.current,e.x,e.y,e.z,r),y.current+=e.yaw,b.current=Math.max(-v,Math.min(v,b.current+e.pitch));y.current+=A.current,b.current=Math.max(-v,Math.min(v,b.current+j.current)),S.current=y.current,C.current=b.current,w.current={...x.current},T.current=!0;let i=f.mode===`third-person`?`follow`:`fly`;if(i!==t&&(Sr.info(`server corrected observer mode: %s → %s`,t,i),n(i),p.current&&(p.current.observerMode=i),i===`fly`&&(O.current=!1,k.current=null)),f.orbitTargetId&&!O.current){let e=l.entities.find(e=>e.id===f.orbitTargetId);if(e?.position){let t={x:e.position[0],y:e.position[1],z:e.position[2]};D.current=t,E.current={...t},O.current=!0}}}if(T.current){if(t===`fly`)Rr(r.camera,w.current,x.current,y.current,b.current,d());else if(t===`follow`){if(!O.current)return;zr(r.camera,E.current,D.current,y.current,b.current,d(),f?.orbitDistance??4,f?.orbitTargetId)}}}),(0,G.useEffect)(()=>()=>{p.current&&=(l.getState().playback.recording?.source===`live`&&l.getState().setRecording(null),null)},[l]),null}function Lr(e,t,n,r,i,a,o){if((t!==0||n!==0)&&(Pr.setFromQuaternion(e.quaternion,`YXZ`),Pr.y-=t,Pr.x-=n,Pr.x=Math.max(-wr,Math.min(wr,Pr.x)),e.quaternion.setFromEuler(Pr)),r!==0||i!==0||a!==0){e.getWorldDirection(jr),jr.normalize(),Mr.crossVectors(e.up,jr).normalize(),Nr.set(0,0,0),i!==0&&Nr.addScaledVector(jr,i),r!==0&&Nr.addScaledVector(Mr,-r),a!==0&&(Nr.y+=a);let t=Nr.length();t>0&&(Nr.multiplyScalar(Math.min(1,t)/t*Cr*o),e.position.add(Nr))}}function Rr(e,t,n,r,i,a){let o=t.x+(n.x-t.x)*a,s=t.y+(n.y-t.y)*a,c=t.z+(n.z-t.z)*a;e.position.set(s,c,o);let[l,u,d,f]=_(r,i);e.quaternion.set(l,u,d,f)}function zr(e,t,n,r,i,a,o,s){let c=t.x+(n.x-t.x)*a,l=t.y+(n.y-t.y)*a,u=t.z+(n.z-t.z)*a+(s!=null&&V.getState().streamEntities.get(s)?.renderType===`Player`?1:0),d=Math.sin(i),f=Math.cos(i),p=Math.sin(r),m=Math.cos(r),h=Math.max(.1,o),g=c-p*f*h,v=l-m*f*h,y=u+d*h;e.position.set(v,y,g);let[b,x,S,C]=_(r,i);e.quaternion.set(b,x,S,C)}var Br=p(`CameraTourConsumer`);function Vr(e){return e<.5?4*e*e*e:1-(-2*e+2)**3/2}var Hr=3,Ur=10,Wr=2,Gr=1.8,Kr=50,qr=200,Jr=2,Yr=1.8,Xr=1.2,Zr=.6,Qr=3/4*(2*Math.PI),$r=Qr/Zr,ei=1.5,ti=1.5,ni=6,ri=180,ii=1.4,ai=new N,oi=new N,si=new N,ci=new ne,li=new A,ui=new A,di=new A,fi=new A,pi=new A,Q=new x,mi=new x,hi=new ne,gi=new S;function _i(e){if(e.orbitCenter)return pi.set(e.orbitCenter[0],e.orbitCenter[1],e.orbitCenter[2]);let t=e.targets[e.currentIndex];return pi.set(t.position[0],t.position[1],t.position[2])}function vi(e){return e.orbitRadius??Hr}function yi(e){return vi(e)*(Wr/Hr)}function bi(e,t,n){let r=_i(e),i=vi(e),a=yi(e);return n.set(r.x+Math.cos(t)*i,r.y+a,r.z+Math.sin(t)*i)}function xi(e,t,n){let r=e.getObjectByName(t.entityId),i=!1;if(r&&r.traverse(e=>{e.geometry&&(i=!0)}),r&&!i){n.orbitCenter=[...t.position],n.orbitRadius=Ur;return}if(r&&i){ai.setFromObject(r),ai.getCenter(li),n.orbitCenter=[li.x,li.y,li.z];let e=hi.copy(r.matrixWorld).invert();oi.makeEmpty(),r.traverse(t=>{t.geometry&&(t.geometry.boundingBox||t.geometry.computeBoundingBox(),si.copy(t.geometry.boundingBox),ci.multiplyMatrices(e,t.matrixWorld),si.applyMatrix4(ci),oi.union(si))}),oi.getSize(ui);let i=ui.y,a=Math.max(ui.x,ui.z),o=i/2+Yr,s=a/2+Xr,c=Math.max(o,s);if(c>200){n.orbitCenter=[...t.position];let e=0;r.traverse(t=>{if(e>0||!t.geometry)return;t.geometry.boundingBox||t.geometry.computeBoundingBox();let n=t.geometry.boundingBox,r=n.max.x-n.min.x,i=n.max.y-n.min.y,a=n.max.z-n.min.z;e=Math.max(r,i,a)});let i=(e/2+Xr)*.75;n.orbitRadius=Math.max(Gr,i)}else n.orbitRadius=Math.max(Gr,c);let l=o>=s?`height`:`spread`,u=c<Gr?` (clamped)`:``;Br.debug(`%s: size=%s height→%s spread→%s driven by %s → radius=%d%s`,t.label,`${ui.x.toFixed(1)}×${ui.y.toFixed(1)}×${ui.z.toFixed(1)}`,o.toFixed(1),s.toFixed(1),l,n.orbitRadius,u)}else n.orbitCenter=null,n.orbitRadius=null,Br.debug(`%s: no scene object, fallback radius=%d`,t.label,Hr)}function Si(e){return gi.setFromQuaternion(e,`YXZ`),gi.z=0,e.setFromEuler(gi)}function Ci(e,t){return hi.lookAt(e,t,fi.set(0,1,0)),mi.setFromRotationMatrix(hi),Si(mi)}function wi(e,t,n){let r=_i(t),i=bi(t,n,di.clone()),a=e.distanceTo(i);if(a<20)return new j([e.clone(),i],!1,`centripetal`);let o=new A().addVectors(e,i).multiplyScalar(.5);return o.distanceTo(r)>i.distanceTo(r)&&o.lerp(r,.3),o.y+=a*.15,new j([e.clone(),o,i],!1,`centripetal`)}function Ti(e,t){let n=_i(t);return Math.atan2(e.z-n.z,e.x-n.x)}function Ei(e){return Math.max(ti,Math.min(ni,e/ri))}function Di(e,t,n,r){let i=e.targets[e.currentIndex];if(!e.curve){e.startPos=[t.position.x,t.position.y,t.position.z],Si(Q.copy(t.quaternion)),e.startQuat=[Q.x,Q.y,Q.z,Q.w],xi(r,i,e);let n=t.position.clone();e.curve=wi(n,e,Ti(n,e)),e.phaseDuration=Ei(e.curve.getLength()),e.elapsed=0;return}e.elapsed+=n;let a=Math.min(1,Vr(e.elapsed/e.phaseDuration));e.curve.getPointAt(a,di),t.position.copy(di);let o=Vr(Math.min(1,e.elapsed/e.phaseDuration*ii)),s=Ci(di,_i(e));o<1&&e.startQuat?(Q.set(e.startQuat[0],e.startQuat[1],e.startQuat[2],e.startQuat[3]),Q.slerp(s,o),t.quaternion.copy(Q)):t.quaternion.copy(s),e.elapsed>=e.phaseDuration&&(e.phase=`orbiting`,e.elapsed=0,e.orbitStartAngle=Ti(t.position,e))}function Oi(e,t,n){let r=e.targets.length===1,i=e.currentIndex>=e.targets.length-1;e.elapsed+=n;let a=e.orbitStartAngle,o=$r+ei,s;if(e.elapsed<=$r)s=a+e.elapsed*Zr;else{let t=e.elapsed-$r,n=Math.min(1,t/ei),r=t*Zr*(1-n/2);s=a+Qr+r}bi(e,s,di),t.position.copy(di);let c=Ci(di,_i(e));t.quaternion.copy(c),e.elapsed>=o&&(r||i?g.getState().cancel():g.getState().advanceTarget())}function ki(){let e=(0,K.c)(3),t=o(Ni),n=o(Mi),r=(0,G.useRef)(null);Ie(`nextStop`,ji),Ie(`exitTour`,Ai);let a;return e[0]!==t||e[1]!==n?(a=(e,i)=>{let a=g.getState().animation,o=a?vi(a):0,s=a&&o>=Kr?Math.max(1,o/qr):1,c=W.fogDistanceScale.value;if(c!==s){let e=Jr*i;s>c?W.fogDistanceScale.value=Math.min(c+e,s):W.fogDistanceScale.value=Math.max(c-e,s)}if(!a){r.current&&=(Si(t.quaternion),null);return}r.current=a,a.phase===`traveling`?Di(a,t,i,n):Oi(a,t,i)},e[0]=t,e[1]=n,e[2]=a):a=e[2],i(a),null}function Ai(){g.getState().cancel()}function ji(){let e=g.getState().animation;e&&(e.currentIndex>=e.targets.length-1?g.getState().cancel():g.getState().advanceTarget())}function Mi(e){return e.scene}function Ni(e){return e.camera}var Pi=3;function $({map:e}){let t=we,n=o(e=>e.gl.domElement),r=(0,G.useMemo)(()=>{let n=e.map(e=>{let t=Array.isArray(e.keys)?e.keys:[e.keys];return{name:e.name,bindings:t.map(pe)}}),r={};for(let e of n)r[e.name]=Ce(e.bindings[0]);let i=new Map,a=[],o=[],s=[],c=[],l=[];for(let e of n)for(let t of e.bindings)switch(t.type){case`key`:{let n=i.get(t.code);n||(n=[],i.set(t.code,n)),n.push({action:e,binding:t});break}case`click`:a.push({action:e,binding:t});break;case`drag`:o.push({action:e,binding:t});break;case`pointerLockMove`:s.push({action:e});break;case`scroll`:c.push({action:e});break;case`touch`:l.push({action:e});break}function u(e){return e==null?!0:e===!!document.pointerLockElement}function d(e){let{actions:n}=t.getState(),r={};for(let[,t]of i)for(let{action:i,binding:a}of t){let t=e.has(a.code)&&Le(e,a.modifiers),o=n[i.name]?.pressed??!1;t&&!o?(r[i.name]={pressed:!0},H(i.name)):!t&&o&&(r[i.name]={pressed:!1})}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}let f=-1,p=0,m=0,h=!1;function g(e,n){t.setState(t=>({...t,actions:{...t.actions,[e]:n}}))}function _(e){let t=!!document.pointerLockElement;for(let{action:t,binding:n}of a){if(!u(n.whenPointerLocked))continue;let r=n.button??0;e.button===r&&Re(e,n.modifiers)&&g(t.name,{pressed:!0})}t||(f=e.button,p=e.clientX,m=e.clientY,h=!1)}function v(e){if(document.pointerLockElement){if(s.length>0){let{actions:n}=t.getState(),r={};for(let{action:t}of s){let i=n[t.name];r[t.name]={...i,deltaX:i.deltaX+e.movementX,deltaY:i.deltaY+e.movementY}}t.setState(e=>({...e,actions:{...e.actions,...r}}))}return}if(f<0)return;if(!h){let n=e.clientX-p,r=e.clientY-m;if(Math.abs(n)<Pi&&Math.abs(r)<Pi)return;h=!0;for(let{action:e,binding:n}of a)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].pressed&&g(e.name,{pressed:!1});for(let{action:e,binding:t}of o)u(t.whenPointerLocked)&&(t.button??0)===f&&g(e.name,{dragging:!0,deltaX:0,deltaY:0,startX:p,startY:m})}let{actions:n}=t.getState(),r={};for(let{action:t,binding:i}of o){if(!u(i.whenPointerLocked)||(i.button??0)!==f)continue;let a=n[t.name];r[t.name]={...a,deltaX:a.deltaX+e.movementX,deltaY:a.deltaY+e.movementY}}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}function y(e){let n=!!document.pointerLockElement;for(let{action:n,binding:r}of a){if(!u(r.whenPointerLocked))continue;let i=r.button??0;e.button===i&&t.getState().actions[n.name].pressed&&(H(n.name),g(n.name,{pressed:!1}))}if(!n&&e.button===f){for(let{action:e,binding:n}of o)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].dragging&&g(e.name,Ee());f=-1,h=!1}}function b(e){for(let{action:t}of c)g(t.name,{deltaX:e.deltaX,deltaY:e.deltaY}),H(t.name)}let x=null,S=0,C=0;function w(e){if(x!==null||l.length===0)return;let t=e.changedTouches[0];if(t){x=t.identifier,S=t.clientX,C=t.clientY;for(let{action:e}of l)g(e.name,{touching:!0,dragging:!1,deltaX:0,deltaY:0})}}function T(e){if(x!==null)for(let n=0;n<e.changedTouches.length;n++){let r=e.changedTouches[n];if(r.identifier!==x)continue;let i=r.clientX-S,a=r.clientY-C;S=r.clientX,C=r.clientY;for(let{action:e}of l){let n=t.getState().actions[e.name];g(e.name,{touching:!0,dragging:!0,deltaX:n.deltaX+i,deltaY:n.deltaY+a})}break}}function E(e){if(x!==null){for(let t=0;t<e.changedTouches.length;t++)if(e.changedTouches[t].identifier===x){x=null;for(let{action:e}of l)g(e.name,Fe());break}}}return{actionNames:n.map(e=>e.name),initialActions:r,deriveKeyActions:d,hasKeyBindings:i.size>0,handleMouseDown:_,handleMouseMove:v,handleMouseUp:y,handleWheel:b,handleTouchStart:w,handleTouchMove:T,handleTouchEnd:E,hasMouseBindings:a.length>0||o.length>0||s.length>0,hasScrollBindings:c.length>0,hasTouchBindings:l.length>0}},[e,t]);return(0,G.useEffect)(()=>{t.setState(e=>({...e,actions:{...e.actions,...r.initialActions}}));let e;return r.hasKeyBindings&&(r.deriveKeyActions(t.getState().keys),e=t.subscribe(e=>e.keys,e=>r.deriveKeyActions(e))),r.hasMouseBindings&&(n.addEventListener(`mousedown`,r.handleMouseDown),document.addEventListener(`mousemove`,r.handleMouseMove),document.addEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.addEventListener(`wheel`,r.handleWheel,{passive:!0}),r.hasTouchBindings&&(n.addEventListener(`touchstart`,r.handleTouchStart,{passive:!0}),document.addEventListener(`touchmove`,r.handleTouchMove,{passive:!0}),document.addEventListener(`touchend`,r.handleTouchEnd,{passive:!0}),document.addEventListener(`touchcancel`,r.handleTouchEnd,{passive:!0})),()=>{e?.(),r.hasMouseBindings&&(n.removeEventListener(`mousedown`,r.handleMouseDown),document.removeEventListener(`mousemove`,r.handleMouseMove),document.removeEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.removeEventListener(`wheel`,r.handleWheel),r.hasTouchBindings&&(n.removeEventListener(`touchstart`,r.handleTouchStart),document.removeEventListener(`touchmove`,r.handleTouchMove),document.removeEventListener(`touchend`,r.handleTouchEnd),document.removeEventListener(`touchcancel`,r.handleTouchEnd)),t.setState(e=>{let t={...e.actions};for(let e of r.actionNames)delete t[e];return{...e,actions:t}})}},[r,t,n]),null}var Fi=[{name:`moveForward`,keys:[`KeyW`]},{name:`moveBackward`,keys:[`KeyS`]},{name:`moveLeft`,keys:[`KeyA`]},{name:`moveRight`,keys:[`KeyD`]},{name:`moveUp`,keys:[`KeyE`]},{name:`moveDown`,keys:[`KeyQ`]},{name:`adjustSpeed`,keys:[{type:`scroll`}]}],Ii=[{name:`lookUp`,keys:[`ArrowUp`]},{name:`lookDown`,keys:[`ArrowDown`]},{name:`lookLeft`,keys:[`ArrowLeft`]},{name:`lookRight`,keys:[`ArrowRight`]},{name:`dragLook`,keys:[{type:`drag`,button:0}]},{name:`lockedLook`,keys:[{type:`pointerLockMove`}]},{name:`touchLook`,keys:[{type:`touch`}]}],Li=[{name:`canvasClick`,keys:[{type:`click`,button:0,whenPointerLocked:!1}]}],Ri=[{name:`camera1`,keys:[`Digit1`]},{name:`camera2`,keys:[`Digit2`]},{name:`camera3`,keys:[`Digit3`]},{name:`camera4`,keys:[`Digit4`]},{name:`camera5`,keys:[`Digit5`]},{name:`camera6`,keys:[`Digit6`]},{name:`camera7`,keys:[`Digit7`]},{name:`camera8`,keys:[`Digit8`]},{name:`camera9`,keys:[`Digit9`]}],zi=[{name:`playPause`,keys:[`Space`]},{name:`decreasePlaybackSpeed`,keys:[`Comma`,`Shift-Comma`]},{name:`increasePlaybackSpeed`,keys:[`Period`,`Shift-Period`]}],Bi=[{name:`toggleObserverMode`,keys:[`Space`]}],Vi=[{name:`nextPlayer`,keys:[{type:`click`,button:0,whenPointerLocked:!0}]}],Hi=[{name:`nextStop`,keys:[{type:`click`,button:0}]},{name:`exitTour`,keys:[`Escape`]}];function Ui(){let e=(0,K.c)(27),t=ye(),n=ge(),r=m(Wi),i=t?.source===`demo`,a=t?.source===`live`,o=!t,s=o&&!r||a&&n===`fly`,c=!r,l=!r,u;e[0]===s?u=e[1]:(u=s&&(0,q.jsx)($,{map:Fi}),e[0]=s,e[1]=u);let d;e[2]===c?d=e[3]:(d=c&&(0,q.jsx)($,{map:Ii}),e[2]=c,e[3]=d);let f;e[4]===l?f=e[5]:(f=l&&(0,q.jsx)($,{map:Li}),e[4]=l,e[5]=f);let p;e[6]!==o||e[7]!==r?(p=o&&!r&&(0,q.jsx)($,{map:Ri}),e[6]=o,e[7]=r,e[8]=p):p=e[8];let h;e[9]===i?h=e[10]:(h=i&&(0,q.jsx)($,{map:zi}),e[9]=i,e[10]=h);let g;e[11]===a?g=e[12]:(g=a&&(0,q.jsx)($,{map:Bi}),e[11]=a,e[12]=g);let _;e[13]!==n||e[14]!==a?(_=a&&n===`follow`&&(0,q.jsx)($,{map:Vi}),e[13]=n,e[14]=a,e[15]=_):_=e[15];let v;e[16]===r?v=e[17]:(v=r&&(0,q.jsx)($,{map:Hi}),e[16]=r,e[17]=v);let y;return e[18]!==u||e[19]!==d||e[20]!==f||e[21]!==p||e[22]!==h||e[23]!==g||e[24]!==_||e[25]!==v?(y=(0,q.jsxs)(q.Fragment,{children:[u,d,f,p,h,g,_,v]}),e[18]=u,e[19]=d,e[20]=f,e[21]=p,e[22]=h,e[23]=g,e[24]=_,e[25]=v,e[26]=y):y=e[26],y}function Wi(e){return e.animation!==null}function Gi(e,t){return(0,G.lazy)(()=>t().then(t=>({default:t[e]})))}var Ki=Gi(`StreamingController`,()=>B(()=>import(`./StreamingController-DAyX4exD.js`),__vite__mapDeps([40,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,24,20,21,25,26,0,22,23,27,28,29,30,31,32,33,41]))),qi=Gi(`DebugElements`,()=>B(()=>import(`./DebugElements-Cxvdw7IG.js`),__vite__mapDeps([42,1,20,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,43]))),Ji=Gi(`Mission`,()=>B(()=>import(`./Mission-B47ZUclM.js`),__vite__mapDeps([44,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,22,45]))),Yi=Gi(`ChatSoundPlayer`,()=>B(()=>import(`./ChatSoundPlayer-D2IMvzlM.js`),__vite__mapDeps([46,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,24,20,21,25,26]))),Xi=(0,G.memo)(function(e){let t=(0,K.c)(23),{dpr:n,onCreated:r,missionName:i,missionType:a,onLoadingChange:o}=e,s=ye(),c=je(),l=c===`demo`||c===`live`,u,d;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(u=(0,q.jsx)(Ui,{}),d=(0,q.jsx)(De,{}),t[0]=u,t[1]=d):(u=t[0],d=t[1]);let f;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,q.jsx)(vt,{}),t[2]=f):f=t[2];let p,m;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(p=(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(mr,{})}),m=(0,q.jsx)(br,{}),t[3]=p,t[4]=m):(p=t[3],m=t[4]);let h;t[5]===Symbol.for(`react.memo_cache_sentinel`)?(h=(0,q.jsx)(Xn,{children:(0,q.jsx)(Yi,{})}),t[5]=h):h=t[5];let g;t[6]===Symbol.for(`react.memo_cache_sentinel`)?(g=(0,q.jsx)(xr,{children:(0,q.jsx)(qi,{})}),t[6]=g):g=t[6];let _;t[7]===s?_=t[8]:(_=s?(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Ki,{recording:s})}):null,t[7]=s,t[8]=_);let v;t[9]!==l||t[10]!==i||t[11]!==a||t[12]!==o?(v=l?null:(0,q.jsx)(G.Suspense,{children:(0,q.jsx)(Ji,{name:i,missionType:a,onLoadingChange:o},`${i}~${a}`)}),t[9]=l,t[10]=i,t[11]=a,t[12]=o,t[13]=v):v=t[13];let y,b;t[14]===Symbol.for(`react.memo_cache_sentinel`)?(y=(0,q.jsx)(ki,{}),b=(0,q.jsx)(Ir,{}),t[14]=y,t[15]=b):(y=t[14],b=t[15]);let x;t[16]!==_||t[17]!==v?(x=(0,q.jsx)(Dt,{children:(0,q.jsxs)(fe,{children:[u,d,(0,q.jsxs)(Ve,{children:[f,p,m,h,g,_,v,y,b]})]})}),t[16]=_,t[17]=v,t[18]=x):x=t[18];let S;return t[19]!==n||t[20]!==r||t[21]!==x?(S=(0,q.jsx)(wt,{dpr:n,onCreated:r,children:x}),t[19]=n,t[20]=r,t[21]=x,t[22]=S):S=t[22],S});export{Xi as GameView};