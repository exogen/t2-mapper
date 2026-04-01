import{r as e}from"./chunk-DECur_0Z.js";import{n as t,r as n,t as r}from"./jsx-runtime-BpGWiA-R.js";import{i,o as a}from"./react-three-fiber.esm-CD18QK1u.js";import{a as o,i as s}from"./SettingsProvider-D-grt5cc.js";import{r as c}from"./cameraTourStore-DQ989o2x.js";import{Ot as l,_t as ee,b as u,jt as d,rt as f}from"./three.module-C9W4LJrj.js";import{n as te,r as p,t as ne}from"./scene-BpfzP6B-.js";import{t as m}from"./extends-DPirtscy.js";import{t as h}from"./Texture-D2i1vM3o.js";import{p as g}from"./index-BEKjcnfN.js";import{t as _}from"./DebugBounds-BnJbEQUF.js";import{a as v,d as y,t as b}from"./globalFogUniforms-BQRkMz5n.js";import{t as x}from"./useAnisotropy-Dq6cNuNI.js";var S=e(n());function C(e,t){let n=e+`Geometry`;return S.forwardRef(({args:e,children:r,...i},a)=>{let o=S.useRef(null);return S.useImperativeHandle(a,()=>o.current),S.useLayoutEffect(()=>void t?.(o.current)),S.createElement(`mesh`,m({ref:o},i),S.createElement(n,{attach:`geometry`,args:e}),r)})}var w=C(`box`),T=t(),E=`
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
`,re=`
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
    uniform float fogVolumeData[12];
    uniform float cameraHeight;
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
    ${v}
  }
`;function D(e){return new d({uniforms:{uTime:{value:0},uOpacity:{value:e?.opacity??.75},uWaveMagnitude:{value:e?.waveMagnitude??1},uEnvMapIntensity:{value:e?.envMapIntensity??1},uBaseTexture:{value:e?.baseTexture??null},uEnvMapTexture:{value:e?.envMapTexture??null},fogColor:{value:new u},fogNear:{value:1},fogFar:{value:2e3},fogVolumeData:b.fogVolumeData,cameraHeight:b.cameraHeight,fogEnabled:b.fogEnabled,fogDistanceScale:b.fogDistanceScale},vertexShader:E,fragmentShader:re,transparent:!0,side:2,depthWrite:!0,fog:!0})}function ie(){let e=(0,T.c)(1),t=(0,S.useRef)(null),n;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=e=>{if(!t.current)return t.current=e.clone(),!0;let n=t.current.x===e.x&&t.current.y===e.y&&t.current.z===e.z;return n||t.current.copy(e),n},e[0]=n):n=e[0],n}var O=r(),k=2048,A=1024;function ae(e,t){let n=e<=1024&&t<=1024?8:16;return[Math.max(4,Math.ceil(e/n)),Math.max(4,Math.ceil(t/n))]}function oe(e){let t=(0,T.c)(7),{surfaceTexture:n,attach:r}=e,i;t[0]===n?i=t[1]:(i=g(n),t[0]=n,t[1]=i);let a=i,o=x(),s;t[2]===o?s=t[3]:(s=e=>y(e,{anisotropy:o}),t[2]=o,t[3]=s);let c=h(a,s),l;return t[4]!==r||t[5]!==c?(l=(0,O.jsx)(`meshStandardMaterial`,{attach:r,map:c,transparent:!0,opacity:.8,side:2}),t[4]=r,t[5]=c,t[6]=l):l=t[6],l}var j=(0,S.memo)(function(e){let t=(0,T.c)(68),{entity:n}=e,r=n.waterData,o=c(n.id),{debugMode:l}=s(),u;t[0]===r.transform?u=t[1]:(u=ne(r.transform),t[0]=r.transform,t[1]=u);let d=u,f;t[2]===r.transform.position?f=t[3]:(f=p(r.transform.position),t[2]=r.transform.position,t[3]=f);let m=f,h;t[4]===r.scale?h=t[5]:(h=te(r.scale),t[4]=r.scale,t[5]=h);let g=h,[v,y,b]=g,x=a(ce),C=ie(),E=r.waveMagnitude,[re,D,oe]=m,j=re+A,M=oe+A,N;t[6]===j?N=t[7]:(N=Math.round(j/8),t[6]=j,t[7]=N);let ue=N,P;t[8]===M?P=t[9]:(P=Math.round(M/8),t[8]=M,t[9]=P);let de=P;ue=Math.max(0,Math.min(2040,ue)),de=Math.max(0,Math.min(2040,de));let fe=ue*8,F=de*8,I;t[10]!==fe||t[11]!==F||t[12]!==D?(I=[fe,D,F],t[10]=fe,t[11]=F,t[12]=D,t[13]=I):I=t[13];let L=I,pe=le,R;t[14]!==x.position.x||t[15]!==x.position.z?(R=()=>pe(x.position.x,x.position.z),t[14]=x.position.x,t[15]=x.position.z,t[16]=R):R=t[16];let[z,me]=(0,S.useState)(R),B;t[17]!==x.position||t[18]!==C?(B=()=>{if(!C(x.position))return;let e=pe(x.position.x,x.position.z);me(t=>t.length===e.length&&t.every((t,n)=>t[0]===e[n][0]&&t[1]===e[n][1])?t:e)},t[17]=x.position,t[18]=C,t[19]=B):B=t[19],i(B);let V=r.surfaceName||`liquidTiles/BlueWater`,H=r.envMapName||void 0,U=r.surfaceOpacity,he=r.envMapIntensity,W;if(t[20]!==v||t[21]!==y||t[22]!==b){let[e,n]=ae(v,b);W=new ee(v,b,e,n),W.rotateX(-Math.PI/2),W.translate(v/2,y,b/2),t[20]=v,t[21]=y,t[22]=b,t[23]=W}else W=t[23];let G=W,K,q;t[24]===G?(K=t[25],q=t[26]):(q=()=>()=>{G.dispose()},K=[G],t[24]=G,t[25]=K,t[26]=q),(0,S.useEffect)(q,K);let J;t[27]!==l||t[28]!==m[0]||t[29]!==m[1]||t[30]!==m[2]||t[31]!==g||t[32]!==v||t[33]!==y||t[34]!==b?(J=l&&(0,O.jsx)(w,{args:g,position:[m[0]+v/2,m[1]+y/2,m[2]+b/2],children:(0,O.jsx)(`meshBasicMaterial`,{color:`#00fbff`,wireframe:!0})}),t[27]=l,t[28]=m[0],t[29]=m[1],t[30]=m[2],t[31]=g,t[32]=v,t[33]=y,t[34]=b,t[35]=J):J=t[35];let Y;t[36]!==o||t[37]!==m[0]||t[38]!==m[1]||t[39]!==m[2]||t[40]!==v||t[41]!==y||t[42]!==b?(Y=o&&(0,O.jsx)(`group`,{position:[m[0]+v/2,m[1]+y/2,m[2]+b/2],children:(0,O.jsx)(_,{size:[v,y,b]})}),t[36]=o,t[37]=m[0],t[38]=m[1],t[39]=m[2],t[40]=v,t[41]=y,t[42]=b,t[43]=Y):Y=t[43];let X;if(t[44]!==L||t[45]!==z||t[46]!==G){let e;t[48]!==L||t[49]!==G?(e=e=>{let[t,n]=e,r=L[0]+t*k-A,i=L[2]+n*k-A;return(0,O.jsx)(`mesh`,{geometry:G,position:[r,L[1],i],children:(0,O.jsx)(`meshStandardMaterial`,{color:`#00fbff`,transparent:!0,opacity:.4,wireframe:!0,side:2})},`${t},${n}`)},t[48]=L,t[49]=G,t[50]=e):e=t[50],X=z.map(e),t[44]=L,t[45]=z,t[46]=G,t[47]=X}else X=t[47];let Z;t[51]!==L||t[52]!==he||t[53]!==H||t[54]!==U||t[55]!==z||t[56]!==G||t[57]!==V||t[58]!==E?(Z=(0,O.jsx)(se,{reps:z,basePosition:L,surfaceGeometry:G,surfaceTexture:V,envMapTexture:H,opacity:U,waveMagnitude:E,envMapIntensity:he}),t[51]=L,t[52]=he,t[53]=H,t[54]=U,t[55]=z,t[56]=G,t[57]=V,t[58]=E,t[59]=Z):Z=t[59];let Q;t[60]!==X||t[61]!==Z?(Q=(0,O.jsx)(S.Suspense,{fallback:X,children:Z}),t[60]=X,t[61]=Z,t[62]=Q):Q=t[62];let $;return t[63]!==d||t[64]!==J||t[65]!==Y||t[66]!==Q?($=(0,O.jsxs)(`group`,{quaternion:d,children:[J,Y,Q]}),t[63]=d,t[64]=J,t[65]=Y,t[66]=Q,t[67]=$):$=t[67],$}),se=(0,S.memo)(function({reps:e,basePosition:t,surfaceGeometry:n,surfaceTexture:r,envMapTexture:a,opacity:s,waveMagnitude:c,envMapIntensity:ee}){let u=g(r),d=g(a??`special/lush_env`),te=x(),[p,ne]=h([u,d],e=>{(Array.isArray(e)?e:[e]).forEach(e=>{y(e,{anisotropy:te}),e.colorSpace=``,e.wrapS=l,e.wrapT=l})}),{animationEnabled:m}=o(),_=(0,S.useMemo)(()=>D({opacity:s,waveMagnitude:c,envMapIntensity:ee,baseTexture:p,envMapTexture:ne}),[s,c,ee,p,ne]),v=(0,S.useRef)(0),b=(0,S.useRef)(null),C=(0,S.useRef)(new f),w=(0,S.useRef)(null),T=(0,S.useRef)(null);return i((n,r)=>{m?(v.current+=r,_.uniforms.uTime.value=v.current):(v.current=0,_.uniforms.uTime.value=0);let i=b.current;if(!i||i===w.current&&e===T.current)return;w.current=i,T.current=e;let a=C.current;for(let n=0;n<e.length;n++){let[r,o]=e[n],s=t[0]+r*k-A,c=t[2]+o*k-A;a.makeTranslation(s,t[1],c),i.setMatrixAt(n,a)}i.count=e.length,i.instanceMatrix.needsUpdate=!0}),(0,S.useEffect)(()=>()=>{_.dispose()},[_]),(0,O.jsx)(`instancedMesh`,{ref:b,args:[n,_,9],frustumCulled:!1,renderOrder:-1})});function ce(e){return e.camera}function le(e,t){let n=e+A,r=t+A,i=Math.trunc(n/k),a=Math.trunc(r/k);n<0&&i--,r<0&&a--;let o=[];for(let e=a-1;e<=a+1;e++)for(let t=i-1;t<=i+1;t++)o.push([t,e]);return o}export{j as WaterBlock,oe as WaterMaterial};