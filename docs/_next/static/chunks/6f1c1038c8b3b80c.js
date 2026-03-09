(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,63724,e=>{"use strict";var r=e.i(43476),o=e.i(932),a=e.i(71645),t=e.i(47071),l=e.i(71753),c=e.i(90072),n=e.i(12979),i=e.i(79123);let u=`
#include <fog_pars_vertex>

varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`,s=`
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
`;function f(e){let r,t,l,n=(0,o.c)(7),[i,u,s]=e;n[0]!==i||n[1]!==u||n[2]!==s?((r=new c.BoxGeometry(i,u,s)).translate(i/2,u/2,s/2),n[0]=i,n[1]=u,n[2]=s,n[3]=r):r=n[3];let f=r;return n[4]!==f?(t=()=>()=>f.dispose(),l=[f],n[4]=f,n[5]=t,n[6]=l):(t=n[5],l=n[6]),(0,a.useEffect)(t,l),f}function m(e){let a,t,l,n=(0,o.c)(10),{scale:i,color:u,baseTranslucency:s}=e,m=f(i);n[0]!==u[0]||n[1]!==u[1]||n[2]!==u[2]?(a=new c.Color(u[0],u[1],u[2]),n[0]=u[0],n[1]=u[1],n[2]=u[2],n[3]=a):a=n[3];let d=a,v=+s;return n[4]!==d||n[5]!==v?(t=(0,r.jsx)("meshBasicMaterial",{color:d,transparent:!0,opacity:v,blending:c.AdditiveBlending,side:c.DoubleSide,depthWrite:!1,fog:!1}),n[4]=d,n[5]=v,n[6]=t):t=n[6],n[7]!==m||n[8]!==t?(l=(0,r.jsx)("mesh",{geometry:m,renderOrder:1,children:t}),n[7]=m,n[8]=t,n[9]=l):l=n[9],l}function d({scale:e,data:o}){let{animationEnabled:m}=(0,i.useSettings)(),d=f(e),v=(0,a.useMemo)(()=>o.textures.map(e=>(0,n.textureToUrl)(e)),[o.textures]),g=(0,t.useTexture)(v,e=>{e.forEach(e=>{e.wrapS=e.wrapT=c.RepeatWrapping,e.colorSpace=c.NoColorSpace,e.flipY=!1,e.needsUpdate=!0})}),p=(0,a.useMemo)(()=>(function({textures:e,scale:r,umapping:o,vmapping:a,color:t,baseTranslucency:l}){let n=[...r].sort((e,r)=>r-e),i=new c.Vector2(n[0]*o,n[1]*a),f=e[0];return new c.ShaderMaterial({uniforms:{frame0:{value:f},frame1:{value:e[1]??f},frame2:{value:e[2]??f},frame3:{value:e[3]??f},frame4:{value:e[4]??f},currentFrame:{value:0},vScroll:{value:0},uvScale:{value:i},tintColor:{value:new c.Color(...t)},opacity:{value:l},opacityFactor:{value:1},fogColor:{value:new c.Color},fogNear:{value:1},fogFar:{value:2e3}},vertexShader:u,fragmentShader:s,transparent:!0,blending:c.AdditiveBlending,side:c.DoubleSide,depthWrite:!1,fog:!0})})({textures:g,scale:e,umapping:o.umapping,vmapping:o.vmapping,color:o.color,baseTranslucency:o.baseTranslucency}),[g,e,o]);(0,a.useEffect)(()=>()=>p.dispose(),[p]);let x=(0,a.useRef)(0);return(0,l.useFrame)((e,r)=>{if(!m){x.current=0,p.uniforms.currentFrame.value=0,p.uniforms.vScroll.value=0;return}x.current+=r,p.uniforms.currentFrame.value=Math.floor(x.current*o.framesPerSec)%o.numFrames,p.uniforms.vScroll.value=x.current*o.scrollSpeed}),(0,r.jsx)("mesh",{geometry:d,material:p,renderOrder:1})}function v(e){let t,l,c,n=(0,o.c)(14),{data:i,scale:u}=e;if(0===i.textures.map(g).length){let e;return n[0]!==i.baseTranslucency||n[1]!==i.color||n[2]!==u?(e=(0,r.jsx)(m,{scale:u,color:i.color,baseTranslucency:i.baseTranslucency}),n[0]=i.baseTranslucency,n[1]=i.color,n[2]=u,n[3]=e):e=n[3],e}return n[4]!==i.baseTranslucency||n[5]!==i.color||n[6]!==u?(t=(0,r.jsx)(m,{scale:u,color:i.color,baseTranslucency:i.baseTranslucency}),n[4]=i.baseTranslucency,n[5]=i.color,n[6]=u,n[7]=t):t=n[7],n[8]!==i||n[9]!==u?(l=(0,r.jsx)(d,{scale:u,data:i}),n[8]=i,n[9]=u,n[10]=l):l=n[10],n[11]!==t||n[12]!==l?(c=(0,r.jsx)(a.Suspense,{fallback:t,children:l}),n[11]=t,n[12]=l,n[13]=c):c=n[13],c}function g(e){return(0,n.textureToUrl)(e)}e.s(["ForceFieldBare",()=>v],63724)}]);