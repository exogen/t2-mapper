(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,42585,e=>{"use strict";var t=e.i(43476),a=e.i(71645),r=e.i(31067),o=e.i(90072);let i=a.forwardRef(({args:e,children:t,...o},i)=>{let n=a.useRef(null);return a.useImperativeHandle(i,()=>n.current),a.useLayoutEffect(()=>void 0),a.createElement("mesh",(0,r.default)({ref:n},o),a.createElement("boxGeometry",{attach:"geometry",args:e}),t)});var n=e.i(47071),l=e.i(49774),s=e.i(73949),u=e.i(12979),c=e.i(62395),f=e.i(75567),v=e.i(48066),d=e.i(47021);let m=`
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
`,p=`
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
    ${d.fogFragmentShader}
  }
`;var g=e.i(79123);function h({surfaceTexture:e,attach:a}){let r=(0,u.textureToUrl)(e),i=(0,n.useTexture)(r,e=>(0,f.setupTexture)(e));return(0,t.jsx)("meshStandardMaterial",{attach:a,map:i,transparent:!0,opacity:.8,side:o.DoubleSide})}let x=(0,a.memo)(function({object:e}){let r,{debugMode:n}=(0,g.useDebug)(),u=(0,a.useMemo)(()=>(0,c.getRotation)(e),[e]),f=(0,a.useMemo)(()=>(0,c.getPosition)(e),[e]),v=(0,a.useMemo)(()=>(0,c.getScale)(e),[e]),[d,m,p]=v,h=(0,s.useThree)(e=>e.camera),x=(r=(0,a.useRef)(null),(0,a.useCallback)(e=>{if(!r.current)return r.current=e.clone(),!0;let t=r.current.x===e.x&&r.current.y===e.y&&r.current.z===e.z;return t||r.current.copy(e),t},[]));f[1];let b=(0,c.getFloat)(e,"waveMagnitude")??1,y=(0,a.useMemo)(()=>{let[e,t,a]=f,r=Math.round((e+1024)/8),o=Math.round((a+1024)/8);return[8*(r=Math.max(0,Math.min(2040,r))),t,8*(o=Math.max(0,Math.min(2040,o)))]},[f]),M=(e,t)=>{let a=e+1024,r=t+1024,o=Math.trunc(a/2048),i=Math.trunc(r/2048);a<0&&o--,r<0&&i--;let n=[];for(let e=i-1;e<=i+1;e++)for(let t=o-1;t<=o+1;t++)n.push([t,e]);return n},[w,E]=(0,a.useState)(()=>M(h.position.x,h.position.z));(0,l.useFrame)(()=>{if(!x(h.position))return;let e=M(h.position.x,h.position.z);E(t=>JSON.stringify(t)===JSON.stringify(e)?t:e)});let P=(0,c.getProperty)(e,"surfaceTexture")??"liquidTiles/BlueWater",V=(0,c.getProperty)(e,"envMapTexture"),_=(0,c.getFloat)(e,"surfaceOpacity")??.75,S=(0,c.getFloat)(e,"envMapIntensity")??1,U=(0,a.useMemo)(()=>{let e,[t,a]=(e=d<=1024&&p<=1024?8:16,[Math.max(4,Math.ceil(d/e)),Math.max(4,Math.ceil(p/e))]),r=new o.PlaneGeometry(d,p,t,a);return r.rotateX(-Math.PI/2),r.translate(d/2,m,p/2),r},[d,m,p]);return(0,a.useEffect)(()=>()=>{U.dispose()},[U]),(0,t.jsxs)("group",{quaternion:u,children:[n&&(0,t.jsx)(i,{args:v,position:[f[0]+d/2,f[1]+m/2,f[2]+p/2],children:(0,t.jsx)("meshBasicMaterial",{color:"#00fbff",wireframe:!0})}),(0,t.jsx)(a.Suspense,{fallback:w.map(([e,a])=>{let r=y[0]+2048*e-1024,i=y[2]+2048*a-1024;return(0,t.jsx)("mesh",{geometry:U,position:[r,y[1],i],children:(0,t.jsx)("meshStandardMaterial",{color:"#00fbff",transparent:!0,opacity:.4,wireframe:!0,side:o.DoubleSide})},`${e},${a}`)}),children:(0,t.jsx)(T,{reps:w,basePosition:y,surfaceGeometry:U,surfaceTexture:P,envMapTexture:V,opacity:_,waveMagnitude:b,envMapIntensity:S})})]})}),T=(0,a.memo)(function({reps:e,basePosition:r,surfaceGeometry:i,surfaceTexture:s,envMapTexture:c,opacity:d,waveMagnitude:h,envMapIntensity:x}){let T=(0,u.textureToUrl)(s),b=(0,u.textureToUrl)(c??"special/lush_env"),[y,M]=(0,n.useTexture)([T,b],e=>{(Array.isArray(e)?e:[e]).forEach(e=>{(0,f.setupTexture)(e),e.colorSpace=o.NoColorSpace,e.wrapS=o.RepeatWrapping,e.wrapT=o.RepeatWrapping})}),{animationEnabled:w}=(0,g.useSettings)(),E=(0,a.useMemo)(()=>{var e;return e={opacity:d,waveMagnitude:h,envMapIntensity:x,baseTexture:y,envMapTexture:M},new o.ShaderMaterial({uniforms:{uTime:{value:0},uOpacity:{value:e?.opacity??.75},uWaveMagnitude:{value:e?.waveMagnitude??1},uEnvMapIntensity:{value:e?.envMapIntensity??1},uBaseTexture:{value:e?.baseTexture??null},uEnvMapTexture:{value:e?.envMapTexture??null},fogColor:{value:new o.Color},fogNear:{value:1},fogFar:{value:2e3},fogVolumeData:v.globalFogUniforms.fogVolumeData,cameraHeight:v.globalFogUniforms.cameraHeight,fogEnabled:v.globalFogUniforms.fogEnabled},vertexShader:m,fragmentShader:p,transparent:!0,side:o.DoubleSide,depthWrite:!0,fog:!0})},[d,h,x,y,M]),P=(0,a.useRef)(0);return(0,l.useFrame)((e,t)=>{w?(P.current+=t,E.uniforms.uTime.value=P.current):(P.current=0,E.uniforms.uTime.value=0)}),(0,a.useEffect)(()=>()=>{E.dispose()},[E]),(0,t.jsx)(t.Fragment,{children:e.map(([e,a])=>{let o=r[0]+2048*e-1024,n=r[2]+2048*a-1024;return(0,t.jsx)("mesh",{geometry:i,material:E,position:[o,r[1],n]},`${e},${a}`)})})});e.s(["WaterBlock",0,x,"WaterMaterial",()=>h],42585)}]);