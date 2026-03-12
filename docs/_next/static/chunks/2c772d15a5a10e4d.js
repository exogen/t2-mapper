(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,63724,e=>{"use strict";var r=e.i(43476),o=e.i(932),a=e.i(71645),t=e.i(46325),l=e.i(47071),c=e.i(71753),n=e.i(90072),i=e.i(12979),u=e.i(79123);let s=`
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
`;function d(e){let r,t,l,c=(0,o.c)(7),[i,u,s]=e;c[0]!==i||c[1]!==u||c[2]!==s?((r=new n.BoxGeometry(i,u,s)).translate(i/2,u/2,s/2),c[0]=i,c[1]=u,c[2]=s,c[3]=r):r=c[3];let f=r;return c[4]!==f?(t=()=>()=>f.dispose(),l=[f],c[4]=f,c[5]=t,c[6]=l):(t=c[5],l=c[6]),(0,a.useEffect)(t,l),f}function m(e){let a,t,l,c=(0,o.c)(10),{scale:i,color:u,baseTranslucency:s}=e,f=d(i);c[0]!==u[0]||c[1]!==u[1]||c[2]!==u[2]?(a=new n.Color(u[0],u[1],u[2]),c[0]=u[0],c[1]=u[1],c[2]=u[2],c[3]=a):a=c[3];let m=a,v=+s;return c[4]!==m||c[5]!==v?(t=(0,r.jsx)("meshBasicMaterial",{color:m,transparent:!0,opacity:v,blending:n.AdditiveBlending,side:n.DoubleSide,depthWrite:!1,fog:!1}),c[4]=m,c[5]=v,c[6]=t):t=c[6],c[7]!==f||c[8]!==t?(l=(0,r.jsx)("mesh",{geometry:f,renderOrder:1,children:t}),c[7]=f,c[8]=t,c[9]=l):l=c[9],l}function v({scale:e,data:o}){let{animationEnabled:t}=(0,u.useSettings)(),m=d(e),v=(0,a.useMemo)(()=>o.textures.map(e=>(0,i.textureToUrl)(e)),[o.textures]),g=(0,l.useTexture)(v,e=>{e.forEach(e=>{e.wrapS=e.wrapT=n.RepeatWrapping,e.colorSpace=n.NoColorSpace,e.flipY=!1,e.needsUpdate=!0})}),p=(0,a.useMemo)(()=>(function({textures:e,scale:r,umapping:o,vmapping:a,color:t,baseTranslucency:l}){let c=[...r].sort((e,r)=>r-e),i=new n.Vector2(c[0]*o,c[1]*a),u=e[0];return new n.ShaderMaterial({uniforms:{frame0:{value:u},frame1:{value:e[1]??u},frame2:{value:e[2]??u},frame3:{value:e[3]??u},frame4:{value:e[4]??u},currentFrame:{value:0},vScroll:{value:0},uvScale:{value:i},tintColor:{value:new n.Color(...t)},opacity:{value:l},opacityFactor:{value:1},fogColor:{value:new n.Color},fogNear:{value:1},fogFar:{value:2e3}},vertexShader:s,fragmentShader:f,transparent:!0,blending:n.AdditiveBlending,side:n.DoubleSide,depthWrite:!1,fog:!0})})({textures:g,scale:e,umapping:o.umapping,vmapping:o.vmapping,color:o.color,baseTranslucency:o.baseTranslucency}),[g,e,o]);(0,a.useEffect)(()=>()=>p.dispose(),[p]);let x=(0,a.useRef)(0);return(0,c.useFrame)((e,r)=>{if(!t){x.current=0,p.uniforms.currentFrame.value=0,p.uniforms.vScroll.value=0;return}x.current+=r,p.uniforms.currentFrame.value=Math.floor(x.current*o.framesPerSec)%o.numFrames,p.uniforms.vScroll.value=x.current*o.scrollSpeed}),(0,r.jsx)("mesh",{geometry:m,material:p,renderOrder:1})}function g(e){let a,l,c,n=(0,o.c)(14),{entity:i}=e,u=i.forceFieldData,s=u.dimensions;if(0===u.textures.map(p).length){let e;return n[0]!==u.baseTranslucency||n[1]!==u.color||n[2]!==s?(e=(0,r.jsx)(m,{scale:s,color:u.color,baseTranslucency:u.baseTranslucency}),n[0]=u.baseTranslucency,n[1]=u.color,n[2]=s,n[3]=e):e=n[3],e}return n[4]!==u.baseTranslucency||n[5]!==u.color||n[6]!==s?(a=(0,r.jsx)(m,{scale:s,color:u.color,baseTranslucency:u.baseTranslucency}),n[4]=u.baseTranslucency,n[5]=u.color,n[6]=s,n[7]=a):a=n[7],n[8]!==u||n[9]!==s?(l=(0,r.jsx)(v,{scale:s,data:u}),n[8]=u,n[9]=s,n[10]=l):l=n[10],n[11]!==a||n[12]!==l?(c=(0,r.jsx)(t.DebugSuspense,{name:"ForceField",fallback:a,children:l}),n[11]=a,n[12]=l,n[13]=c):c=n[13],c}function p(e){return(0,i.textureToUrl)(e)}e.s(["ForceFieldBare",()=>g],63724)}]);