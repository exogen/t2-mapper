(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,42585,e=>{"use strict";var t=e.i(43476),a=e.i(932),o=e.i(71645),i=e.i(31067),r=e.i(90072);let n=o.forwardRef(({args:e,children:t,...a},r)=>{let n=o.useRef(null);return o.useImperativeHandle(r,()=>n.current),o.useLayoutEffect(()=>void 0),o.createElement("mesh",(0,i.default)({ref:n},a),o.createElement("boxGeometry",{attach:"geometry",args:e}),t)});var l=e.i(47071),s=e.i(71753),u=e.i(15080),c=e.i(12979),f=e.i(62395),v=e.i(75567),d=e.i(48066),m=e.i(47021);let p=`
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
`;var h=e.i(79123);function x(e){let o,i,n=(0,a.c)(5),{surfaceTexture:s,attach:u}=e;n[0]!==s?(o=(0,c.textureToUrl)(s),n[0]=s,n[1]=o):o=n[1];let f=o,v=(0,l.useTexture)(f,T);return n[2]!==u||n[3]!==v?(i=(0,t.jsx)("meshStandardMaterial",{attach:u,map:v,transparent:!0,opacity:.8,side:r.DoubleSide}),n[2]=u,n[3]=v,n[4]=i):i=n[4],i}function T(e){return(0,v.setupTexture)(e)}let b=(0,o.memo)(function(e){let i,l,c,v,d,m,p,g,x,T,b,E,_,P,S,V,U,F,C,D,A,O,W,I,R=(0,a.c)(69),{object:z}=e,{debugMode:B}=(0,h.useDebug)();R[0]!==z?(i=(0,f.getRotation)(z),R[0]=z,R[1]=i):i=R[1];let j=i;R[2]!==z?(l=(0,f.getPosition)(z),R[2]=z,R[3]=l):l=R[3];let G=l;R[4]!==z?(c=(0,f.getScale)(z),R[4]=z,R[5]=c):c=R[5];let L=c,[N,Q,Y]=L,X=(0,u.useThree)(w),H=(W=(0,a.c)(1),I=(0,o.useRef)(null),W[0]===Symbol.for("react.memo_cache_sentinel")?(O=e=>{if(!I.current)return I.current=e.clone(),!0;let t=I.current.x===e.x&&I.current.y===e.y&&I.current.z===e.z;return t||I.current.copy(e),t},W[0]=O):O=W[0],O);R[6]!==z?(v=(0,f.getFloat)(z,"waveMagnitude")??1,R[6]=z,R[7]=v):v=R[7];let $=v,[q,Z,k]=G,J=q+1024,K=k+1024;R[8]!==J?(d=Math.round(J/8),R[8]=J,R[9]=d):d=R[9];let ee=d;R[10]!==K?(m=Math.round(K/8),R[10]=K,R[11]=m):m=R[11];let et=m,ea=8*(ee=Math.max(0,Math.min(2040,ee))),eo=8*(et=Math.max(0,Math.min(2040,et)));R[12]!==ea||R[13]!==eo||R[14]!==Z?(p=[ea,Z,eo],R[12]=ea,R[13]=eo,R[14]=Z,R[15]=p):p=R[15];let ei=p,er=M;R[16]!==X.position.x||R[17]!==X.position.z?(g=()=>er(X.position.x,X.position.z),R[16]=X.position.x,R[17]=X.position.z,R[18]=g):g=R[18];let[en,el]=(0,o.useState)(g);R[19]!==X.position||R[20]!==H?(x=()=>{if(!H(X.position))return;let e=er(X.position.x,X.position.z);el(t=>JSON.stringify(t)===JSON.stringify(e)?t:e)},R[19]=X.position,R[20]=H,R[21]=x):x=R[21],(0,s.useFrame)(x),R[22]!==z?(T=(0,f.getProperty)(z,"surfaceTexture")??"liquidTiles/BlueWater",R[22]=z,R[23]=T):T=R[23];let es=T;R[24]!==z?(b=(0,f.getProperty)(z,"envMapTexture"),R[24]=z,R[25]=b):b=R[25];let eu=b;R[26]!==z?(E=(0,f.getFloat)(z,"surfaceOpacity")??.75,R[26]=z,R[27]=E):E=R[27];let ec=E;R[28]!==z?(_=(0,f.getFloat)(z,"envMapIntensity")??1,R[28]=z,R[29]=_):_=R[29];let ef=_;if(R[30]!==N||R[31]!==Q||R[32]!==Y){let e,[t,a]=(e=N<=1024&&Y<=1024?8:16,[Math.max(4,Math.ceil(N/e)),Math.max(4,Math.ceil(Y/e))]);(P=new r.PlaneGeometry(N,Y,t,a)).rotateX(-Math.PI/2),P.translate(N/2,Q,Y/2),R[30]=N,R[31]=Q,R[32]=Y,R[33]=P}else P=R[33];let ev=P;if(R[34]!==ev?(S=()=>()=>{ev.dispose()},V=[ev],R[34]=ev,R[35]=S,R[36]=V):(S=R[35],V=R[36]),(0,o.useEffect)(S,V),R[37]!==B||R[38]!==G[0]||R[39]!==G[1]||R[40]!==G[2]||R[41]!==L||R[42]!==N||R[43]!==Q||R[44]!==Y?(U=B&&(0,t.jsx)(n,{args:L,position:[G[0]+N/2,G[1]+Q/2,G[2]+Y/2],children:(0,t.jsx)("meshBasicMaterial",{color:"#00fbff",wireframe:!0})}),R[37]=B,R[38]=G[0],R[39]=G[1],R[40]=G[2],R[41]=L,R[42]=N,R[43]=Q,R[44]=Y,R[45]=U):U=R[45],R[46]!==ei||R[47]!==en||R[48]!==ev){let e;R[50]!==ei||R[51]!==ev?(e=e=>{let[a,o]=e,i=ei[0]+2048*a-1024,n=ei[2]+2048*o-1024;return(0,t.jsx)("mesh",{geometry:ev,position:[i,ei[1],n],children:(0,t.jsx)("meshStandardMaterial",{color:"#00fbff",transparent:!0,opacity:.4,wireframe:!0,side:r.DoubleSide})},`${a},${o}`)},R[50]=ei,R[51]=ev,R[52]=e):e=R[52],F=en.map(e),R[46]=ei,R[47]=en,R[48]=ev,R[49]=F}else F=R[49];return R[53]!==ei||R[54]!==ef||R[55]!==eu||R[56]!==ec||R[57]!==en||R[58]!==ev||R[59]!==es||R[60]!==$?(C=(0,t.jsx)(y,{reps:en,basePosition:ei,surfaceGeometry:ev,surfaceTexture:es,envMapTexture:eu,opacity:ec,waveMagnitude:$,envMapIntensity:ef}),R[53]=ei,R[54]=ef,R[55]=eu,R[56]=ec,R[57]=en,R[58]=ev,R[59]=es,R[60]=$,R[61]=C):C=R[61],R[62]!==F||R[63]!==C?(D=(0,t.jsx)(o.Suspense,{fallback:F,children:C}),R[62]=F,R[63]=C,R[64]=D):D=R[64],R[65]!==j||R[66]!==U||R[67]!==D?(A=(0,t.jsxs)("group",{quaternion:j,children:[U,D]}),R[65]=j,R[66]=U,R[67]=D,R[68]=A):A=R[68],A}),y=(0,o.memo)(function({reps:e,basePosition:a,surfaceGeometry:i,surfaceTexture:n,envMapTexture:u,opacity:f,waveMagnitude:m,envMapIntensity:x}){let T=(0,c.textureToUrl)(n),b=(0,c.textureToUrl)(u??"special/lush_env"),[y,w]=(0,l.useTexture)([T,b],e=>{(Array.isArray(e)?e:[e]).forEach(e=>{(0,v.setupTexture)(e),e.colorSpace=r.NoColorSpace,e.wrapS=r.RepeatWrapping,e.wrapT=r.RepeatWrapping})}),{animationEnabled:M}=(0,h.useSettings)(),E=(0,o.useMemo)(()=>{var e;return e={opacity:f,waveMagnitude:m,envMapIntensity:x,baseTexture:y,envMapTexture:w},new r.ShaderMaterial({uniforms:{uTime:{value:0},uOpacity:{value:e?.opacity??.75},uWaveMagnitude:{value:e?.waveMagnitude??1},uEnvMapIntensity:{value:e?.envMapIntensity??1},uBaseTexture:{value:e?.baseTexture??null},uEnvMapTexture:{value:e?.envMapTexture??null},fogColor:{value:new r.Color},fogNear:{value:1},fogFar:{value:2e3},fogVolumeData:d.globalFogUniforms.fogVolumeData,cameraHeight:d.globalFogUniforms.cameraHeight,fogEnabled:d.globalFogUniforms.fogEnabled},vertexShader:p,fragmentShader:g,transparent:!0,side:r.DoubleSide,depthWrite:!0,fog:!0})},[f,m,x,y,w]),_=(0,o.useRef)(0);return(0,s.useFrame)((e,t)=>{M?(_.current+=t,E.uniforms.uTime.value=_.current):(_.current=0,E.uniforms.uTime.value=0)}),(0,o.useEffect)(()=>()=>{E.dispose()},[E]),(0,t.jsx)(t.Fragment,{children:e.map(([e,o])=>{let r=a[0]+2048*e-1024,n=a[2]+2048*o-1024;return(0,t.jsx)("mesh",{geometry:i,material:E,position:[r,a[1],n]},`${e},${o}`)})})});function w(e){return e.camera}function M(e,t){let a=e+1024,o=t+1024,i=Math.trunc(a/2048),r=Math.trunc(o/2048);a<0&&i--,o<0&&r--;let n=[];for(let e=r-1;e<=r+1;e++)for(let t=i-1;t<=i+1;t++)n.push([t,e]);return n}e.s(["WaterBlock",0,b,"WaterMaterial",()=>x],42585)}]);