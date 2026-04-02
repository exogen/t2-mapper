import{r as e}from"./chunk-DECur_0Z.js";import{n as t,r as n,t as r}from"./jsx-runtime-BpGWiA-R.js";import{i}from"./react-three-fiber.esm-CD18QK1u.js";import{a}from"./SettingsProvider-CeFD8Cx1.js";import{r as o}from"./cameraTourStore-DQ989o2x.js";import{Ot as s,Ut as c,b as l,jt as u,p as d}from"./three.module-C9W4LJrj.js";import{t as f}from"./Texture-D2i1vM3o.js";import{p}from"./index-CcOasdr9.js";import{t as m}from"./DebugBounds-BnJbEQUF.js";import{t as h}from"./DebugSuspense-D7OBM5vj.js";var g=e(n(),1),_=t(),v=`
#include <fog_pars_vertex>

varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`,y=`
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
`;function b({textures:e,scale:t,umapping:n,vmapping:r,color:i,baseTranslucency:a}){let o=[...t].sort((e,t)=>t-e),s=new c(o[0]*n,o[1]*r),d=e[0];return new u({uniforms:{frame0:{value:d},frame1:{value:e[1]??d},frame2:{value:e[2]??d},frame3:{value:e[3]??d},frame4:{value:e[4]??d},currentFrame:{value:0},vScroll:{value:0},uvScale:{value:s},tintColor:{value:new l(...i)},opacity:{value:a},opacityFactor:{value:1},fogColor:{value:new l},fogNear:{value:1},fogFar:{value:2e3}},vertexShader:v,fragmentShader:y,transparent:!0,blending:2,side:2,depthWrite:!1,fog:!0})}var x=r();function S(e){e.wrapS=e.wrapT=s,e.colorSpace=``,e.flipY=!1,e.needsUpdate=!0}function C(e){let t=(0,_.c)(7),[n,r,i]=e,a;t[0]!==n||t[1]!==r||t[2]!==i?(a=new d(n,r,i),a.translate(n/2,r/2,i/2),t[0]=n,t[1]=r,t[2]=i,t[3]=a):a=t[3];let o=a,s,c;return t[4]===o?(s=t[5],c=t[6]):(s=()=>()=>o.dispose(),c=[o],t[4]=o,t[5]=s,t[6]=c),(0,g.useEffect)(s,c),o}function w(e){let t=(0,_.c)(10),{scale:n,color:r,baseTranslucency:i}=e,a=C(n),o;t[0]!==r[0]||t[1]!==r[1]||t[2]!==r[2]?(o=new l(r[0],r[1],r[2]),t[0]=r[0],t[1]=r[1],t[2]=r[2],t[3]=o):o=t[3];let s=o,c=i*1,u;t[4]!==s||t[5]!==c?(u=(0,x.jsx)(`meshBasicMaterial`,{color:s,transparent:!0,opacity:c,blending:2,side:2,depthWrite:!1,fog:!1}),t[4]=s,t[5]=c,t[6]=u):u=t[6];let d;return t[7]!==a||t[8]!==u?(d=(0,x.jsx)(`mesh`,{geometry:a,renderOrder:1,children:u}),t[7]=a,t[8]=u,t[9]=d):d=t[9],d}function T({scale:e,data:t}){let{animationEnabled:n}=a(),r=C(e),o=f((0,g.useMemo)(()=>t.textures.map(e=>p(e)),[t.textures]),e=>{e.forEach(e=>S(e))}),s=(0,g.useMemo)(()=>b({textures:o,scale:e,umapping:t.umapping,vmapping:t.vmapping,color:t.color,baseTranslucency:t.baseTranslucency}),[o,e,t]);(0,g.useEffect)(()=>()=>s.dispose(),[s]);let c=(0,g.useRef)(0);return i((e,r)=>{if(!n){c.current=0,s.uniforms.currentFrame.value=0,s.uniforms.vScroll.value=0;return}c.current+=r,s.uniforms.currentFrame.value=Math.floor(c.current*t.framesPerSec)%t.numFrames,s.uniforms.vScroll.value=c.current*t.scrollSpeed}),(0,x.jsx)(`mesh`,{geometry:r,material:s,renderOrder:1})}function E(e){let t=(0,_.c)(20),{entity:n}=e,r=n.forceFieldData,i=r.dimensions,a=o(n.id);if(r.textures.map(D).length===0){let e;return t[0]!==r.baseTranslucency||t[1]!==r.color||t[2]!==i?(e=(0,x.jsx)(w,{scale:i,color:r.color,baseTranslucency:r.baseTranslucency}),t[0]=r.baseTranslucency,t[1]=r.color,t[2]=i,t[3]=e):e=t[3],e}let s;t[4]!==r.baseTranslucency||t[5]!==r.color||t[6]!==i?(s=(0,x.jsx)(w,{scale:i,color:r.color,baseTranslucency:r.baseTranslucency}),t[4]=r.baseTranslucency,t[5]=r.color,t[6]=i,t[7]=s):s=t[7];let c;t[8]!==r||t[9]!==i?(c=(0,x.jsx)(T,{scale:i,data:r}),t[8]=r,t[9]=i,t[10]=c):c=t[10];let l;t[11]!==s||t[12]!==c?(l=(0,x.jsx)(h,{name:`ForceField`,fallback:s,children:c}),t[11]=s,t[12]=c,t[13]=l):l=t[13];let u;t[14]!==a||t[15]!==i?(u=a&&i&&(0,x.jsx)(m,{size:i}),t[14]=a,t[15]=i,t[16]=u):u=t[16];let d;return t[17]!==l||t[18]!==u?(d=(0,x.jsxs)(x.Fragment,{children:[l,u]}),t[17]=l,t[18]=u,t[19]=d):d=t[19],d}function D(e){return p(e)}export{E as ForceFieldBare};