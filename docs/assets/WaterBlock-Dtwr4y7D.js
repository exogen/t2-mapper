import{r as e}from"./rolldown-runtime-hePW80VL.js";import{n as t,r as n,t as r}from"./jsx-runtime-D-_CyhZk.js";import{f as i,g as a}from"./events-156d8d12.esm-u8ZdQWGw.js";import{a as o,i as s}from"./SettingsProvider-D2hLowYN.js";import{$n as c,Er as l,H as u,Ji as d,Ri as f}from"./three.core-D2MYdXnG.js";import{a as p,i as m,l as h}from"./textureUtils-BDyZvo5u.js";import{p as g}from"./loaders-Df6o7-AK.js";import{t as _}from"./extends-CvVTau-c.js";import{t as v}from"./Texture-dMmR1muP.js";import{t as y}from"./useAnisotropy-BSWf219v.js";import{r as ee}from"./cameraTourStore-D45m1hbf.js";import{t as te}from"./DebugBounds-rkBbCQYv.js";import"./scene-B-9Votyg.js";import{n as b,r as x,t as S}from"./coordinates-bjK4fu3T.js";var C=e(n());function w(e,t){let n=e+`Geometry`;return C.forwardRef(({args:e,children:r,...i},a)=>{let o=C.useRef(null);return C.useImperativeHandle(a,()=>o.current),C.useLayoutEffect(()=>void t?.(o.current)),C.createElement(`mesh`,_({ref:o},i),C.createElement(n,{attach:`geometry`,args:e}),r)})}var T=w(`box`),E=t(),D=`
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
`,ne=`
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
    ${h}
  }
`;function O(e){return new d({uniforms:{uTime:{value:0},uOpacity:{value:e?.opacity??.75},uWaveMagnitude:{value:e?.waveMagnitude??1},uEnvMapIntensity:{value:e?.envMapIntensity??1},uBaseTexture:{value:e?.baseTexture??null},uEnvMapTexture:{value:e?.envMapTexture??null},fogColor:{value:new u},fogNear:{value:1},fogFar:{value:2e3},fogVolumeData:p.fogVolumeData,cameraHeight:p.cameraHeight,fogEnabled:p.fogEnabled,fogDistanceScale:p.fogDistanceScale},vertexShader:D,fragmentShader:ne,transparent:!0,side:2,depthWrite:!0,fog:!0})}function re(){let e=(0,E.c)(1),t=(0,C.useRef)(null),n;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=e=>{if(!t.current)return t.current=e.clone(),!0;let n=t.current.x===e.x&&t.current.y===e.y&&t.current.z===e.z;return n||t.current.copy(e),n},e[0]=n):n=e[0],n}var k=r(),A=2048,j=1024;function ie(e,t){let n=e<=1024&&t<=1024?8:16;return[Math.max(4,Math.ceil(e/n)),Math.max(4,Math.ceil(t/n))]}function ae(e){let t=(0,E.c)(7),{surfaceTexture:n,attach:r}=e,i;t[0]===n?i=t[1]:(i=g(n),t[0]=n,t[1]=i);let a=i,o=y(),s;t[2]===o?s=t[3]:(s=e=>m(e,{anisotropy:o}),t[2]=o,t[3]=s);let c=v(a,s),l;return t[4]!==r||t[5]!==c?(l=(0,k.jsx)(`meshStandardMaterial`,{attach:r,map:c,transparent:!0,opacity:.8,side:2}),t[4]=r,t[5]=c,t[6]=l):l=t[6],l}var M=(0,C.memo)(function(e){let t=(0,E.c)(68),{entity:n}=e,r=n.waterData,o=ee(n.id),{debugMode:c}=s(),u;t[0]===r.transform?u=t[1]:(u=S(r.transform),t[0]=r.transform,t[1]=u);let d=u,f;t[2]===r.transform.position?f=t[3]:(f=x(r.transform.position),t[2]=r.transform.position,t[3]=f);let p=f,m;t[4]===r.scale?m=t[5]:(m=b(r.scale),t[4]=r.scale,t[5]=m);let h=m,[g,_,v]=h,y=a(se),w=re(),D=r.waveMagnitude,[ne,O,ae]=p,M=ne+j,N=ae+j,P;t[6]===M?P=t[7]:(P=Math.round(M/8),t[6]=M,t[7]=P);let F=P,I;t[8]===N?I=t[9]:(I=Math.round(N/8),t[8]=N,t[9]=I);let le=I;F=Math.max(0,Math.min(2040,F)),le=Math.max(0,Math.min(2040,le));let ue=F*8,de=le*8,L;t[10]!==ue||t[11]!==de||t[12]!==O?(L=[ue,O,de],t[10]=ue,t[11]=de,t[12]=O,t[13]=L):L=t[13];let R=L,fe=ce,z;t[14]!==y.position.x||t[15]!==y.position.z?(z=()=>fe(y.position.x,y.position.z),t[14]=y.position.x,t[15]=y.position.z,t[16]=z):z=t[16];let[B,pe]=(0,C.useState)(z),V;t[17]!==y.position||t[18]!==w?(V=()=>{if(!w(y.position))return;let e=fe(y.position.x,y.position.z);pe(t=>t.length===e.length&&t.every((t,n)=>t[0]===e[n][0]&&t[1]===e[n][1])?t:e)},t[17]=y.position,t[18]=w,t[19]=V):V=t[19],i(V);let H=r.surfaceName||`liquidTiles/BlueWater`,U=r.envMapName||void 0,me=r.surfaceOpacity,he=r.envMapIntensity,W;if(t[20]!==g||t[21]!==_||t[22]!==v){let[e,n]=ie(g,v);W=new l(g,v,e,n),W.rotateX(-Math.PI/2),W.translate(g/2,_,v/2),t[20]=g,t[21]=_,t[22]=v,t[23]=W}else W=t[23];let G=W,K,q;t[24]===G?(K=t[25],q=t[26]):(q=()=>()=>{G.dispose()},K=[G],t[24]=G,t[25]=K,t[26]=q),(0,C.useEffect)(q,K);let J;t[27]!==c||t[28]!==p[0]||t[29]!==p[1]||t[30]!==p[2]||t[31]!==h||t[32]!==g||t[33]!==_||t[34]!==v?(J=c&&(0,k.jsx)(T,{args:h,position:[p[0]+g/2,p[1]+_/2,p[2]+v/2],children:(0,k.jsx)(`meshBasicMaterial`,{color:`#00fbff`,wireframe:!0})}),t[27]=c,t[28]=p[0],t[29]=p[1],t[30]=p[2],t[31]=h,t[32]=g,t[33]=_,t[34]=v,t[35]=J):J=t[35];let Y;t[36]!==o||t[37]!==p[0]||t[38]!==p[1]||t[39]!==p[2]||t[40]!==g||t[41]!==_||t[42]!==v?(Y=o&&(0,k.jsx)(`group`,{position:[p[0]+g/2,p[1]+_/2,p[2]+v/2],children:(0,k.jsx)(te,{size:[g,_,v]})}),t[36]=o,t[37]=p[0],t[38]=p[1],t[39]=p[2],t[40]=g,t[41]=_,t[42]=v,t[43]=Y):Y=t[43];let X;if(t[44]!==R||t[45]!==B||t[46]!==G){let e;t[48]!==R||t[49]!==G?(e=e=>{let[t,n]=e,r=R[0]+t*A-j,i=R[2]+n*A-j;return(0,k.jsx)(`mesh`,{geometry:G,position:[r,R[1],i],children:(0,k.jsx)(`meshStandardMaterial`,{color:`#00fbff`,transparent:!0,opacity:.4,wireframe:!0,side:2})},`${t},${n}`)},t[48]=R,t[49]=G,t[50]=e):e=t[50],X=B.map(e),t[44]=R,t[45]=B,t[46]=G,t[47]=X}else X=t[47];let Z;t[51]!==R||t[52]!==he||t[53]!==U||t[54]!==me||t[55]!==B||t[56]!==G||t[57]!==H||t[58]!==D?(Z=(0,k.jsx)(oe,{reps:B,basePosition:R,surfaceGeometry:G,surfaceTexture:H,envMapTexture:U,opacity:me,waveMagnitude:D,envMapIntensity:he}),t[51]=R,t[52]=he,t[53]=U,t[54]=me,t[55]=B,t[56]=G,t[57]=H,t[58]=D,t[59]=Z):Z=t[59];let Q;t[60]!==X||t[61]!==Z?(Q=(0,k.jsx)(C.Suspense,{fallback:X,children:Z}),t[60]=X,t[61]=Z,t[62]=Q):Q=t[62];let $;return t[63]!==d||t[64]!==J||t[65]!==Y||t[66]!==Q?($=(0,k.jsxs)(`group`,{quaternion:d,children:[J,Y,Q]}),t[63]=d,t[64]=J,t[65]=Y,t[66]=Q,t[67]=$):$=t[67],$}),oe=(0,C.memo)(function({reps:e,basePosition:t,surfaceGeometry:n,surfaceTexture:r,envMapTexture:a,opacity:s,waveMagnitude:l,envMapIntensity:u}){let d=g(r),p=g(a??`special/lush_env`),h=y(),[_,ee]=v([d,p],e=>{(Array.isArray(e)?e:[e]).forEach(e=>{m(e,{anisotropy:h}),e.colorSpace=``,e.wrapS=f,e.wrapT=f})}),{animationEnabled:te}=o(),b=(0,C.useMemo)(()=>O({opacity:s,waveMagnitude:l,envMapIntensity:u,baseTexture:_,envMapTexture:ee}),[s,l,u,_,ee]),x=(0,C.useRef)(0),S=(0,C.useRef)(null),w=(0,C.useRef)(new c),T=(0,C.useRef)(null),E=(0,C.useRef)(null);return i((n,r)=>{te?(x.current+=r,b.uniforms.uTime.value=x.current):(x.current=0,b.uniforms.uTime.value=0);let i=S.current;if(!i||i===T.current&&e===E.current)return;T.current=i,E.current=e;let a=w.current;for(let n=0;n<e.length;n++){let[r,o]=e[n],s=t[0]+r*A-j,c=t[2]+o*A-j;a.makeTranslation(s,t[1],c),i.setMatrixAt(n,a)}i.count=e.length,i.instanceMatrix.needsUpdate=!0}),(0,C.useEffect)(()=>()=>{b.dispose()},[b]),(0,k.jsx)(`instancedMesh`,{ref:S,args:[n,b,9],frustumCulled:!1,renderOrder:-1})});function se(e){return e.camera}function ce(e,t){let n=e+j,r=t+j,i=Math.trunc(n/A),a=Math.trunc(r/A);n<0&&i--,r<0&&a--;let o=[];for(let e=a-1;e<=a+1;e++)for(let t=i-1;t<=i+1;t++)o.push([t,e]);return o}export{M as WaterBlock,ae as WaterMaterial};