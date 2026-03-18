import{r as e}from"./chunk-DECur_0Z.js";import{n as t,r as n,t as r}from"./jsx-runtime-BpGWiA-R.js";import{i}from"./react-three-fiber.esm-dhSWjERg.js";import{a}from"./SettingsProvider-2cUUftaX.js";import"./logger-zy3b0zcG.js";import"./traditional-BTL5qX2E.js";import{At as o,Dt as s,Ht as c,b as l,p as u}from"./three.module-CwgFV8Kd.js";import"./mission-CFLOK_Oy.js";import{t as d}from"./Texture-CI_Y9elU.js";import{p as f}from"./loaders-C_1cX1lR.js";import{t as p}from"./DebugSuspense-DTOoTVsz.js";var m=t(),h=e(n(),1),g=`
#include <fog_pars_vertex>

varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`,_=`
#include <fog_pars_fragment>

uniform sampler2D frame0;
uniform sampler2D frame1;
uniform sampler2D frame2;
uniform sampler2D frame3;
uniform sampler2D frame4;
uniform int currentFrame;
uniform float vScroll;
uniform vec2 uvScale;
uniform vec3 tintColor;
uniform float opacity;
uniform float opacityFactor;

varying vec2 vUv;

void main() {
  // Scale and scroll UVs
  vec2 scrolledUv = vec2(vUv.x * uvScale.x, vUv.y * uvScale.y + vScroll);

  // Sample the current frame
  vec4 texColor;
  if (currentFrame == 0) {
    texColor = texture2D(frame0, scrolledUv);
  } else if (currentFrame == 1) {
    texColor = texture2D(frame1, scrolledUv);
  } else if (currentFrame == 2) {
    texColor = texture2D(frame2, scrolledUv);
  } else if (currentFrame == 3) {
    texColor = texture2D(frame3, scrolledUv);
  } else {
    texColor = texture2D(frame4, scrolledUv);
  }

  // Tribes 2 GL_MODULATE: output = texture * vertexColor
  // No gamma correction - textures use NoColorSpace and values pass through
  // directly to display, matching how WaterBlock handles sRGB textures.
  vec3 modulatedColor = texColor.rgb * tintColor;

  float adjustedOpacity = opacity * opacityFactor;

  gl_FragColor = vec4(modulatedColor, adjustedOpacity);

  // Custom fog for additive blending: fade out rather than blend to fog color.
  // Standard fog (mix toward fogColor) doesn't work with additive blending
  // because we'd still be adding fogColor to the framebuffer.
  // Uses Torque's quadratic haze formula for consistency.
  #ifdef USE_FOG
    float dist = vFogDepth;
    float fogFactor = 0.0;
    if (dist > fogNear) {
      if (dist >= fogFar) {
        fogFactor = 1.0;
      } else {
        float fogScale = 1.0 / (fogFar - fogNear);
        float distFactor = (dist - fogNear) * fogScale - 1.0;
        fogFactor = 1.0 - distFactor * distFactor;
      }
    }
    gl_FragColor.a *= 1.0 - fogFactor;
  #endif
}
`;function v({textures:e,scale:t,umapping:n,vmapping:r,color:i,baseTranslucency:a}){let s=[...t].sort((e,t)=>t-e),u=new c(s[0]*n,s[1]*r),d=e[0];return new o({uniforms:{frame0:{value:d},frame1:{value:e[1]??d},frame2:{value:e[2]??d},frame3:{value:e[3]??d},frame4:{value:e[4]??d},currentFrame:{value:0},vScroll:{value:0},uvScale:{value:u},tintColor:{value:new l(...i)},opacity:{value:a},opacityFactor:{value:1},fogColor:{value:new l},fogNear:{value:1},fogFar:{value:2e3}},vertexShader:g,fragmentShader:_,transparent:!0,blending:2,side:2,depthWrite:!1,fog:!0})}var y=r();function b(e){e.wrapS=e.wrapT=s,e.colorSpace=``,e.flipY=!1,e.needsUpdate=!0}function x(e){let t=(0,m.c)(7),[n,r,i]=e,a;t[0]!==n||t[1]!==r||t[2]!==i?(a=new u(n,r,i),a.translate(n/2,r/2,i/2),t[0]=n,t[1]=r,t[2]=i,t[3]=a):a=t[3];let o=a,s,c;return t[4]===o?(s=t[5],c=t[6]):(s=()=>()=>o.dispose(),c=[o],t[4]=o,t[5]=s,t[6]=c),(0,h.useEffect)(s,c),o}function S(e){let t=(0,m.c)(10),{scale:n,color:r,baseTranslucency:i}=e,a=x(n),o;t[0]!==r[0]||t[1]!==r[1]||t[2]!==r[2]?(o=new l(r[0],r[1],r[2]),t[0]=r[0],t[1]=r[1],t[2]=r[2],t[3]=o):o=t[3];let s=o,c=i*1,u;t[4]!==s||t[5]!==c?(u=(0,y.jsx)(`meshBasicMaterial`,{color:s,transparent:!0,opacity:c,blending:2,side:2,depthWrite:!1,fog:!1}),t[4]=s,t[5]=c,t[6]=u):u=t[6];let d;return t[7]!==a||t[8]!==u?(d=(0,y.jsx)(`mesh`,{geometry:a,renderOrder:1,children:u}),t[7]=a,t[8]=u,t[9]=d):d=t[9],d}function C({scale:e,data:t}){let{animationEnabled:n}=a(),r=x(e),o=d((0,h.useMemo)(()=>t.textures.map(e=>f(e)),[t.textures]),e=>{e.forEach(e=>b(e))}),s=(0,h.useMemo)(()=>v({textures:o,scale:e,umapping:t.umapping,vmapping:t.vmapping,color:t.color,baseTranslucency:t.baseTranslucency}),[o,e,t]);(0,h.useEffect)(()=>()=>s.dispose(),[s]);let c=(0,h.useRef)(0);return i((e,r)=>{if(!n){c.current=0,s.uniforms.currentFrame.value=0,s.uniforms.vScroll.value=0;return}c.current+=r,s.uniforms.currentFrame.value=Math.floor(c.current*t.framesPerSec)%t.numFrames,s.uniforms.vScroll.value=c.current*t.scrollSpeed}),(0,y.jsx)(`mesh`,{geometry:r,material:s,renderOrder:1})}function w(e){let t=(0,m.c)(14),{entity:n}=e,r=n.forceFieldData,i=r.dimensions;if(r.textures.map(T).length===0){let e;return t[0]!==r.baseTranslucency||t[1]!==r.color||t[2]!==i?(e=(0,y.jsx)(S,{scale:i,color:r.color,baseTranslucency:r.baseTranslucency}),t[0]=r.baseTranslucency,t[1]=r.color,t[2]=i,t[3]=e):e=t[3],e}let a;t[4]!==r.baseTranslucency||t[5]!==r.color||t[6]!==i?(a=(0,y.jsx)(S,{scale:i,color:r.color,baseTranslucency:r.baseTranslucency}),t[4]=r.baseTranslucency,t[5]=r.color,t[6]=i,t[7]=a):a=t[7];let o;t[8]!==r||t[9]!==i?(o=(0,y.jsx)(C,{scale:i,data:r}),t[8]=r,t[9]=i,t[10]=o):o=t[10];let s;return t[11]!==a||t[12]!==o?(s=(0,y.jsx)(p,{name:`ForceField`,fallback:a,children:o}),t[11]=a,t[12]=o,t[13]=s):s=t[13],s}function T(e){return f(e)}export{w as ForceFieldBare};