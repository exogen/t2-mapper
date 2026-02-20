(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,47071,971,e=>{"use strict";var t=e.i(71645),r=e.i(90072),i=e.i(73949),o=e.i(91037);e.s(["useLoader",()=>o.G],971);var o=o;let a=e=>e===Object(e)&&!Array.isArray(e)&&"function"!=typeof e;function n(e,n){let l=(0,i.useThree)(e=>e.gl),s=(0,o.G)(r.TextureLoader,a(e)?Object.values(e):e);return(0,t.useLayoutEffect)(()=>{null==n||n(s)},[n]),(0,t.useEffect)(()=>{if("initTexture"in l){let e=[];Array.isArray(s)?e=s:s instanceof r.Texture?e=[s]:a(s)&&(e=Object.values(s)),e.forEach(e=>{e instanceof r.Texture&&l.initTexture(e)})}},[l,s]),(0,t.useMemo)(()=>{if(!a(e))return s;{let t={},r=0;for(let i in e)t[i]=s[r++];return t}},[e,s])}n.preload=e=>o.G.preload(r.TextureLoader,e),n.clear=e=>o.G.clear(r.TextureLoader,e),e.s(["useTexture",()=>n],47071)},6112,51475,77482,e=>{"use strict";var t=e.i(932),r=e.i(43476),i=e.i(71645),o=e.i(49774);let a=(0,i.createContext)(null);function n({children:e}){let t=(0,i.useRef)(void 0),n=(0,i.useRef)(0),l=(0,i.useRef)(0);(0,o.useFrame)((e,r)=>{for(n.current+=r;n.current>=.03125;)if(n.current-=.03125,l.current++,t.current)for(let e of t.current)e(l.current)});let s=(0,i.useCallback)(e=>(t.current??=new Set,t.current.add(e),()=>{t.current.delete(e)}),[]),c=(0,i.useCallback)(()=>l.current,[]),u=(0,i.useMemo)(()=>({subscribe:s,getTick:c}),[s,c]);return(0,r.jsx)(a.Provider,{value:u,children:e})}function l(e){let t=(0,i.useContext)(a);if(!t)throw Error("useTick must be used within a TickProvider");let r=(0,i.useRef)(e);r.current=e,(0,i.useEffect)(()=>t.subscribe(e=>r.current(e)),[t])}e.s(["TickProvider",()=>n,"useTick",()=>l],51475);let s=(0,i.createContext)(null);function c(e){let i,o,a=(0,t.c)(5),{runtime:l,children:c}=e;return a[0]!==c?(i=(0,r.jsx)(n,{children:c}),a[0]=c,a[1]=i):i=a[1],a[2]!==l||a[3]!==i?(o=(0,r.jsx)(s.Provider,{value:l,children:i}),a[2]=l,a[3]=i,a[4]=o):o=a[4],o}function u(){let e=(0,i.useContext)(s);if(!e)throw Error("useRuntime must be used within a RuntimeProvider");return e}function f(e){let r,i=(0,t.c)(3),o=u();if(e)return i[0]!==e||i[1]!==o.state.datablocks?(r=o.state.datablocks.get(e),i[0]=e,i[1]=o.state.datablocks,i[2]=r):r=i[2],r}e.s(["RuntimeProvider",()=>c,"useRuntime",()=>u],77482),e.s(["useDatablock",()=>f],6112)},31067,e=>{"use strict";function t(){return(t=Object.assign.bind()).apply(null,arguments)}e.s(["default",()=>t])},75567,e=>{"use strict";var t=e.i(90072);function r(e,i={}){let{repeat:o=[1,1],disableMipmaps:a=!1}=i;return e.wrapS=e.wrapT=t.RepeatWrapping,e.colorSpace=t.SRGBColorSpace,e.repeat.set(...o),e.flipY=!1,e.anisotropy=16,a?(e.generateMipmaps=!1,e.minFilter=t.LinearFilter):(e.generateMipmaps=!0,e.minFilter=t.LinearMipmapLinearFilter),e.magFilter=t.LinearFilter,e.needsUpdate=!0,e}function i(e){let r=new t.DataTexture(e,256,256,t.RedFormat,t.UnsignedByteType);return r.colorSpace=t.NoColorSpace,r.wrapS=r.wrapT=t.RepeatWrapping,r.generateMipmaps=!1,r.minFilter=t.LinearFilter,r.magFilter=t.LinearFilter,r.needsUpdate=!0,r}e.s(["setupMask",()=>i,"setupTexture",()=>r])},47021,e=>{"use strict";var t=e.i(8560);let r=`
#ifdef USE_FOG
  // Check fog enabled uniform - allows toggling without shader recompilation
  #ifdef USE_VOLUMETRIC_FOG
  if (!fogEnabled) {
    // Skip all fog calculations when disabled
  } else {
  #endif

  float dist = vFogDepth;

  // Discard fragments at or beyond visible distance - matches Torque's behavior
  // where objects beyond visibleDistance are not rendered at all.
  // This prevents fully-fogged geometry from showing as silhouettes against
  // the sky's fog-to-sky gradient.
  if (dist >= fogFar) {
    discard;
  }

  // Step 1: Calculate distance-based haze (quadratic falloff)
  // Since we discard at fogFar, haze never reaches 1.0 here
  float haze = 0.0;
  if (dist > fogNear) {
    float fogScale = 1.0 / (fogFar - fogNear);
    float distFactor = (dist - fogNear) * fogScale - 1.0;
    haze = 1.0 - distFactor * distFactor;
  }

  // Step 2: Calculate fog volume contributions
  // Note: Per-volume colors are NOT used in Tribes 2 ($specialFog defaults to false)
  // All fog uses the global fogColor - see Tribes2_Fog_System.md for details
  float volumeFog = 0.0;

  #ifdef USE_VOLUMETRIC_FOG
  {
    #ifdef USE_FOG_WORLD_POSITION
      float fragmentHeight = vFogWorldPosition.y;
    #else
      float fragmentHeight = cameraHeight;
    #endif

    float deltaY = fragmentHeight - cameraHeight;
    float absDeltaY = abs(deltaY);

    // Determine if we're going up (positive) or down (negative)
    if (absDeltaY > 0.01) {
      // Non-horizontal ray: ray-march through fog volumes
      for (int i = 0; i < 3; i++) {
        int offset = i * 4;
        float volVisDist = fogVolumeData[offset + 0];
        float volMinH = fogVolumeData[offset + 1];
        float volMaxH = fogVolumeData[offset + 2];
        float volPct = fogVolumeData[offset + 3];

        // Skip inactive volumes (visibleDistance = 0)
        if (volVisDist <= 0.0) continue;

        // Calculate fog factor for this volume
        // From Torque: factor = (1 / (volumeVisDist * visFactor)) * percentage
        // where visFactor is smVisibleDistanceMod (a user quality pref, default 1.0)
        // Since we don't have quality settings, we use visFactor = 1.0
        float factor = (1.0 / volVisDist) * volPct;

        // Find ray intersection with this volume's height range
        float rayMinY = min(cameraHeight, fragmentHeight);
        float rayMaxY = max(cameraHeight, fragmentHeight);

        // Check if ray intersects volume height range
        if (rayMinY < volMaxH && rayMaxY > volMinH) {
          float intersectMin = max(rayMinY, volMinH);
          float intersectMax = min(rayMaxY, volMaxH);
          float intersectHeight = intersectMax - intersectMin;

          // Calculate distance traveled through this volume using similar triangles:
          // subDist / dist = intersectHeight / absDeltaY
          float subDist = dist * (intersectHeight / absDeltaY);

          // Accumulate fog: fog += subDist * factor
          volumeFog += subDist * factor;
        }
      }
    } else {
      // Near-horizontal ray: if camera is inside a volume, apply full fog for that volume
      for (int i = 0; i < 3; i++) {
        int offset = i * 4;
        float volVisDist = fogVolumeData[offset + 0];
        float volMinH = fogVolumeData[offset + 1];
        float volMaxH = fogVolumeData[offset + 2];
        float volPct = fogVolumeData[offset + 3];

        if (volVisDist <= 0.0) continue;

        // If camera is inside this volume, apply fog for full distance
        if (cameraHeight >= volMinH && cameraHeight <= volMaxH) {
          float factor = (1.0 / volVisDist) * volPct;
          volumeFog += dist * factor;
        }
      }
    }
  }
  #endif

  // Step 3: Combine haze and volume fog
  // Torque's clamping: if (bandPct + hazePct > 1) hazePct = 1 - bandPct
  // This gives fog volumes priority over haze
  float volPct = min(volumeFog, 1.0);
  float hazePct = haze;
  if (volPct + hazePct > 1.0) {
    hazePct = 1.0 - volPct;
  }
  float fogFactor = hazePct + volPct;

  // Apply fog using global fogColor (per-volume colors not used in Tribes 2)
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);

  #ifdef USE_VOLUMETRIC_FOG
  } // end fogEnabled check
  #endif
#endif
`;function i(){t.ShaderChunk.fog_pars_fragment=`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif

  // Custom volumetric fog uniforms (only defined when USE_VOLUMETRIC_FOG is set)
  // Format: [visDist, minH, maxH, percentage] x 3 volumes = 12 floats
  #ifdef USE_VOLUMETRIC_FOG
    uniform float fogVolumeData[12];
    uniform float cameraHeight;
  #endif

  #ifdef USE_FOG_WORLD_POSITION
    varying vec3 vFogWorldPosition;
  #endif
#endif
`,t.ShaderChunk.fog_fragment=r,t.ShaderChunk.fog_pars_vertex=`
#ifdef USE_FOG
  varying float vFogDepth;
  #ifdef USE_FOG_WORLD_POSITION
    varying vec3 vFogWorldPosition;
  #endif
#endif
`,t.ShaderChunk.fog_vertex=`
#ifdef USE_FOG
  // Use Euclidean distance from camera, not view-space z-depth
  // This ensures fog doesn't change when rotating the camera
  vFogDepth = length(mvPosition.xyz);
  #ifdef USE_FOG_WORLD_POSITION
    vFogWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
#endif
`}function o(e,t){e.uniforms.fogVolumeData=t.fogVolumeData,e.uniforms.cameraHeight=t.cameraHeight,e.uniforms.fogEnabled=t.fogEnabled,e.vertexShader=e.vertexShader.replace("#include <fog_pars_vertex>",`#include <fog_pars_vertex>
#ifdef USE_FOG
  #define USE_FOG_WORLD_POSITION
  #define USE_VOLUMETRIC_FOG
  varying vec3 vFogWorldPosition;
#endif`),e.vertexShader=e.vertexShader.replace("#include <fog_vertex>",`#include <fog_vertex>
#ifdef USE_FOG
  vFogWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`),e.fragmentShader=e.fragmentShader.replace("#include <fog_pars_fragment>",`#include <fog_pars_fragment>
#ifdef USE_FOG
  #define USE_VOLUMETRIC_FOG
  uniform float fogVolumeData[12];
  uniform float cameraHeight;
  uniform bool fogEnabled;
  #define USE_FOG_WORLD_POSITION
  varying vec3 vFogWorldPosition;
#endif`),e.fragmentShader=e.fragmentShader.replace("#include <fog_fragment>",r)}e.s(["fogFragmentShader",0,r,"injectCustomFog",()=>o,"installCustomFogShader",()=>i])},48066,e=>{"use strict";let t={fogVolumeData:{value:new Float32Array(12)},cameraHeight:{value:0},fogEnabled:{value:!0}};function r(e,i,o=!0){t.cameraHeight.value=e,t.fogVolumeData.value.set(i),t.fogEnabled.value=o}function i(){t.cameraHeight.value=0,t.fogVolumeData.value.fill(0),t.fogEnabled.value=!0}function o(e){let t=new Float32Array(12);for(let r=0;r<3;r++){let i=4*r,o=e[r];o&&(t[i+0]=o.visibleDistance,t[i+1]=o.minHeight,t[i+2]=o.maxHeight,t[i+3]=o.percentage)}return t}e.s(["globalFogUniforms",0,t,"packFogVolumeData",()=>o,"resetGlobalFogUniforms",()=>i,"updateGlobalFogUniforms",()=>r])},89887,60099,e=>{"use strict";let t,r;var i=e.i(43476),o=e.i(932),a=e.i(71645),n=e.i(49774),l=e.i(73949),s=e.i(90072),c=e.i(31067),u=e.i(88014);let f=new s.Vector3,d=new s.Vector3,m=new s.Vector3,g=new s.Vector2;function h(e,t,r){let i=f.setFromMatrixPosition(e.matrixWorld);i.project(t);let o=r.width/2,a=r.height/2;return[i.x*o+o,-(i.y*a)+a]}let v=e=>1e-10>Math.abs(e)?0:e;function p(e,t,r=""){let i="matrix3d(";for(let r=0;16!==r;r++)i+=v(t[r]*e.elements[r])+(15!==r?",":")");return r+i}let x=(t=[1,-1,1,1,1,-1,1,1,1,-1,1,1,1,-1,1,1],e=>p(e,t)),y=(r=e=>[1/e,1/e,1/e,1,-1/e,-1/e,-1/e,-1,1/e,1/e,1/e,1,1,1,1,1],(e,t)=>p(e,r(t),"translate(-50%,-50%)")),b=a.forwardRef(({children:e,eps:t=.001,style:r,className:i,prepend:o,center:p,fullscreen:b,portal:F,distanceFactor:S,sprite:M=!1,transform:P=!1,occlude:E,onOcclude:_,castShadow:T,receiveShadow:w,material:O,geometry:D,zIndexRange:C=[0x1000037,0],calculatePosition:R=h,as:H="div",wrapperClass:V,pointerEvents:W="auto",...L},U)=>{let{gl:k,camera:z,scene:G,size:I,raycaster:j,events:A,viewport:N}=(0,l.useThree)(),[$]=a.useState(()=>document.createElement(H)),Y=a.useRef(null),q=a.useRef(null),B=a.useRef(0),K=a.useRef([0,0]),X=a.useRef(null),Z=a.useRef(null),J=(null==F?void 0:F.current)||A.connected||k.domElement.parentNode,Q=a.useRef(null),ee=a.useRef(!1),et=a.useMemo(()=>{var e;return E&&"blending"!==E||Array.isArray(E)&&E.length&&(e=E[0])&&"object"==typeof e&&"current"in e},[E]);a.useLayoutEffect(()=>{let e=k.domElement;E&&"blending"===E?(e.style.zIndex=`${Math.floor(C[0]/2)}`,e.style.position="absolute",e.style.pointerEvents="none"):(e.style.zIndex=null,e.style.position=null,e.style.pointerEvents=null)},[E]),a.useLayoutEffect(()=>{if(q.current){let e=Y.current=u.createRoot($);if(G.updateMatrixWorld(),P)$.style.cssText="position:absolute;top:0;left:0;pointer-events:none;overflow:hidden;";else{let e=R(q.current,z,I);$.style.cssText=`position:absolute;top:0;left:0;transform:translate3d(${e[0]}px,${e[1]}px,0);transform-origin:0 0;`}return J&&(o?J.prepend($):J.appendChild($)),()=>{J&&J.removeChild($),e.unmount()}}},[J,P]),a.useLayoutEffect(()=>{V&&($.className=V)},[V]);let er=a.useMemo(()=>P?{position:"absolute",top:0,left:0,width:I.width,height:I.height,transformStyle:"preserve-3d",pointerEvents:"none"}:{position:"absolute",transform:p?"translate3d(-50%,-50%,0)":"none",...b&&{top:-I.height/2,left:-I.width/2,width:I.width,height:I.height},...r},[r,p,b,I,P]),ei=a.useMemo(()=>({position:"absolute",pointerEvents:W}),[W]);a.useLayoutEffect(()=>{var t,o;ee.current=!1,P?null==(t=Y.current)||t.render(a.createElement("div",{ref:X,style:er},a.createElement("div",{ref:Z,style:ei},a.createElement("div",{ref:U,className:i,style:r,children:e})))):null==(o=Y.current)||o.render(a.createElement("div",{ref:U,style:er,className:i,children:e}))});let eo=a.useRef(!0);(0,n.useFrame)(e=>{if(q.current){z.updateMatrixWorld(),q.current.updateWorldMatrix(!0,!1);let e=P?K.current:R(q.current,z,I);if(P||Math.abs(B.current-z.zoom)>t||Math.abs(K.current[0]-e[0])>t||Math.abs(K.current[1]-e[1])>t){var r;let t,i,o,a,n=(r=q.current,t=f.setFromMatrixPosition(r.matrixWorld),i=d.setFromMatrixPosition(z.matrixWorld),o=t.sub(i),a=z.getWorldDirection(m),o.angleTo(a)>Math.PI/2),l=!1;et&&(Array.isArray(E)?l=E.map(e=>e.current):"blending"!==E&&(l=[G]));let c=eo.current;l?eo.current=function(e,t,r,i){let o=f.setFromMatrixPosition(e.matrixWorld),a=o.clone();a.project(t),g.set(a.x,a.y),r.setFromCamera(g,t);let n=r.intersectObjects(i,!0);if(n.length){let e=n[0].distance;return o.distanceTo(r.ray.origin)<e}return!0}(q.current,z,j,l)&&!n:eo.current=!n,c!==eo.current&&(_?_(!eo.current):$.style.display=eo.current?"block":"none");let u=Math.floor(C[0]/2),h=E?et?[C[0],u]:[u-1,0]:C;if($.style.zIndex=`${function(e,t,r){if(t instanceof s.PerspectiveCamera||t instanceof s.OrthographicCamera){let i=f.setFromMatrixPosition(e.matrixWorld),o=d.setFromMatrixPosition(t.matrixWorld),a=i.distanceTo(o),n=(r[1]-r[0])/(t.far-t.near),l=r[1]-n*t.far;return Math.round(n*a+l)}}(q.current,z,h)}`,P){let[e,t]=[I.width/2,I.height/2],r=z.projectionMatrix.elements[5]*t,{isOrthographicCamera:i,top:o,left:a,bottom:n,right:l}=z,s=x(z.matrixWorldInverse),c=i?`scale(${r})translate(${v(-(l+a)/2)}px,${v((o+n)/2)}px)`:`translateZ(${r}px)`,u=q.current.matrixWorld;M&&((u=z.matrixWorldInverse.clone().transpose().copyPosition(u).scale(q.current.scale)).elements[3]=u.elements[7]=u.elements[11]=0,u.elements[15]=1),$.style.width=I.width+"px",$.style.height=I.height+"px",$.style.perspective=i?"":`${r}px`,X.current&&Z.current&&(X.current.style.transform=`${c}${s}translate(${e}px,${t}px)`,Z.current.style.transform=y(u,1/((S||10)/400)))}else{let t=void 0===S?1:function(e,t){if(t instanceof s.OrthographicCamera)return t.zoom;if(!(t instanceof s.PerspectiveCamera))return 1;{let r=f.setFromMatrixPosition(e.matrixWorld),i=d.setFromMatrixPosition(t.matrixWorld);return 1/(2*Math.tan(t.fov*Math.PI/180/2)*r.distanceTo(i))}}(q.current,z)*S;$.style.transform=`translate3d(${e[0]}px,${e[1]}px,0) scale(${t})`}K.current=e,B.current=z.zoom}}if(!et&&Q.current&&!ee.current)if(P){if(X.current){let e=X.current.children[0];if(null!=e&&e.clientWidth&&null!=e&&e.clientHeight){let{isOrthographicCamera:t}=z;if(t||D)L.scale&&(Array.isArray(L.scale)?L.scale instanceof s.Vector3?Q.current.scale.copy(L.scale.clone().divideScalar(1)):Q.current.scale.set(1/L.scale[0],1/L.scale[1],1/L.scale[2]):Q.current.scale.setScalar(1/L.scale));else{let t=(S||10)/400,r=e.clientWidth*t,i=e.clientHeight*t;Q.current.scale.set(r,i,1)}ee.current=!0}}}else{let t=$.children[0];if(null!=t&&t.clientWidth&&null!=t&&t.clientHeight){let e=1/N.factor,r=t.clientWidth*e,i=t.clientHeight*e;Q.current.scale.set(r,i,1),ee.current=!0}Q.current.lookAt(e.camera.position)}});let ea=a.useMemo(()=>({vertexShader:P?void 0:`
          /*
            This shader is from the THREE's SpriteMaterial.
            We need to turn the backing plane into a Sprite
            (make it always face the camera) if "transfrom"
            is false.
          */
          #include <common>

          void main() {
            vec2 center = vec2(0., 1.);
            float rotation = 0.0;

            // This is somewhat arbitrary, but it seems to work well
            // Need to figure out how to derive this dynamically if it even matters
            float size = 0.03;

            vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
            vec2 scale;
            scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) );
            scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) );

            bool isPerspective = isPerspectiveMatrix( projectionMatrix );
            if ( isPerspective ) scale *= - mvPosition.z;

            vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale * size;
            vec2 rotatedPosition;
            rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
            rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
            mvPosition.xy += rotatedPosition;

            gl_Position = projectionMatrix * mvPosition;
          }
      `,fragmentShader:`
        void main() {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        }
      `}),[P]);return a.createElement("group",(0,c.default)({},L,{ref:q}),E&&!et&&a.createElement("mesh",{castShadow:T,receiveShadow:w,ref:Q},D||a.createElement("planeGeometry",null),O||a.createElement("shaderMaterial",{side:s.DoubleSide,vertexShader:ea.vertexShader,fragmentShader:ea.fragmentShader})))});e.s(["Html",()=>b],60099);let F=[0,0,0],S=(0,a.memo)(function(e){let t,r,c,u,f,d=(0,o.c)(19),{children:m,color:g,position:h,opacity:v}=e,p=void 0===g?"white":g,x=void 0===h?F:h,y=void 0===v?"fadeWithDistance":v,S="fadeWithDistance"===y,M=(0,a.useRef)(null),P=function(e){let t,r,i=(0,o.c)(3),{camera:c}=(0,l.useThree)(),u=(0,a.useRef)(null),f=(r=(0,a.useRef)(null),(0,n.useFrame)(()=>{e.current&&(r.current??=new s.Vector3,e.current.getWorldPosition(r.current))}),r);return i[0]!==c||i[1]!==f?(t=()=>{f.current?u.current=c.position.distanceTo(f.current):u.current=null},i[0]=c,i[1]=f,i[2]=t):t=i[2],(0,n.useFrame)(t),u}(M),[E,_]=(0,a.useState)(0!==y),T=(0,a.useRef)(null);return d[0]!==P||d[1]!==S?(t=()=>{if(S&&T.current&&null!=P.current){let e=Math.max(0,Math.min(1,1-P.current/200));T.current.style.opacity=e.toString()}},d[0]=P,d[1]=S,d[2]=t):t=d[2],d[3]!==P||d[4]!==S||d[5]!==E?(r=[E,S,P],d[3]=P,d[4]=S,d[5]=E,d[6]=r):r=d[6],(0,a.useEffect)(t,r),d[7]!==P||d[8]!==S||d[9]!==E||d[10]!==y?(c=()=>{if(S){let e=P.current,t=null!=e&&e<200;if(E!==t&&_(t),T.current&&t){let t=Math.max(0,Math.min(1,1-e/200));T.current.style.opacity=t.toString()}}else _(0!==y),T.current&&(T.current.style.opacity=y.toString())},d[7]=P,d[8]=S,d[9]=E,d[10]=y,d[11]=c):c=d[11],(0,n.useFrame)(c),d[12]!==m||d[13]!==p||d[14]!==E||d[15]!==x?(u=E?(0,i.jsx)(b,{position:x,center:!0,children:(0,i.jsx)("div",{ref:T,className:"StaticShapeLabel",style:{color:p},children:m})}):null,d[12]=m,d[13]=p,d[14]=E,d[15]=x,d[16]=u):u=d[16],d[17]!==u?(f=(0,i.jsx)("group",{ref:M,children:u}),d[17]=u,d[18]=f):f=d[18],f});e.s(["FloatingLabel",0,S],89887)},51434,e=>{"use strict";var t=e.i(43476),r=e.i(932),i=e.i(71645),o=e.i(73949),a=e.i(90072);let n=(0,i.createContext)(void 0);function l(e){let l,c,u,f,d=(0,r.c)(7),{children:m}=e,{camera:g}=(0,o.useThree)();d[0]===Symbol.for("react.memo_cache_sentinel")?(l={audioLoader:null,audioListener:null},d[0]=l):l=d[0];let[h,v]=(0,i.useState)(l);return d[1]!==g?(c=()=>{let e=new a.AudioLoader,t=g.children.find(s);t||(t=new a.AudioListener,g.add(t)),v({audioLoader:e,audioListener:t})},u=[g],d[1]=g,d[2]=c,d[3]=u):(c=d[2],u=d[3]),(0,i.useEffect)(c,u),d[4]!==h||d[5]!==m?(f=(0,t.jsx)(n.Provider,{value:h,children:m}),d[4]=h,d[5]=m,d[6]=f):f=d[6],f}function s(e){return e instanceof a.AudioListener}function c(){let e=(0,i.useContext)(n);if(void 0===e)throw Error("useAudio must be used within AudioProvider");return e}e.s(["AudioProvider",()=>l,"useAudio",()=>c])},61921,e=>{e.v(t=>Promise.all(["static/chunks/cb4089eec9313f48.js"].map(t=>e.l(t))).then(()=>t(29055)))},25147,e=>{e.v(t=>Promise.all(["static/chunks/4e5626f3eeee0985.js"].map(t=>e.l(t))).then(()=>t(63724)))},18599,e=>{e.v(t=>Promise.all(["static/chunks/6e74e9455d83b68c.js"].map(t=>e.l(t))).then(()=>t(42585)))},84968,e=>{e.v(t=>Promise.all(["static/chunks/70bf3e06d5674fac.js"].map(t=>e.l(t))).then(()=>t(90208)))},59197,e=>{e.v(t=>Promise.all(["static/chunks/0be79f7f5e0597a7.css","static/chunks/1cf33c843f96e1c9.js"].map(t=>e.l(t))).then(()=>t(94247)))}]);