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
`;var h=e.i(79123);function x(e){let o,r,n=(0,a.c)(5),{surfaceTexture:l,attach:u}=e;n[0]!==l?(o=(0,c.textureToUrl)(l),n[0]=l,n[1]=o):o=n[1];let f=o,v=(0,s.useTexture)(f,T);return n[2]!==u||n[3]!==v?(r=(0,t.jsx)("meshStandardMaterial",{attach:u,map:v,transparent:!0,opacity:.8,side:i.DoubleSide}),n[2]=u,n[3]=v,n[4]=r):r=n[4],r}function T(e){return(0,v.setupTexture)(e)}let b=(0,o.memo)(function(e){let r,s,c,v,d,m,p,g,x,T,b,E,_,S,V,P,U,C,F,D=(0,a.c)(59),{scene:A}=e,{debugMode:O}=(0,h.useDebug)();D[0]!==A.transform?(r=(0,f.matrixFToQuaternion)(A.transform),D[0]=A.transform,D[1]=r):r=D[1];let W=r;D[2]!==A.transform.position?(s=(0,f.torqueToThree)(A.transform.position),D[2]=A.transform.position,D[3]=s):s=D[3];let I=s;D[4]!==A.scale?(c=(0,f.torqueScaleToThree)(A.scale),D[4]=A.scale,D[5]=c):c=D[5];let R=c,[z,B,j]=R,G=(0,u.useThree)(w),N=(C=(0,a.c)(1),F=(0,o.useRef)(null),C[0]===Symbol.for("react.memo_cache_sentinel")?(U=e=>{if(!F.current)return F.current=e.clone(),!0;let t=F.current.x===e.x&&F.current.y===e.y&&F.current.z===e.z;return t||F.current.copy(e),t},C[0]=U):U=C[0],U),L=A.waveMagnitude,[Q,Y,X]=I,q=Q+1024,H=X+1024;D[6]!==q?(v=Math.round(q/8),D[6]=q,D[7]=v):v=D[7];let $=v;D[8]!==H?(d=Math.round(H/8),D[8]=H,D[9]=d):d=D[9];let Z=d,k=8*($=Math.max(0,Math.min(2040,$))),J=8*(Z=Math.max(0,Math.min(2040,Z)));D[10]!==k||D[11]!==J||D[12]!==Y?(m=[k,Y,J],D[10]=k,D[11]=J,D[12]=Y,D[13]=m):m=D[13];let K=m,ee=M;D[14]!==G.position.x||D[15]!==G.position.z?(p=()=>ee(G.position.x,G.position.z),D[14]=G.position.x,D[15]=G.position.z,D[16]=p):p=D[16];let[et,ea]=(0,o.useState)(p);D[17]!==G.position||D[18]!==N?(g=()=>{if(!N(G.position))return;let e=ee(G.position.x,G.position.z);ea(t=>JSON.stringify(t)===JSON.stringify(e)?t:e)},D[17]=G.position,D[18]=N,D[19]=g):g=D[19],(0,l.useFrame)(g);let eo=A.surfaceName||"liquidTiles/BlueWater",er=A.envMapName||void 0,ei=A.surfaceOpacity,en=A.envMapIntensity;if(D[20]!==z||D[21]!==B||D[22]!==j){let e,[t,a]=(e=z<=1024&&j<=1024?8:16,[Math.max(4,Math.ceil(z/e)),Math.max(4,Math.ceil(j/e))]);(x=new i.PlaneGeometry(z,j,t,a)).rotateX(-Math.PI/2),x.translate(z/2,B,j/2),D[20]=z,D[21]=B,D[22]=j,D[23]=x}else x=D[23];let es=x;if(D[24]!==es?(b=()=>()=>{es.dispose()},T=[es],D[24]=es,D[25]=T,D[26]=b):(T=D[25],b=D[26]),(0,o.useEffect)(b,T),D[27]!==O||D[28]!==I[0]||D[29]!==I[1]||D[30]!==I[2]||D[31]!==R||D[32]!==z||D[33]!==B||D[34]!==j?(E=O&&(0,t.jsx)(n,{args:R,position:[I[0]+z/2,I[1]+B/2,I[2]+j/2],children:(0,t.jsx)("meshBasicMaterial",{color:"#00fbff",wireframe:!0})}),D[27]=O,D[28]=I[0],D[29]=I[1],D[30]=I[2],D[31]=R,D[32]=z,D[33]=B,D[34]=j,D[35]=E):E=D[35],D[36]!==K||D[37]!==et||D[38]!==es){let e;D[40]!==K||D[41]!==es?(e=e=>{let[a,o]=e,r=K[0]+2048*a-1024,n=K[2]+2048*o-1024;return(0,t.jsx)("mesh",{geometry:es,position:[r,K[1],n],children:(0,t.jsx)("meshStandardMaterial",{color:"#00fbff",transparent:!0,opacity:.4,wireframe:!0,side:i.DoubleSide})},`${a},${o}`)},D[40]=K,D[41]=es,D[42]=e):e=D[42],_=et.map(e),D[36]=K,D[37]=et,D[38]=es,D[39]=_}else _=D[39];return D[43]!==K||D[44]!==en||D[45]!==er||D[46]!==ei||D[47]!==et||D[48]!==es||D[49]!==eo||D[50]!==L?(S=(0,t.jsx)(y,{reps:et,basePosition:K,surfaceGeometry:es,surfaceTexture:eo,envMapTexture:er,opacity:ei,waveMagnitude:L,envMapIntensity:en}),D[43]=K,D[44]=en,D[45]=er,D[46]=ei,D[47]=et,D[48]=es,D[49]=eo,D[50]=L,D[51]=S):S=D[51],D[52]!==_||D[53]!==S?(V=(0,t.jsx)(o.Suspense,{fallback:_,children:S}),D[52]=_,D[53]=S,D[54]=V):V=D[54],D[55]!==W||D[56]!==E||D[57]!==V?(P=(0,t.jsxs)("group",{quaternion:W,children:[E,V]}),D[55]=W,D[56]=E,D[57]=V,D[58]=P):P=D[58],P}),y=(0,o.memo)(function({reps:e,basePosition:a,surfaceGeometry:r,surfaceTexture:n,envMapTexture:u,opacity:f,waveMagnitude:m,envMapIntensity:x}){let T=(0,c.textureToUrl)(n),b=(0,c.textureToUrl)(u??"special/lush_env"),[y,w]=(0,s.useTexture)([T,b],e=>{(Array.isArray(e)?e:[e]).forEach(e=>{(0,v.setupTexture)(e),e.colorSpace=i.NoColorSpace,e.wrapS=i.RepeatWrapping,e.wrapT=i.RepeatWrapping})}),{animationEnabled:M}=(0,h.useSettings)(),E=(0,o.useMemo)(()=>{var e;return e={opacity:f,waveMagnitude:m,envMapIntensity:x,baseTexture:y,envMapTexture:w},new i.ShaderMaterial({uniforms:{uTime:{value:0},uOpacity:{value:e?.opacity??.75},uWaveMagnitude:{value:e?.waveMagnitude??1},uEnvMapIntensity:{value:e?.envMapIntensity??1},uBaseTexture:{value:e?.baseTexture??null},uEnvMapTexture:{value:e?.envMapTexture??null},fogColor:{value:new i.Color},fogNear:{value:1},fogFar:{value:2e3},fogVolumeData:d.globalFogUniforms.fogVolumeData,cameraHeight:d.globalFogUniforms.cameraHeight,fogEnabled:d.globalFogUniforms.fogEnabled},vertexShader:p,fragmentShader:g,transparent:!0,side:i.DoubleSide,depthWrite:!0,fog:!0})},[f,m,x,y,w]),_=(0,o.useRef)(0);return(0,l.useFrame)((e,t)=>{M?(_.current+=t,E.uniforms.uTime.value=_.current):(_.current=0,E.uniforms.uTime.value=0)}),(0,o.useEffect)(()=>()=>{E.dispose()},[E]),(0,t.jsx)(t.Fragment,{children:e.map(([e,o])=>{let i=a[0]+2048*e-1024,n=a[2]+2048*o-1024;return(0,t.jsx)("mesh",{geometry:r,material:E,position:[i,a[1],n]},`${e},${o}`)})})});function w(e){return e.camera}function M(e,t){let a=e+1024,o=t+1024,r=Math.trunc(a/2048),i=Math.trunc(o/2048);a<0&&r--,o<0&&i--;let n=[];for(let e=i-1;e<=i+1;e++)for(let t=r-1;t<=r+1;t++)n.push([t,e]);return n}e.s(["WaterBlock",0,b,"WaterMaterial",()=>x],42585)}]);