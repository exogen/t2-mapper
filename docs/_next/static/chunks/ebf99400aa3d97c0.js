(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,42585,e=>{"use strict";var t=e.i(43476),a=e.i(932),o=e.i(71645),r=e.i(31067),i=e.i(90072);let n=o.forwardRef(({args:e,children:t,...a},i)=>{let n=o.useRef(null);return o.useImperativeHandle(i,()=>n.current),o.useLayoutEffect(()=>void 0),o.createElement("mesh",(0,r.default)({ref:n},a),o.createElement("boxGeometry",{attach:"geometry",args:e}),t)});var s=e.i(47071),l=e.i(71753),u=e.i(15080),c=e.i(12979);e.i(70847);var f=e.i(63318),v=e.i(75567),d=e.i(48066),m=e.i(47021);let p=`
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
    // Get world position for wave calculation
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;

    // Apply wave displacement to Y (vertical axis in Three.js)
    vec3 displaced = position;
    displaced.y += getWaveHeight(worldPos.xyz);

    // Calculate final world position after displacement for fog
    #ifdef USE_FOG
      vec4 displacedWorldPos = modelMatrix * vec4(displaced, 1.0);
      vFogWorldPosition = displacedWorldPos.xyz;
    #endif

    // Calculate view vector for environment mapping
    vViewVector = cameraPosition - worldPos.xyz;
    vDistance = length(vViewVector);

    vec4 mvPosition = viewMatrix * modelMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Set fog depth (distance from camera) - normally done by fog_vertex include
    // but we can't use that include because it references 'transformed' which we don't have
    #ifdef USE_FOG
      vFogDepth = length(mvPosition.xyz);
    #endif
  }
`,g=`
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
    ${m.fogFragmentShader}
  }
`;var h=e.i(79123);function x(e){let o,r,n=(0,a.c)(5),{surfaceTexture:l,attach:u}=e;n[0]!==l?(o=(0,c.textureToUrl)(l),n[0]=l,n[1]=o):o=n[1];let f=o,v=(0,s.useTexture)(f,T);return n[2]!==u||n[3]!==v?(r=(0,t.jsx)("meshStandardMaterial",{attach:u,map:v,transparent:!0,opacity:.8,side:i.DoubleSide}),n[2]=u,n[3]=v,n[4]=r):r=n[4],r}function T(e){return(0,v.setupTexture)(e)}let b=(0,o.memo)(function(e){let r,s,c,v,d,m,p,g,x,T,b,E,_,S,V,P,U,C,D,F=(0,a.c)(59),{entity:A}=e,O=A.waterData,{debugMode:W}=(0,h.useDebug)();F[0]!==O.transform?(r=(0,f.matrixFToQuaternion)(O.transform),F[0]=O.transform,F[1]=r):r=F[1];let I=r;F[2]!==O.transform.position?(s=(0,f.torqueToThree)(O.transform.position),F[2]=O.transform.position,F[3]=s):s=F[3];let R=s;F[4]!==O.scale?(c=(0,f.torqueScaleToThree)(O.scale),F[4]=O.scale,F[5]=c):c=F[5];let z=c,[B,j,G]=z,N=(0,u.useThree)(w),L=(C=(0,a.c)(1),D=(0,o.useRef)(null),C[0]===Symbol.for("react.memo_cache_sentinel")?(U=e=>{if(!D.current)return D.current=e.clone(),!0;let t=D.current.x===e.x&&D.current.y===e.y&&D.current.z===e.z;return t||D.current.copy(e),t},C[0]=U):U=C[0],U),Q=O.waveMagnitude,[Y,X,q]=R,H=Y+1024,$=q+1024;F[6]!==H?(v=Math.round(H/8),F[6]=H,F[7]=v):v=F[7];let Z=v;F[8]!==$?(d=Math.round($/8),F[8]=$,F[9]=d):d=F[9];let k=d,J=8*(Z=Math.max(0,Math.min(2040,Z))),K=8*(k=Math.max(0,Math.min(2040,k)));F[10]!==J||F[11]!==K||F[12]!==X?(m=[J,X,K],F[10]=J,F[11]=K,F[12]=X,F[13]=m):m=F[13];let ee=m,et=M;F[14]!==N.position.x||F[15]!==N.position.z?(p=()=>et(N.position.x,N.position.z),F[14]=N.position.x,F[15]=N.position.z,F[16]=p):p=F[16];let[ea,eo]=(0,o.useState)(p);F[17]!==N.position||F[18]!==L?(g=()=>{if(!L(N.position))return;let e=et(N.position.x,N.position.z);eo(t=>JSON.stringify(t)===JSON.stringify(e)?t:e)},F[17]=N.position,F[18]=L,F[19]=g):g=F[19],(0,l.useFrame)(g);let er=O.surfaceName||"liquidTiles/BlueWater",ei=O.envMapName||void 0,en=O.surfaceOpacity,es=O.envMapIntensity;if(F[20]!==B||F[21]!==j||F[22]!==G){let e,[t,a]=(e=B<=1024&&G<=1024?8:16,[Math.max(4,Math.ceil(B/e)),Math.max(4,Math.ceil(G/e))]);(x=new i.PlaneGeometry(B,G,t,a)).rotateX(-Math.PI/2),x.translate(B/2,j,G/2),F[20]=B,F[21]=j,F[22]=G,F[23]=x}else x=F[23];let el=x;if(F[24]!==el?(b=()=>()=>{el.dispose()},T=[el],F[24]=el,F[25]=T,F[26]=b):(T=F[25],b=F[26]),(0,o.useEffect)(b,T),F[27]!==W||F[28]!==R[0]||F[29]!==R[1]||F[30]!==R[2]||F[31]!==z||F[32]!==B||F[33]!==j||F[34]!==G?(E=W&&(0,t.jsx)(n,{args:z,position:[R[0]+B/2,R[1]+j/2,R[2]+G/2],children:(0,t.jsx)("meshBasicMaterial",{color:"#00fbff",wireframe:!0})}),F[27]=W,F[28]=R[0],F[29]=R[1],F[30]=R[2],F[31]=z,F[32]=B,F[33]=j,F[34]=G,F[35]=E):E=F[35],F[36]!==ee||F[37]!==ea||F[38]!==el){let e;F[40]!==ee||F[41]!==el?(e=e=>{let[a,o]=e,r=ee[0]+2048*a-1024,n=ee[2]+2048*o-1024;return(0,t.jsx)("mesh",{geometry:el,position:[r,ee[1],n],children:(0,t.jsx)("meshStandardMaterial",{color:"#00fbff",transparent:!0,opacity:.4,wireframe:!0,side:i.DoubleSide})},`${a},${o}`)},F[40]=ee,F[41]=el,F[42]=e):e=F[42],_=ea.map(e),F[36]=ee,F[37]=ea,F[38]=el,F[39]=_}else _=F[39];return F[43]!==ee||F[44]!==es||F[45]!==ei||F[46]!==en||F[47]!==ea||F[48]!==el||F[49]!==er||F[50]!==Q?(S=(0,t.jsx)(y,{reps:ea,basePosition:ee,surfaceGeometry:el,surfaceTexture:er,envMapTexture:ei,opacity:en,waveMagnitude:Q,envMapIntensity:es}),F[43]=ee,F[44]=es,F[45]=ei,F[46]=en,F[47]=ea,F[48]=el,F[49]=er,F[50]=Q,F[51]=S):S=F[51],F[52]!==_||F[53]!==S?(V=(0,t.jsx)(o.Suspense,{fallback:_,children:S}),F[52]=_,F[53]=S,F[54]=V):V=F[54],F[55]!==I||F[56]!==E||F[57]!==V?(P=(0,t.jsxs)("group",{quaternion:I,children:[E,V]}),F[55]=I,F[56]=E,F[57]=V,F[58]=P):P=F[58],P}),y=(0,o.memo)(function({reps:e,basePosition:a,surfaceGeometry:r,surfaceTexture:n,envMapTexture:u,opacity:f,waveMagnitude:m,envMapIntensity:x}){let T=(0,c.textureToUrl)(n),b=(0,c.textureToUrl)(u??"special/lush_env"),[y,w]=(0,s.useTexture)([T,b],e=>{(Array.isArray(e)?e:[e]).forEach(e=>{(0,v.setupTexture)(e),e.colorSpace=i.NoColorSpace,e.wrapS=i.RepeatWrapping,e.wrapT=i.RepeatWrapping})}),{animationEnabled:M}=(0,h.useSettings)(),E=(0,o.useMemo)(()=>{var e;return e={opacity:f,waveMagnitude:m,envMapIntensity:x,baseTexture:y,envMapTexture:w},new i.ShaderMaterial({uniforms:{uTime:{value:0},uOpacity:{value:e?.opacity??.75},uWaveMagnitude:{value:e?.waveMagnitude??1},uEnvMapIntensity:{value:e?.envMapIntensity??1},uBaseTexture:{value:e?.baseTexture??null},uEnvMapTexture:{value:e?.envMapTexture??null},fogColor:{value:new i.Color},fogNear:{value:1},fogFar:{value:2e3},fogVolumeData:d.globalFogUniforms.fogVolumeData,cameraHeight:d.globalFogUniforms.cameraHeight,fogEnabled:d.globalFogUniforms.fogEnabled},vertexShader:p,fragmentShader:g,transparent:!0,side:i.DoubleSide,depthWrite:!0,fog:!0})},[f,m,x,y,w]),_=(0,o.useRef)(0);return(0,l.useFrame)((e,t)=>{M?(_.current+=t,E.uniforms.uTime.value=_.current):(_.current=0,E.uniforms.uTime.value=0)}),(0,o.useEffect)(()=>()=>{E.dispose()},[E]),(0,t.jsx)(t.Fragment,{children:e.map(([e,o])=>{let i=a[0]+2048*e-1024,n=a[2]+2048*o-1024;return(0,t.jsx)("mesh",{geometry:r,material:E,position:[i,a[1],n]},`${e},${o}`)})})});function w(e){return e.camera}function M(e,t){let a=e+1024,o=t+1024,r=Math.trunc(a/2048),i=Math.trunc(o/2048);a<0&&r--,o<0&&i--;let n=[];for(let e=i-1;e<=i+1;e++)for(let t=r-1;t<=r+1;t++)n.push([t,e]);return n}e.s(["WaterBlock",0,b,"WaterMaterial",()=>x],42585)}]);