(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,29418,e=>{e.v({Bottom:"PlayerNameplate-module__zYDm0a__Bottom PlayerNameplate-module__zYDm0a__Root",HealthBar:"PlayerNameplate-module__zYDm0a__HealthBar",HealthFill:"PlayerNameplate-module__zYDm0a__HealthFill",IffArrow:"PlayerNameplate-module__zYDm0a__IffArrow",Name:"PlayerNameplate-module__zYDm0a__Name",Root:"PlayerNameplate-module__zYDm0a__Root",Top:"PlayerNameplate-module__zYDm0a__Top PlayerNameplate-module__zYDm0a__Root"})},78779,e=>{e.v({Distance:"FlagMarker-module__INpLba__Distance",Icon:"FlagMarker-module__INpLba__Icon",Root:"FlagMarker-module__INpLba__Root"})},87297,38437,e=>{"use strict";var t=e.i(43476),r=e.i(932),a=e.i(71645),i=e.i(90072),o=e.i(71753);e.i(13876);var l=e.i(92224),n=e.i(77964),s=e.i(93784),u=e.i(91907),c=e.i(25947),f=e.i(89887),d=e.i(79123),m=e.i(68294);function g(e){let t,o,l,n,s=(0,r.c)(12),{entity:u}=e,{registerCamera:c,unregisterCamera:f}=(0,m.useCameras)(),d=(0,a.useId)(),g=u.cameraDataBlock;s[0]!==u.position?(t=u.position?new i.Vector3(...u.position):new i.Vector3,s[0]=u.position,s[1]=t):t=s[1];let h=t;s[2]!==u.rotation?(o=u.rotation?new i.Quaternion(...u.rotation):new i.Quaternion,s[2]=u.rotation,s[3]=o):o=s[3];let p=o;return s[4]!==g||s[5]!==d||s[6]!==h||s[7]!==c||s[8]!==p||s[9]!==f?(l=()=>{if("Observer"===g){let e={id:d,position:h,rotation:p};return c(e),()=>{f(e)}}},n=[d,g,c,f,h,p],s[4]=g,s[5]=d,s[6]=h,s[7]=c,s[8]=p,s[9]=f,s[10]=l,s[11]=n):(l=s[10],n=s[11]),(0,a.useEffect)(l,n),null}function h(e){let a,i=(0,r.c)(3),{entity:o}=e;return i[0]!==o.label||i[1]!==o.position?(a=o.label?(0,t.jsx)(f.FloatingLabel,{position:o.position,opacity:.6,children:o.label}):null,i[0]=o.label,i[1]=o.position,i[2]=a):a=i[2],a}var p=e.i(15080),v=e.i(66027),x=e.i(63318),b=e.i(12979),y=e.i(75567),S=e.i(47071);let F={sunLightPointsDown:{value:!0}};function w(e){F.sunLightPointsDown.value=e}e.s(["globalSunUniforms",0,F,"updateGlobalSunUniforms",()=>w],38437);let T=`
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
`;var M=e.i(47021),D=e.i(48066);let C={0:32,1:32,2:32,3:32,4:32,5:32},j=(0,a.memo)(function({displacementMap:e,visibilityMask:r,textureNames:o,alphaTextures:l,detailTextureName:n,lightmap:s}){let{debugMode:u}=(0,d.useDebug)(),c=(0,S.useTexture)(o.map(e=>(0,b.terrainTextureToUrl)(e)),e=>{e.forEach(e=>(0,y.setupTexture)(e))}),f=n?(0,b.textureToUrl)(n):null,m=(0,S.useTexture)(f??b.FALLBACK_TEXTURE_URL,e=>{(0,y.setupTexture)(e)}),g=(0,a.useCallback)(e=>{!function({shader:e,baseTextures:t,alphaTextures:r,visibilityMask:a,tiling:i,detailTexture:o=null,lightmap:l=null}){e.uniforms.sunLightPointsDown=F.sunLightPointsDown;let n=t.length;if(t.forEach((t,r)=>{e.uniforms[`albedo${r}`]={value:t}}),r.forEach((t,r)=>{e.uniforms[`mask${r}`]={value:t}}),a&&(e.uniforms.visibilityMask={value:a}),t.forEach((t,r)=>{e.uniforms[`tiling${r}`]={value:i[r]??32}}),l&&(e.uniforms.terrainLightmap={value:l}),o&&(e.uniforms.detailTexture={value:o},e.uniforms.detailTiling={value:64},e.uniforms.detailFadeDistance={value:150},e.vertexShader=e.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vTerrainWorldPos;`),e.vertexShader=e.vertexShader.replace("#include <worldpos_vertex>",`#include <worldpos_vertex>
vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`)),e.fragmentShader=`
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
${a?"uniform sampler2D visibilityMask;":""}
${l?"uniform sampler2D terrainLightmap;":""}
uniform bool sunLightPointsDown;
${o?`uniform sampler2D detailTexture;
uniform float detailTiling;
uniform float detailFadeDistance;
varying vec3 vTerrainWorldPos;`:""}

${T}

// Global variable to store shadow factor from RE_Direct for use in output calculation
float terrainShadowFactor = 1.0;
`+e.fragmentShader,a){let t="#include <clipping_planes_fragment>";e.fragmentShader=e.fragmentShader.replace(t,`${t}
  // Early discard for invisible areas (before fog/lighting)
  float visibility = texture2D(visibilityMask, vMapUv).r;
  if (visibility < 0.5) {
    discard;
  }
  `)}e.fragmentShader=e.fragmentShader.replace("#include <map_fragment>",`
  // Sample base albedo layers (sRGB textures auto-decoded to linear by Three.js)
  vec2 baseUv = vMapUv;
  vec3 c0 = texture2D(albedo0, baseUv * vec2(tiling0)).rgb;
  ${n>1?"vec3 c1 = texture2D(albedo1, baseUv * vec2(tiling1)).rgb;":""}
  ${n>2?"vec3 c2 = texture2D(albedo2, baseUv * vec2(tiling2)).rgb;":""}
  ${n>3?"vec3 c3 = texture2D(albedo3, baseUv * vec2(tiling3)).rgb;":""}
  ${n>4?"vec3 c4 = texture2D(albedo4, baseUv * vec2(tiling4)).rgb;":""}
  ${n>5?"vec3 c5 = texture2D(albedo5, baseUv * vec2(tiling5)).rgb;":""}

  // Sample alpha masks for all layers (use R channel)
  // Add +0.5 texel offset: Torque samples alpha at grid corners (integer indices),
  // but GPU linear filtering samples at texel centers. This offset aligns them.
  vec2 alphaUv = baseUv + vec2(0.5 / 256.0);
  float a0 = texture2D(mask0, alphaUv).r;
  ${n>1?"float a1 = texture2D(mask1, alphaUv).r;":""}
  ${n>2?"float a2 = texture2D(mask2, alphaUv).r;":""}
  ${n>3?"float a3 = texture2D(mask3, alphaUv).r;":""}
  ${n>4?"float a4 = texture2D(mask4, alphaUv).r;":""}
  ${n>5?"float a5 = texture2D(mask5, alphaUv).r;":""}

  // Torque-style additive weighted blending (blender.cc):
  // result = tex0 * alpha0 + tex1 * alpha1 + tex2 * alpha2 + ...
  // Each layer's alpha map defines its contribution weight.
  vec3 blended = c0 * a0;
  ${n>1?"blended += c1 * a1;":""}
  ${n>2?"blended += c2 * a2;":""}
  ${n>3?"blended += c3 * a3;":""}
  ${n>4?"blended += c4 * a4;":""}
  ${n>5?"blended += c5 * a5;":""}

  // Assign to diffuseColor before lighting
  vec3 textureColor = blended;

  ${o?`// Detail texture blending (Torque-style multiplicative blend)
  // Sample detail texture at high frequency tiling
  vec3 detailColor = texture2D(detailTexture, baseUv * detailTiling).rgb;

  // Calculate distance-based fade factor using world positions
  // Torque: distFactor = (zeroDetailDistance - distance) / zeroDetailDistance
  float distToCamera = distance(vTerrainWorldPos, cameraPosition);
  float detailFade = clamp(1.0 - distToCamera / detailFadeDistance, 0.0, 1.0);

  // Torque blending: dst * lerp(1.0, detailTexel, fadeFactor)
  // Detail textures are authored with bright values (~0.8 mean), not 0.5 gray
  // Direct multiplication adds subtle darkening for surface detail
  textureColor *= mix(vec3(1.0), detailColor, detailFade);`:""}

  // Store blended texture in diffuseColor (still in linear space here)
  // We'll convert to sRGB in the output calculation
  diffuseColor.rgb = textureColor;
`),l&&(e.fragmentShader=e.fragmentShader.replace("#include <lights_lambert_pars_fragment>",`#include <lights_lambert_pars_fragment>

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

`),e.fragmentShader=e.fragmentShader.replace("#include <lights_fragment_begin>",`#include <lights_fragment_begin>
// Clear indirect diffuse - we'll compute ambient in gamma space
#if defined( RE_IndirectDiffuse )
  irradiance = vec3(0.0);
#endif
`),e.fragmentShader=e.fragmentShader.replace("#include <lights_fragment_end>",`#include <lights_fragment_end>
  // Clear Three.js lighting - we compute everything in gamma space
  reflectedLight.directDiffuse = vec3(0.0);
  reflectedLight.indirectDiffuse = vec3(0.0);
`)),e.fragmentShader=e.fragmentShader.replace("#include <opaque_fragment>",`// Torque-style terrain lighting: output = clamp(lighting \xd7 texture, 0, 1) in sRGB space
{
  // Get texture in sRGB space (undo Three.js linear decode)
  vec3 textureSRGB = terrainLinearToSRGB(diffuseColor.rgb);

  ${l?`
  // Sample terrain lightmap for smooth NdotL
  vec2 lightmapUv = vMapUv + vec2(0.5 / 512.0);
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

  // Torque formula: output = clamp(lighting \xd7 texture, 0, 1) in sRGB/gamma space
  vec3 resultSRGB = clamp(lightingSRGB * textureSRGB, 0.0, 1.0);

  // Convert back to linear for Three.js output pipeline
  outgoingLight = terrainSRGBToLinear(resultSRGB) + totalEmissiveRadiance;
}
#include <opaque_fragment>`),e.fragmentShader=e.fragmentShader.replace("#include <tonemapping_fragment>",`#if DEBUG_MODE
  // Debug mode: overlay green grid matching terrain grid squares (256x256)
  float gridIntensity = terrainDebugGrid(vMapUv, 256.0, 1.5);
  vec3 gridColor = vec3(0.0, 0.8, 0.4); // Green
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gridColor, gridIntensity * 0.1);
#endif

#include <tonemapping_fragment>`)}({shader:e,baseTextures:c,alphaTextures:l,visibilityMask:r,tiling:C,detailTexture:f?m:null,lightmap:s}),(0,M.injectCustomFog)(e,D.globalFogUniforms)},[c,l,r,m,f,s]),h=(0,a.useRef)(null);(0,a.useEffect)(()=>{let e=h.current;e&&(e.defines??={},e.defines.DEBUG_MODE=+!!u,e.needsUpdate=!0)},[u]);let p=`${f?"detail":"nodetail"}-${s?"lightmap":"nolightmap"}`;return(0,t.jsx)("meshLambertMaterial",{ref:h,map:e,depthWrite:!0,side:i.FrontSide,defines:{DEBUG_MODE:+!!u},onBeforeCompile:g},p)}),_=(0,a.memo)(function(e){let i,o,l=(0,r.c)(8),{displacementMap:n,visibilityMask:s,textureNames:u,alphaTextures:c,detailTextureName:f,lightmap:d}=e;return l[0]===Symbol.for("react.memo_cache_sentinel")?(i=(0,t.jsx)("meshLambertMaterial",{color:"rgb(0, 109, 56)",wireframe:!0}),l[0]=i):i=l[0],l[1]!==c||l[2]!==f||l[3]!==n||l[4]!==d||l[5]!==u||l[6]!==s?(o=(0,t.jsx)(a.Suspense,{fallback:i,children:(0,t.jsx)(j,{displacementMap:n,visibilityMask:s,textureNames:u,alphaTextures:c,detailTextureName:f,lightmap:d})}),l[1]=c,l[2]=f,l[3]=n,l[4]=d,l[5]=u,l[6]=s,l[7]=o):o=l[7],o}),k=(0,a.memo)(function(e){let a,i,o,l=(0,r.c)(15),{tileX:n,tileZ:s,blockSize:u,basePosition:c,textureNames:f,geometry:d,displacementMap:m,visibilityMask:g,alphaTextures:h,detailTextureName:p,lightmap:v,visible:x}=e,b=void 0===x||x,y=u/2,S=c.x+n*u+y,F=c.z+s*u+y;l[0]!==S||l[1]!==F?(a=[S,0,F],l[0]=S,l[1]=F,l[2]=a):a=l[2];let w=a;return l[3]!==h||l[4]!==p||l[5]!==m||l[6]!==v||l[7]!==f||l[8]!==g?(i=(0,t.jsx)(_,{displacementMap:m,visibilityMask:g,textureNames:f,alphaTextures:h,detailTextureName:p,lightmap:v}),l[3]=h,l[4]=p,l[5]=m,l[6]=v,l[7]=f,l[8]=g,l[9]=i):i=l[9],l[10]!==d||l[11]!==w||l[12]!==i||l[13]!==b?(o=(0,t.jsx)("mesh",{position:w,geometry:d,castShadow:!0,receiveShadow:!0,visible:b,children:i}),l[10]=d,l[11]=w,l[12]=i,l[13]=b,l[14]=o):o=l[14],o});var R=e.i(8328);function B(e){let t=new Uint8Array(65536);for(let r of(t.fill(255),e)){let e=255&r,a=r>>8&255,i=r>>16,o=256*a;for(let r=0;r<i;r++){let a=o+e+r;a<t.length&&(t[a]=0)}}let r=new i.DataTexture(t,256,256,i.RedFormat,i.UnsignedByteType);return r.colorSpace=i.NoColorSpace,r.wrapS=r.wrapT=i.ClampToEdgeWrapping,r.magFilter=i.NearestFilter,r.minFilter=i.NearestFilter,r.needsUpdate=!0,r}let L=(0,a.memo)(function(e){let n,s,u,c,f,d,m,g,h,y,S,F,w,T,M,D,C,j,_,L,I,A=(0,r.c)(67),{scene:E}=e,P=E.terrFileName,H=E.squareSize||8,V=E.detailTextureName||void 0,q=256*H,$=(_=(0,l.useSceneSky)())&&_.visibleDistance>0?_.visibleDistance:600,W=(0,p.useThree)(G),O=-(128*H);A[0]!==O?(n={x:O,z:O},A[0]=O,A[1]=n):n=A[1];let Y=n;A[2]!==E.emptySquareRuns?(s=E.emptySquareRuns??[],A[2]=E.emptySquareRuns,A[3]=s):s=A[3];let K=s,{data:Q}=((I=(0,r.c)(2))[0]!==P?(L={queryKey:["terrain",P],queryFn:()=>(0,b.loadTerrain)(P)},I[0]=P,I[1]=L):L=I[1],(0,v.useQuery)(L));e:{let e;if(!Q){u=null;break e}let t=256*H;A[4]!==t||A[5]!==H||A[6]!==Q.heightMap?(!function(e,t,r){let a=e.attributes.position,i=e.attributes.uv,o=e.attributes.normal,l=a.array,n=i.array,s=o.array,u=a.count,c=(e,r)=>(e=Math.max(0,Math.min(255,e)),t[256*(r=Math.max(0,Math.min(255,r)))+e]/65535*2048),f=(e,r)=>{let a=Math.floor(e=Math.max(0,Math.min(255,e))),i=Math.floor(r=Math.max(0,Math.min(255,r))),o=Math.min(a+1,255),l=Math.min(i+1,255),n=e-a,s=r-i;return(t[256*i+a]/65535*2048*(1-n)+t[256*i+o]/65535*2048*n)*(1-s)+(t[256*l+a]/65535*2048*(1-n)+t[256*l+o]/65535*2048*n)*s};for(let e=0;e<u;e++){let t=n[2*e],a=n[2*e+1],i=c(255&Math.floor(256*t),255&Math.floor(256*a));l[3*e+1]=i;let o=255*t,u=255*a,d=f(o-1,u),m=f(o+1,u),g=(f(o,u+1)-f(o,u-1))/2,h=r,p=(m-d)/2,v=Math.sqrt(g*g+h*h+p*p);v>0?(g/=v,h/=v,p/=v):(g=0,h=1,p=0),s[3*e]=g,s[3*e+1]=h,s[3*e+2]=p}a.needsUpdate=!0,o.needsUpdate=!0}(e=function(e,t){let r=new i.BufferGeometry,a=new Float32Array(198147),o=new Float32Array(198147),l=new Float32Array(132098),n=new Uint32Array(393216),s=0,u=e/256;for(let t=0;t<=256;t++)for(let r=0;r<=256;r++){let i=257*t+r;a[3*i]=r*u-e/2,a[3*i+1]=e/2-t*u,a[3*i+2]=0,o[3*i]=0,o[3*i+1]=0,o[3*i+2]=1,l[2*i]=r/256,l[2*i+1]=1-t/256}for(let e=0;e<256;e++)for(let t=0;t<256;t++){let r=257*e+t,a=r+1,i=(e+1)*257+t,o=i+1;((t^e)&1)==0?(n[s++]=r,n[s++]=i,n[s++]=o,n[s++]=r,n[s++]=o,n[s++]=a):(n[s++]=r,n[s++]=i,n[s++]=a,n[s++]=a,n[s++]=i,n[s++]=o)}return r.setIndex(new i.BufferAttribute(n,1)),r.setAttribute("position",new i.Float32BufferAttribute(a,3)),r.setAttribute("normal",new i.Float32BufferAttribute(o,3)),r.setAttribute("uv",new i.Float32BufferAttribute(l,2)),r.rotateX(-Math.PI/2),r.rotateY(-Math.PI/2),r}(t,0),Q.heightMap,H),A[4]=t,A[5]=H,A[6]=Q.heightMap,A[7]=e):e=A[7],u=e}let X=u;A[8]!==H||A[9]!==Q?(c=()=>{if(Q)return(0,R.setTerrainHeightSampler)((0,R.createTerrainHeightSampler)(Q.heightMap,H)),z},f=[Q,H],A[8]=H,A[9]=Q,A[10]=c,A[11]=f):(c=A[10],f=A[11]),(0,a.useEffect)(c,f);let Z=(0,l.useSceneSun)();t:{let e,t;if(!Z){let e;A[12]===Symbol.for("react.memo_cache_sentinel")?(e=new i.Vector3(.57735,-.57735,.57735),A[12]=e):e=A[12],d=e;break t}A[13]!==Z.direction?(e=(0,x.torqueToThree)(Z.direction),A[13]=Z.direction,A[14]=e):e=A[14];let[r,a,o]=e,l=Math.sqrt(r*r+a*a+o*o),n=r/l,s=a/l,u=o/l;A[15]!==u||A[16]!==n||A[17]!==s?(t=new i.Vector3(n,s,u),A[15]=u,A[16]=n,A[17]=s,A[18]=t):t=A[18],d=t}let J=d;r:{let e;if(!Q){m=null;break r}A[19]!==H||A[20]!==J||A[21]!==Q.heightMap?(e=function(e,t,r){let a=(t,r)=>{let a=Math.max(0,Math.min(255,t)),i=Math.max(0,Math.min(255,r)),o=Math.floor(a),l=Math.floor(i),n=Math.min(o+1,255),s=Math.min(l+1,255),u=a-o,c=i-l;return((e[256*l+o]/65535*(1-u)+e[256*l+n]/65535*u)*(1-c)+(e[256*s+o]/65535*(1-u)+e[256*s+n]/65535*u)*c)*2048},o=new i.Vector3(-t.x,-t.y,-t.z).normalize(),l=new Uint8Array(262144);for(let e=0;e<512;e++)for(let t=0;t<512;t++){let i=t/2+.25,n=e/2+.25,s=a(i,n),u=a(i-.5,n),c=a(i+.5,n),f=a(i,n-.5),d=-((a(i,n+.5)-f)/1),m=-((c-u)/1),g=Math.sqrt(d*d+r*r+m*m),h=Math.max(0,d/g*o.x+r/g*o.y+m/g*o.z),p=1;h>0&&(p=function(e,t,r,a,i,o){let l=a.z/i,n=a.x/i,s=a.y,u=Math.sqrt(l*l+n*n);if(u<1e-4)return 1;let c=.5/u,f=l*c,d=n*c,m=s*c,g=e,h=t,p=r+.1;for(let e=0;e<768&&(g+=f,h+=d,p+=m,!(g<0)&&!(g>=256)&&!(h<0)&&!(h>=256)&&!(p>2048));e++)if(p<o(g,h))return 0;return 1}(i,n,s,o,r,a)),l[512*e+t]=Math.floor(h*p*255)}let n=new i.DataTexture(l,512,512,i.RedFormat,i.UnsignedByteType);return n.colorSpace=i.NoColorSpace,n.generateMipmaps=!0,n.wrapS=i.ClampToEdgeWrapping,n.wrapT=i.ClampToEdgeWrapping,n.magFilter=i.LinearFilter,n.minFilter=i.LinearFilter,n.needsUpdate=!0,n}(Q.heightMap,J,H),A[19]=H,A[20]=J,A[21]=Q.heightMap,A[22]=e):e=A[22],m=e}let ee=m;a:{let e;if(!Q){g=null;break a}if(A[23]!==Q.heightMap){let t=function(e){let t=new Float32Array(e.length);for(let r=0;r<e.length;r++)t[r]=e[r]/65535;return t}(Q.heightMap);(e=new i.DataTexture(t,256,256,i.RedFormat,i.FloatType)).colorSpace=i.NoColorSpace,e.generateMipmaps=!1,e.wrapS=i.RepeatWrapping,e.wrapT=i.RepeatWrapping,e.needsUpdate=!0,A[23]=Q.heightMap,A[24]=e}else e=A[24];g=e}let et=g;A[25]!==K?(h=B(K),A[25]=K,A[26]=h):h=A[26];let er=h;A[27]===Symbol.for("react.memo_cache_sentinel")?(y=B([]),A[27]=y):y=A[27];let ea=y;i:{let e;if(!Q){S=null;break i}A[28]!==Q.alphaMaps?(e=Q.alphaMaps.map(U),A[28]=Q.alphaMaps,A[29]=e):e=A[29],S=e}let ei=S,eo=2*Math.ceil($/q)+1,el=eo*eo-1;A[30]!==el?(F=Array.from({length:el},N),A[30]=el,A[31]=F):F=A[31];let en=F;A[32]!==el?(w=()=>Array(el).fill(null),A[32]=el,A[33]=w):w=A[33];let[es,eu]=(0,a.useState)(w);A[34]===Symbol.for("react.memo_cache_sentinel")?(T={xStart:0,xEnd:0,zStart:0,zEnd:0},A[34]=T):T=A[34];let ec=(0,a.useRef)(T);return(A[35]!==Y.x||A[36]!==Y.z||A[37]!==q||A[38]!==W.position.x||A[39]!==W.position.z||A[40]!==el||A[41]!==$?(M=()=>{let e=W.position.x-Y.x,t=W.position.z-Y.z,r=Math.floor((e-$)/q),a=Math.ceil((e+$)/q),i=Math.floor((t-$)/q),o=Math.ceil((t+$)/q),l=ec.current;if(r===l.xStart&&a===l.xEnd&&i===l.zStart&&o===l.zEnd)return;l.xStart=r,l.xEnd=a,l.zStart=i,l.zEnd=o;let n=[];for(let e=r;e<a;e++)for(let t=i;t<o;t++)(0!==e||0!==t)&&n.push({tileX:e,tileZ:t});for(;n.length<el;)n.push(null);eu(n)},A[35]=Y.x,A[36]=Y.z,A[37]=q,A[38]=W.position.x,A[39]=W.position.z,A[40]=el,A[41]=$,A[42]=M):M=A[42],(0,o.useFrame)(M),Q&&X&&et&&ei)?(A[43]!==Y||A[44]!==q||A[45]!==V||A[46]!==er||A[47]!==ei||A[48]!==et||A[49]!==X||A[50]!==Q.textureNames||A[51]!==ee?(D=(0,t.jsx)(k,{tileX:0,tileZ:0,blockSize:q,basePosition:Y,textureNames:Q.textureNames,geometry:X,displacementMap:et,visibilityMask:er,alphaTextures:ei,detailTextureName:V,lightmap:ee}),A[43]=Y,A[44]=q,A[45]=V,A[46]=er,A[47]=ei,A[48]=et,A[49]=X,A[50]=Q.textureNames,A[51]=ee,A[52]=D):D=A[52],A[53]!==Y||A[54]!==q||A[55]!==V||A[56]!==en||A[57]!==ei||A[58]!==et||A[59]!==X||A[60]!==Q.textureNames||A[61]!==ee||A[62]!==es?(C=en.map(e=>{let r=es[e];return(0,t.jsx)(k,{tileX:r?.tileX??0,tileZ:r?.tileZ??0,blockSize:q,basePosition:Y,textureNames:Q.textureNames,geometry:X,displacementMap:et,visibilityMask:ea,alphaTextures:ei,detailTextureName:V,lightmap:ee,visible:null!==r},e)}),A[53]=Y,A[54]=q,A[55]=V,A[56]=en,A[57]=ei,A[58]=et,A[59]=X,A[60]=Q.textureNames,A[61]=ee,A[62]=es,A[63]=C):C=A[63],A[64]!==D||A[65]!==C?(j=(0,t.jsxs)(t.Fragment,{children:[D,C]}),A[64]=D,A[65]=C,A[66]=j):j=A[66],j):null});function G(e){return e.camera}function z(){return(0,R.setTerrainHeightSampler)(null)}function U(e){return(0,y.setupMask)(e)}function N(e,t){return t}var I=e.i(8597),A=e.i(78140);let E=`
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
`;function P({materialName:e,material:r,lightMap:o}){let l=(0,d.useDebug)(),n=l?.debugMode??!1,s=(0,b.textureToUrl)(e),u=(0,S.useTexture)(s,e=>(0,y.setupTexture)(e)),c=new Set(r?.userData?.flag_names??[]).has("SelfIlluminating"),f=new Set(r?.userData?.surface_flag_names??[]).has("SurfaceOutsideVisible"),m=(0,a.useCallback)(e=>{let t;(0,M.injectCustomFog)(e,D.globalFogUniforms),t=f??!1,e.uniforms.useSceneLighting={value:t},e.uniforms.interiorDebugColor={value:t?new i.Vector3(0,.4,1):new i.Vector3(1,.2,0)},e.fragmentShader=e.fragmentShader.replace("#include <common>",`#include <common>
${E}
uniform bool useSceneLighting;
uniform vec3 interiorDebugColor;
`),e.fragmentShader=e.fragmentShader.replace("#include <lights_fragment_maps>",`// Lightmap handled in custom output calculation
#ifdef USE_LIGHTMAP
  vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
#endif`),e.fragmentShader=e.fragmentShader.replace("#include <opaque_fragment>",`// Torque-style lighting: output = clamp(lighting \xd7 texture, 0, 1) in sRGB space
// Get texture in sRGB space (undo Three.js linear decode)
vec3 textureSRGB = interiorLinearToSRGB(diffuseColor.rgb);

// Compute lighting in sRGB space
vec3 lightingSRGB = vec3(0.0);

if (useSceneLighting) {
  // Three.js computed: reflectedLight = lighting \xd7 texture_linear / PI
  // Extract pure lighting: lighting = reflectedLight \xd7 PI / texture_linear
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

// Torque formula: output = clamp(lighting \xd7 texture, 0, 1) in sRGB/gamma space
vec3 resultSRGB = clamp(lightingSRGB * textureSRGB, 0.0, 1.0);

// Convert back to linear for Three.js output pipeline
vec3 resultLinear = interiorSRGBToLinear(resultSRGB);

// Reassign outgoingLight before opaque_fragment consumes it
outgoingLight = resultLinear + totalEmissiveRadiance;

#include <opaque_fragment>`),e.fragmentShader=e.fragmentShader.replace("#include <tonemapping_fragment>",`// Debug mode: overlay colored grid on top of normal rendering
// Blue grid = SurfaceOutsideVisible (receives scene ambient light)
// Red grid = inside surface (no scene ambient light)
#if DEBUG_MODE && defined(USE_MAP)
  // gridSize=4 creates 4x4 grid per UV tile, lineWidth=1.5 is ~1.5 pixels wide
  float gridIntensity = debugGrid(vMapUv, 4.0, 1.5);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, interiorDebugColor, gridIntensity * 0.1);
#endif

#include <tonemapping_fragment>`)},[f]),g=(0,a.useRef)(null),h=(0,a.useRef)(null);(0,a.useEffect)(()=>{let e=g.current??h.current;e&&(e.defines??={},e.defines.DEBUG_MODE=+!!n,e.needsUpdate=!0)},[n]);let p={DEBUG_MODE:+!!n},v=`${f}`;return c?(0,t.jsx)("meshBasicMaterial",{ref:g,map:u,toneMapped:!1,defines:p,onBeforeCompile:m},v):(0,t.jsx)("meshLambertMaterial",{ref:h,map:u,lightMap:o,toneMapped:!1,defines:p,onBeforeCompile:m},v)}function H(e){if(!e)return null;let t=e.emissiveMap;return t&&(t.colorSpace=i.SRGBColorSpace),t??null}function V(e){let i,o,l,n=(0,r.c)(13),{node:s}=e;e:{let e,t;if(!s.material){let e;n[0]===Symbol.for("react.memo_cache_sentinel")?(e=[],n[0]=e):e=n[0],i=e;break e}if(Array.isArray(s.material)){let e;n[1]!==s.material?(e=s.material.map(q),n[1]=s.material,n[2]=e):e=n[2],i=e;break e}n[3]!==s.material?(e=H(s.material),n[3]=s.material,n[4]=e):e=n[4],n[5]!==e?(t=[e],n[5]=e,n[6]=t):t=n[6],i=t}let u=i;return n[7]!==u||n[8]!==s.material?(o=s.material?(0,t.jsx)(a.Suspense,{fallback:(0,t.jsx)("meshStandardMaterial",{color:"yellow",wireframe:!0}),children:Array.isArray(s.material)?s.material.map((e,r)=>(0,t.jsx)(P,{materialName:e.userData.resource_path,material:e,lightMap:u[r]},r)):(0,t.jsx)(P,{materialName:s.material.userData.resource_path,material:s.material,lightMap:u[0]})}):null,n[7]=u,n[8]=s.material,n[9]=o):o=n[9],n[10]!==s.geometry||n[11]!==o?(l=(0,t.jsx)("mesh",{geometry:s.geometry,castShadow:!0,receiveShadow:!0,children:o}),n[10]=s.geometry,n[11]=o,n[12]=l):l=n[12],l}function q(e){return H(e)}let $=(0,a.memo)(function(e){let a,i,o,l,n,s,u,c=(0,r.c)(10),{interiorFile:m,ghostIndex:g}=e,{nodes:h}=((s=(0,r.c)(2))[0]!==m?(n=(0,b.interiorToUrl)(m),s[0]=m,s[1]=n):n=s[1],u=n,(0,A.useGLTF)(u)),p=(0,d.useDebug)(),v=p?.debugMode??!1;return c[0]===Symbol.for("react.memo_cache_sentinel")?(a=[0,-Math.PI/2,0],c[0]=a):a=c[0],c[1]!==h?(i=Object.entries(h).filter(K).map(Q),c[1]=h,c[2]=i):i=c[2],c[3]!==v||c[4]!==g||c[5]!==m?(o=v?(0,t.jsxs)(f.FloatingLabel,{children:[g,": ",m]}):null,c[3]=v,c[4]=g,c[5]=m,c[6]=o):o=c[6],c[7]!==i||c[8]!==o?(l=(0,t.jsxs)("group",{rotation:a,children:[i,o]}),c[7]=i,c[8]=o,c[9]=l):l=c[9],l});function W(e){let a,i,o,l,n=(0,r.c)(9),{color:s,label:u}=e;return n[0]===Symbol.for("react.memo_cache_sentinel")?(a=(0,t.jsx)("boxGeometry",{args:[10,10,10]}),n[0]=a):a=n[0],n[1]!==s?(i=(0,t.jsx)("meshStandardMaterial",{color:s,wireframe:!0}),n[1]=s,n[2]=i):i=n[2],n[3]!==s||n[4]!==u?(o=u?(0,t.jsx)(f.FloatingLabel,{color:s,children:u}):null,n[3]=s,n[4]=u,n[5]=o):o=n[5],n[6]!==i||n[7]!==o?(l=(0,t.jsxs)("mesh",{children:[a,i,o]}),n[6]=i,n[7]=o,n[8]=l):l=n[8],l}function O(e){let a,i=(0,r.c)(3),{label:o}=e,l=(0,d.useDebug)(),n=l?.debugMode??!1;return i[0]!==n||i[1]!==o?(a=n?(0,t.jsx)(W,{color:"red",label:o}):null,i[0]=n,i[1]=o,i[2]=a):a=i[2],a}let Y=(0,a.memo)(function(e){let i,o,l,n,s,u,c,f,d,m=(0,r.c)(23),{scene:g}=e;m[0]!==g.transform.position?(i=(0,x.torqueToThree)(g.transform.position),m[0]=g.transform.position,m[1]=i):i=m[1];let h=i;m[2]!==g.transform?(o=(0,x.matrixFToQuaternion)(g.transform),m[2]=g.transform,m[3]=o):o=m[3];let p=o;m[4]!==g.scale?(l=(0,x.torqueScaleToThree)(g.scale),m[4]=g.scale,m[5]=l):l=m[5];let v=l,b=`${g.ghostIndex}: ${g.interiorFile}`;return m[6]!==b?(n=(0,t.jsx)(O,{label:b}),m[6]=b,m[7]=n):n=m[7],m[8]!==g.interiorFile?(s=e=>{console.warn(`[interior] Failed to load ${g.interiorFile}:`,e.message)},m[8]=g.interiorFile,m[9]=s):s=m[9],m[10]===Symbol.for("react.memo_cache_sentinel")?(u=(0,t.jsx)(W,{color:"orange"}),m[10]=u):u=m[10],m[11]!==g.ghostIndex||m[12]!==g.interiorFile?(c=(0,t.jsx)(a.Suspense,{fallback:u,children:(0,t.jsx)($,{interiorFile:g.interiorFile,ghostIndex:g.ghostIndex})}),m[11]=g.ghostIndex,m[12]=g.interiorFile,m[13]=c):c=m[13],m[14]!==n||m[15]!==s||m[16]!==c?(f=(0,t.jsx)(I.ErrorBoundary,{fallback:n,onError:s,children:c}),m[14]=n,m[15]=s,m[16]=c,m[17]=f):f=m[17],m[18]!==h||m[19]!==p||m[20]!==v||m[21]!==f?(d=(0,t.jsx)("group",{position:h,quaternion:p,scale:v,children:f}),m[18]=h,m[19]=p,m[20]=v,m[21]=f,m[22]=d):d=m[22],d});function K(e){let[,t]=e;return t.isMesh}function Q(e){let[r,a]=e;return(0,t.jsx)(V,{node:a},r)}var X=e.i(99143);function Z(e,{path:t}){let[r]=(0,X.useLoader)(i.CubeTextureLoader,[e],e=>e.setPath(t));return r}Z.preload=(e,{path:t})=>X.useLoader.preload(i.CubeTextureLoader,[e],e=>e.setPath(t));let J=()=>{};function ee(e){return e.wrapS=i.RepeatWrapping,e.wrapT=i.RepeatWrapping,e.minFilter=i.LinearFilter,e.magFilter=i.LinearFilter,e.colorSpace=i.NoColorSpace,e.needsUpdate=!0,e}let et=`
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
`,er=`
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

    // Tribes 2 uses GL_MODULATE: final = texture \xd7 vertex color
    // Vertex color is white with varying alpha, so:
    // Final RGB = Texture RGB \xd7 1.0 = Texture RGB
    // Final Alpha = Texture Alpha \xd7 Vertex Alpha
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
`;function ea({textureUrl:e,radius:r,heightPercent:l,speed:n,windDirection:s,layerIndex:u}){let{debugMode:c}=(0,d.useDebug)(),{animationEnabled:f}=(0,d.useSettings)(),m=(0,a.useRef)(null),g=(0,S.useTexture)(e,ee),h=(0,a.useMemo)(()=>{let e=l-.05;return function(e,t,r,a){var o;let l,n,s,u,c,f,d,m,g,h,p,v,x,b,y,S,F,w=new i.BufferGeometry,T=new Float32Array(75),M=new Float32Array(50),D=[.05,.05,.05,.05,.05,.05,r,r,r,.05,.05,r,t,r,.05,.05,r,r,r,.05,.05,.05,.05,.05,.05],C=2*e/4;for(let t=0;t<5;t++)for(let r=0;r<5;r++){let a=5*t+r,i=-e+r*C,o=e-t*C,l=e*D[a];T[3*a]=i,T[3*a+1]=l,T[3*a+2]=o,M[2*a]=r,M[2*a+1]=t}o=T,l=e=>({x:o[3*e],y:o[3*e+1],z:o[3*e+2]}),n=(e,t,r,a)=>{o[3*e]=t,o[3*e+1]=r,o[3*e+2]=a},s=l(1),u=l(3),c=l(5),f=l(6),d=l(8),m=l(9),g=l(15),h=l(16),p=l(18),v=l(19),x=l(21),b=l(23),y=c.x+(s.x-c.x)*.5,S=c.y+(s.y-c.y)*.5,F=c.z+(s.z-c.z)*.5,n(0,f.x+(y-f.x)*2,f.y+(S-f.y)*2,f.z+(F-f.z)*2),y=m.x+(u.x-m.x)*.5,S=m.y+(u.y-m.y)*.5,F=m.z+(u.z-m.z)*.5,n(4,d.x+(y-d.x)*2,d.y+(S-d.y)*2,d.z+(F-d.z)*2),y=x.x+(g.x-x.x)*.5,S=x.y+(g.y-x.y)*.5,F=x.z+(g.z-x.z)*.5,n(20,h.x+(y-h.x)*2,h.y+(S-h.y)*2,h.z+(F-h.z)*2),y=b.x+(v.x-b.x)*.5,S=b.y+(v.y-b.y)*.5,F=b.z+(v.z-b.z)*.5,n(24,p.x+(y-p.x)*2,p.y+(S-p.y)*2,p.z+(F-p.z)*2);let j=function(e,t){let r=new Float32Array(25);for(let a=0;a<25;a++){let i=e[3*a],o=e[3*a+2],l=1.3-Math.sqrt(i*i+o*o)/t;l<.4?l=0:l>.8&&(l=1),r[a]=l}return r}(T,e),_=[];for(let e=0;e<4;e++)for(let t=0;t<4;t++){let r=5*e+t,a=r+1,i=r+5,o=i+1;_.push(r,i,o),_.push(r,o,a)}return w.setIndex(_),w.setAttribute("position",new i.Float32BufferAttribute(T,3)),w.setAttribute("uv",new i.Float32BufferAttribute(M,2)),w.setAttribute("alpha",new i.Float32BufferAttribute(j,1)),w.computeBoundingSphere(),w}(r,l,e,0)},[r,l]);(0,a.useEffect)(()=>()=>{h.dispose()},[h]);let p=(0,a.useMemo)(()=>new i.ShaderMaterial({uniforms:{cloudTexture:{value:g},uvOffset:{value:new i.Vector2(0,0)},debugMode:{value:+!!c},layerIndex:{value:u}},vertexShader:et,fragmentShader:er,transparent:!0,depthWrite:!1,side:i.DoubleSide}),[g,c,u]);return(0,a.useEffect)(()=>()=>{p.dispose()},[p]),(0,o.useFrame)(f?(e,t)=>{let r=1e3*t/32;m.current??=new i.Vector2(0,0),m.current.x+=s.x*n*r,m.current.y+=s.y*n*r,m.current.x-=Math.floor(m.current.x),m.current.y-=Math.floor(m.current.y),p.uniforms.uvOffset.value.copy(m.current)}:J),(0,t.jsx)("mesh",{geometry:h,frustumCulled:!1,renderOrder:10,children:(0,t.jsx)("primitive",{object:p,attach:"material"})})}function ei(e){var l;let n,s,u,c,f,d,m,g,h,p,x,y=(0,r.c)(18),{scene:S}=e,{data:F}=(l=S.materialList||void 0,(p=(0,r.c)(7))[0]!==l?(m=["detailMapList",l],g=()=>(0,b.loadDetailMapList)(l),p[0]=l,p[1]=m,p[2]=g):(m=p[1],g=p[2]),x=!!l,p[3]!==m||p[4]!==g||p[5]!==x?(h={queryKey:m,queryFn:g,enabled:x},p[3]=m,p[4]=g,p[5]=x,p[6]=h):h=p[6],(0,v.useQuery)(h)),w=.95*(S.visibleDistance>0?S.visibleDistance:500);y[0]!==S.cloudLayers?(n=S.cloudLayers.map(el),y[0]=S.cloudLayers,y[1]=n):n=y[1];let T=n;y[2]!==S.cloudLayers?(s=S.cloudLayers.map(eo),y[2]=S.cloudLayers,y[3]=s):s=y[3];let M=s;e:{let e,{x:t,y:r}=S.windVelocity;if(0!==t||0!==r){let e;y[4]!==t||y[5]!==r?(e=new i.Vector2(r,-t).normalize(),y[4]=t,y[5]=r,y[6]=e):e=y[6],u=e;break e}y[7]===Symbol.for("react.memo_cache_sentinel")?(e=new i.Vector2(1,0),y[7]=e):e=y[7],u=e}let D=u;t:{let e;if(!F){let e;y[8]===Symbol.for("react.memo_cache_sentinel")?(e=[],y[8]=e):e=y[8],c=e;break t}if(y[9]!==M||y[10]!==T||y[11]!==F){e=[];for(let t=0;t<3;t++){let r=F[7+t];r&&e.push({texture:r,height:M[t],speed:T[t]})}y[9]=M,y[10]=T,y[11]=F,y[12]=e}else e=y[12];c=e}let C=c,j=(0,a.useRef)(null);return(y[13]===Symbol.for("react.memo_cache_sentinel")?(f=e=>{let{camera:t}=e;j.current&&j.current.position.copy(t.position)},y[13]=f):f=y[13],(0,o.useFrame)(f),C&&0!==C.length)?(y[14]!==C||y[15]!==w||y[16]!==D?(d=(0,t.jsx)("group",{ref:j,children:C.map((e,r)=>{let i=(0,b.textureToUrl)(e.texture);return(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(ea,{textureUrl:i,radius:w,heightPercent:e.height,speed:e.speed,windDirection:D,layerIndex:r})},r)})}),y[14]=C,y[15]=w,y[16]=D,y[17]=d):d=y[17],d):null}function eo(e,t){return e.heightPercent||[.35,.25,.2][t]}function el(e,t){return e.speed||[1e-4,2e-4,3e-4][t]}e.i(62395);let en=!1;function es(e){return[new i.Color().setRGB(e.r,e.g,e.b),new i.Color().setRGB(e.r,e.g,e.b).convertSRGBToLinear()]}function eu({skyBoxFiles:e,fogColor:r,fogState:o}){let{camera:l}=(0,p.useThree)(),n=Z(e,{path:""}),s=!!r,u=(0,a.useMemo)(()=>l.projectionMatrixInverse,[l]),c=(0,a.useMemo)(()=>o?(0,D.packFogVolumeData)(o.fogVolumes):new Float32Array(12),[o]),f=(0,a.useRef)({skybox:{value:n},fogColor:{value:r??new i.Color(0,0,0)},enableFog:{value:s},inverseProjectionMatrix:{value:u},cameraMatrixWorld:{value:l.matrixWorld},cameraHeight:D.globalFogUniforms.cameraHeight,fogVolumeData:{value:c},horizonFogHeight:{value:.18}}),d=(0,a.useMemo)(()=>{if(!o)return .18;let e=.95*o.visibleDistance/Math.sqrt(3);return 60/Math.sqrt(e*e+3600)},[o]);return(0,a.useEffect)(()=>{f.current.skybox.value=n,f.current.fogColor.value=r??new i.Color(0,0,0),f.current.enableFog.value=s,f.current.fogVolumeData.value=c,f.current.horizonFogHeight.value=d},[n,r,s,c,d]),(0,t.jsxs)("mesh",{renderOrder:-1e3,frustumCulled:!1,children:[(0,t.jsxs)("bufferGeometry",{children:[(0,t.jsx)("bufferAttribute",{attach:"attributes-position",array:new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),count:3,itemSize:3}),(0,t.jsx)("bufferAttribute",{attach:"attributes-uv",array:new Float32Array([0,0,2,0,0,2]),count:3,itemSize:2})]}),(0,t.jsx)("shaderMaterial",{uniforms:f.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function ec(e){let a,i,o,l,n=(0,r.c)(6),{materialList:s,fogColor:u,fogState:c}=e,{data:f}=((l=(0,r.c)(2))[0]!==s?(o={queryKey:["detailMapList",s],queryFn:()=>(0,b.loadDetailMapList)(s)},l[0]=s,l[1]=o):o=l[1],(0,v.useQuery)(o));n[0]!==f?(a=f?[(0,b.textureToUrl)(f[1]),(0,b.textureToUrl)(f[3]),(0,b.textureToUrl)(f[4]),(0,b.textureToUrl)(f[5]),(0,b.textureToUrl)(f[0]),(0,b.textureToUrl)(f[2])]:null,n[0]=f,n[1]=a):a=n[1];let d=a;return d?(n[2]!==u||n[3]!==c||n[4]!==d?(i=(0,t.jsx)(eu,{skyBoxFiles:d,fogColor:u,fogState:c}),n[2]=u,n[3]=c,n[4]=d,n[5]=i):i=n[5],i):null}function ef({skyColor:e,fogColor:r,fogState:o}){let{camera:l}=(0,p.useThree)(),n=!!r,s=(0,a.useMemo)(()=>l.projectionMatrixInverse,[l]),u=(0,a.useMemo)(()=>o?(0,D.packFogVolumeData)(o.fogVolumes):new Float32Array(12),[o]),c=(0,a.useMemo)(()=>{if(!o)return .18;let e=.95*o.visibleDistance/Math.sqrt(3);return 60/Math.sqrt(e*e+3600)},[o]),f=(0,a.useRef)({skyColor:{value:e},fogColor:{value:r??new i.Color(0,0,0)},enableFog:{value:n},inverseProjectionMatrix:{value:s},cameraMatrixWorld:{value:l.matrixWorld},cameraHeight:D.globalFogUniforms.cameraHeight,fogVolumeData:{value:u},horizonFogHeight:{value:c}});return(0,a.useEffect)(()=>{f.current.skyColor.value=e,f.current.fogColor.value=r??new i.Color(0,0,0),f.current.enableFog.value=n,f.current.fogVolumeData.value=u,f.current.horizonFogHeight.value=c},[e,r,n,u,c]),(0,t.jsxs)("mesh",{renderOrder:-1e3,frustumCulled:!1,children:[(0,t.jsxs)("bufferGeometry",{children:[(0,t.jsx)("bufferAttribute",{attach:"attributes-position",array:new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),count:3,itemSize:3}),(0,t.jsx)("bufferAttribute",{attach:"attributes-uv",array:new Float32Array([0,0,2,0,0,2]),count:3,itemSize:2})]}),(0,t.jsx)("shaderMaterial",{uniforms:f.current,vertexShader:`
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
        `,depthWrite:!1,depthTest:!1})]})}function ed(e,t){let{fogDistance:r,visibleDistance:a}=e;return[r,a]}function em({fogState:e,enabled:t}){let{scene:r,camera:l}=(0,p.useThree)(),n=(0,a.useRef)(null),s=(0,a.useMemo)(()=>(0,D.packFogVolumeData)(e.fogVolumes),[e.fogVolumes]);return(0,a.useEffect)(()=>{en||((0,M.installCustomFogShader)(),en=!0)},[]),(0,a.useEffect)(()=>{(0,D.resetGlobalFogUniforms)();let[t,a]=ed(e,l.position.y),o=new i.Fog(e.fogColor,t,a);return r.fog=o,n.current=o,(0,D.updateGlobalFogUniforms)(l.position.y,s),()=>{r.fog=null,n.current=null,(0,D.resetGlobalFogUniforms)()}},[r,l,e,s]),(0,a.useEffect)(()=>{let r=n.current;if(r)if(t){let[t,a]=ed(e,l.position.y);r.near=t,r.far=a}else r.near=1e10,r.far=1e10},[t,e,l.position.y]),(0,o.useFrame)(()=>{let r=n.current;if(!r)return;let a=l.position.y;if((0,D.updateGlobalFogUniforms)(a,s,t),t){let[t,i]=ed(e,a);r.near=t,r.far=i,r.color.copy(e.fogColor)}}),null}function eg({scene:e}){let{fogEnabled:r}=(0,d.useSettings)(),o=e.materialList||void 0,l=(0,a.useMemo)(()=>es(e.skySolidColor),[e.skySolidColor]),n=e.useSkyTextures,s=(0,a.useMemo)(()=>(function(e){let t=e.fogDistance,r=e.visibleDistance>0?e.visibleDistance:1e3,{r:a,g:o,b:l}=e.fogColor,n=new i.Color().setRGB(a,o,l).convertSRGBToLinear(),s=[];for(let t of e.fogVolumes)t.visibleDistance<=0||t.maxHeight<=t.minHeight||s.push({visibleDistance:t.visibleDistance,minHeight:t.minHeight,maxHeight:t.maxHeight,percentage:1});let u=s.reduce((e,t)=>Math.max(e,t.maxHeight),0);return{fogDistance:t,visibleDistance:r,fogColor:n,fogVolumes:s,fogLine:u,enabled:r>t}})(e),[e]),u=(0,a.useMemo)(()=>es(e.fogColor),[e.fogColor]),c=l||u,f=s.enabled&&r,m=s.fogColor,{scene:g,gl:h}=(0,p.useThree)();(0,a.useEffect)(()=>{if(f){let e=m.clone();g.background=e,h.setClearColor(e)}else if(c){let e=c[0].clone();g.background=e,h.setClearColor(e)}else g.background=null;return()=>{g.background=null}},[g,h,f,m,c]);let v=l?.[1];return(0,t.jsxs)(t.Fragment,{children:[o&&n&&o.length>0?(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(ec,{materialList:o,fogColor:f?m:void 0,fogState:f?s:void 0},o)}):v?(0,t.jsx)(ef,{skyColor:v,fogColor:f?m:void 0,fogState:f?s:void 0}):null,(0,t.jsx)(a.Suspense,{children:(0,t.jsx)(ei,{scene:e})}),s.enabled?(0,t.jsx)(em,{fogState:s,enabled:r}):null]})}let eh=(0,a.lazy)(()=>e.A(30814).then(e=>({default:e.PlayerModel}))),ep=(0,a.lazy)(()=>e.A(44325).then(e=>({default:e.ExplosionShape}))),ev=(0,a.lazy)(()=>e.A(62125).then(e=>({default:e.TracerProjectile}))),ex=(0,a.lazy)(()=>e.A(62125).then(e=>({default:e.SpriteProjectile}))),eb=(0,a.lazy)(()=>e.A(25147).then(e=>({default:e.ForceFieldBare}))),ey=(0,a.lazy)(()=>e.A(61921).then(e=>({default:e.AudioEmitter}))),eS=(0,a.lazy)(()=>e.A(18599).then(e=>({default:e.WaterBlock}))),eF={1:"Storm",2:"Inferno"},ew=(0,a.memo)(function(e){let i=(0,r.c)(26),{entity:o}=e;switch(o.renderType){case"Shape":{let e;return i[0]!==o?(e=(0,t.jsx)(eT,{entity:o}),i[0]=o,i[1]=e):e=i[1],e}case"ForceFieldBare":{let e;return i[2]!==o?(e=(0,t.jsx)(eM,{entity:o}),i[2]=o,i[3]=e):e=i[3],e}case"Player":{let e;return i[4]!==o?(e=(0,t.jsx)(eD,{entity:o}),i[4]=o,i[5]=e):e=i[5],e}case"Explosion":{let e;return i[6]!==o?(e=(0,t.jsx)(eC,{entity:o}),i[6]=o,i[7]=e):e=i[7],e}case"Tracer":{let e;return i[8]!==o?(e=(0,t.jsx)(ej,{entity:o}),i[8]=o,i[9]=e):e=i[9],e}case"Sprite":{let e;return i[10]!==o?(e=(0,t.jsx)(e_,{entity:o}),i[10]=o,i[11]=e):e=i[11],e}case"AudioEmitter":{let e;return i[12]!==o?(e=(0,t.jsx)(ek,{entity:o}),i[12]=o,i[13]=e):e=i[13],e}case"Camera":{let e;return i[14]!==o?(e=(0,t.jsx)(g,{entity:o}),i[14]=o,i[15]=e):e=i[15],e}case"WayPoint":{let e;return i[16]!==o?(e=(0,t.jsx)(h,{entity:o}),i[16]=o,i[17]=e):e=i[17],e}case"TerrainBlock":{let e;return i[18]!==o.terrainData?(e=(0,t.jsx)(L,{scene:o.terrainData}),i[18]=o.terrainData,i[19]=e):e=i[19],e}case"InteriorInstance":{let e;return i[20]!==o.interiorData?(e=(0,t.jsx)(Y,{scene:o.interiorData}),i[20]=o.interiorData,i[21]=e):e=i[21],e}case"Sky":{let e;return i[22]!==o.skyData?(e=(0,t.jsx)(eg,{scene:o.skyData}),i[22]=o.skyData,i[23]=e):e=i[23],e}case"Sun":case"MissionArea":case"None":return null;case"WaterBlock":{let e;return i[24]!==o.waterData?(e=(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(eS,{scene:o.waterData})}),i[24]=o.waterData,i[25]=e):e=i[25],e}}});function eT(e){let i,l,n,s,m,g,h=(0,r.c)(21),{entity:p}=e,{animationEnabled:v}=(0,d.useSettings)(),x=(0,a.useRef)(null);if(h[0]!==v||h[1]!==p.rotate?(i=()=>{if(!x.current||!p.rotate||!v)return;let e=performance.now()/1e3;x.current.rotation.y=e/3*Math.PI*2},h[0]=v,h[1]=p.rotate,h[2]=i):i=h[2],(0,o.useFrame)(i),!p.shapeName)return null;let b=p.runtimeObject,y=p.shapeType??"StaticShape",S=p.dataBlock?.toLowerCase()==="flag",F=p.teamId&&p.teamId>0?eF[p.teamId]:null,w=S&&F?`${F} Flag`:null,T="Item"===p.shapeType?"pink":p.threads?"#00ff88":"yellow",M=p.rotate?x:void 0,D=b?void 0:p;return h[3]!==w?(l=w?(0,t.jsx)(f.FloatingLabel,{opacity:.6,children:w}):null,h[3]=w,h[4]=l):l=h[4],h[5]!==T||h[6]!==D||h[7]!==l?(n=(0,t.jsx)(u.ShapeRenderer,{loadingColor:T,streamEntity:D,children:l}),h[5]=T,h[6]=D,h[7]=l,h[8]=n):n=h[8],h[9]!==p.barrelShapeName||h[10]!==b?(s=p.barrelShapeName&&(0,t.jsx)(c.ShapeInfoProvider,{object:b,shapeName:p.barrelShapeName,type:"Turret",children:(0,t.jsx)("group",{position:[0,1.5,0],children:(0,t.jsx)(u.ShapeRenderer,{})})}),h[9]=p.barrelShapeName,h[10]=b,h[11]=s):s=h[11],h[12]!==M||h[13]!==n||h[14]!==s?(m=(0,t.jsxs)("group",{ref:M,children:[n,s]}),h[12]=M,h[13]=n,h[14]=s,h[15]=m):m=h[15],h[16]!==p.shapeName||h[17]!==y||h[18]!==m||h[19]!==b?(g=(0,t.jsx)(c.ShapeInfoProvider,{object:b,shapeName:p.shapeName,type:y,children:m}),h[16]=p.shapeName,h[17]=y,h[18]=m,h[19]=b,h[20]=g):g=h[20],g}function eM(e){let i,o=(0,r.c)(2),{entity:l}=e;return l.forceFieldData?(o[0]!==l.forceFieldData?(i=(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(eb,{data:l.forceFieldData,scale:l.forceFieldData.dimensions})}),o[0]=l.forceFieldData,o[1]=i):i=o[1],i):null}function eD(e){let i,o=(0,r.c)(2),{entity:l}=e;return l.shapeName?(o[0]!==l?(i=(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(eh,{entity:l})}),o[0]=l,o[1]=i):i=o[1],i):null}function eC(e){let i,o,l,n=(0,r.c)(10),{entity:u}=e;n[0]===Symbol.for("react.memo_cache_sentinel")?(i=s.streamPlaybackStore.getState(),n[0]=i):i=n[0];let c=i.playback;n[1]!==u.explosionDataBlockId||n[2]!==u.faceViewer||n[3]!==u.id||n[4]!==u.position||n[5]!==u.rotation||n[6]!==u.shapeName?(o={id:u.id,type:"Explosion",dataBlock:u.shapeName,position:u.position,rotation:u.rotation,faceViewer:u.faceViewer,explosionDataBlockId:u.explosionDataBlockId},n[1]=u.explosionDataBlockId,n[2]=u.faceViewer,n[3]=u.id,n[4]=u.position,n[5]=u.rotation,n[6]=u.shapeName,n[7]=o):o=n[7];let f=o;return u.shapeName&&c?(n[8]!==f?(l=(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(ep,{entity:f,playback:c})}),n[8]=f,n[9]=l):l=n[9],l):null}function ej(e){let i,o=(0,r.c)(2),{entity:l}=e;return o[0]!==l?(i=(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(ev,{entity:l,visual:l.visual})}),o[0]=l,o[1]=i):i=o[1],i}function e_(e){let i,o=(0,r.c)(2),{entity:l}=e;return o[0]!==l.visual?(i=(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(ex,{visual:l.visual})}),o[0]=l.visual,o[1]=i):i=o[1],i}function ek(e){let i,o=(0,r.c)(2),{entity:l}=e,{audioEnabled:n}=(0,d.useSettings)();return l.audioFileName&&n?(o[0]!==l?(i=(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(ey,{entity:l})}),o[0]=l,o[1]=i):i=o[1],i):null}var eR=e.i(60099),eB=e.i(85557),eL=e.i(29418);let eG=(0,b.textureToUrl)("gui/hud_alliedtriangle"),ez=(0,b.textureToUrl)("gui/hud_enemytriangle"),eU=new i.Vector3;function eN(e){let l,n,c,f,d,m,g=(0,r.c)(23),{entity:h}=e,v=(0,u.useStaticShape)(h.shapeName??h.dataBlock),{camera:x}=(0,p.useThree)(),b=(0,a.useRef)(null),y=(0,a.useRef)(null),S=(0,a.useRef)(null),F=(0,a.useRef)(null),w=(0,a.useRef)(null),[T,M]=(0,a.useState)(!0),D=(0,a.useRef)(null);g[0]!==v.scene?(l=new i.Box3().setFromObject(v.scene),g[0]=v.scene,g[1]=l):l=g[1];let C=l.max.y+.1;g[2]!==h.keyframes?(n=h.keyframes??[],g[2]=h.keyframes,g[3]=n):n=g[3];let j=n;g[4]!==j?(c=j.some(eI),g[4]=j,g[5]=c):c=g[5];let _=c;g[6]!==x||g[7]!==h.id||g[8]!==h.iffColor||g[9]!==h.playerName||g[10]!==_||g[11]!==T||g[12]!==j?(f=()=>{let e=b.current;if(!e)return;e.getWorldPosition(eU);let t=x.position.distanceTo(eU),r=x.matrixWorld.elements,a=!(-((eU.x-r[12])*r[8])+-((eU.y-r[13])*r[9])+-((eU.z-r[14])*r[10])<0)&&t<150;if(T!==a&&M(a),!a)return;let i=(0,eB.getKeyframeAtTime)(j,s.streamPlaybackStore.getState().time),o=i?.health??1;if(i?.damageState!=null&&i.damageState>=1){y.current&&(y.current.style.opacity="0"),S.current&&(S.current.style.opacity="0");return}let l=Math.max(0,Math.min(1,1-t/150)).toString();if(y.current&&(y.current.style.opacity=l),S.current&&(S.current.style.opacity=l),D.current){let e=h.playerName??h.id;D.current.textContent!==e&&(D.current.textContent=e)}if(w.current&&h.iffColor){let e=h.iffColor.r>h.iffColor.g?ez:eG;w.current.getAttribute("src")!==e&&(w.current.src=e)}F.current&&_&&(F.current.style.width=`${Math.max(0,Math.min(100,100*o))}%`,F.current.style.background=h.iffColor?`rgb(${h.iffColor.r}, ${h.iffColor.g}, ${h.iffColor.b})`:"")},g[6]=x,g[7]=h.id,g[8]=h.iffColor,g[9]=h.playerName,g[10]=_,g[11]=T,g[12]=j,g[13]=f):f=g[13],(0,o.useFrame)(f);let k=h.iffColor&&h.iffColor.r>h.iffColor.g?ez:eG;return g[14]!==h.id||g[15]!==h.playerName||g[16]!==_||g[17]!==C||g[18]!==k||g[19]!==T?(d=T&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(eR.Html,{position:[0,C,0],center:!0,children:(0,t.jsx)("div",{ref:y,className:eL.default.Top,children:(0,t.jsx)("img",{ref:w,className:eL.default.IffArrow,src:k,alt:""})})}),(0,t.jsx)(eR.Html,{position:[0,-.2,0],center:!0,children:(0,t.jsxs)("div",{ref:S,className:eL.default.Bottom,children:[(0,t.jsx)("div",{ref:D,className:eL.default.Name,children:h.playerName??h.id}),_&&(0,t.jsx)("div",{className:eL.default.HealthBar,children:(0,t.jsx)("div",{ref:F,className:eL.default.HealthFill})})]})})]}),g[14]=h.id,g[15]=h.playerName,g[16]=_,g[17]=C,g[18]=k,g[19]=T,g[20]=d):d=g[20],g[21]!==d?(m=(0,t.jsx)("group",{ref:b,children:d}),g[21]=d,g[22]=m):m=g[22],m}function eI(e){return null!=e.health}var eA=e.i(78779);let eE=(0,b.textureToUrl)("commander/MiniIcons/com_flag_grey"),eP=new i.Vector3;function eH(e){let i,l,n,s,u,c=(0,r.c)(9),{entity:f}=e,d=(0,a.useRef)(null),m=(0,a.useRef)(null),g=(0,a.useRef)(null),{camera:h}=(0,p.useThree)();c[0]!==h||c[1]!==f.iffColor?(i=()=>{if(m.current&&f.iffColor){let{r:e,g:t,b:r}=f.iffColor;m.current.style.backgroundColor=`rgb(${e},${t},${r})`}if(g.current&&d.current){d.current.getWorldPosition(eP);let e=h.position.distanceTo(eP);g.current.textContent=e.toFixed(1)}},c[0]=h,c[1]=f.iffColor,c[2]=i):i=c[2],(0,o.useFrame)(i);let v=f.iffColor?`rgb(${f.iffColor.r},${f.iffColor.g},${f.iffColor.b})`:"rgb(200,200,200)";c[3]===Symbol.for("react.memo_cache_sentinel")?(l=[0,1.5,0],c[3]=l):l=c[3],c[4]===Symbol.for("react.memo_cache_sentinel")?(n=(0,t.jsx)("span",{ref:g,className:eA.default.Distance}),c[4]=n):n=c[4],c[5]!==v?(s={backgroundColor:v,"--flag-icon-url":`url(${eE})`},c[5]=v,c[6]=s):s=c[6];let x=s;return c[7]!==x?(u=(0,t.jsx)("group",{ref:d,children:(0,t.jsx)(eR.Html,{position:l,center:!0,children:(0,t.jsxs)("div",{className:eA.default.Root,children:[n,(0,t.jsx)("div",{ref:m,className:eA.default.Icon,style:x})]})})}),c[7]=x,c[8]=u):u=c[8],u}var eV=e.i(58647);let eq=(0,a.lazy)(()=>e.A(44325).then(e=>({default:e.WeaponModel})));function e$(e){let a,i=(0,r.c)(3),{missionType:o}=e,l=(0,d.useDebug)(),n=l?.debugMode??!1;return i[0]!==n||i[1]!==o?(a=(0,t.jsx)("group",{ref:eW,children:(0,t.jsx)(eO,{missionType:o,debugMode:n})}),i[0]=n,i[1]=o,i[2]=a):a=i[2],a}function eW(e){s.streamPlaybackStore.setState({root:e})}let eO=(0,a.memo)(function({missionType:e,debugMode:r}){let i=(0,l.useAllGameEntities)(),o=(0,a.useRef)(new Map).current,n=new Set;for(let e of i)n.add(e.id),o.set(e.id,e);for(let e of o.keys())n.has(e)||o.delete(e);let s=(0,a.useMemo)(()=>{let t=[],r=e?.toLowerCase();for(let e of o.values()){if(r&&e.missionTypesList){let t=new Set(e.missionTypesList.toLowerCase().split(/\s+/).filter(Boolean));if(t.size>0&&!t.has(r))continue}t.push(e)}return t},[i,e]);return(0,t.jsx)(t.Fragment,{children:s.map(e=>(0,t.jsx)(eY,{entity:e,debugMode:r},e.id))})}),eY=(0,a.memo)(function(e){let a,i=(0,r.c)(8),{entity:o,debugMode:l}=e;if((0,n.isSceneEntity)(o)){let e,r;return i[0]!==o?(e=(0,t.jsx)(ew,{entity:o}),i[0]=o,i[1]=e):e=i[1],i[2]!==o.id||i[3]!==e?(r=(0,t.jsx)("group",{name:o.id,children:e}),i[2]=o.id,i[3]=e,i[4]=r):r=i[4],r}return"None"===o.renderType?null:(i[5]!==l||i[6]!==o?(a=(0,t.jsx)(eZ,{entity:o,debugMode:l}),i[5]=l,i[6]=o,i[7]=a):a=i[7],a)});function eK(e){let a,i=(0,r.c)(2),{entity:o}=e,l=(0,eV.useEngineSelector)(eQ);return o.id===l?null:(i[0]!==o?(a=(0,t.jsx)(eN,{entity:o}),i[0]=o,i[1]=a):a=i[1],a)}function eQ(e){return e.playback.streamSnapshot?.controlPlayerGhostId}function eX({entity:e}){let r=(0,a.useRef)(!1),[i,l]=(0,a.useState)(()=>((("targetRenderFlags"in e?e.targetRenderFlags:void 0)??0)&2)!=0);return(r.current=i,(0,o.useFrame)(()=>{let t=((("targetRenderFlags"in e?e.targetRenderFlags:void 0)??0)&2)!=0;t!==r.current&&(r.current=t,l(t))}),i)?(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(eH,{entity:e})}):null}function eZ(e){let o,l,n,s,u,c,f,d,m,g,h,p=(0,r.c)(56),{entity:v,debugMode:x}=e,b=v.position,y=v.scale;e:{let e;if(!v.rotation){o=void 0;break e}p[0]!==v.rotation?(e=new i.Quaternion(...v.rotation),p[0]=v.rotation,p[1]=e):e=p[1],o=e}let S=o,F="Player"===v.renderType;if("Shape"===v.renderType&&!v.shapeName){let e,r,a,i,o,l,n=v.id;return p[2]===Symbol.for("react.memo_cache_sentinel")?(e=(0,t.jsx)("sphereGeometry",{args:[.3,6,4]}),p[2]=e):e=p[2],p[3]!==v.className?(r=(0,eB.entityTypeColor)(v.className),p[3]=v.className,p[4]=r):r=p[4],p[5]!==r?(a=(0,t.jsxs)("mesh",{children:[e,(0,t.jsx)("meshBasicMaterial",{color:r,wireframe:!0})]}),p[5]=r,p[6]=a):a=p[6],p[7]!==x||p[8]!==v?(i=x&&(0,t.jsx)(eJ,{entity:v}),p[7]=x,p[8]=v,p[9]=i):i=p[9],p[10]!==v?(o=(0,t.jsx)(eX,{entity:v}),p[10]=v,p[11]=o):o=p[11],p[12]!==v.id||p[13]!==b||p[14]!==S||p[15]!==y||p[16]!==a||p[17]!==i||p[18]!==o?(l=(0,t.jsxs)("group",{name:n,position:b,quaternion:S,scale:y,children:[a,i,o]}),p[12]=v.id,p[13]=b,p[14]=S,p[15]=y,p[16]=a,p[17]=i,p[18]=o,p[19]=l):l=p[19],l}p[20]!==v.className||p[21]!==v.renderType?(l="Explosion"===v.renderType?null:(0,t.jsxs)("mesh",{children:[(0,t.jsx)("sphereGeometry",{args:[.5,8,6]}),(0,t.jsx)("meshBasicMaterial",{color:(0,eB.entityTypeColor)(v.className),wireframe:!0})]}),p[20]=v.className,p[21]=v.renderType,p[22]=l):l=p[22];let w=l,T="shapeName"in v?v.shapeName:void 0,M="weaponShape"in v?v.weaponShape:void 0;return p[23]!==v?(n=(0,t.jsx)(ew,{entity:v}),p[23]=v,p[24]=n):n=p[24],p[25]!==w||p[26]!==n?(s=(0,t.jsx)(a.Suspense,{fallback:w,children:n}),p[25]=w,p[26]=n,p[27]=s):s=p[27],p[28]!==w||p[29]!==s?(u=(0,t.jsx)(e0,{fallback:w,children:s}),p[28]=w,p[29]=s,p[30]=u):u=p[30],p[31]!==v||p[32]!==F?(c=F&&(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(eK,{entity:v})}),p[31]=v,p[32]=F,p[33]=c):c=p[33],p[34]!==v?(f=(0,t.jsx)(eX,{entity:v}),p[34]=v,p[35]=f):f=p[35],p[36]!==x||p[37]!==v||p[38]!==T?(d=x&&!T&&"Shape"!==v.renderType&&(0,t.jsx)(eJ,{entity:v}),p[36]=x,p[37]=v,p[38]=T,p[39]=d):d=p[39],p[40]!==u||p[41]!==c||p[42]!==f||p[43]!==d?(m=(0,t.jsxs)("group",{name:"model",children:[u,c,f,d]}),p[40]=u,p[41]=c,p[42]=f,p[43]=d,p[44]=m):m=p[44],p[45]!==F||p[46]!==T||p[47]!==M?(g=M&&T&&!F&&(0,t.jsx)("group",{name:"weapon",children:(0,t.jsx)(e0,{fallback:null,children:(0,t.jsx)(a.Suspense,{fallback:null,children:(0,t.jsx)(eq,{shapeName:M,playerShapeName:T})})})}),p[45]=F,p[46]=T,p[47]=M,p[48]=g):g=p[48],p[49]!==v.id||p[50]!==b||p[51]!==S||p[52]!==y||p[53]!==g||p[54]!==m?(h=(0,t.jsxs)("group",{name:v.id,position:b,quaternion:S,scale:y,children:[m,g]}),p[49]=v.id,p[50]=b,p[51]=S,p[52]=y,p[53]=g,p[54]=m,p[55]=h):h=p[55],h}function eJ(e){let a,i,o=(0,r.c)(8),{entity:l}=e;o[0]!==l.className||o[1]!==l.dataBlockId||o[2]!==l.ghostIndex||o[3]!==l.id||o[4]!==l.shapeHint?((a=[]).push(`${l.id} (${l.className})`),"number"==typeof l.ghostIndex&&a.push(`ghost ${l.ghostIndex}`),"number"==typeof l.dataBlockId&&a.push(`db ${l.dataBlockId}`),a.push(l.shapeHint?`shapeHint ${l.shapeHint}`:"shapeHint <none resolved>"),o[0]=l.className,o[1]=l.dataBlockId,o[2]=l.ghostIndex,o[3]=l.id,o[4]=l.shapeHint,o[5]=a):a=o[5];let n=a.join(" | ");return o[6]!==n?(i=(0,t.jsx)(f.FloatingLabel,{color:"#ff6688",children:n}),o[6]=n,o[7]=i):i=o[7],i}class e0 extends a.Component{state={hasError:!1};static getDerivedStateFromError(){return{hasError:!0}}componentDidCatch(e,t){console.warn("[entity] Shape load failed:",e.message,t.componentStack)}render(){return this.state.hasError?this.props.fallback:this.props.children}}e.s(["EntityScene",()=>e$,"ShapeErrorBoundary",()=>e0],87297)}]);