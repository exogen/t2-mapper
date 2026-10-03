import{r as e}from"./rolldown-runtime-hePW80VL.js";import{E as t,T as n,w as r}from"./gameEntityStore-yrDxjNog.js";import{d as i}from"./events-9ce18a08.esm-ByOytsPo.js";import{o as a}from"./SettingsProvider-DFUtH9WB.js";import{O as o,U as s,Wi as c,no as l,ro as u,ta as d}from"./three.core-DtjtRha-.js";import{f,g as p}from"./worldCollision-KpkV1HqY.js";import{p as m}from"./loaders-C53-y5Bv.js";import{r as h}from"./globalFogUniforms-Ds1aGA7A.js";import{c as g}from"./engineStore-Van7qfuY.js";import{i as _}from"./cameraTourStore-CKqZnuwq.js";import{t as v}from"./DebugBounds-JFrCgn_b.js";import{r as y}from"./placement-B57urdbY.js";import{t as b}from"./Texture-GrxGktyQ.js";import{c as x}from"./GameView-CYPE52TW.js";var S=e(t(),1),C=n(),w=`
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,T=`
uniform vec3 fogColor;
uniform float fieldHaze;

uniform sampler2D frame0;
uniform sampler2D frame1;
uniform sampler2D frame2;
uniform sampler2D frame3;
uniform sampler2D frame4;
uniform int currentFrame;
uniform float vScroll;
uniform vec2 uvScale;
uniform vec3 tintColor;
uniform vec3 powerOffColor;
uniform float opacity;
uniform float powerOffOpacity;
uniform float fieldAlpha;
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

  // Open/close fade: color × alpha + powerOffColor × (1 − alpha), same
  // for the translucency.
  vec3 fieldColor = mix(powerOffColor, tintColor, fieldAlpha);
  float translucency = mix(powerOffOpacity, opacity, fieldAlpha) * opacityFactor;

  // Engine haze (ForceFieldBare::renderObject 0x676050): one
  // getHazeAndFog value for the whole object, computed per frame by the
  // component; glColor blends toward the fog color and the alpha is
  // scaled by 1 - haze (the constant at 0x7b9894 is 0), so an additive
  // field fades out into the fog instead of adding the fog colour.
  // The fog color arrives linear while this shader works in the textures'
  // raw sRGB values (sRGBTransferOETF comes from the colorspace chunk
  // Three prepends to every fragment).
  vec3 hazeColor = sRGBTransferOETF(vec4(fogColor, 1.0)).rgb;
  fieldColor = mix(fieldColor, hazeColor, fieldHaze);
  translucency *= 1.0 - fieldHaze;

  // Tribes 2 GL_MODULATE: output = texture * vertexColor
  // No gamma correction - textures use NoColorSpace and values pass through
  // directly to display, matching how WaterBlock handles sRGB textures.
  gl_FragColor = vec4(texColor.rgb * fieldColor, translucency);
}
`;function E(e,t,n){return e*n+t*(1-n)}function D({textures:e,scale:t,umapping:n,vmapping:r,color:i,powerOffColor:a,baseTranslucency:o,powerOffTranslucency:c}){let u=[...t].sort((e,t)=>t-e),f=new l(u[0]*n,u[1]*r),p=e[0];return new d({uniforms:{frame0:{value:p},frame1:{value:e[1]??p},frame2:{value:e[2]??p},frame3:{value:e[3]??p},frame4:{value:e[4]??p},currentFrame:{value:0},vScroll:{value:0},uvScale:{value:f},tintColor:{value:new s(...i)},powerOffColor:{value:new s(...a)},opacity:{value:o},powerOffOpacity:{value:c},fieldAlpha:{value:1},opacityFactor:{value:1},fogColor:{value:new s},fogNear:{value:1},fogFar:{value:2e3},fieldHaze:{value:0}},vertexShader:w,fragmentShader:T,transparent:!0,blending:2,side:2,depthWrite:!1,fog:!0})}var O=r(),k=new u;function A(e){e.wrapS=e.wrapT=c,e.colorSpace=``,e.flipY=!1,e.needsUpdate=!0}function j(e){let t=(0,C.c)(7),[n,r,i]=e,a;t[0]!==n||t[1]!==r||t[2]!==i?(a=new o(n,r,i),a.translate(n/2,r/2,i/2),t[0]=n,t[1]=r,t[2]=i,t[3]=a):a=t[3];let s=a,c,l;return t[4]===s?(c=t[5],l=t[6]):(c=()=>()=>s.dispose(),l=[s],t[4]=s,t[5]=c,t[6]=l),(0,S.useEffect)(c,l),s}function M(e){return e.fieldAlpha??+!e.fieldOpen}function N(e,t){let[n,r,i]=e.dimensions;return n>0&&r>0&&i>0&&E(e.baseTranslucency,e.powerOffTranslucency,t)>0}function P(e){let t=(0,C.c)(14),{entity:n}=e,r=n.forceFieldData,a=j(r.dimensions),o=(0,S.useRef)(null),c;t[0]===r.color?c=t[1]:(c=new s(...r.color),t[0]=r.color,t[1]=c);let l;t[2]===r.powerOffColor?l=t[3]:(l=new s(...r.powerOffColor),t[2]=r.powerOffColor,t[3]=l);let u;t[4]!==c||t[5]!==l?(u={closed:c,open:l},t[4]=c,t[5]=l,t[6]=u):u=t[6];let d=u,f;t[7]!==d||t[8]!==r||t[9]!==n?(f=()=>{let e=o.current;if(!e)return;let t=M(n),i=e.material;i.color.copy(d.open).lerp(d.closed,t),i.opacity=E(r.baseTranslucency,r.powerOffTranslucency,t)*1,e.visible=N(r,t)},t[7]=d,t[8]=r,t[9]=n,t[10]=f):f=t[10],i(f);let p;t[11]===Symbol.for(`react.memo_cache_sentinel`)?(p=(0,O.jsx)(`meshBasicMaterial`,{transparent:!0,blending:2,side:2,depthWrite:!1,fog:!1}),t[11]=p):p=t[11];let m;return t[12]===a?m=t[13]:(m=(0,O.jsx)(`mesh`,{ref:o,geometry:a,renderOrder:1,children:p}),t[12]=a,t[13]=m),m}function F({entity:e}){let t=e.forceFieldData,n=t.dimensions,{animationEnabled:r}=a(),o=j(n),s=(0,S.useRef)(null),c=(0,S.useMemo)(()=>t.textures.map(e=>m(e)),[t.textures]),l=b(c,e=>{e.forEach(e=>A(e))}),u=(0,S.useMemo)(()=>D({textures:l,scale:n,umapping:t.umapping,vmapping:t.vmapping,color:t.color,powerOffColor:t.powerOffColor,baseTranslucency:t.baseTranslucency,powerOffTranslucency:t.powerOffTranslucency}),[l,n,t]);(0,S.useEffect)(()=>()=>u.dispose(),[u]);let d=(0,S.useRef)(0);return i((n,i)=>{let a=M(e);u.uniforms.fieldAlpha.value=a;let o=s.current;if(o){o.visible=N(t,a);let e=n.scene.fog;o.getWorldPosition(k),u.uniforms.fieldHaze.value=e?h(k.distanceTo(n.camera.position),k.y,e.near,e.far):0}if(!r){d.current=0,u.uniforms.currentFrame.value=0,u.uniforms.vScroll.value=0;return}d.current+=g(i),u.uniforms.currentFrame.value=Math.round(d.current*t.framesPerSec)%t.numFrames,u.uniforms.vScroll.value=d.current*t.scrollSpeed}),(0,O.jsx)(`mesh`,{ref:s,geometry:o,material:u,renderOrder:1})}function I(e){let t=(0,C.c)(13),{entity:n}=e,r=n.forceFieldData,i=r.dimensions,a=_(n.id),o,s;if(t[0]===n?(o=t[1],s=t[2]):(o=()=>{let e=y(n);if(e)return f(n.id,e.matrix,e.box,e.enabled),()=>p(n.id)},s=[n],t[0]=n,t[1]=o,t[2]=s),(0,S.useEffect)(o,s),r.textures.length===0){let e;return t[3]===n?e=t[4]:(e=(0,O.jsx)(P,{entity:n}),t[3]=n,t[4]=e),e}let c;t[5]===n?c=t[6]:(c=(0,O.jsx)(x,{name:`ForceField`,fallback:(0,O.jsx)(P,{entity:n}),children:(0,O.jsx)(F,{entity:n})}),t[5]=n,t[6]=c);let l;t[7]!==a||t[8]!==i?(l=a&&i&&(0,O.jsx)(v,{size:i}),t[7]=a,t[8]=i,t[9]=l):l=t[9];let u;return t[10]!==c||t[11]!==l?(u=(0,O.jsxs)(O.Fragment,{children:[c,l]}),t[10]=c,t[11]=l,t[12]=u):u=t[12],u}export{I as ForceFieldBare};