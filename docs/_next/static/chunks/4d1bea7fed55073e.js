(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,63724,e=>{"use strict";var r=e.i(43476),o=e.i(71645),t=e.i(47071),a=e.i(49774),l=e.i(90072),i=e.i(62395),n=e.i(12979),u=e.i(79123),s=e.i(6112);let c=`
#include <fog_pars_vertex>

varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`,f=`
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
`;function m(e){let r=(0,o.useMemo)(()=>{let[r,o,t]=e,a=new l.BoxGeometry(r,o,t);return a.translate(r/2,o/2,t/2),a},[e]);return(0,o.useEffect)(()=>()=>r.dispose(),[r]),r}function d({scale:e,color:i,baseTranslucency:n,textureUrls:s,numFrames:d,framesPerSec:p,scrollSpeed:v,umapping:g,vmapping:F}){let{animationEnabled:x}=(0,u.useSettings)(),y=m(e),S=(0,t.useTexture)(s,e=>{e.forEach(e=>{e.wrapS=e.wrapT=l.RepeatWrapping,e.colorSpace=l.NoColorSpace,e.flipY=!1,e.needsUpdate=!0})}),h=(0,o.useMemo)(()=>(function({textures:e,scale:r,umapping:o,vmapping:t,color:a,baseTranslucency:i}){let n=[...r].sort((e,r)=>r-e),u=new l.Vector2(n[0]*o,n[1]*t),s=e[0];return new l.ShaderMaterial({uniforms:{frame0:{value:s},frame1:{value:e[1]??s},frame2:{value:e[2]??s},frame3:{value:e[3]??s},frame4:{value:e[4]??s},currentFrame:{value:0},vScroll:{value:0},uvScale:{value:u},tintColor:{value:new l.Color(...a)},opacity:{value:i},opacityFactor:{value:1},fogColor:{value:new l.Color},fogNear:{value:1},fogFar:{value:2e3}},vertexShader:c,fragmentShader:f,transparent:!0,blending:l.AdditiveBlending,side:l.DoubleSide,depthWrite:!1,fog:!0})})({textures:S,scale:e,umapping:g,vmapping:F,color:i,baseTranslucency:n}),[S,e,g,F,i,n]);(0,o.useEffect)(()=>()=>h.dispose(),[h]);let C=(0,o.useRef)(0);return(0,a.useFrame)((e,r)=>{if(!x){C.current=0,h.uniforms.currentFrame.value=0,h.uniforms.vScroll.value=0;return}C.current+=r,h.uniforms.currentFrame.value=Math.floor(C.current*p)%d,h.uniforms.vScroll.value=C.current*v}),(0,r.jsx)("mesh",{geometry:y,material:h,renderOrder:1})}function p({scale:e,color:t,baseTranslucency:a}){let i=m(e),n=(0,o.useMemo)(()=>new l.Color(t[0],t[1],t[2]),[t]);return(0,r.jsx)("mesh",{geometry:i,renderOrder:1,children:(0,r.jsx)("meshBasicMaterial",{color:n,transparent:!0,opacity:+a,blending:l.AdditiveBlending,side:l.DoubleSide,depthWrite:!1,fog:!1})})}let v=(0,o.memo)(function({object:e}){let t=(0,o.useMemo)(()=>(0,i.getPosition)(e),[e]),a=(0,o.useMemo)(()=>(0,i.getRotation)(e),[e]),l=(0,o.useMemo)(()=>(0,i.getScale)(e),[e]),u=(0,s.useDatablock)((0,i.getProperty)(e,"dataBlock")),c=(0,i.getProperty)(u,"color"),f=(0,o.useMemo)(()=>{let e;return c?[(e=c.split(" ").map(e=>parseFloat(e)))[0]??0,e[1]??0,e[2]??0]:[1,1,1]},[c]),m=parseFloat((0,i.getProperty)(u,"baseTranslucency"))||1,v=parseInt((0,i.getProperty)(u,"numFrames"),10)||1,g=parseFloat((0,i.getProperty)(u,"framesPerSec"))||1,F=parseFloat((0,i.getProperty)(u,"scrollSpeed"))||0,x=parseFloat((0,i.getProperty)(u,"umapping"))||1,y=parseFloat((0,i.getProperty)(u,"vmapping"))||1,S=(0,o.useMemo)(()=>(function(e,r){let o=[];for(let t=0;t<r;t++){let r=(0,i.getProperty)(e,`texture${t}`);r&&o.push((0,n.textureToUrl)(r))}return o})(u,v),[u,v]);return 0===S.length?null:(0,r.jsx)("group",{position:t,quaternion:a,children:(0,r.jsx)(o.Suspense,{fallback:(0,r.jsx)(p,{scale:l,color:f,baseTranslucency:m}),children:(0,r.jsx)(d,{scale:l,color:f,baseTranslucency:m,textureUrls:S,numFrames:v,framesPerSec:g,scrollSpeed:F,umapping:x,vmapping:y})})})});e.s(["ForceFieldBare",0,v],63724)}]);