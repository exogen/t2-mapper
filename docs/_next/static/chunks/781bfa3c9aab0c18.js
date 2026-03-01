(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,47071,971,e=>{"use strict";var t=e.i(71645),a=e.i(90072),r=e.i(73949),n=e.i(91037);e.s(["useLoader",()=>n.G],971);var n=n;let i=e=>e===Object(e)&&!Array.isArray(e)&&"function"!=typeof e;function o(e,o){let l=(0,r.useThree)(e=>e.gl),s=(0,n.G)(a.TextureLoader,i(e)?Object.values(e):e);return(0,t.useLayoutEffect)(()=>{null==o||o(s)},[o]),(0,t.useEffect)(()=>{if("initTexture"in l){let e=[];Array.isArray(s)?e=s:s instanceof a.Texture?e=[s]:i(s)&&(e=Object.values(s)),e.forEach(e=>{e instanceof a.Texture&&l.initTexture(e)})}},[l,s]),(0,t.useMemo)(()=>{if(!i(e))return s;{let t={},a=0;for(let r in e)t[r]=s[a++];return t}},[e,s])}o.preload=e=>n.G.preload(a.TextureLoader,e),o.clear=e=>n.G.clear(a.TextureLoader,e),e.s(["useTexture",()=>o],47071)},31067,e=>{"use strict";function t(){return(t=Object.assign.bind()).apply(null,arguments)}e.s(["default",()=>t])},75567,e=>{"use strict";var t=e.i(90072);function a(e,r={}){let{repeat:n=[1,1],disableMipmaps:i=!1}=r;return e.wrapS=e.wrapT=t.RepeatWrapping,e.colorSpace=t.SRGBColorSpace,e.repeat.set(...n),e.flipY=!1,e.anisotropy=16,i?(e.generateMipmaps=!1,e.minFilter=t.LinearFilter):(e.generateMipmaps=!0,e.minFilter=t.LinearMipmapLinearFilter),e.magFilter=t.LinearFilter,e.needsUpdate=!0,e}function r(e){let a=new t.DataTexture(e,256,256,t.RedFormat,t.UnsignedByteType);return a.colorSpace=t.NoColorSpace,a.wrapS=a.wrapT=t.RepeatWrapping,a.generateMipmaps=!1,a.minFilter=t.LinearFilter,a.magFilter=t.LinearFilter,a.needsUpdate=!0,a}e.s(["setupMask",()=>r,"setupTexture",()=>a])},47021,e=>{"use strict";var t=e.i(8560);let a=`
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
`;function r(){t.ShaderChunk.fog_pars_fragment=`
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
`,t.ShaderChunk.fog_fragment=a,t.ShaderChunk.fog_pars_vertex=`
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
`}function n(e,t){e.uniforms.fogVolumeData=t.fogVolumeData,e.uniforms.cameraHeight=t.cameraHeight,e.uniforms.fogEnabled=t.fogEnabled,e.vertexShader=e.vertexShader.replace("#include <fog_pars_vertex>",`#include <fog_pars_vertex>
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
#endif`),e.fragmentShader=e.fragmentShader.replace("#include <fog_fragment>",a)}e.s(["fogFragmentShader",0,a,"injectCustomFog",()=>n,"installCustomFogShader",()=>r])},48066,e=>{"use strict";let t={fogVolumeData:{value:new Float32Array(12)},cameraHeight:{value:0},fogEnabled:{value:!0}};function a(e,r,n=!0){t.cameraHeight.value=e,t.fogVolumeData.value.set(r),t.fogEnabled.value=n}function r(){t.cameraHeight.value=0,t.fogVolumeData.value.fill(0),t.fogEnabled.value=!0}function n(e){let t=new Float32Array(12);for(let a=0;a<3;a++){let r=4*a,n=e[a];n&&(t[r+0]=n.visibleDistance,t[r+1]=n.minHeight,t[r+2]=n.maxHeight,t[r+3]=n.percentage)}return t}e.s(["globalFogUniforms",0,t,"packFogVolumeData",()=>n,"resetGlobalFogUniforms",()=>r,"updateGlobalFogUniforms",()=>a])},89887,60099,e=>{"use strict";let t,a;var r=e.i(43476),n=e.i(932),i=e.i(71645),o=e.i(49774),l=e.i(73949),s=e.i(90072),c=e.i(31067),u=e.i(88014);let d=new s.Vector3,f=new s.Vector3,m=new s.Vector3,g=new s.Vector2;function p(e,t,a){let r=d.setFromMatrixPosition(e.matrixWorld);r.project(t);let n=a.width/2,i=a.height/2;return[r.x*n+n,-(r.y*i)+i]}let h=e=>1e-10>Math.abs(e)?0:e;function y(e,t,a=""){let r="matrix3d(";for(let a=0;16!==a;a++)r+=h(t[a]*e.elements[a])+(15!==a?",":")");return a+r}let b=(t=[1,-1,1,1,1,-1,1,1,1,-1,1,1,1,-1,1,1],e=>y(e,t)),v=(a=e=>[1/e,1/e,1/e,1,-1/e,-1/e,-1/e,-1,1/e,1/e,1/e,1,1,1,1,1],(e,t)=>y(e,a(t),"translate(-50%,-50%)")),x=i.forwardRef(({children:e,eps:t=.001,style:a,className:r,prepend:n,center:y,fullscreen:x,portal:S,distanceFactor:k,sprite:_=!1,transform:j=!1,occlude:M,onOcclude:E,castShadow:P,receiveShadow:F,material:C,geometry:I,zIndexRange:O=[0x1000037,0],calculatePosition:D=p,as:T="div",wrapperClass:w,pointerEvents:N="auto",...R},B)=>{let{gl:V,camera:L,scene:H,size:W,raycaster:U,events:z,viewport:A}=(0,l.useThree)(),[G]=i.useState(()=>document.createElement(T)),$=i.useRef(null),Y=i.useRef(null),q=i.useRef(0),K=i.useRef([0,0]),J=i.useRef(null),X=i.useRef(null),Z=(null==S?void 0:S.current)||z.connected||V.domElement.parentNode,Q=i.useRef(null),ee=i.useRef(!1),et=i.useMemo(()=>{var e;return M&&"blending"!==M||Array.isArray(M)&&M.length&&(e=M[0])&&"object"==typeof e&&"current"in e},[M]);i.useLayoutEffect(()=>{let e=V.domElement;M&&"blending"===M?(e.style.zIndex=`${Math.floor(O[0]/2)}`,e.style.position="absolute",e.style.pointerEvents="none"):(e.style.zIndex=null,e.style.position=null,e.style.pointerEvents=null)},[M]),i.useLayoutEffect(()=>{if(Y.current){let e=$.current=u.createRoot(G);if(H.updateMatrixWorld(),j)G.style.cssText="position:absolute;top:0;left:0;pointer-events:none;overflow:hidden;";else{let e=D(Y.current,L,W);G.style.cssText=`position:absolute;top:0;left:0;transform:translate3d(${e[0]}px,${e[1]}px,0);transform-origin:0 0;`}return Z&&(n?Z.prepend(G):Z.appendChild(G)),()=>{Z&&Z.removeChild(G),e.unmount()}}},[Z,j]),i.useLayoutEffect(()=>{w&&(G.className=w)},[w]);let ea=i.useMemo(()=>j?{position:"absolute",top:0,left:0,width:W.width,height:W.height,transformStyle:"preserve-3d",pointerEvents:"none"}:{position:"absolute",transform:y?"translate3d(-50%,-50%,0)":"none",...x&&{top:-W.height/2,left:-W.width/2,width:W.width,height:W.height},...a},[a,y,x,W,j]),er=i.useMemo(()=>({position:"absolute",pointerEvents:N}),[N]);i.useLayoutEffect(()=>{var t,n;ee.current=!1,j?null==(t=$.current)||t.render(i.createElement("div",{ref:J,style:ea},i.createElement("div",{ref:X,style:er},i.createElement("div",{ref:B,className:r,style:a,children:e})))):null==(n=$.current)||n.render(i.createElement("div",{ref:B,style:ea,className:r,children:e}))});let en=i.useRef(!0);(0,o.useFrame)(e=>{if(Y.current){L.updateMatrixWorld(),Y.current.updateWorldMatrix(!0,!1);let e=j?K.current:D(Y.current,L,W);if(j||Math.abs(q.current-L.zoom)>t||Math.abs(K.current[0]-e[0])>t||Math.abs(K.current[1]-e[1])>t){var a;let t,r,n,i,o=(a=Y.current,t=d.setFromMatrixPosition(a.matrixWorld),r=f.setFromMatrixPosition(L.matrixWorld),n=t.sub(r),i=L.getWorldDirection(m),n.angleTo(i)>Math.PI/2),l=!1;et&&(Array.isArray(M)?l=M.map(e=>e.current):"blending"!==M&&(l=[H]));let c=en.current;l?en.current=function(e,t,a,r){let n=d.setFromMatrixPosition(e.matrixWorld),i=n.clone();i.project(t),g.set(i.x,i.y),a.setFromCamera(g,t);let o=a.intersectObjects(r,!0);if(o.length){let e=o[0].distance;return n.distanceTo(a.ray.origin)<e}return!0}(Y.current,L,U,l)&&!o:en.current=!o,c!==en.current&&(E?E(!en.current):G.style.display=en.current?"block":"none");let u=Math.floor(O[0]/2),p=M?et?[O[0],u]:[u-1,0]:O;if(G.style.zIndex=`${function(e,t,a){if(t instanceof s.PerspectiveCamera||t instanceof s.OrthographicCamera){let r=d.setFromMatrixPosition(e.matrixWorld),n=f.setFromMatrixPosition(t.matrixWorld),i=r.distanceTo(n),o=(a[1]-a[0])/(t.far-t.near),l=a[1]-o*t.far;return Math.round(o*i+l)}}(Y.current,L,p)}`,j){let[e,t]=[W.width/2,W.height/2],a=L.projectionMatrix.elements[5]*t,{isOrthographicCamera:r,top:n,left:i,bottom:o,right:l}=L,s=b(L.matrixWorldInverse),c=r?`scale(${a})translate(${h(-(l+i)/2)}px,${h((n+o)/2)}px)`:`translateZ(${a}px)`,u=Y.current.matrixWorld;_&&((u=L.matrixWorldInverse.clone().transpose().copyPosition(u).scale(Y.current.scale)).elements[3]=u.elements[7]=u.elements[11]=0,u.elements[15]=1),G.style.width=W.width+"px",G.style.height=W.height+"px",G.style.perspective=r?"":`${a}px`,J.current&&X.current&&(J.current.style.transform=`${c}${s}translate(${e}px,${t}px)`,X.current.style.transform=v(u,1/((k||10)/400)))}else{let t=void 0===k?1:function(e,t){if(t instanceof s.OrthographicCamera)return t.zoom;if(!(t instanceof s.PerspectiveCamera))return 1;{let a=d.setFromMatrixPosition(e.matrixWorld),r=f.setFromMatrixPosition(t.matrixWorld);return 1/(2*Math.tan(t.fov*Math.PI/180/2)*a.distanceTo(r))}}(Y.current,L)*k;G.style.transform=`translate3d(${e[0]}px,${e[1]}px,0) scale(${t})`}K.current=e,q.current=L.zoom}}if(!et&&Q.current&&!ee.current)if(j){if(J.current){let e=J.current.children[0];if(null!=e&&e.clientWidth&&null!=e&&e.clientHeight){let{isOrthographicCamera:t}=L;if(t||I)R.scale&&(Array.isArray(R.scale)?R.scale instanceof s.Vector3?Q.current.scale.copy(R.scale.clone().divideScalar(1)):Q.current.scale.set(1/R.scale[0],1/R.scale[1],1/R.scale[2]):Q.current.scale.setScalar(1/R.scale));else{let t=(k||10)/400,a=e.clientWidth*t,r=e.clientHeight*t;Q.current.scale.set(a,r,1)}ee.current=!0}}}else{let t=G.children[0];if(null!=t&&t.clientWidth&&null!=t&&t.clientHeight){let e=1/A.factor,a=t.clientWidth*e,r=t.clientHeight*e;Q.current.scale.set(a,r,1),ee.current=!0}Q.current.lookAt(e.camera.position)}});let ei=i.useMemo(()=>({vertexShader:j?void 0:`
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
      `}),[j]);return i.createElement("group",(0,c.default)({},R,{ref:Y}),M&&!et&&i.createElement("mesh",{castShadow:P,receiveShadow:F,ref:Q},I||i.createElement("planeGeometry",null),C||i.createElement("shaderMaterial",{side:s.DoubleSide,vertexShader:ei.vertexShader,fragmentShader:ei.fragmentShader})))});e.s(["Html",()=>x],60099);let S=[0,0,0],k=(0,i.memo)(function(e){let t,a,c,u,d,f=(0,n.c)(19),{children:m,color:g,position:p,opacity:h}=e,y=void 0===g?"white":g,b=void 0===p?S:p,v=void 0===h?"fadeWithDistance":h,k="fadeWithDistance"===v,_=(0,i.useRef)(null),j=function(e){let t,a,r=(0,n.c)(3),{camera:c}=(0,l.useThree)(),u=(0,i.useRef)(null),d=(a=(0,i.useRef)(null),(0,o.useFrame)(()=>{e.current&&(a.current??=new s.Vector3,e.current.getWorldPosition(a.current))}),a);return r[0]!==c||r[1]!==d?(t=()=>{d.current?u.current=c.position.distanceTo(d.current):u.current=null},r[0]=c,r[1]=d,r[2]=t):t=r[2],(0,o.useFrame)(t),u}(_),[M,E]=(0,i.useState)(0!==v),P=(0,i.useRef)(null);return f[0]!==j||f[1]!==k?(t=()=>{if(k&&P.current&&null!=j.current){let e=Math.max(0,Math.min(1,1-j.current/200));P.current.style.opacity=e.toString()}},f[0]=j,f[1]=k,f[2]=t):t=f[2],f[3]!==j||f[4]!==k||f[5]!==M?(a=[M,k,j],f[3]=j,f[4]=k,f[5]=M,f[6]=a):a=f[6],(0,i.useEffect)(t,a),f[7]!==j||f[8]!==k||f[9]!==M||f[10]!==v?(c=()=>{if(k){let e=j.current,t=null!=e&&e<200;if(M!==t&&E(t),P.current&&t){let t=Math.max(0,Math.min(1,1-e/200));P.current.style.opacity=t.toString()}}else E(0!==v),P.current&&(P.current.style.opacity=v.toString())},f[7]=j,f[8]=k,f[9]=M,f[10]=v,f[11]=c):c=f[11],(0,o.useFrame)(c),f[12]!==m||f[13]!==y||f[14]!==M||f[15]!==b?(u=M?(0,r.jsx)(x,{position:b,center:!0,children:(0,r.jsx)("div",{ref:P,className:"StaticShapeLabel",style:{color:y},children:m})}):null,f[12]=m,f[13]=y,f[14]=M,f[15]=b,f[16]=u):u=f[16],f[17]!==u?(d=(0,r.jsx)("group",{ref:_,children:u}),f[17]=u,f[18]=d):d=f[18],d});e.s(["FloatingLabel",0,k],89887)},51434,e=>{"use strict";var t=e.i(43476),a=e.i(932),r=e.i(71645),n=e.i(73949),i=e.i(90072);let o=(0,r.createContext)(void 0);function l(e){let l,c,u,d,f=(0,a.c)(7),{children:m}=e,{camera:g}=(0,n.useThree)();f[0]===Symbol.for("react.memo_cache_sentinel")?(l={audioLoader:null,audioListener:null},f[0]=l):l=f[0];let[p,h]=(0,r.useState)(l);return f[1]!==g?(c=()=>{let e=new i.AudioLoader,t=g.children.find(s);t||(t=new i.AudioListener,g.add(t)),h({audioLoader:e,audioListener:t})},u=[g],f[1]=g,f[2]=c,f[3]=u):(c=f[2],u=f[3]),(0,r.useEffect)(c,u),f[4]!==p||f[5]!==m?(d=(0,t.jsx)(o.Provider,{value:p,children:m}),f[4]=p,f[5]=m,f[6]=d):d=f[6],d}function s(e){return e instanceof i.AudioListener}function c(){let e=(0,r.useContext)(o);if(void 0===e)throw Error("useAudio must be used within AudioProvider");return e}e.s(["AudioProvider",()=>l,"useAudio",()=>c])},6112,79473,58647,30064,13876,e=>{"use strict";var t=e.i(932),a=e.i(8155);let r=e=>(t,a,r)=>{let n=r.subscribe;return r.subscribe=(e,t,a)=>{let i=e;if(t){let n=(null==a?void 0:a.equalityFn)||Object.is,o=e(r.getState());i=a=>{let r=e(a);if(!n(o,r)){let e=o;t(o=r,e)}},(null==a?void 0:a.fireImmediately)&&t(o,o)}return n(i)},e(t,a,r)};e.s(["subscribeWithSelector",()=>r],79473);var n=e.i(66748);function i(e){return e.toLowerCase()}function o(e){let t=i(e.trim());return t.startsWith("$")?t.slice(1):t}let l={runtime:{runtime:null,objectVersionById:{},globalVersionByName:{},objectIdsByName:{},datablockIdsByName:{},lastRuntimeTick:0},world:{entitiesById:{},players:[],ghosts:[],projectiles:[],flags:[],teams:{},scores:{}},playback:{recording:null,status:"stopped",timeMs:0,rate:1,frameCursor:0,durationMs:0,streamSnapshot:null},diagnostics:{eventCounts:{"object.created":0,"object.deleted":0,"field.changed":0,"method.called":0,"global.changed":0,"batch.flushed":0},recentEvents:[],maxRecentEvents:200,webglContextLost:!1,playbackEvents:[],maxPlaybackEvents:400,rendererSamples:[],maxRendererSamples:2400}},s=(0,a.createStore)()(r(e=>({...l,setRuntime(t){let a=function(e){let t={},a={},r={},n={};for(let a of e.state.objectsById.values())t[a._id]=0,a._name&&(r[i(a._name)]=a._id,a._isDatablock&&(n[i(a._name)]=a._id));for(let t of e.state.globals.keys())a[o(t)]=0;return{objectVersionById:t,globalVersionByName:a,objectIdsByName:r,datablockIdsByName:n}}(t);e(e=>({...e,runtime:{runtime:t,objectVersionById:a.objectVersionById,globalVersionByName:a.globalVersionByName,objectIdsByName:a.objectIdsByName,datablockIdsByName:a.datablockIdsByName,lastRuntimeTick:0}}))},clearRuntime(){e(e=>({...e,runtime:{runtime:null,objectVersionById:{},globalVersionByName:{},objectIdsByName:{},datablockIdsByName:{},lastRuntimeTick:0}}))},applyRuntimeBatch(t,a){0!==t.length&&e(e=>{let r={...e.runtime.objectVersionById},n={...e.runtime.globalVersionByName},l={...e.runtime.objectIdsByName},s={...e.runtime.datablockIdsByName},c={...e.diagnostics.eventCounts},u=[...e.diagnostics.recentEvents],d=e=>{null!=e&&(r[e]=(r[e]??0)+1)};for(let e of t){if(c[e.type]=(c[e.type]??0)+1,u.push(e),"object.created"===e.type){let t=e.object;if(d(e.objectId),t._name){let a=i(t._name);l[a]=e.objectId,t._isDatablock&&(s[a]=e.objectId)}d(t._parent?._id);continue}if("object.deleted"===e.type){let t=e.object;if(delete r[e.objectId],t?._name){let e=i(t._name);delete l[e],t._isDatablock&&delete s[e]}d(t?._parent?._id);continue}if("field.changed"===e.type){d(e.objectId);continue}if("global.changed"===e.type){let t=o(e.name);n[t]=(n[t]??0)+1;continue}}let f=a?.tick??(e.runtime.lastRuntimeTick>0?e.runtime.lastRuntimeTick+1:1);c["batch.flushed"]+=1,u.push({type:"batch.flushed",tick:f,events:t});let m=e.diagnostics.maxRecentEvents,g=u.length>m?u.slice(u.length-m):u;return{...e,runtime:{...e.runtime,objectVersionById:r,globalVersionByName:n,objectIdsByName:l,datablockIdsByName:s,lastRuntimeTick:f},diagnostics:{...e.diagnostics,eventCounts:c,recentEvents:g}}})},setDemoRecording(t){let a=Math.max(0,(t?.duration??0)*1e3),r=function(e=0){let t=Error().stack;if(!t)return null;let a=t.split("\n").map(e=>e.trim()).filter(Boolean).slice(1+e,9+e);return a.length>0?a.join(" <= "):null}(1);e(e=>{let n=e.playback.streamSnapshot,i=e.playback.recording,o={t:Date.now(),kind:"recording.set",message:"setDemoRecording invoked",playbackStatus:e.playback.status,playbackTimeMs:e.playback.timeMs,frameCursor:e.playback.frameCursor,streamEntityCount:n?.entities.length??0,streamCameraMode:n?.camera?.mode??null,streamExhausted:n?.exhausted??!1,meta:{previousMissionName:i?.missionName??null,nextMissionName:t?.missionName??null,previousDurationSec:i?Number(i.duration.toFixed(3)):null,nextDurationSec:t?Number(t.duration.toFixed(3)):null,isNull:null==t,isMetadataOnly:!!t?.isMetadataOnly,isPartial:!!t?.isPartial,hasStreamingPlayback:!!t?.streamingPlayback,stack:r??"unavailable"}};return{...e,world:function(e){if(!e)return{entitiesById:{},players:[],ghosts:[],projectiles:[],flags:[],teams:{},scores:{}};let t={},a=[],r=[],n=[],i=[];for(let o of e.entities){let e=String(o.id);t[e]=o;let l=o.type.toLowerCase();if("player"===l){a.push(e),e.startsWith("player_")&&r.push(e);continue}if("projectile"===l){n.push(e);continue}(o.dataBlock?.toLowerCase()==="flag"||o.dataBlock?.toLowerCase().includes("flag"))&&i.push(e)}return{entitiesById:t,players:a,ghosts:r,projectiles:n,flags:i,teams:{},scores:{}}}(t),playback:{recording:t,status:"stopped",timeMs:0,rate:1,frameCursor:0,durationMs:a,streamSnapshot:null},diagnostics:{...e.diagnostics,webglContextLost:!1,playbackEvents:[o],rendererSamples:[]}}})},setPlaybackTime(t){e(e=>{var a,r,n;let i=(a=t,r=0,n=e.playback.durationMs,a<0?0:a>n?n:a);return{...e,playback:{...e.playback,timeMs:i,frameCursor:i}}})},setPlaybackStatus(t){e(e=>({...e,playback:{...e.playback,status:t}}))},setPlaybackRate(t){var a,r,n;let i=Number.isFinite(t)?(r=.01,n=16,(a=t)<.01?.01:a>16?16:a):1;e(e=>({...e,playback:{...e.playback,rate:i}}))},setPlaybackFrameCursor(t){let a=Number.isFinite(t)?t:0;e(e=>({...e,playback:{...e.playback,frameCursor:a}}))},setPlaybackStreamSnapshot(t){e(e=>({...e,playback:{...e.playback,streamSnapshot:t}}))},setWebglContextLost(t){e(e=>({...e,diagnostics:{...e.diagnostics,webglContextLost:t}}))},recordPlaybackDiagnosticEvent(t){e(e=>{let a=e.playback.streamSnapshot,r={t:Date.now(),kind:t.kind,message:t.message,playbackStatus:e.playback.status,playbackTimeMs:e.playback.timeMs,frameCursor:e.playback.frameCursor,streamEntityCount:a?.entities.length??0,streamCameraMode:a?.camera?.mode??null,streamExhausted:a?.exhausted??!1,meta:t.meta},n=[...e.diagnostics.playbackEvents,r],i=e.diagnostics.maxPlaybackEvents,o=n.length>i?n.slice(n.length-i):n;return{...e,diagnostics:{...e.diagnostics,playbackEvents:o}}})},appendRendererSample(t){e(e=>{let a=e.playback.streamSnapshot,r={t:t.t??Date.now(),playbackStatus:e.playback.status,playbackTimeMs:e.playback.timeMs,frameCursor:e.playback.frameCursor,streamEntityCount:a?.entities.length??0,streamCameraMode:a?.camera?.mode??null,streamExhausted:a?.exhausted??!1,geometries:t.geometries,textures:t.textures,programs:t.programs,renderCalls:t.renderCalls,renderTriangles:t.renderTriangles,renderPoints:t.renderPoints,renderLines:t.renderLines,sceneObjects:t.sceneObjects,visibleSceneObjects:t.visibleSceneObjects,jsHeapUsed:t.jsHeapUsed,jsHeapTotal:t.jsHeapTotal,jsHeapLimit:t.jsHeapLimit},n=[...e.diagnostics.rendererSamples,r],i=e.diagnostics.maxRendererSamples,o=n.length>i?n.slice(n.length-i):n;return{...e,diagnostics:{...e.diagnostics,rendererSamples:o}}})},clearPlaybackDiagnostics(){e(e=>({...e,diagnostics:{...e.diagnostics,webglContextLost:!1,playbackEvents:[],rendererSamples:[]}}))}})));function c(){return s}function u(e,t){return(0,n.useStoreWithEqualityFn)(s,e,t)}function d(e){let a,r,n,i=(0,t.c)(7),o=u(f);i[0]!==e?(a=t=>null==e?-1:t.runtime.objectVersionById[e]??-1,i[0]=e,i[1]=a):a=i[1];let l=u(a);if(null==e||!o||-1===l)return;i[2]!==e||i[3]!==o.state.objectsById?(r=o.state.objectsById.get(e),i[2]=e,i[3]=o.state.objectsById,i[4]=r):r=i[4];let s=r;return i[5]!==s?(n=s?{...s}:void 0,i[5]=s,i[6]=n):n=i[6],n}function f(e){return e.runtime.runtime}function m(e){let a,r,n,o,l,s=(0,t.c)(11),c=u(g);s[0]!==e?(a=e?i(e):"",s[0]=e,s[1]=a):a=s[1];let d=a;s[2]!==d?(r=e=>d?e.runtime.objectIdsByName[d]:void 0,s[2]=d,s[3]=r):r=s[3];let f=u(r);s[4]!==f?(n=e=>null==f?-1:e.runtime.objectVersionById[f]??-1,s[4]=f,s[5]=n):n=s[5];let m=u(n);if(!c||!d||null==f||-1===m)return;s[6]!==f||s[7]!==c.state.objectsById?(o=c.state.objectsById.get(f),s[6]=f,s[7]=c.state.objectsById,s[8]=o):o=s[8];let p=o;return s[9]!==p?(l=p?{...p}:void 0,s[9]=p,s[10]=l):l=s[10],l}function g(e){return e.runtime.runtime}function p(e){let a,r,n,o,l,s=(0,t.c)(11),c=u(h);s[0]!==e?(a=e?i(e):"",s[0]=e,s[1]=a):a=s[1];let d=a;s[2]!==d?(r=e=>d?e.runtime.datablockIdsByName[d]:void 0,s[2]=d,s[3]=r):r=s[3];let f=u(r);s[4]!==f?(n=e=>null==f?-1:e.runtime.objectVersionById[f]??-1,s[4]=f,s[5]=n):n=s[5];let m=u(n);if(!c||!d||null==f||-1===m)return;s[6]!==f||s[7]!==c.state.objectsById?(o=c.state.objectsById.get(f),s[6]=f,s[7]=c.state.objectsById,s[8]=o):o=s[8];let g=o;return s[9]!==g?(l=g?{...g}:void 0,s[9]=g,s[10]=l):l=s[10],l}function h(e){return e.runtime.runtime}function y(e,a){let r,n,i,o,l=(0,t.c)(13);l[0]!==a?(r=void 0===a?[]:a,l[0]=a,l[1]=r):r=l[1];let s=r,c=u(S);l[2]!==e?(n=t=>null==e?-1:t.runtime.objectVersionById[e]??-1,l[2]=e,l[3]=n):n=l[3];let d=u(n);if(null==e){let e;return l[4]!==s?(e=s.map(x),l[4]=s,l[5]=e):e=l[5],e}if(!c||-1===d){let e;return l[6]!==s?(e=s.map(v),l[6]=s,l[7]=e):e=l[7],e}let f=c.state.objectsById;if(l[8]!==e||l[9]!==c.state.objectsById){o=Symbol.for("react.early_return_sentinel");e:{let t=f.get(e);if(!t?._children){let e;l[12]===Symbol.for("react.memo_cache_sentinel")?(e=[],l[12]=e):e=l[12],o=e;break e}i=t._children.map(b)}l[8]=e,l[9]=c.state.objectsById,l[10]=i,l[11]=o}else i=l[10],o=l[11];return o!==Symbol.for("react.early_return_sentinel")?o:i}function b(e){return e._id}function v(e){return e._id}function x(e){return e._id}function S(e){return e.runtime.runtime}e.s(["engineStore",0,s,"useDatablockByName",()=>p,"useEngineSelector",()=>u,"useEngineStoreApi",()=>c,"useRuntimeChildIds",()=>y,"useRuntimeObjectById",()=>d,"useRuntimeObjectByName",()=>m],58647);let k={maxRuntimeEvents:80,maxPlaybackEvents:200,maxRendererSamples:1200,maxStreamEntities:40};function _(e){return e&&"object"==typeof e?{kind:"TorqueObject",id:"number"==typeof e._id?e._id:null,className:"string"==typeof e._className?e._className:null,class:"string"==typeof e._class?e._class:null,name:"string"==typeof e._name?e._name:null,isDatablock:!!e._isDatablock,parentId:e._parent&&"number"==typeof e._parent._id?e._parent._id:null,childCount:Array.isArray(e._children)?e._children.length:0}:null}function j(e,t={}){let a,r,n,i={...k,...t},o=(a=new WeakSet,function e(t,r=0){if(null==t)return t;let n=typeof t;if("string"===n||"number"===n||"boolean"===n)return t;if("bigint"===n)return t.toString();if("function"===n)return`[Function ${t.name||"anonymous"}]`;if("object"!==n)return String(t);if("_id"in t&&"_className"in t)return _(t);if(t instanceof Date)return t.toISOString();if(Array.isArray(t)){if(r>=2)return{kind:"Array",length:t.length};let a=t.slice(0,8).map(t=>e(t,r+1));return{kind:"Array",length:t.length,sample:a}}if(a.has(t))return"[Circular]";if(a.add(t),r>=2)return{kind:t?.constructor?.name??"Object"};let i=Object.keys(t).slice(0,12),o={};for(let a of i)try{o[a]=e(t[a],r+1)}catch(e){o[a]=`[Unserializable: ${e.message}]`}return Object.keys(t).length>i.length&&(o.__truncatedKeys=Object.keys(t).length-i.length),o}),l=e.diagnostics.recentEvents.slice(-i.maxRuntimeEvents).map(e=>(function(e,t){if("object.created"===e.type||"object.deleted"===e.type)return{type:e.type,objectId:e.objectId,object:_(e.object)};if("field.changed"===e.type)return{type:e.type,objectId:e.objectId,field:e.field,value:t(e.value),previousValue:t(e.previousValue),object:_(e.object)};if("method.called"===e.type)return{type:e.type,className:e.className,methodName:e.methodName,objectId:e.objectId??null,args:t(e.args)};if("global.changed"===e.type)return{type:e.type,name:e.name,value:t(e.value),previousValue:t(e.previousValue)};if("batch.flushed"===e.type){let t={};for(let a of e.events)t[a.type]=(t[a.type]??0)+1;return{type:e.type,tick:e.tick,eventCount:e.events.length,byType:t}}return{type:"unknown"}})(e,o)),s=e.diagnostics.playbackEvents.slice(-i.maxPlaybackEvents).map(e=>({...e,meta:e.meta?o(e.meta):void 0})),c=e.diagnostics.rendererSamples.slice(-i.maxRendererSamples);return{generatedAt:new Date().toISOString(),playback:{status:e.playback.status,timeMs:e.playback.timeMs,frameCursor:e.playback.frameCursor,rate:e.playback.rate,durationMs:e.playback.durationMs,recording:(r=e.playback.recording)?{duration:r.duration,missionName:r.missionName,gameType:r.gameType,isMetadataOnly:!!r.isMetadataOnly,isPartial:!!r.isPartial,hasStreamingPlayback:!!r.streamingPlayback,entitiesCount:r.entities.length,cameraModesCount:r.cameraModes.length,controlPlayerGhostId:r.controlPlayerGhostId??null}:null,streamSnapshot:function(e,t){let a=e.playback.streamSnapshot;if(!a)return null;let r={},n={};for(let e of a.entities){let t=e.type||"Unknown";r[t]=(r[t]??0)+1,e.visual?.kind&&(n[e.visual.kind]=(n[e.visual.kind]??0)+1)}let i=a.entities.slice(0,t).map(e=>({id:e.id,type:e.type,dataBlock:e.dataBlock??null,className:e.className??null,ghostIndex:e.ghostIndex??null,dataBlockId:e.dataBlockId??null,shapeHint:e.shapeHint??null,visualKind:e.visual?.kind??null,hasPosition:!!e.position,hasRotation:!!e.rotation}));return{timeSec:a.timeSec,exhausted:a.exhausted,cameraMode:a.camera?.mode??null,controlEntityId:a.camera?.controlEntityId??null,orbitTargetId:a.camera?.orbitTargetId??null,controlPlayerGhostId:a.controlPlayerGhostId??null,entityCount:a.entities.length,entitiesByType:r,visualsByKind:n,entitySample:i,status:a.status}}(e,i.maxStreamEntities)},runtime:(n=e.runtime.runtime)?{lastRuntimeTick:e.runtime.lastRuntimeTick,objectCount:n.state.objectsById.size,datablockCount:n.state.datablocks.size,globalCount:n.state.globals.size,activePackageCount:n.state.activePackages.length,executedScriptCount:n.state.executedScripts.size,failedScriptCount:n.state.failedScripts.size}:null,diagnostics:{webglContextLost:e.diagnostics.webglContextLost,eventCounts:e.diagnostics.eventCounts,playbackEventCount:e.diagnostics.playbackEvents.length,rendererSampleCount:e.diagnostics.rendererSamples.length,runtimeEventCount:e.diagnostics.recentEvents.length,playbackEventsByKind:function(e){let t={};for(let a of e)t[a.kind]=(t[a.kind]??0)+1;return t}(e.diagnostics.playbackEvents),rendererTrend:function(e){if(e.length<2)return null;let t=e[0],a=e[e.length-1];return{sampleCount:e.length,durationSec:Number(((a.t-t.t)/1e3).toFixed(3)),geometriesDelta:a.geometries-t.geometries,texturesDelta:a.textures-t.textures,programsDelta:a.programs-t.programs,sceneObjectsDelta:a.sceneObjects-t.sceneObjects,visibleSceneObjectsDelta:a.visibleSceneObjects-t.visibleSceneObjects,renderCallsDelta:a.renderCalls-t.renderCalls}}(c),playbackEvents:s,rendererSamples:c,runtimeEvents:l}}}function M(e,t={}){return JSON.stringify(j(e,t),null,2)}function E(e){return p(e)}e.s(["buildSerializableDiagnosticsJson",()=>M,"buildSerializableDiagnosticsSnapshot",()=>j],30064),e.s([],13876),e.s(["useDatablock",()=>E],6112)},61921,e=>{e.v(t=>Promise.all(["static/chunks/cb4089eec9313f48.js"].map(t=>e.l(t))).then(()=>t(29055)))},25147,e=>{e.v(t=>Promise.all(["static/chunks/b9c295cb642f6712.js"].map(t=>e.l(t))).then(()=>t(63724)))},18599,e=>{e.v(t=>Promise.all(["static/chunks/6e74e9455d83b68c.js"].map(t=>e.l(t))).then(()=>t(42585)))},84968,e=>{e.v(t=>Promise.all(["static/chunks/70bf3e06d5674fac.js"].map(t=>e.l(t))).then(()=>t(90208)))},59197,e=>{e.v(t=>Promise.all(["static/chunks/0be79f7f5e0597a7.css","static/chunks/1cf33c843f96e1c9.js"].map(t=>e.l(t))).then(()=>t(94247)))}]);