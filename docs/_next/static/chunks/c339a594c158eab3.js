(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,47071,971,e=>{"use strict";var t=e.i(71645),a=e.i(90072),r=e.i(73949),i=e.i(91037);e.s(["useLoader",()=>i.G],971);var i=i;let n=e=>e===Object(e)&&!Array.isArray(e)&&"function"!=typeof e;function o(e,o){let l=(0,r.useThree)(e=>e.gl),s=(0,i.G)(a.TextureLoader,n(e)?Object.values(e):e);return(0,t.useLayoutEffect)(()=>{null==o||o(s)},[o]),(0,t.useEffect)(()=>{if("initTexture"in l){let e=[];Array.isArray(s)?e=s:s instanceof a.Texture?e=[s]:n(s)&&(e=Object.values(s)),e.forEach(e=>{e instanceof a.Texture&&l.initTexture(e)})}},[l,s]),(0,t.useMemo)(()=>{if(!n(e))return s;{let t={},a=0;for(let r in e)t[r]=s[a++];return t}},[e,s])}o.preload=e=>i.G.preload(a.TextureLoader,e),o.clear=e=>i.G.clear(a.TextureLoader,e),e.s(["useTexture",()=>o],47071)},31067,e=>{"use strict";function t(){return(t=Object.assign.bind()).apply(null,arguments)}e.s(["default",()=>t])},75567,e=>{"use strict";var t=e.i(90072);function a(e,r={}){let{repeat:i=[1,1],disableMipmaps:n=!1}=r;return e.wrapS=e.wrapT=t.RepeatWrapping,e.colorSpace=t.SRGBColorSpace,e.repeat.set(...i),e.flipY=!1,e.anisotropy=16,n?(e.generateMipmaps=!1,e.minFilter=t.LinearFilter):(e.generateMipmaps=!0,e.minFilter=t.LinearMipmapLinearFilter),e.magFilter=t.LinearFilter,e.needsUpdate=!0,e}function r(e){let a=new t.DataTexture(e,256,256,t.RedFormat,t.UnsignedByteType);return a.colorSpace=t.NoColorSpace,a.wrapS=a.wrapT=t.RepeatWrapping,a.generateMipmaps=!1,a.minFilter=t.LinearFilter,a.magFilter=t.LinearFilter,a.needsUpdate=!0,a}e.s(["setupMask",()=>r,"setupTexture",()=>a])},47021,e=>{"use strict";var t=e.i(8560);let a=`
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
`}function i(e,t){e.uniforms.fogVolumeData=t.fogVolumeData,e.uniforms.cameraHeight=t.cameraHeight,e.uniforms.fogEnabled=t.fogEnabled,e.vertexShader=e.vertexShader.replace("#include <fog_pars_vertex>",`#include <fog_pars_vertex>
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
#endif`),e.fragmentShader=e.fragmentShader.replace("#include <fog_fragment>",a)}e.s(["fogFragmentShader",0,a,"injectCustomFog",()=>i,"installCustomFogShader",()=>r])},48066,e=>{"use strict";let t={fogVolumeData:{value:new Float32Array(12)},cameraHeight:{value:0},fogEnabled:{value:!0}};function a(e,r,i=!0){t.cameraHeight.value=e,t.fogVolumeData.value.set(r),t.fogEnabled.value=i}function r(){t.cameraHeight.value=0,t.fogVolumeData.value.fill(0),t.fogEnabled.value=!0}function i(e){let t=new Float32Array(12);for(let a=0;a<3;a++){let r=4*a,i=e[a];i&&(t[r+0]=i.visibleDistance,t[r+1]=i.minHeight,t[r+2]=i.maxHeight,t[r+3]=i.percentage)}return t}e.s(["globalFogUniforms",0,t,"packFogVolumeData",()=>i,"resetGlobalFogUniforms",()=>r,"updateGlobalFogUniforms",()=>a])},67191,e=>{e.v({Label:"FloatingLabel-module__8y09Ka__Label"})},89887,60099,e=>{"use strict";let t,a;var r=e.i(43476),i=e.i(932),n=e.i(71645),o=e.i(90072),l=e.i(49774),s=e.i(31067),c=e.i(88014),u=e.i(73949);let d=new o.Vector3,f=new o.Vector3,m=new o.Vector3,g=new o.Vector2;function p(e,t,a){let r=d.setFromMatrixPosition(e.matrixWorld);r.project(t);let i=a.width/2,n=a.height/2;return[r.x*i+i,-(r.y*n)+n]}let h=e=>1e-10>Math.abs(e)?0:e;function y(e,t,a=""){let r="matrix3d(";for(let a=0;16!==a;a++)r+=h(t[a]*e.elements[a])+(15!==a?",":")");return a+r}let b=(t=[1,-1,1,1,1,-1,1,1,1,-1,1,1,1,-1,1,1],e=>y(e,t)),v=(a=e=>[1/e,1/e,1/e,1,-1/e,-1/e,-1/e,-1,1/e,1/e,1/e,1,1,1,1,1],(e,t)=>y(e,a(t),"translate(-50%,-50%)")),x=n.forwardRef(({children:e,eps:t=.001,style:a,className:r,prepend:i,center:y,fullscreen:x,portal:k,distanceFactor:S,sprite:_=!1,transform:j=!1,occlude:M,onOcclude:E,castShadow:P,receiveShadow:F,material:C,geometry:I,zIndexRange:O=[0x1000037,0],calculatePosition:D=p,as:T="div",wrapperClass:w,pointerEvents:N="auto",...R},B)=>{let{gl:V,camera:L,scene:H,size:W,raycaster:U,events:z,viewport:A}=(0,u.useThree)(),[G]=n.useState(()=>document.createElement(T)),$=n.useRef(null),Y=n.useRef(null),q=n.useRef(0),K=n.useRef([0,0]),J=n.useRef(null),X=n.useRef(null),Z=(null==k?void 0:k.current)||z.connected||V.domElement.parentNode,Q=n.useRef(null),ee=n.useRef(!1),et=n.useMemo(()=>{var e;return M&&"blending"!==M||Array.isArray(M)&&M.length&&(e=M[0])&&"object"==typeof e&&"current"in e},[M]);n.useLayoutEffect(()=>{let e=V.domElement;M&&"blending"===M?(e.style.zIndex=`${Math.floor(O[0]/2)}`,e.style.position="absolute",e.style.pointerEvents="none"):(e.style.zIndex=null,e.style.position=null,e.style.pointerEvents=null)},[M]),n.useLayoutEffect(()=>{if(Y.current){let e=$.current=c.createRoot(G);if(H.updateMatrixWorld(),j)G.style.cssText="position:absolute;top:0;left:0;pointer-events:none;overflow:hidden;";else{let e=D(Y.current,L,W);G.style.cssText=`position:absolute;top:0;left:0;transform:translate3d(${e[0]}px,${e[1]}px,0);transform-origin:0 0;`}return Z&&(i?Z.prepend(G):Z.appendChild(G)),()=>{Z&&Z.removeChild(G),e.unmount()}}},[Z,j]),n.useLayoutEffect(()=>{w&&(G.className=w)},[w]);let ea=n.useMemo(()=>j?{position:"absolute",top:0,left:0,width:W.width,height:W.height,transformStyle:"preserve-3d",pointerEvents:"none"}:{position:"absolute",transform:y?"translate3d(-50%,-50%,0)":"none",...x&&{top:-W.height/2,left:-W.width/2,width:W.width,height:W.height},...a},[a,y,x,W,j]),er=n.useMemo(()=>({position:"absolute",pointerEvents:N}),[N]);n.useLayoutEffect(()=>{var t,i;ee.current=!1,j?null==(t=$.current)||t.render(n.createElement("div",{ref:J,style:ea},n.createElement("div",{ref:X,style:er},n.createElement("div",{ref:B,className:r,style:a,children:e})))):null==(i=$.current)||i.render(n.createElement("div",{ref:B,style:ea,className:r,children:e}))});let ei=n.useRef(!0);(0,l.useFrame)(e=>{if(Y.current){L.updateMatrixWorld(),Y.current.updateWorldMatrix(!0,!1);let e=j?K.current:D(Y.current,L,W);if(j||Math.abs(q.current-L.zoom)>t||Math.abs(K.current[0]-e[0])>t||Math.abs(K.current[1]-e[1])>t){var a;let t,r,i,n,l=(a=Y.current,t=d.setFromMatrixPosition(a.matrixWorld),r=f.setFromMatrixPosition(L.matrixWorld),i=t.sub(r),n=L.getWorldDirection(m),i.angleTo(n)>Math.PI/2),s=!1;et&&(Array.isArray(M)?s=M.map(e=>e.current):"blending"!==M&&(s=[H]));let c=ei.current;s?ei.current=function(e,t,a,r){let i=d.setFromMatrixPosition(e.matrixWorld),n=i.clone();n.project(t),g.set(n.x,n.y),a.setFromCamera(g,t);let o=a.intersectObjects(r,!0);if(o.length){let e=o[0].distance;return i.distanceTo(a.ray.origin)<e}return!0}(Y.current,L,U,s)&&!l:ei.current=!l,c!==ei.current&&(E?E(!ei.current):G.style.display=ei.current?"block":"none");let u=Math.floor(O[0]/2),p=M?et?[O[0],u]:[u-1,0]:O;if(G.style.zIndex=`${function(e,t,a){if(t instanceof o.PerspectiveCamera||t instanceof o.OrthographicCamera){let r=d.setFromMatrixPosition(e.matrixWorld),i=f.setFromMatrixPosition(t.matrixWorld),n=r.distanceTo(i),o=(a[1]-a[0])/(t.far-t.near),l=a[1]-o*t.far;return Math.round(o*n+l)}}(Y.current,L,p)}`,j){let[e,t]=[W.width/2,W.height/2],a=L.projectionMatrix.elements[5]*t,{isOrthographicCamera:r,top:i,left:n,bottom:o,right:l}=L,s=b(L.matrixWorldInverse),c=r?`scale(${a})translate(${h(-(l+n)/2)}px,${h((i+o)/2)}px)`:`translateZ(${a}px)`,u=Y.current.matrixWorld;_&&((u=L.matrixWorldInverse.clone().transpose().copyPosition(u).scale(Y.current.scale)).elements[3]=u.elements[7]=u.elements[11]=0,u.elements[15]=1),G.style.width=W.width+"px",G.style.height=W.height+"px",G.style.perspective=r?"":`${a}px`,J.current&&X.current&&(J.current.style.transform=`${c}${s}translate(${e}px,${t}px)`,X.current.style.transform=v(u,1/((S||10)/400)))}else{let t=void 0===S?1:function(e,t){if(t instanceof o.OrthographicCamera)return t.zoom;if(!(t instanceof o.PerspectiveCamera))return 1;{let a=d.setFromMatrixPosition(e.matrixWorld),r=f.setFromMatrixPosition(t.matrixWorld);return 1/(2*Math.tan(t.fov*Math.PI/180/2)*a.distanceTo(r))}}(Y.current,L)*S;G.style.transform=`translate3d(${e[0]}px,${e[1]}px,0) scale(${t})`}K.current=e,q.current=L.zoom}}if(!et&&Q.current&&!ee.current)if(j){if(J.current){let e=J.current.children[0];if(null!=e&&e.clientWidth&&null!=e&&e.clientHeight){let{isOrthographicCamera:t}=L;if(t||I)R.scale&&(Array.isArray(R.scale)?R.scale instanceof o.Vector3?Q.current.scale.copy(R.scale.clone().divideScalar(1)):Q.current.scale.set(1/R.scale[0],1/R.scale[1],1/R.scale[2]):Q.current.scale.setScalar(1/R.scale));else{let t=(S||10)/400,a=e.clientWidth*t,r=e.clientHeight*t;Q.current.scale.set(a,r,1)}ee.current=!0}}}else{let t=G.children[0];if(null!=t&&t.clientWidth&&null!=t&&t.clientHeight){let e=1/A.factor,a=t.clientWidth*e,r=t.clientHeight*e;Q.current.scale.set(a,r,1),ee.current=!0}Q.current.lookAt(e.camera.position)}});let en=n.useMemo(()=>({vertexShader:j?void 0:`
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
      `}),[j]);return n.createElement("group",(0,s.default)({},R,{ref:Y}),M&&!et&&n.createElement("mesh",{castShadow:P,receiveShadow:F,ref:Q},I||n.createElement("planeGeometry",null),C||n.createElement("shaderMaterial",{side:o.DoubleSide,vertexShader:en.vertexShader,fragmentShader:en.fragmentShader})))});e.s(["Html",()=>x],60099);var k=e.i(67191);let S=[0,0,0],_=new o.Vector3,j=(0,n.memo)(function(e){let t,a,o,s=(0,i.c)(11),{children:c,color:u,position:d,opacity:f}=e,m=void 0===u?"white":u,g=void 0===d?S:d,p=void 0===f?"fadeWithDistance":f,h="fadeWithDistance"===p,y=(0,n.useRef)(null),[b,v]=(0,n.useState)(0!==p),j=(0,n.useRef)(null);return s[0]!==h||s[1]!==b||s[2]!==p?(t=e=>{var t,a,r;let i,{camera:n}=e,o=y.current;if(!o)return;o.getWorldPosition(_);let l=(t=_.x,a=_.y,r=_.z,-((t-(i=n.matrixWorld.elements)[12])*i[8])+-((a-i[13])*i[9])+-((r-i[14])*i[10])<0);if(h){let e=l?1/0:n.position.distanceTo(_),t=e<200;if(b!==t&&v(t),j.current&&t){let t=Math.max(0,Math.min(1,1-e/200));j.current.style.opacity=t.toString()}}else{let e=!l&&0!==p;b!==e&&v(e),j.current&&(j.current.style.opacity=p.toString())}},s[0]=h,s[1]=b,s[2]=p,s[3]=t):t=s[3],(0,l.useFrame)(t),s[4]!==c||s[5]!==m||s[6]!==b||s[7]!==g?(a=b?(0,r.jsx)(x,{position:g,center:!0,children:(0,r.jsx)("div",{ref:j,className:k.default.Label,style:{color:m},children:c})}):null,s[4]=c,s[5]=m,s[6]=b,s[7]=g,s[8]=a):a=s[8],s[9]!==a?(o=(0,r.jsx)("group",{ref:y,children:a}),s[9]=a,s[10]=o):o=s[10],o});e.s(["FloatingLabel",0,j],89887)},51434,e=>{"use strict";var t=e.i(43476),a=e.i(932),r=e.i(71645),i=e.i(73949),n=e.i(90072);let o=(0,r.createContext)(void 0);function l(e){let l,c,u,d,f=(0,a.c)(7),{children:m}=e,{camera:g}=(0,i.useThree)();f[0]===Symbol.for("react.memo_cache_sentinel")?(l={audioLoader:null,audioListener:null},f[0]=l):l=f[0];let[p,h]=(0,r.useState)(l);return f[1]!==g?(c=()=>{let e=new n.AudioLoader,t=g.children.find(s);t||(t=new n.AudioListener,g.add(t)),h({audioLoader:e,audioListener:t})},u=[g],f[1]=g,f[2]=c,f[3]=u):(c=f[2],u=f[3]),(0,r.useEffect)(c,u),f[4]!==p||f[5]!==m?(d=(0,t.jsx)(o.Provider,{value:p,children:m}),f[4]=p,f[5]=m,f[6]=d):d=f[6],d}function s(e){return e instanceof n.AudioListener}function c(){let e=(0,r.useContext)(o);if(void 0===e)throw Error("useAudio must be used within AudioProvider");return e}e.s(["AudioProvider",()=>l,"useAudio",()=>c])},6112,79473,58647,30064,13876,e=>{"use strict";var t=e.i(932),a=e.i(8155);let r=e=>(t,a,r)=>{let i=r.subscribe;return r.subscribe=(e,t,a)=>{let n=e;if(t){let i=(null==a?void 0:a.equalityFn)||Object.is,o=e(r.getState());n=a=>{let r=e(a);if(!i(o,r)){let e=o;t(o=r,e)}},(null==a?void 0:a.fireImmediately)&&t(o,o)}return i(n)},e(t,a,r)};e.s(["subscribeWithSelector",()=>r],79473);var i=e.i(66748);function n(e){return e.toLowerCase()}function o(e){let t=n(e.trim());return t.startsWith("$")?t.slice(1):t}let l={runtime:{runtime:null,objectVersionById:{},globalVersionByName:{},objectIdsByName:{},datablockIdsByName:{},lastRuntimeTick:0},world:{entitiesById:{},players:[],ghosts:[],projectiles:[],flags:[],teams:{},scores:{}},playback:{recording:null,status:"stopped",timeMs:0,rate:1,frameCursor:0,durationMs:0,streamSnapshot:null},diagnostics:{eventCounts:{"object.created":0,"object.deleted":0,"field.changed":0,"method.called":0,"global.changed":0,"batch.flushed":0},recentEvents:[],maxRecentEvents:200,webglContextLost:!1,playbackEvents:[],maxPlaybackEvents:400,rendererSamples:[],maxRendererSamples:2400}},s=(0,a.createStore)()(r(e=>({...l,setRuntime(t){let a=function(e){let t={},a={},r={},i={};for(let a of e.state.objectsById.values())t[a._id]=0,a._name&&(r[n(a._name)]=a._id,a._isDatablock&&(i[n(a._name)]=a._id));for(let t of e.state.globals.keys())a[o(t)]=0;return{objectVersionById:t,globalVersionByName:a,objectIdsByName:r,datablockIdsByName:i}}(t);e(e=>({...e,runtime:{runtime:t,objectVersionById:a.objectVersionById,globalVersionByName:a.globalVersionByName,objectIdsByName:a.objectIdsByName,datablockIdsByName:a.datablockIdsByName,lastRuntimeTick:0}}))},clearRuntime(){e(e=>({...e,runtime:{runtime:null,objectVersionById:{},globalVersionByName:{},objectIdsByName:{},datablockIdsByName:{},lastRuntimeTick:0}}))},applyRuntimeBatch(t,a){0!==t.length&&e(e=>{let r={...e.runtime.objectVersionById},i={...e.runtime.globalVersionByName},l={...e.runtime.objectIdsByName},s={...e.runtime.datablockIdsByName},c={...e.diagnostics.eventCounts},u=[...e.diagnostics.recentEvents],d=e=>{null!=e&&(r[e]=(r[e]??0)+1)};for(let e of t){if(c[e.type]=(c[e.type]??0)+1,u.push(e),"object.created"===e.type){let t=e.object;if(d(e.objectId),t._name){let a=n(t._name);l[a]=e.objectId,t._isDatablock&&(s[a]=e.objectId)}d(t._parent?._id);continue}if("object.deleted"===e.type){let t=e.object;if(delete r[e.objectId],t?._name){let e=n(t._name);delete l[e],t._isDatablock&&delete s[e]}d(t?._parent?._id);continue}if("field.changed"===e.type){d(e.objectId);continue}if("global.changed"===e.type){let t=o(e.name);i[t]=(i[t]??0)+1;continue}}let f=a?.tick??(e.runtime.lastRuntimeTick>0?e.runtime.lastRuntimeTick+1:1);c["batch.flushed"]+=1,u.push({type:"batch.flushed",tick:f,events:t});let m=e.diagnostics.maxRecentEvents,g=u.length>m?u.slice(u.length-m):u;return{...e,runtime:{...e.runtime,objectVersionById:r,globalVersionByName:i,objectIdsByName:l,datablockIdsByName:s,lastRuntimeTick:f},diagnostics:{...e.diagnostics,eventCounts:c,recentEvents:g}}})},setDemoRecording(t){let a=Math.max(0,(t?.duration??0)*1e3),r=function(e=0){let t=Error().stack;if(!t)return null;let a=t.split("\n").map(e=>e.trim()).filter(Boolean).slice(1+e,9+e);return a.length>0?a.join(" <= "):null}(1);e(e=>{let i=e.playback.streamSnapshot,n=e.playback.recording,o={t:Date.now(),kind:"recording.set",message:"setDemoRecording invoked",playbackStatus:e.playback.status,playbackTimeMs:e.playback.timeMs,frameCursor:e.playback.frameCursor,streamEntityCount:i?.entities.length??0,streamCameraMode:i?.camera?.mode??null,streamExhausted:i?.exhausted??!1,meta:{previousMissionName:n?.missionName??null,nextMissionName:t?.missionName??null,previousDurationSec:n?Number(n.duration.toFixed(3)):null,nextDurationSec:t?Number(t.duration.toFixed(3)):null,isNull:null==t,isMetadataOnly:!!t?.isMetadataOnly,isPartial:!!t?.isPartial,hasStreamingPlayback:!!t?.streamingPlayback,stack:r??"unavailable"}};return{...e,world:function(e){if(!e)return{entitiesById:{},players:[],ghosts:[],projectiles:[],flags:[],teams:{},scores:{}};let t={},a=[],r=[],i=[],n=[];for(let o of e.entities){let e=String(o.id);t[e]=o;let l=o.type.toLowerCase();if("player"===l){a.push(e),e.startsWith("player_")&&r.push(e);continue}if("projectile"===l){i.push(e);continue}(o.dataBlock?.toLowerCase()==="flag"||o.dataBlock?.toLowerCase().includes("flag"))&&n.push(e)}return{entitiesById:t,players:a,ghosts:r,projectiles:i,flags:n,teams:{},scores:{}}}(t),playback:{recording:t,status:"stopped",timeMs:0,rate:1,frameCursor:0,durationMs:a,streamSnapshot:null},diagnostics:{...e.diagnostics,webglContextLost:!1,playbackEvents:[o],rendererSamples:[]}}})},setPlaybackTime(t){e(e=>{var a,r,i;let n=(a=t,r=0,i=e.playback.durationMs,a<0?0:a>i?i:a);return{...e,playback:{...e.playback,timeMs:n,frameCursor:n}}})},setPlaybackStatus(t){e(e=>({...e,playback:{...e.playback,status:t}}))},setPlaybackRate(t){var a,r,i;let n=Number.isFinite(t)?(r=.01,i=16,(a=t)<.01?.01:a>16?16:a):1;e(e=>({...e,playback:{...e.playback,rate:n}}))},setPlaybackFrameCursor(t){let a=Number.isFinite(t)?t:0;e(e=>({...e,playback:{...e.playback,frameCursor:a}}))},setPlaybackStreamSnapshot(t){e(e=>({...e,playback:{...e.playback,streamSnapshot:t}}))},setWebglContextLost(t){e(e=>({...e,diagnostics:{...e.diagnostics,webglContextLost:t}}))},recordPlaybackDiagnosticEvent(t){e(e=>{let a=e.playback.streamSnapshot,r={t:Date.now(),kind:t.kind,message:t.message,playbackStatus:e.playback.status,playbackTimeMs:e.playback.timeMs,frameCursor:e.playback.frameCursor,streamEntityCount:a?.entities.length??0,streamCameraMode:a?.camera?.mode??null,streamExhausted:a?.exhausted??!1,meta:t.meta},i=[...e.diagnostics.playbackEvents,r],n=e.diagnostics.maxPlaybackEvents,o=i.length>n?i.slice(i.length-n):i;return{...e,diagnostics:{...e.diagnostics,playbackEvents:o}}})},appendRendererSample(t){e(e=>{let a=e.playback.streamSnapshot,r={t:t.t??Date.now(),playbackStatus:e.playback.status,playbackTimeMs:e.playback.timeMs,frameCursor:e.playback.frameCursor,streamEntityCount:a?.entities.length??0,streamCameraMode:a?.camera?.mode??null,streamExhausted:a?.exhausted??!1,geometries:t.geometries,textures:t.textures,programs:t.programs,renderCalls:t.renderCalls,renderTriangles:t.renderTriangles,renderPoints:t.renderPoints,renderLines:t.renderLines,sceneObjects:t.sceneObjects,visibleSceneObjects:t.visibleSceneObjects,jsHeapUsed:t.jsHeapUsed,jsHeapTotal:t.jsHeapTotal,jsHeapLimit:t.jsHeapLimit},i=[...e.diagnostics.rendererSamples,r],n=e.diagnostics.maxRendererSamples,o=i.length>n?i.slice(i.length-n):i;return{...e,diagnostics:{...e.diagnostics,rendererSamples:o}}})},clearPlaybackDiagnostics(){e(e=>({...e,diagnostics:{...e.diagnostics,webglContextLost:!1,playbackEvents:[],rendererSamples:[]}}))}})));function c(){return s}function u(e,t){return(0,i.useStoreWithEqualityFn)(s,e,t)}function d(e){let a,r,i,n=(0,t.c)(7),o=u(f);n[0]!==e?(a=t=>null==e?-1:t.runtime.objectVersionById[e]??-1,n[0]=e,n[1]=a):a=n[1];let l=u(a);if(null==e||!o||-1===l)return;n[2]!==e||n[3]!==o.state.objectsById?(r=o.state.objectsById.get(e),n[2]=e,n[3]=o.state.objectsById,n[4]=r):r=n[4];let s=r;return n[5]!==s?(i=s?{...s}:void 0,n[5]=s,n[6]=i):i=n[6],i}function f(e){return e.runtime.runtime}function m(e){let a,r,i,o,l,s=(0,t.c)(11),c=u(g);s[0]!==e?(a=e?n(e):"",s[0]=e,s[1]=a):a=s[1];let d=a;s[2]!==d?(r=e=>d?e.runtime.objectIdsByName[d]:void 0,s[2]=d,s[3]=r):r=s[3];let f=u(r);s[4]!==f?(i=e=>null==f?-1:e.runtime.objectVersionById[f]??-1,s[4]=f,s[5]=i):i=s[5];let m=u(i);if(!c||!d||null==f||-1===m)return;s[6]!==f||s[7]!==c.state.objectsById?(o=c.state.objectsById.get(f),s[6]=f,s[7]=c.state.objectsById,s[8]=o):o=s[8];let p=o;return s[9]!==p?(l=p?{...p}:void 0,s[9]=p,s[10]=l):l=s[10],l}function g(e){return e.runtime.runtime}function p(e){let a,r,i,o,l,s=(0,t.c)(11),c=u(h);s[0]!==e?(a=e?n(e):"",s[0]=e,s[1]=a):a=s[1];let d=a;s[2]!==d?(r=e=>d?e.runtime.datablockIdsByName[d]:void 0,s[2]=d,s[3]=r):r=s[3];let f=u(r);s[4]!==f?(i=e=>null==f?-1:e.runtime.objectVersionById[f]??-1,s[4]=f,s[5]=i):i=s[5];let m=u(i);if(!c||!d||null==f||-1===m)return;s[6]!==f||s[7]!==c.state.objectsById?(o=c.state.objectsById.get(f),s[6]=f,s[7]=c.state.objectsById,s[8]=o):o=s[8];let g=o;return s[9]!==g?(l=g?{...g}:void 0,s[9]=g,s[10]=l):l=s[10],l}function h(e){return e.runtime.runtime}function y(e,a){let r,i,n,o,l=(0,t.c)(13);l[0]!==a?(r=void 0===a?[]:a,l[0]=a,l[1]=r):r=l[1];let s=r,c=u(k);l[2]!==e?(i=t=>null==e?-1:t.runtime.objectVersionById[e]??-1,l[2]=e,l[3]=i):i=l[3];let d=u(i);if(null==e){let e;return l[4]!==s?(e=s.map(x),l[4]=s,l[5]=e):e=l[5],e}if(!c||-1===d){let e;return l[6]!==s?(e=s.map(v),l[6]=s,l[7]=e):e=l[7],e}let f=c.state.objectsById;if(l[8]!==e||l[9]!==c.state.objectsById){o=Symbol.for("react.early_return_sentinel");e:{let t=f.get(e);if(!t?._children){let e;l[12]===Symbol.for("react.memo_cache_sentinel")?(e=[],l[12]=e):e=l[12],o=e;break e}n=t._children.map(b)}l[8]=e,l[9]=c.state.objectsById,l[10]=n,l[11]=o}else n=l[10],o=l[11];return o!==Symbol.for("react.early_return_sentinel")?o:n}function b(e){return e._id}function v(e){return e._id}function x(e){return e._id}function k(e){return e.runtime.runtime}e.s(["engineStore",0,s,"useDatablockByName",()=>p,"useEngineSelector",()=>u,"useEngineStoreApi",()=>c,"useRuntimeChildIds",()=>y,"useRuntimeObjectById",()=>d,"useRuntimeObjectByName",()=>m],58647);let S={maxRuntimeEvents:80,maxPlaybackEvents:200,maxRendererSamples:1200,maxStreamEntities:40};function _(e){return e&&"object"==typeof e?{kind:"TorqueObject",id:"number"==typeof e._id?e._id:null,className:"string"==typeof e._className?e._className:null,class:"string"==typeof e._class?e._class:null,name:"string"==typeof e._name?e._name:null,isDatablock:!!e._isDatablock,parentId:e._parent&&"number"==typeof e._parent._id?e._parent._id:null,childCount:Array.isArray(e._children)?e._children.length:0}:null}function j(e,t={}){let a,r,i,n={...S,...t},o=(a=new WeakSet,function e(t,r=0){if(null==t)return t;let i=typeof t;if("string"===i||"number"===i||"boolean"===i)return t;if("bigint"===i)return t.toString();if("function"===i)return`[Function ${t.name||"anonymous"}]`;if("object"!==i)return String(t);if("_id"in t&&"_className"in t)return _(t);if(t instanceof Date)return t.toISOString();if(Array.isArray(t)){if(r>=2)return{kind:"Array",length:t.length};let a=t.slice(0,8).map(t=>e(t,r+1));return{kind:"Array",length:t.length,sample:a}}if(a.has(t))return"[Circular]";if(a.add(t),r>=2)return{kind:t?.constructor?.name??"Object"};let n=Object.keys(t).slice(0,12),o={};for(let a of n)try{o[a]=e(t[a],r+1)}catch(e){o[a]=`[Unserializable: ${e.message}]`}return Object.keys(t).length>n.length&&(o.__truncatedKeys=Object.keys(t).length-n.length),o}),l=e.diagnostics.recentEvents.slice(-n.maxRuntimeEvents).map(e=>(function(e,t){if("object.created"===e.type||"object.deleted"===e.type)return{type:e.type,objectId:e.objectId,object:_(e.object)};if("field.changed"===e.type)return{type:e.type,objectId:e.objectId,field:e.field,value:t(e.value),previousValue:t(e.previousValue),object:_(e.object)};if("method.called"===e.type)return{type:e.type,className:e.className,methodName:e.methodName,objectId:e.objectId??null,args:t(e.args)};if("global.changed"===e.type)return{type:e.type,name:e.name,value:t(e.value),previousValue:t(e.previousValue)};if("batch.flushed"===e.type){let t={};for(let a of e.events)t[a.type]=(t[a.type]??0)+1;return{type:e.type,tick:e.tick,eventCount:e.events.length,byType:t}}return{type:"unknown"}})(e,o)),s=e.diagnostics.playbackEvents.slice(-n.maxPlaybackEvents).map(e=>({...e,meta:e.meta?o(e.meta):void 0})),c=e.diagnostics.rendererSamples.slice(-n.maxRendererSamples);return{generatedAt:new Date().toISOString(),playback:{status:e.playback.status,timeMs:e.playback.timeMs,frameCursor:e.playback.frameCursor,rate:e.playback.rate,durationMs:e.playback.durationMs,recording:(r=e.playback.recording)?{duration:r.duration,missionName:r.missionName,gameType:r.gameType,isMetadataOnly:!!r.isMetadataOnly,isPartial:!!r.isPartial,hasStreamingPlayback:!!r.streamingPlayback,entitiesCount:r.entities.length,cameraModesCount:r.cameraModes.length,controlPlayerGhostId:r.controlPlayerGhostId??null}:null,streamSnapshot:function(e,t){let a=e.playback.streamSnapshot;if(!a)return null;let r={},i={};for(let e of a.entities){let t=e.type||"Unknown";r[t]=(r[t]??0)+1,e.visual?.kind&&(i[e.visual.kind]=(i[e.visual.kind]??0)+1)}let n=a.entities.slice(0,t).map(e=>({id:e.id,type:e.type,dataBlock:e.dataBlock??null,className:e.className??null,ghostIndex:e.ghostIndex??null,dataBlockId:e.dataBlockId??null,shapeHint:e.shapeHint??null,visualKind:e.visual?.kind??null,hasPosition:!!e.position,hasRotation:!!e.rotation}));return{timeSec:a.timeSec,exhausted:a.exhausted,cameraMode:a.camera?.mode??null,controlEntityId:a.camera?.controlEntityId??null,orbitTargetId:a.camera?.orbitTargetId??null,controlPlayerGhostId:a.controlPlayerGhostId??null,entityCount:a.entities.length,entitiesByType:r,visualsByKind:i,entitySample:n,status:a.status}}(e,n.maxStreamEntities)},runtime:(i=e.runtime.runtime)?{lastRuntimeTick:e.runtime.lastRuntimeTick,objectCount:i.state.objectsById.size,datablockCount:i.state.datablocks.size,globalCount:i.state.globals.size,activePackageCount:i.state.activePackages.length,executedScriptCount:i.state.executedScripts.size,failedScriptCount:i.state.failedScripts.size}:null,diagnostics:{webglContextLost:e.diagnostics.webglContextLost,eventCounts:e.diagnostics.eventCounts,playbackEventCount:e.diagnostics.playbackEvents.length,rendererSampleCount:e.diagnostics.rendererSamples.length,runtimeEventCount:e.diagnostics.recentEvents.length,playbackEventsByKind:function(e){let t={};for(let a of e)t[a.kind]=(t[a.kind]??0)+1;return t}(e.diagnostics.playbackEvents),rendererTrend:function(e){if(e.length<2)return null;let t=e[0],a=e[e.length-1];return{sampleCount:e.length,durationSec:Number(((a.t-t.t)/1e3).toFixed(3)),geometriesDelta:a.geometries-t.geometries,texturesDelta:a.textures-t.textures,programsDelta:a.programs-t.programs,sceneObjectsDelta:a.sceneObjects-t.sceneObjects,visibleSceneObjectsDelta:a.visibleSceneObjects-t.visibleSceneObjects,renderCallsDelta:a.renderCalls-t.renderCalls}}(c),playbackEvents:s,rendererSamples:c,runtimeEvents:l}}}function M(e,t={}){return JSON.stringify(j(e,t),null,2)}function E(e){return p(e)}e.s(["buildSerializableDiagnosticsJson",()=>M,"buildSerializableDiagnosticsSnapshot",()=>j],30064),e.s([],13876),e.s(["useDatablock",()=>E],6112)},61921,e=>{e.v(t=>Promise.all(["static/chunks/cb4089eec9313f48.js"].map(t=>e.l(t))).then(()=>t(29055)))},25147,e=>{e.v(t=>Promise.all(["static/chunks/b9c295cb642f6712.js"].map(t=>e.l(t))).then(()=>t(63724)))},18599,e=>{e.v(t=>Promise.all(["static/chunks/6e74e9455d83b68c.js"].map(t=>e.l(t))).then(()=>t(42585)))},84968,e=>{e.v(t=>Promise.all(["static/chunks/70bf3e06d5674fac.js"].map(t=>e.l(t))).then(()=>t(90208)))},59197,e=>{e.v(t=>Promise.all(["static/chunks/0be79f7f5e0597a7.css","static/chunks/1cf33c843f96e1c9.js"].map(t=>e.l(t))).then(()=>t(94247)))}]);