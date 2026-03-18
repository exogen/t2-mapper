import{r as e}from"./chunk-DECur_0Z.js";import{n as t,r as n,t as r}from"./jsx-runtime-BpGWiA-R.js";import{i,o as a}from"./react-three-fiber.esm-dhSWjERg.js";import{a as o,i as s}from"./SettingsProvider-2cUUftaX.js";import"./logger-zy3b0zcG.js";import"./traditional-BTL5qX2E.js";import{At as c,Dt as l,b as u,gt as ee,nt as d}from"./three.module-CwgFV8Kd.js";import{n as te,r as ne,t as re}from"./scene-B1EyKjda.js";import"./mission-CFLOK_Oy.js";import{t as f}from"./extends-C_PM0Yom.js";import{t as p}from"./Texture-CI_Y9elU.js";import{p as m}from"./loaders-C_1cX1lR.js";import{a as h,c as g,f as _,t as v}from"./globalFogUniforms-DQn9KFk6.js";var y=e(n());function b(e,t){let n=e+`Geometry`;return y.forwardRef(({args:e,children:r,...i},a)=>{let o=y.useRef(null);return y.useImperativeHandle(a,()=>o.current),y.useLayoutEffect(()=>void t?.(o.current)),y.createElement(`mesh`,f({ref:o},i),y.createElement(n,{attach:`geometry`,args:e}),r)})}var x=b(`box`),S=t(),C=`
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
`,w=`
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
    ${h}
  }
`;function ie(e){return new c({uniforms:{uTime:{value:0},uOpacity:{value:e?.opacity??.75},uWaveMagnitude:{value:e?.waveMagnitude??1},uEnvMapIntensity:{value:e?.envMapIntensity??1},uBaseTexture:{value:e?.baseTexture??null},uEnvMapTexture:{value:e?.envMapTexture??null},fogColor:{value:new u},fogNear:{value:1},fogFar:{value:2e3},fogVolumeData:v.fogVolumeData,cameraHeight:v.cameraHeight,fogEnabled:v.fogEnabled},vertexShader:C,fragmentShader:w,transparent:!0,side:2,depthWrite:!0,fog:!0})}function ae(){let e=(0,S.c)(1),t=(0,y.useRef)(null),n;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=e=>{if(!t.current)return t.current=e.clone(),!0;let n=t.current.x===e.x&&t.current.y===e.y&&t.current.z===e.z;return n||t.current.copy(e),n},e[0]=n):n=e[0],n}var T=r(),E=2048,D=1024;function oe(e,t){let n=e<=1024&&t<=1024?8:16;return[Math.max(4,Math.ceil(e/n)),Math.max(4,Math.ceil(t/n))]}function O(e){let t=(0,S.c)(7),{surfaceTexture:n,attach:r}=e,i;t[0]===n?i=t[1]:(i=m(n),t[0]=n,t[1]=i);let a=i,o=g(),s;t[2]===o?s=t[3]:(s=e=>_(e,{anisotropy:o}),t[2]=o,t[3]=s);let c=p(a,s),l;return t[4]!==r||t[5]!==c?(l=(0,T.jsx)(`meshStandardMaterial`,{attach:r,map:c,transparent:!0,opacity:.8,side:2}),t[4]=r,t[5]=c,t[6]=l):l=t[6],l}var k=(0,y.memo)(function(e){let t=(0,S.c)(59),{entity:n}=e,r=n.waterData,{debugMode:o}=s(),c;t[0]===r.transform?c=t[1]:(c=re(r.transform),t[0]=r.transform,t[1]=c);let l=c,u;t[2]===r.transform.position?u=t[3]:(u=ne(r.transform.position),t[2]=r.transform.position,t[3]=u);let d=u,f;t[4]===r.scale?f=t[5]:(f=te(r.scale),t[4]=r.scale,t[5]=f);let p=f,[m,h,g]=p,_=a(ce),v=ae(),b=r.waveMagnitude,[C,w,ie]=d,O=C+D,k=ie+D,A;t[6]===O?A=t[7]:(A=Math.round(O/8),t[6]=O,t[7]=A);let j=A,M;t[8]===k?M=t[9]:(M=Math.round(k/8),t[8]=k,t[9]=M);let N=M;j=Math.max(0,Math.min(2040,j)),N=Math.max(0,Math.min(2040,N));let P=j*8,F=N*8,I;t[10]!==P||t[11]!==F||t[12]!==w?(I=[P,w,F],t[10]=P,t[11]=F,t[12]=w,t[13]=I):I=t[13];let L=I,ue=le,R;t[14]!==_.position.x||t[15]!==_.position.z?(R=()=>ue(_.position.x,_.position.z),t[14]=_.position.x,t[15]=_.position.z,t[16]=R):R=t[16];let[z,de]=(0,y.useState)(R),B;t[17]!==_.position||t[18]!==v?(B=()=>{if(!v(_.position))return;let e=ue(_.position.x,_.position.z);de(t=>t.length===e.length&&t.every((t,n)=>t[0]===e[n][0]&&t[1]===e[n][1])?t:e)},t[17]=_.position,t[18]=v,t[19]=B):B=t[19],i(B);let V=r.surfaceName||`liquidTiles/BlueWater`,H=r.envMapName||void 0,U=r.surfaceOpacity,W=r.envMapIntensity,G;if(t[20]!==m||t[21]!==h||t[22]!==g){let[e,n]=oe(m,g);G=new ee(m,g,e,n),G.rotateX(-Math.PI/2),G.translate(m/2,h,g/2),t[20]=m,t[21]=h,t[22]=g,t[23]=G}else G=t[23];let K=G,q,J;t[24]===K?(q=t[25],J=t[26]):(J=()=>()=>{K.dispose()},q=[K],t[24]=K,t[25]=q,t[26]=J),(0,y.useEffect)(J,q);let Y;t[27]!==o||t[28]!==d[0]||t[29]!==d[1]||t[30]!==d[2]||t[31]!==p||t[32]!==m||t[33]!==h||t[34]!==g?(Y=o&&(0,T.jsx)(x,{args:p,position:[d[0]+m/2,d[1]+h/2,d[2]+g/2],children:(0,T.jsx)(`meshBasicMaterial`,{color:`#00fbff`,wireframe:!0})}),t[27]=o,t[28]=d[0],t[29]=d[1],t[30]=d[2],t[31]=p,t[32]=m,t[33]=h,t[34]=g,t[35]=Y):Y=t[35];let X;if(t[36]!==L||t[37]!==z||t[38]!==K){let e;t[40]!==L||t[41]!==K?(e=e=>{let[t,n]=e,r=L[0]+t*E-D,i=L[2]+n*E-D;return(0,T.jsx)(`mesh`,{geometry:K,position:[r,L[1],i],children:(0,T.jsx)(`meshStandardMaterial`,{color:`#00fbff`,transparent:!0,opacity:.4,wireframe:!0,side:2})},`${t},${n}`)},t[40]=L,t[41]=K,t[42]=e):e=t[42],X=z.map(e),t[36]=L,t[37]=z,t[38]=K,t[39]=X}else X=t[39];let Z;t[43]!==L||t[44]!==W||t[45]!==H||t[46]!==U||t[47]!==z||t[48]!==K||t[49]!==V||t[50]!==b?(Z=(0,T.jsx)(se,{reps:z,basePosition:L,surfaceGeometry:K,surfaceTexture:V,envMapTexture:H,opacity:U,waveMagnitude:b,envMapIntensity:W}),t[43]=L,t[44]=W,t[45]=H,t[46]=U,t[47]=z,t[48]=K,t[49]=V,t[50]=b,t[51]=Z):Z=t[51];let Q;t[52]!==X||t[53]!==Z?(Q=(0,T.jsx)(y.Suspense,{fallback:X,children:Z}),t[52]=X,t[53]=Z,t[54]=Q):Q=t[54];let $;return t[55]!==l||t[56]!==Y||t[57]!==Q?($=(0,T.jsxs)(`group`,{quaternion:l,children:[Y,Q]}),t[55]=l,t[56]=Y,t[57]=Q,t[58]=$):$=t[58],$}),se=(0,y.memo)(function({reps:e,basePosition:t,surfaceGeometry:n,surfaceTexture:r,envMapTexture:a,opacity:s,waveMagnitude:c,envMapIntensity:u}){let ee=m(r),te=m(a??`special/lush_env`),ne=g(),[re,f]=p([ee,te],e=>{(Array.isArray(e)?e:[e]).forEach(e=>{_(e,{anisotropy:ne}),e.colorSpace=``,e.wrapS=l,e.wrapT=l})}),{animationEnabled:h}=o(),v=(0,y.useMemo)(()=>ie({opacity:s,waveMagnitude:c,envMapIntensity:u,baseTexture:re,envMapTexture:f}),[s,c,u,re,f]),b=(0,y.useRef)(0),x=(0,y.useRef)(null),S=(0,y.useRef)(new d),C=(0,y.useRef)(null),w=(0,y.useRef)(null);return i((n,r)=>{h?(b.current+=r,v.uniforms.uTime.value=b.current):(b.current=0,v.uniforms.uTime.value=0);let i=x.current;if(!i||i===C.current&&e===w.current)return;C.current=i,w.current=e;let a=S.current;for(let n=0;n<e.length;n++){let[r,o]=e[n],s=t[0]+r*E-D,c=t[2]+o*E-D;a.makeTranslation(s,t[1],c),i.setMatrixAt(n,a)}i.count=e.length,i.instanceMatrix.needsUpdate=!0}),(0,y.useEffect)(()=>()=>{v.dispose()},[v]),(0,T.jsx)(`instancedMesh`,{ref:x,args:[n,v,9],frustumCulled:!1,renderOrder:-1})});function ce(e){return e.camera}function le(e,t){let n=e+D,r=t+D,i=Math.trunc(n/E),a=Math.trunc(r/E);n<0&&i--,r<0&&a--;let o=[];for(let e=a-1;e<=a+1;e++)for(let t=i-1;t<=i+1;t++)o.push([t,e]);return o}export{k as WaterBlock,O as WaterMaterial};