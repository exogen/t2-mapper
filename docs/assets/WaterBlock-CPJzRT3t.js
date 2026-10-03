import{r as e}from"./rolldown-runtime-hePW80VL.js";import{E as t,T as n,w as r}from"./gameEntityStore-yrDxjNog.js";import{d as i,g as a}from"./events-9ce18a08.esm-ByOytsPo.js";import{a as o,o as s}from"./SettingsProvider-DFUtH9WB.js";import{U as c,Wi as l,ir as u,jr as ee,ta as d}from"./three.core-DtjtRha-.js";import{p as f}from"./loaders-C53-y5Bv.js";import{l as p,t as m}from"./fogShader-DUcfrCw2.js";import{n as h}from"./globalFogUniforms-Ds1aGA7A.js";import{c as g,s as _}from"./waterLevel-CbYeI0gJ.js";import"./ghostToScene-BWxSpc4G.js";import{n as te,r as ne,t as v}from"./coordinates-Dq2wq4f2.js";import{c as y}from"./engineStore-Van7qfuY.js";import{i as b}from"./cameraTourStore-CKqZnuwq.js";import{t as x}from"./DebugBounds-JFrCgn_b.js";import{t as S}from"./useAnisotropy-xmzaB7y-.js";import{o as re}from"./placement-B57urdbY.js";import{t as C}from"./Texture-GrxGktyQ.js";import{s as w}from"./GameView-CYPE52TW.js";import"./misToScene-CtrNg9fC.js";var T=e(t());function E(e,t){let n=e+`Geometry`;return T.forwardRef(({args:e,children:r,...i},a)=>{let o=T.useRef(null);return T.useImperativeHandle(a,()=>o.current),T.useLayoutEffect(()=>void t?.(o.current)),T.createElement(`mesh`,w({ref:o},i),T.createElement(n,{attach:`geometry`,args:e}),r)})}var ie=E(`box`),ae=n(),oe=`
  #include <fog_pars_vertex>

  #ifdef USE_FOG
    #define USE_FOG_WORLD_POSITION
    varying vec3 vFogWorldPosition;
  #endif

  uniform float uTime;
  uniform float uWaveMagnitude;

  varying vec3 vWorldPosition;
  varying vec3 vViewVector;
  varying float vDistance;

  // Wave function matching Tribes 2 engine
  // Z = surfaceZ + (sin(X*0.05 + time) + sin(Y*0.05 + time)) * waveFactor
  // waveFactor = waveAmplitude * 0.25
  // Note: Using xz for Three.js Y-up (Torque uses XY with Z-up)
  float getWaveHeight(vec3 worldPos) {
    float waveFactor = uWaveMagnitude * 0.25;
    return (sin(worldPos.x * 0.05 + uTime) + sin(worldPos.z * 0.05 + uTime)) * waveFactor;
  }

  void main() {
    // Apply instance transform when using InstancedMesh.
    #ifdef USE_INSTANCING
      mat4 localModel = modelMatrix * instanceMatrix;
    #else
      mat4 localModel = modelMatrix;
    #endif

    // Get world position for wave calculation
    vec4 worldPos = localModel * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;

    // Apply wave displacement to Y (vertical axis in Three.js)
    vec3 displaced = position;
    displaced.y += getWaveHeight(worldPos.xyz);

    // Calculate final world position after displacement for fog
    #ifdef USE_FOG
      vec4 displacedWorldPos = localModel * vec4(displaced, 1.0);
      vFogWorldPosition = displacedWorldPos.xyz;
    #endif

    // Calculate view vector for environment mapping
    vViewVector = cameraPosition - worldPos.xyz;
    vDistance = length(vViewVector);

    vec4 mvPosition = viewMatrix * localModel * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Set fog depth (distance from camera) - normally done by fog_vertex include
    // but we can't use that include because it references 'transformed' which we don't have
    #ifdef USE_FOG
      vFogDepth = length(mvPosition.xyz);
    #endif
  }
`,D=`
  #define HAS_FOG_DISTANCE_SCALE
  #include <fog_pars_fragment>

  // Enable volumetric fog (must be defined before fog uniforms)
  #ifdef USE_FOG
    #define USE_VOLUMETRIC_FOG
    #define USE_FOG_WORLD_POSITION
  #endif

  uniform float uTime;
  uniform float uOpacity;
  uniform float uEnvMapIntensity;
  uniform sampler2D uBaseTexture;
  uniform sampler2D uEnvMapTexture;

  // Volumetric fog uniforms
  #ifdef USE_FOG
    uniform vec4 fogVolumeData[3];
    uniform float cameraHeight;
    uniform float fogRowBase;
    uniform float fogRowStep;
    uniform bool fogEnabled;
    varying vec3 vFogWorldPosition;
  #endif

  varying vec3 vWorldPosition;
  varying vec3 vViewVector;
  varying float vDistance;

  #define TWO_PI 6.283185307179586

  // Constants from Tribes 2 engine
  #define BASE_DRIFT_CYCLE_TIME 8.0
  #define BASE_DRIFT_RATE 0.02
  #define BASE_DRIFT_SCALAR 0.03
  #define TEXTURE_SCALE (1.0 / 48.0)

  // Environment map UV wobble constants
  #define Q1 150.0
  #define Q2 2.0
  #define Q3 0.01

  // Rotate UV coordinates
  vec2 rotateUV(vec2 uv, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(
      uv.x * c - uv.y * s,
      uv.x * s + uv.y * c
    );
  }

  void main() {
    // Calculate base texture UVs using world position (1/48 tiling)
    vec2 baseUV = vWorldPosition.xz * TEXTURE_SCALE;

    // Phase (time in radians for drift cycle)
    float phase = mod(uTime * (TWO_PI / BASE_DRIFT_CYCLE_TIME), TWO_PI);

    // Base texture drift
    float baseDriftX = uTime * BASE_DRIFT_RATE;
    float baseDriftY = cos(phase) * BASE_DRIFT_SCALAR;

    // === Phase 1a: First base texture pass (rotated 30 degrees) ===
    vec2 uv1a = rotateUV(baseUV, radians(30.0));

    // === Phase 1b: Second base texture pass (rotated 60 degrees total, with drift) ===
    vec2 uv1b = rotateUV(baseUV + vec2(baseDriftX, baseDriftY), radians(60.0));

    // Calculate cross-fade swing value
    float A1 = cos(((vWorldPosition.x / Q1) + (uTime / Q2)) * 6.0);
    float A2 = sin(((vWorldPosition.z / Q1) + (uTime / Q2)) * TWO_PI);
    float swing = (A1 + A2) * 0.15 + 0.5;

    // Cross-fade alpha calculation from engine
    float alpha1a = ((1.0 - swing) * uOpacity) / max(1.0 - (swing * uOpacity), 0.001);
    float alpha1b = swing * uOpacity;

    // Sample base texture for both passes
    vec4 texColor1a = texture2D(uBaseTexture, uv1a);
    vec4 texColor1b = texture2D(uBaseTexture, uv1b);

    // Combined alpha and color
    float combinedAlpha = 1.0 - (1.0 - alpha1a) * (1.0 - alpha1b);
    vec3 baseColor = (texColor1a.rgb * alpha1a * (1.0 - alpha1b) + texColor1b.rgb * alpha1b) / max(combinedAlpha, 0.001);

    // === Phase 3: Environment map / specular ===
    vec3 reflectVec = -vViewVector;
    reflectVec.y = abs(reflectVec.y);
    if (reflectVec.y < 0.001) reflectVec.y = 0.001;

    vec2 envUV;
    if (vDistance < 0.001) {
      envUV = vec2(0.0);
    } else {
      float value = (vDistance - reflectVec.y) / (vDistance * vDistance);
      envUV.x = reflectVec.x * value;
      envUV.y = reflectVec.z * value;
    }

    envUV = envUV * 0.5 + 0.5;
    envUV.x += A1 * Q3;
    envUV.y += A2 * Q3;

    vec4 envColor = texture2D(uEnvMapTexture, envUV);
    vec3 finalColor = baseColor + envColor.rgb * envColor.a * uEnvMapIntensity;

    // Note: Tribes 2 water does NOT use lighting - Phase 2 (lightmap) is disabled
    // in the original engine. Water colors come directly from textures.

    gl_FragColor = vec4(finalColor, combinedAlpha);

    // Apply volumetric fog using shared Torque-style fog shader
    ${m}
  }
`;function se(e){return new d({uniforms:{uTime:{value:0},uOpacity:{value:e?.opacity??.75},uWaveMagnitude:{value:e?.waveMagnitude??1},uEnvMapIntensity:{value:e?.envMapIntensity??1},uBaseTexture:{value:e?.baseTexture??null},uEnvMapTexture:{value:e?.envMapTexture??null},fogColor:{value:new c},fogNear:{value:1},fogFar:{value:2e3},fogVolumeData:h.fogVolumeData,cameraHeight:h.cameraHeight,fogEnabled:h.fogEnabled,fogDistanceScale:h.fogDistanceScale,fogRowBase:h.fogRowBase,fogRowStep:h.fogRowStep},vertexShader:oe,fragmentShader:D,transparent:!0,side:2,depthWrite:!0,fog:!0})}var O=r(),k=2048,A=1024;function ce(e,t){let n=e<=1024&&t<=1024?8:16;return[Math.max(4,Math.ceil(e/n)),Math.max(4,Math.ceil(t/n))]}function j(e){let t=e+A,n=Math.trunc(t/k);return t<0&&n--,n}function le(e,t){let n=[];for(let r=t-1;r<=t+1;r++)for(let t=e-1;t<=e+1;t++)n.push([t,r]);return n}function M(e){let t=(0,ae.c)(7),{surfaceTexture:n,attach:r}=e,i;t[0]===n?i=t[1]:(i=f(n),t[0]=n,t[1]=i);let a=i,o=S(),s;t[2]===o?s=t[3]:(s=e=>p(e,{anisotropy:o}),t[2]=o,t[3]=s);let c=C(a,s),l;return t[4]!==r||t[5]!==c?(l=(0,O.jsx)(`meshStandardMaterial`,{attach:r,map:c,transparent:!0,opacity:.8,side:2}),t[4]=r,t[5]=c,t[6]=l):l=t[6],l}var N=(0,T.memo)(function(e){let t=(0,ae.c)(78),{entity:n}=e,r=n.waterData,s=b(n.id),{debugMode:c}=o(),l;t[0]===r.transform?l=t[1]:(l=v(r.transform),t[0]=r.transform,t[1]=l);let u=l,d;t[2]===r.transform.position?d=t[3]:(d=ne(r.transform.position),t[2]=r.transform.position,t[3]=d);let f=d,p;t[4]===r.scale?p=t[5]:(p=te(r.scale),t[4]=r.scale,t[5]=p);let m=p,[h,g,y]=m,S=a(de),C=r.waveMagnitude,w,E;t[6]===r?(w=t[7],E=t[8]):(w=()=>{let e=`ghost:${r.ghostIndex}`;return _(e,re(r)),()=>_(e,null)},E=[r],t[6]=r,t[7]=w,t[8]=E),(0,T.useEffect)(w,E);let[oe,D,se]=f,M=oe+A,N=se+A,P;t[9]===M?P=t[10]:(P=Math.round(M/8),t[9]=M,t[10]=P);let fe=P,F;t[11]===N?F=t[12]:(F=Math.round(N/8),t[11]=N,t[12]=F);let pe=F;fe=Math.max(0,Math.min(2040,fe)),pe=Math.max(0,Math.min(2040,pe));let me=fe*8,he=pe*8,I;t[13]!==me||t[14]!==he||t[15]!==D?(I=[me,D,he],t[13]=me,t[14]=he,t[15]=D,t[16]=I):I=t[16];let L=I,R;t[17]!==S.position.x||t[18]!==S.position.z?(R=()=>le(j(S.position.x),j(S.position.z)),t[17]=S.position.x,t[18]=S.position.z,t[19]=R):R=t[19];let[z,ge]=(0,T.useState)(R),B;t[20]===S.position.x?B=t[21]:(B=j(S.position.x),t[20]=S.position.x,t[21]=B);let V;t[22]===S.position.z?V=t[23]:(V=j(S.position.z),t[22]=S.position.z,t[23]=V);let H;t[24]!==B||t[25]!==V?(H={x:B,z:V},t[24]=B,t[25]=V,t[26]=H):H=t[26];let _e=(0,T.useRef)(H),U;t[27]!==S.position.x||t[28]!==S.position.z?(U=()=>{let e=j(S.position.x),t=j(S.position.z),n=_e.current;(n.x!==e||n.z!==t)&&(n.x=e,n.z=t,ge(le(e,t)))},t[27]=S.position.x,t[28]=S.position.z,t[29]=U):U=t[29],i(U);let ve=r.surfaceName||`liquidTiles/BlueWater`,ye=r.envMapName||void 0,be=r.surfaceOpacity,xe=r.envMapIntensity,W;if(t[30]!==h||t[31]!==g||t[32]!==y){let[e,n]=ce(h,y);W=new ee(h,y,e,n),W.rotateX(-Math.PI/2),W.translate(h/2,g,y/2),t[30]=h,t[31]=g,t[32]=y,t[33]=W}else W=t[33];let G=W,K,q;t[34]===G?(K=t[35],q=t[36]):(K=()=>()=>{G.dispose()},q=[G],t[34]=G,t[35]=K,t[36]=q),(0,T.useEffect)(K,q);let J;t[37]!==c||t[38]!==f[0]||t[39]!==f[1]||t[40]!==f[2]||t[41]!==m||t[42]!==h||t[43]!==g||t[44]!==y?(J=c&&(0,O.jsx)(ie,{args:m,position:[f[0]+h/2,f[1]+g/2,f[2]+y/2],children:(0,O.jsx)(`meshBasicMaterial`,{color:`#00fbff`,wireframe:!0})}),t[37]=c,t[38]=f[0],t[39]=f[1],t[40]=f[2],t[41]=m,t[42]=h,t[43]=g,t[44]=y,t[45]=J):J=t[45];let Y;t[46]!==s||t[47]!==f[0]||t[48]!==f[1]||t[49]!==f[2]||t[50]!==h||t[51]!==g||t[52]!==y?(Y=s&&(0,O.jsx)(`group`,{position:[f[0]+h/2,f[1]+g/2,f[2]+y/2],children:(0,O.jsx)(x,{size:[h,g,y]})}),t[46]=s,t[47]=f[0],t[48]=f[1],t[49]=f[2],t[50]=h,t[51]=g,t[52]=y,t[53]=Y):Y=t[53];let X;if(t[54]!==L||t[55]!==z||t[56]!==G){let e;t[58]!==L||t[59]!==G?(e=e=>{let[t,n]=e,r=L[0]+t*k-A,i=L[2]+n*k-A;return(0,O.jsx)(`mesh`,{geometry:G,position:[r,L[1],i],children:(0,O.jsx)(`meshStandardMaterial`,{color:`#00fbff`,transparent:!0,opacity:.4,wireframe:!0,side:2})},`${t},${n}`)},t[58]=L,t[59]=G,t[60]=e):e=t[60],X=z.map(e),t[54]=L,t[55]=z,t[56]=G,t[57]=X}else X=t[57];let Z;t[61]!==L||t[62]!==xe||t[63]!==ye||t[64]!==be||t[65]!==z||t[66]!==G||t[67]!==ve||t[68]!==C?(Z=(0,O.jsx)(ue,{reps:z,basePosition:L,surfaceGeometry:G,surfaceTexture:ve,envMapTexture:ye,opacity:be,waveMagnitude:C,envMapIntensity:xe}),t[61]=L,t[62]=xe,t[63]=ye,t[64]=be,t[65]=z,t[66]=G,t[67]=ve,t[68]=C,t[69]=Z):Z=t[69];let Q;t[70]!==X||t[71]!==Z?(Q=(0,O.jsx)(T.Suspense,{fallback:X,children:Z}),t[70]=X,t[71]=Z,t[72]=Q):Q=t[72];let $;return t[73]!==u||t[74]!==J||t[75]!==Y||t[76]!==Q?($=(0,O.jsxs)(`group`,{quaternion:u,children:[J,Y,Q]}),t[73]=u,t[74]=J,t[75]=Y,t[76]=Q,t[77]=$):$=t[77],$}),ue=(0,T.memo)(function({reps:e,basePosition:t,surfaceGeometry:n,surfaceTexture:r,envMapTexture:a,opacity:o,waveMagnitude:c,envMapIntensity:ee}){let d=f(r),m=f(a??`special/lush_env`),h=S(),[_,te]=C([d,m],e=>{(Array.isArray(e)?e:[e]).forEach(e=>{p(e,{anisotropy:h}),e.colorSpace=``,e.wrapS=l,e.wrapT=l})}),{animationEnabled:ne}=s(),v=(0,T.useMemo)(()=>se({opacity:o,waveMagnitude:c,envMapIntensity:ee,baseTexture:_,envMapTexture:te}),[o,c,ee,_,te]),b=(0,T.useRef)(0),x=(0,T.useRef)(null),re=(0,T.useRef)(new u),w=(0,T.useRef)(null),E=(0,T.useRef)(null);return i((n,r)=>{ne?(b.current+=y(r),v.uniforms.uTime.value=b.current):(b.current=0,v.uniforms.uTime.value=0),g(b.current);let i=x.current;if(!i||i===w.current&&e===E.current)return;w.current=i,E.current=e;let a=re.current;for(let n=0;n<e.length;n++){let[r,o]=e[n],s=t[0]+r*k-A,c=t[2]+o*k-A;a.makeTranslation(s,t[1],c),i.setMatrixAt(n,a)}i.count=e.length,i.instanceMatrix.needsUpdate=!0}),(0,T.useEffect)(()=>()=>{v.dispose()},[v]),(0,O.jsx)(`instancedMesh`,{ref:x,args:[n,v,9],frustumCulled:!1,renderOrder:-1})});function de(e){return e.camera}export{N as WaterBlock,M as WaterMaterial};