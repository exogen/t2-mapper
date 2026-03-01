(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,63724,e=>{"use strict";var r=e.i(43476),t=e.i(932),o=e.i(71645),a=e.i(47071),l=e.i(49774),i=e.i(90072),n=e.i(62395),s=e.i(12979),c=e.i(79123),u=e.i(6112);let f=`
#include <fog_pars_vertex>

varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`,m=`
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
`;function d(e){let r,a,l,n=(0,t.c)(7),[s,c,u]=e;n[0]!==s||n[1]!==c||n[2]!==u?((r=new i.BoxGeometry(s,c,u)).translate(s/2,c/2,u/2),n[0]=s,n[1]=c,n[2]=u,n[3]=r):r=n[3];let f=r;return n[4]!==f?(a=()=>()=>f.dispose(),l=[f],n[4]=f,n[5]=a,n[6]=l):(a=n[5],l=n[6]),(0,o.useEffect)(a,l),f}function p({scale:e,color:t,baseTranslucency:n,textureUrls:s,numFrames:u,framesPerSec:p,scrollSpeed:v,umapping:g,vmapping:x}){let{animationEnabled:F}=(0,c.useSettings)(),y=d(e),S=(0,a.useTexture)(s,e=>{e.forEach(e=>{e.wrapS=e.wrapT=i.RepeatWrapping,e.colorSpace=i.NoColorSpace,e.flipY=!1,e.needsUpdate=!0})}),h=(0,o.useMemo)(()=>(function({textures:e,scale:r,umapping:t,vmapping:o,color:a,baseTranslucency:l}){let n=[...r].sort((e,r)=>r-e),s=new i.Vector2(n[0]*t,n[1]*o),c=e[0];return new i.ShaderMaterial({uniforms:{frame0:{value:c},frame1:{value:e[1]??c},frame2:{value:e[2]??c},frame3:{value:e[3]??c},frame4:{value:e[4]??c},currentFrame:{value:0},vScroll:{value:0},uvScale:{value:s},tintColor:{value:new i.Color(...a)},opacity:{value:l},opacityFactor:{value:1},fogColor:{value:new i.Color},fogNear:{value:1},fogFar:{value:2e3}},vertexShader:f,fragmentShader:m,transparent:!0,blending:i.AdditiveBlending,side:i.DoubleSide,depthWrite:!1,fog:!0})})({textures:S,scale:e,umapping:g,vmapping:x,color:t,baseTranslucency:n}),[S,e,g,x,t,n]);(0,o.useEffect)(()=>()=>h.dispose(),[h]);let C=(0,o.useRef)(0);return(0,l.useFrame)((e,r)=>{if(!F){C.current=0,h.uniforms.currentFrame.value=0,h.uniforms.vScroll.value=0;return}C.current+=r,h.uniforms.currentFrame.value=Math.floor(C.current*p)%u,h.uniforms.vScroll.value=C.current*v}),(0,r.jsx)("mesh",{geometry:y,material:h,renderOrder:1})}function v(e){let o,a,l,n=(0,t.c)(10),{scale:s,color:c,baseTranslucency:u}=e,f=d(s);n[0]!==c[0]||n[1]!==c[1]||n[2]!==c[2]?(o=new i.Color(c[0],c[1],c[2]),n[0]=c[0],n[1]=c[1],n[2]=c[2],n[3]=o):o=n[3];let m=o,p=+u;return n[4]!==m||n[5]!==p?(a=(0,r.jsx)("meshBasicMaterial",{color:m,transparent:!0,opacity:p,blending:i.AdditiveBlending,side:i.DoubleSide,depthWrite:!1,fog:!1}),n[4]=m,n[5]=p,n[6]=a):a=n[6],n[7]!==f||n[8]!==a?(l=(0,r.jsx)("mesh",{geometry:f,renderOrder:1,children:a}),n[7]=f,n[8]=a,n[9]=l):l=n[9],l}let g=(0,o.memo)(function(e){let a,l,i,c,f,m,d,g,x,F,y,S,h,C,b,U,P,D=(0,t.c)(56),{object:w}=e;D[0]!==w?(a=(0,n.getPosition)(w),D[0]=w,D[1]=a):a=D[1];let T=a;D[2]!==w?(l=(0,n.getRotation)(w),D[2]=w,D[3]=l):l=D[3];let j=l;D[4]!==w?(i=(0,n.getScale)(w),D[4]=w,D[5]=i):i=D[5];let B=i;D[6]!==w?(c=(0,n.getProperty)(w,"dataBlock"),D[6]=w,D[7]=c):c=D[7];let _=(0,u.useDatablock)(c);D[8]!==_?(f=(0,n.getProperty)(_,"color"),D[8]=_,D[9]=f):f=D[9];let O=f;if(D[10]!==O){let e;m=O?[(e=O.split(" ").map(e=>parseFloat(e)))[0]??0,e[1]??0,e[2]??0]:[1,1,1],D[10]=O,D[11]=m}else m=D[11];let M=m;D[12]!==_?(d=parseFloat((0,n.getProperty)(_,"baseTranslucency"))||1,D[12]=_,D[13]=d):d=D[13];let N=d;D[14]!==_?(g=parseInt((0,n.getProperty)(_,"numFrames"),10)||1,D[14]=_,D[15]=g):g=D[15];let R=g;D[16]!==_?(x=parseFloat((0,n.getProperty)(_,"framesPerSec"))||1,D[16]=_,D[17]=x):x=D[17];let k=x;D[18]!==_?(F=parseFloat((0,n.getProperty)(_,"scrollSpeed"))||0,D[18]=_,D[19]=F):F=D[19];let A=F;D[20]!==_?(y=parseFloat((0,n.getProperty)(_,"umapping"))||1,D[20]=_,D[21]=y):y=D[21];let E=y;D[22]!==_?(S=parseFloat((0,n.getProperty)(_,"vmapping"))||1,D[22]=_,D[23]=S):S=D[23];let q=S;D[24]!==_||D[25]!==R?(h=function(e,r){let t=[];for(let o=0;o<r;o++){let r=(0,n.getProperty)(e,`texture${o}`);r&&t.push((0,s.textureToUrl)(r))}return t}(_,R),D[24]=_,D[25]=R,D[26]=h):h=D[26];let G=h;if(0===G.length){let e,t;return D[27]!==N||D[28]!==M||D[29]!==B?(e=(0,r.jsx)(v,{scale:B,color:M,baseTranslucency:N}),D[27]=N,D[28]=M,D[29]=B,D[30]=e):e=D[30],D[31]!==T||D[32]!==j||D[33]!==e?(t=(0,r.jsx)("group",{position:T,quaternion:j,children:e}),D[31]=T,D[32]=j,D[33]=e,D[34]=t):t=D[34],t}return D[35]!==N||D[36]!==M||D[37]!==B?(C=(0,r.jsx)(v,{scale:B,color:M,baseTranslucency:N}),D[35]=N,D[36]=M,D[37]=B,D[38]=C):C=D[38],D[39]!==N||D[40]!==M||D[41]!==k||D[42]!==R||D[43]!==B||D[44]!==A||D[45]!==G||D[46]!==E||D[47]!==q?(b=(0,r.jsx)(p,{scale:B,color:M,baseTranslucency:N,textureUrls:G,numFrames:R,framesPerSec:k,scrollSpeed:A,umapping:E,vmapping:q}),D[39]=N,D[40]=M,D[41]=k,D[42]=R,D[43]=B,D[44]=A,D[45]=G,D[46]=E,D[47]=q,D[48]=b):b=D[48],D[49]!==C||D[50]!==b?(U=(0,r.jsx)(o.Suspense,{fallback:C,children:b}),D[49]=C,D[50]=b,D[51]=U):U=D[51],D[52]!==T||D[53]!==j||D[54]!==U?(P=(0,r.jsx)("group",{position:T,quaternion:j,children:U}),D[52]=T,D[53]=j,D[54]=U,D[55]=P):P=D[55],P});e.s(["ForceFieldBare",0,g],63724)}]);