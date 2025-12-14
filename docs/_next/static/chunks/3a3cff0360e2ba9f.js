(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,47071,971,e=>{"use strict";var t=e.i(71645),r=e.i(90072),i=e.i(73949),o=e.i(91037);e.s(["useLoader",()=>o.G],971);var o=o;let a=e=>e===Object(e)&&!Array.isArray(e)&&"function"!=typeof e;function n(e,n){let l=(0,i.useThree)(e=>e.gl),s=(0,o.G)(r.TextureLoader,a(e)?Object.values(e):e);return(0,t.useLayoutEffect)(()=>{null==n||n(s)},[n]),(0,t.useEffect)(()=>{if("initTexture"in l){let e=[];Array.isArray(s)?e=s:s instanceof r.Texture?e=[s]:a(s)&&(e=Object.values(s)),e.forEach(e=>{e instanceof r.Texture&&l.initTexture(e)})}},[l,s]),(0,t.useMemo)(()=>{if(!a(e))return s;{let t={},r=0;for(let i in e)t[i]=s[r++];return t}},[e,s])}n.preload=e=>o.G.preload(r.TextureLoader,e),n.clear=e=>o.G.clear(r.TextureLoader,e),e.s(["useTexture",()=>n],47071)},6112,51475,77482,e=>{"use strict";var t=e.i(43476),r=e.i(71645),i=e.i(49774);let o=(0,r.createContext)(null);function a({children:e}){let a=(0,r.useRef)(void 0),n=(0,r.useRef)(0),l=(0,r.useRef)(0);(0,i.useFrame)((e,t)=>{for(n.current+=t;n.current>=.03125;)if(n.current-=.03125,l.current++,a.current)for(let e of a.current)e(l.current)});let s=(0,r.useCallback)(e=>(a.current??=new Set,a.current.add(e),()=>{a.current.delete(e)}),[]),c=(0,r.useCallback)(()=>l.current,[]),u=(0,r.useMemo)(()=>({subscribe:s,getTick:c}),[s,c]);return(0,t.jsx)(o.Provider,{value:u,children:e})}function n(e){let t=(0,r.useContext)(o);if(!t)throw Error("useTick must be used within a TickProvider");let i=(0,r.useRef)(e);i.current=e,(0,r.useEffect)(()=>t.subscribe(e=>i.current(e)),[t])}e.s(["TickProvider",()=>a,"useTick",()=>n],51475);let l=(0,r.createContext)(null);function s({runtime:e,children:r}){return(0,t.jsx)(l.Provider,{value:e,children:(0,t.jsx)(a,{children:r})})}function c(){let e=(0,r.useContext)(l);if(!e)throw Error("useRuntime must be used within a RuntimeProvider");return e}function u(e){let t=c();if(e)return t.state.datablocks.get(e)}e.s(["RuntimeProvider",()=>s,"useRuntime",()=>c],77482),e.s(["useDatablock",()=>u],6112)},31067,e=>{"use strict";function t(){return(t=Object.assign.bind()).apply(null,arguments)}e.s(["default",()=>t])},75567,e=>{"use strict";var t=e.i(90072);function r(e,i={}){let{repeat:o=[1,1],disableMipmaps:a=!1}=i;return e.wrapS=e.wrapT=t.RepeatWrapping,e.colorSpace=t.SRGBColorSpace,e.repeat.set(...o),e.flipY=!1,e.anisotropy=16,a?(e.generateMipmaps=!1,e.minFilter=t.LinearFilter):(e.generateMipmaps=!0,e.minFilter=t.LinearMipmapLinearFilter),e.magFilter=t.LinearFilter,e.needsUpdate=!0,e}function i(e){let r=new t.DataTexture(e,256,256,t.RedFormat,t.UnsignedByteType);return r.colorSpace=t.NoColorSpace,r.wrapS=r.wrapT=t.RepeatWrapping,r.generateMipmaps=!1,r.minFilter=t.LinearFilter,r.magFilter=t.LinearFilter,r.needsUpdate=!0,r}e.s(["setupMask",()=>i,"setupTexture",()=>r])},47021,e=>{"use strict";var t=e.i(8560);let r=`
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
#endif`),e.fragmentShader=e.fragmentShader.replace("#include <fog_fragment>",r)}e.s(["fogFragmentShader",0,r,"injectCustomFog",()=>o,"installCustomFogShader",()=>i])},48066,e=>{"use strict";let t={fogVolumeData:{value:new Float32Array(12)},cameraHeight:{value:0},fogEnabled:{value:!0}};function r(e,i,o=!0){t.cameraHeight.value=e,t.fogVolumeData.value.set(i),t.fogEnabled.value=o}function i(){t.cameraHeight.value=0,t.fogVolumeData.value.fill(0),t.fogEnabled.value=!0}function o(e){let t=new Float32Array(12);for(let r=0;r<3;r++){let i=4*r,o=e[r];o&&(t[i+0]=o.visibleDistance,t[i+1]=o.minHeight,t[i+2]=o.maxHeight,t[i+3]=o.percentage)}return t}e.s(["globalFogUniforms",0,t,"packFogVolumeData",()=>o,"resetGlobalFogUniforms",()=>i,"updateGlobalFogUniforms",()=>r])},89887,60099,e=>{"use strict";let t,r;var i=e.i(43476),o=e.i(71645),a=e.i(49774),n=e.i(73949),l=e.i(90072),s=e.i(31067),c=e.i(88014);let u=new l.Vector3,f=new l.Vector3,d=new l.Vector3,m=new l.Vector2;function g(e,t,r){let i=u.setFromMatrixPosition(e.matrixWorld);i.project(t);let o=r.width/2,a=r.height/2;return[i.x*o+o,-(i.y*a)+a]}let h=e=>1e-10>Math.abs(e)?0:e;function v(e,t,r=""){let i="matrix3d(";for(let r=0;16!==r;r++)i+=h(t[r]*e.elements[r])+(15!==r?",":")");return r+i}let p=(t=[1,-1,1,1,1,-1,1,1,1,-1,1,1,1,-1,1,1],e=>v(e,t)),x=(r=e=>[1/e,1/e,1/e,1,-1/e,-1/e,-1/e,-1,1/e,1/e,1/e,1,1,1,1,1],(e,t)=>v(e,r(t),"translate(-50%,-50%)")),y=o.forwardRef(({children:e,eps:t=.001,style:r,className:i,prepend:v,center:y,fullscreen:F,portal:b,distanceFactor:S,sprite:M=!1,transform:P=!1,occlude:E,onOcclude:_,castShadow:T,receiveShadow:w,material:O,geometry:D,zIndexRange:C=[0x1000037,0],calculatePosition:R=g,as:H="div",wrapperClass:V,pointerEvents:W="auto",...L},U)=>{let{gl:z,camera:k,scene:G,size:I,raycaster:A,events:j,viewport:N}=(0,n.useThree)(),[$]=o.useState(()=>document.createElement(H)),Y=o.useRef(null),q=o.useRef(null),B=o.useRef(0),K=o.useRef([0,0]),X=o.useRef(null),Z=o.useRef(null),J=(null==b?void 0:b.current)||j.connected||z.domElement.parentNode,Q=o.useRef(null),ee=o.useRef(!1),et=o.useMemo(()=>{var e;return E&&"blending"!==E||Array.isArray(E)&&E.length&&(e=E[0])&&"object"==typeof e&&"current"in e},[E]);o.useLayoutEffect(()=>{let e=z.domElement;E&&"blending"===E?(e.style.zIndex=`${Math.floor(C[0]/2)}`,e.style.position="absolute",e.style.pointerEvents="none"):(e.style.zIndex=null,e.style.position=null,e.style.pointerEvents=null)},[E]),o.useLayoutEffect(()=>{if(q.current){let e=Y.current=c.createRoot($);if(G.updateMatrixWorld(),P)$.style.cssText="position:absolute;top:0;left:0;pointer-events:none;overflow:hidden;";else{let e=R(q.current,k,I);$.style.cssText=`position:absolute;top:0;left:0;transform:translate3d(${e[0]}px,${e[1]}px,0);transform-origin:0 0;`}return J&&(v?J.prepend($):J.appendChild($)),()=>{J&&J.removeChild($),e.unmount()}}},[J,P]),o.useLayoutEffect(()=>{V&&($.className=V)},[V]);let er=o.useMemo(()=>P?{position:"absolute",top:0,left:0,width:I.width,height:I.height,transformStyle:"preserve-3d",pointerEvents:"none"}:{position:"absolute",transform:y?"translate3d(-50%,-50%,0)":"none",...F&&{top:-I.height/2,left:-I.width/2,width:I.width,height:I.height},...r},[r,y,F,I,P]),ei=o.useMemo(()=>({position:"absolute",pointerEvents:W}),[W]);o.useLayoutEffect(()=>{var t,a;ee.current=!1,P?null==(t=Y.current)||t.render(o.createElement("div",{ref:X,style:er},o.createElement("div",{ref:Z,style:ei},o.createElement("div",{ref:U,className:i,style:r,children:e})))):null==(a=Y.current)||a.render(o.createElement("div",{ref:U,style:er,className:i,children:e}))});let eo=o.useRef(!0);(0,a.useFrame)(e=>{if(q.current){k.updateMatrixWorld(),q.current.updateWorldMatrix(!0,!1);let e=P?K.current:R(q.current,k,I);if(P||Math.abs(B.current-k.zoom)>t||Math.abs(K.current[0]-e[0])>t||Math.abs(K.current[1]-e[1])>t){var r;let t,i,o,a,n=(r=q.current,t=u.setFromMatrixPosition(r.matrixWorld),i=f.setFromMatrixPosition(k.matrixWorld),o=t.sub(i),a=k.getWorldDirection(d),o.angleTo(a)>Math.PI/2),s=!1;et&&(Array.isArray(E)?s=E.map(e=>e.current):"blending"!==E&&(s=[G]));let c=eo.current;s?eo.current=function(e,t,r,i){let o=u.setFromMatrixPosition(e.matrixWorld),a=o.clone();a.project(t),m.set(a.x,a.y),r.setFromCamera(m,t);let n=r.intersectObjects(i,!0);if(n.length){let e=n[0].distance;return o.distanceTo(r.ray.origin)<e}return!0}(q.current,k,A,s)&&!n:eo.current=!n,c!==eo.current&&(_?_(!eo.current):$.style.display=eo.current?"block":"none");let g=Math.floor(C[0]/2),v=E?et?[C[0],g]:[g-1,0]:C;if($.style.zIndex=`${function(e,t,r){if(t instanceof l.PerspectiveCamera||t instanceof l.OrthographicCamera){let i=u.setFromMatrixPosition(e.matrixWorld),o=f.setFromMatrixPosition(t.matrixWorld),a=i.distanceTo(o),n=(r[1]-r[0])/(t.far-t.near),l=r[1]-n*t.far;return Math.round(n*a+l)}}(q.current,k,v)}`,P){let[e,t]=[I.width/2,I.height/2],r=k.projectionMatrix.elements[5]*t,{isOrthographicCamera:i,top:o,left:a,bottom:n,right:l}=k,s=p(k.matrixWorldInverse),c=i?`scale(${r})translate(${h(-(l+a)/2)}px,${h((o+n)/2)}px)`:`translateZ(${r}px)`,u=q.current.matrixWorld;M&&((u=k.matrixWorldInverse.clone().transpose().copyPosition(u).scale(q.current.scale)).elements[3]=u.elements[7]=u.elements[11]=0,u.elements[15]=1),$.style.width=I.width+"px",$.style.height=I.height+"px",$.style.perspective=i?"":`${r}px`,X.current&&Z.current&&(X.current.style.transform=`${c}${s}translate(${e}px,${t}px)`,Z.current.style.transform=x(u,1/((S||10)/400)))}else{let t=void 0===S?1:function(e,t){if(t instanceof l.OrthographicCamera)return t.zoom;if(!(t instanceof l.PerspectiveCamera))return 1;{let r=u.setFromMatrixPosition(e.matrixWorld),i=f.setFromMatrixPosition(t.matrixWorld);return 1/(2*Math.tan(t.fov*Math.PI/180/2)*r.distanceTo(i))}}(q.current,k)*S;$.style.transform=`translate3d(${e[0]}px,${e[1]}px,0) scale(${t})`}K.current=e,B.current=k.zoom}}if(!et&&Q.current&&!ee.current)if(P){if(X.current){let e=X.current.children[0];if(null!=e&&e.clientWidth&&null!=e&&e.clientHeight){let{isOrthographicCamera:t}=k;if(t||D)L.scale&&(Array.isArray(L.scale)?L.scale instanceof l.Vector3?Q.current.scale.copy(L.scale.clone().divideScalar(1)):Q.current.scale.set(1/L.scale[0],1/L.scale[1],1/L.scale[2]):Q.current.scale.setScalar(1/L.scale));else{let t=(S||10)/400,r=e.clientWidth*t,i=e.clientHeight*t;Q.current.scale.set(r,i,1)}ee.current=!0}}}else{let t=$.children[0];if(null!=t&&t.clientWidth&&null!=t&&t.clientHeight){let e=1/N.factor,r=t.clientWidth*e,i=t.clientHeight*e;Q.current.scale.set(r,i,1),ee.current=!0}Q.current.lookAt(e.camera.position)}});let ea=o.useMemo(()=>({vertexShader:P?void 0:`
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
      `}),[P]);return o.createElement("group",(0,s.default)({},L,{ref:q}),E&&!et&&o.createElement("mesh",{castShadow:T,receiveShadow:w,ref:Q},D||o.createElement("planeGeometry",null),O||o.createElement("shaderMaterial",{side:l.DoubleSide,vertexShader:ea.vertexShader,fragmentShader:ea.fragmentShader})))});e.s(["Html",()=>y],60099);let F=[0,0,0],b=(0,o.memo)(function({children:e,color:t="white",position:r=F,opacity:s="fadeWithDistance"}){let c="fadeWithDistance"===s,u=(0,o.useRef)(null),f=function(e){let t,{camera:r}=(0,n.useThree)(),i=(0,o.useRef)(null),s=(t=(0,o.useRef)(null),(0,a.useFrame)(()=>{e.current&&(t.current??=new l.Vector3,e.current.getWorldPosition(t.current))}),t);return(0,a.useFrame)(()=>{s.current?i.current=r.position.distanceTo(s.current):i.current=null}),i}(u),[d,m]=(0,o.useState)(0!==s),g=(0,o.useRef)(null);return(0,o.useEffect)(()=>{if(c&&g.current&&null!=f.current){let e=Math.max(0,Math.min(1,1-f.current/200));g.current.style.opacity=e.toString()}},[d,c]),(0,a.useFrame)(()=>{if(c){let e=f.current,t=null!=e&&e<200;if(d!==t&&m(t),g.current&&t){let t=Math.max(0,Math.min(1,1-e/200));g.current.style.opacity=t.toString()}}else m(0!==s),g.current&&(g.current.style.opacity=s.toString())}),(0,i.jsx)("group",{ref:u,children:d?(0,i.jsx)(y,{position:r,center:!0,children:(0,i.jsx)("div",{ref:g,className:"StaticShapeLabel",style:{color:t},children:e})}):null})});e.s(["FloatingLabel",0,b],89887)},51434,e=>{"use strict";var t=e.i(43476),r=e.i(71645),i=e.i(73949),o=e.i(90072);let a=(0,r.createContext)(void 0);function n({children:e}){let{camera:n}=(0,i.useThree)(),[l,s]=(0,r.useState)({audioLoader:null,audioListener:null});return(0,r.useEffect)(()=>{let e=new o.AudioLoader,t=n.children.find(e=>e instanceof o.AudioListener);t||(t=new o.AudioListener,n.add(t)),s({audioLoader:e,audioListener:t})},[n]),(0,t.jsx)(a.Provider,{value:l,children:e})}function l(){let e=(0,r.useContext)(a);if(void 0===e)throw Error("useAudio must be used within AudioProvider");return e}e.s(["AudioProvider",()=>n,"useAudio",()=>l])},61921,e=>{e.v(t=>Promise.all(["static/chunks/d6b468212f2cc982.js"].map(t=>e.l(t))).then(()=>t(29055)))},25147,e=>{e.v(t=>Promise.all(["static/chunks/4d1bea7fed55073e.js"].map(t=>e.l(t))).then(()=>t(63724)))},18599,e=>{e.v(t=>Promise.all(["static/chunks/ae94dbdee9f8feee.js"].map(t=>e.l(t))).then(()=>t(42585)))}]);