(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,31067,e=>{"use strict";function t(){return(t=Object.assign.bind()).apply(null,arguments)}e.s(["default",()=>t])},47071,99143,e=>{"use strict";var t=e.i(71645),r=e.i(90072),i=e.i(15080),s=e.i(40859);e.s(["useLoader",()=>s.G],99143);var s=s;let a=e=>e===Object(e)&&!Array.isArray(e)&&"function"!=typeof e;function n(e,n){let o=(0,i.useThree)(e=>e.gl),l=(0,s.G)(r.TextureLoader,a(e)?Object.values(e):e);return(0,t.useLayoutEffect)(()=>{null==n||n(l)},[n]),(0,t.useEffect)(()=>{if("initTexture"in o){let e=[];Array.isArray(l)?e=l:l instanceof r.Texture?e=[l]:a(l)&&(e=Object.values(l)),e.forEach(e=>{e instanceof r.Texture&&o.initTexture(e)})}},[o,l]),(0,t.useMemo)(()=>{if(!a(e))return l;{let t={},r=0;for(let i in e)t[i]=l[r++];return t}},[e,l])}n.preload=e=>s.G.preload(r.TextureLoader,e),n.clear=e=>s.G.clear(r.TextureLoader,e),e.s(["useTexture",()=>n],47071)},75567,e=>{"use strict";var t=e.i(90072);let r=new t.ImageBitmapLoader,i=new Map;function s(e,s){let a=i.get(e);if(a)return s&&a.image&&s(a),a;let n=new t.Texture;return n.flipY=!1,i.set(e,n),r.load(e,e=>{n.image=e,n.needsUpdate=!0,s?.(n)}),n}function a(e){let s=i.get(e);return s?s.image?Promise.resolve(s):new Promise(e=>{let t=()=>{s.image?e(s):setTimeout(t,16)};t()}):new Promise((s,a)=>{let n=new t.Texture;n.flipY=!1,i.set(e,n),r.load(e,e=>{n.image=e,n.needsUpdate=!0,s(n)},void 0,a)})}function n(e,r={}){let{repeat:i=[1,1],disableMipmaps:s=!1}=r;return e.wrapS=e.wrapT=t.RepeatWrapping,e.colorSpace=t.SRGBColorSpace,e.repeat.set(...i),e.flipY=!1,e.anisotropy=16,s?(e.generateMipmaps=!1,e.minFilter=t.LinearFilter):(e.generateMipmaps=!0,e.minFilter=t.LinearMipmapLinearFilter),e.magFilter=t.LinearFilter,e.needsUpdate=!0,e}function o(e){let r=new t.DataTexture(e,256,256,t.RedFormat,t.UnsignedByteType);return r.colorSpace=t.NoColorSpace,r.wrapS=r.wrapT=t.RepeatWrapping,r.generateMipmaps=!1,r.minFilter=t.LinearFilter,r.magFilter=t.LinearFilter,r.needsUpdate=!0,r}e.s(["loadTexture",()=>s,"loadTextureAsync",()=>a,"setupMask",()=>o,"setupTexture",()=>n])},47021,e=>{"use strict";var t=e.i(8560);let r=`
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
`}function s(e,t){e.uniforms.fogVolumeData=t.fogVolumeData,e.uniforms.cameraHeight=t.cameraHeight,e.uniforms.fogEnabled=t.fogEnabled,e.vertexShader=e.vertexShader.replace("#include <fog_pars_vertex>",`#include <fog_pars_vertex>
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
#endif`),e.fragmentShader=e.fragmentShader.replace("#include <fog_fragment>",r)}e.s(["fogFragmentShader",0,r,"injectCustomFog",()=>s,"installCustomFogShader",()=>i])},48066,e=>{"use strict";let t={fogVolumeData:{value:new Float32Array(12)},cameraHeight:{value:0},fogEnabled:{value:!0}};function r(e,i,s=!0){t.cameraHeight.value=e,t.fogVolumeData.value.set(i),t.fogEnabled.value=s}function i(){t.cameraHeight.value=0,t.fogVolumeData.value.fill(0),t.fogEnabled.value=!0}function s(e){let t=new Float32Array(12);for(let r=0;r<3;r++){let i=4*r,s=e[r];s&&(t[i+0]=s.visibleDistance,t[i+1]=s.minHeight,t[i+2]=s.maxHeight,t[i+3]=s.percentage)}return t}e.s(["globalFogUniforms",0,t,"packFogVolumeData",()=>s,"resetGlobalFogUniforms",()=>i,"updateGlobalFogUniforms",()=>r])},15823,e=>{"use strict";var t=class{constructor(){this.listeners=new Set,this.subscribe=this.subscribe.bind(this)}subscribe(e){return this.listeners.add(e),this.onSubscribe(),()=>{this.listeners.delete(e),this.onUnsubscribe()}}hasListeners(){return this.listeners.size>0}onSubscribe(){}onUnsubscribe(){}};e.s(["Subscribable",()=>t])},19273,80166,e=>{"use strict";e.i(47167);var t={setTimeout:(e,t)=>setTimeout(e,t),clearTimeout:e=>clearTimeout(e),setInterval:(e,t)=>setInterval(e,t),clearInterval:e=>clearInterval(e)},r=new class{#e=t;#t=!1;setTimeoutProvider(e){this.#e=e}setTimeout(e,t){return this.#e.setTimeout(e,t)}clearTimeout(e){this.#e.clearTimeout(e)}setInterval(e,t){return this.#e.setInterval(e,t)}clearInterval(e){this.#e.clearInterval(e)}};function i(e){setTimeout(e,0)}e.s(["systemSetTimeoutZero",()=>i,"timeoutManager",()=>r],80166);var s="u"<typeof window||"Deno"in globalThis;function a(){}function n(e,t){return"function"==typeof e?e(t):e}function o(e){return"number"==typeof e&&e>=0&&e!==1/0}function l(e,t){return Math.max(e+(t||0)-Date.now(),0)}function u(e,t){return"function"==typeof e?e(t):e}function c(e,t){return"function"==typeof e?e(t):e}function h(e,t){let{type:r="all",exact:i,fetchStatus:s,predicate:a,queryKey:n,stale:o}=e;if(n){if(i){if(t.queryHash!==d(n,t.options))return!1}else if(!v(t.queryKey,n))return!1}if("all"!==r){let e=t.isActive();if("active"===r&&!e||"inactive"===r&&e)return!1}return("boolean"!=typeof o||t.isStale()===o)&&(!s||s===t.state.fetchStatus)&&(!a||!!a(t))}function f(e,t){let{exact:r,status:i,predicate:s,mutationKey:a}=e;if(a){if(!t.options.mutationKey)return!1;if(r){if(p(t.options.mutationKey)!==p(a))return!1}else if(!v(t.options.mutationKey,a))return!1}return(!i||t.state.status===i)&&(!s||!!s(t))}function d(e,t){return(t?.queryKeyHashFn||p)(e)}function p(e){return JSON.stringify(e,(e,t)=>b(t)?Object.keys(t).sort().reduce((e,r)=>(e[r]=t[r],e),{}):t)}function v(e,t){return e===t||typeof e==typeof t&&!!e&&!!t&&"object"==typeof e&&"object"==typeof t&&Object.keys(t).every(r=>v(e[r],t[r]))}var m=Object.prototype.hasOwnProperty;function g(e,t){if(!t||Object.keys(e).length!==Object.keys(t).length)return!1;for(let r in e)if(e[r]!==t[r])return!1;return!0}function y(e){return Array.isArray(e)&&e.length===Object.keys(e).length}function b(e){if(!S(e))return!1;let t=e.constructor;if(void 0===t)return!0;let r=t.prototype;return!!S(r)&&!!r.hasOwnProperty("isPrototypeOf")&&Object.getPrototypeOf(e)===Object.prototype}function S(e){return"[object Object]"===Object.prototype.toString.call(e)}function O(e){return new Promise(t=>{r.setTimeout(t,e)})}function T(e,t,r){return"function"==typeof r.structuralSharing?r.structuralSharing(e,t):!1!==r.structuralSharing?function e(t,r,i=0){if(t===r)return t;if(i>500)return r;let s=y(t)&&y(r);if(!s&&!(b(t)&&b(r)))return r;let a=(s?t:Object.keys(t)).length,n=s?r:Object.keys(r),o=n.length,l=s?Array(o):{},u=0;for(let c=0;c<o;c++){let o=s?c:n[c],h=t[o],f=r[o];if(h===f){l[o]=h,(s?c<a:m.call(t,o))&&u++;continue}if(null===h||null===f||"object"!=typeof h||"object"!=typeof f){l[o]=f;continue}let d=e(h,f,i+1);l[o]=d,d===h&&u++}return a===o&&u===a?t:l}(e,t):t}function F(e,t,r=0){let i=[...e,t];return r&&i.length>r?i.slice(1):i}function R(e,t,r=0){let i=[t,...e];return r&&i.length>r?i.slice(0,-1):i}var E=Symbol();function w(e,t){return!e.queryFn&&t?.initialPromise?()=>t.initialPromise:e.queryFn&&e.queryFn!==E?e.queryFn:()=>Promise.reject(Error(`Missing queryFn: '${e.queryHash}'`))}function C(e,t){return"function"==typeof e?e(...t):!!e}function D(e,t,r){let i,s=!1;return Object.defineProperty(e,"signal",{enumerable:!0,get:()=>(i??=t(),s||(s=!0,i.aborted?r():i.addEventListener("abort",r,{once:!0})),i)}),e}e.s(["addConsumeAwareSignal",()=>D,"addToEnd",()=>F,"addToStart",()=>R,"ensureQueryFn",()=>w,"functionalUpdate",()=>n,"hashKey",()=>p,"hashQueryKeyByOptions",()=>d,"isServer",()=>s,"isValidTimeout",()=>o,"matchMutation",()=>f,"matchQuery",()=>h,"noop",()=>a,"partialMatchKey",()=>v,"replaceData",()=>T,"resolveEnabled",()=>c,"resolveStaleTime",()=>u,"shallowEqualObjects",()=>g,"shouldThrowError",()=>C,"skipToken",()=>E,"sleep",()=>O,"timeUntilStale",()=>l],19273)},75555,e=>{"use strict";var t=e.i(15823),r=e.i(19273),i=new class extends t.Subscribable{#r;#i;#s;constructor(){super(),this.#s=e=>{if(!r.isServer&&window.addEventListener){let t=()=>e();return window.addEventListener("visibilitychange",t,!1),()=>{window.removeEventListener("visibilitychange",t)}}}}onSubscribe(){this.#i||this.setEventListener(this.#s)}onUnsubscribe(){this.hasListeners()||(this.#i?.(),this.#i=void 0)}setEventListener(e){this.#s=e,this.#i?.(),this.#i=e(e=>{"boolean"==typeof e?this.setFocused(e):this.onFocus()})}setFocused(e){this.#r!==e&&(this.#r=e,this.onFocus())}onFocus(){let e=this.isFocused();this.listeners.forEach(t=>{t(e)})}isFocused(){return"boolean"==typeof this.#r?this.#r:globalThis.document?.visibilityState!=="hidden"}};e.s(["focusManager",()=>i])},40143,e=>{"use strict";let t,r,i,s,a,n;var o=e.i(80166).systemSetTimeoutZero,l=(t=[],r=0,i=e=>{e()},s=e=>{e()},a=o,{batch:e=>{let n;r++;try{n=e()}finally{let e;--r||(e=t,t=[],e.length&&a(()=>{s(()=>{e.forEach(e=>{i(e)})})}))}return n},batchCalls:e=>(...t)=>{n(()=>{e(...t)})},schedule:n=e=>{r?t.push(e):a(()=>{i(e)})},setNotifyFunction:e=>{i=e},setBatchNotifyFunction:e=>{s=e},setScheduler:e=>{a=e}});e.s(["notifyManager",()=>l])},86491,14448,93803,36553,88587,e=>{"use strict";e.i(47167);var t=e.i(19273),r=e.i(40143),i=e.i(75555),s=e.i(15823),a=new class extends s.Subscribable{#a=!0;#i;#s;constructor(){super(),this.#s=e=>{if(!t.isServer&&window.addEventListener){let t=()=>e(!0),r=()=>e(!1);return window.addEventListener("online",t,!1),window.addEventListener("offline",r,!1),()=>{window.removeEventListener("online",t),window.removeEventListener("offline",r)}}}}onSubscribe(){this.#i||this.setEventListener(this.#s)}onUnsubscribe(){this.hasListeners()||(this.#i?.(),this.#i=void 0)}setEventListener(e){this.#s=e,this.#i?.(),this.#i=e(this.setOnline.bind(this))}setOnline(e){this.#a!==e&&(this.#a=e,this.listeners.forEach(t=>{t(e)}))}isOnline(){return this.#a}};function n(){let e,t,r=new Promise((r,i)=>{e=r,t=i});function i(e){Object.assign(r,e),delete r.resolve,delete r.reject}return r.status="pending",r.catch(()=>{}),r.resolve=t=>{i({status:"fulfilled",value:t}),e(t)},r.reject=e=>{i({status:"rejected",reason:e}),t(e)},r}function o(e){return Math.min(1e3*2**e,3e4)}function l(e){return(e??"online")!=="online"||a.isOnline()}e.s(["onlineManager",()=>a],14448),e.s(["pendingThenable",()=>n],93803);var u=class extends Error{constructor(e){super("CancelledError"),this.revert=e?.revert,this.silent=e?.silent}};function c(e){let r,s=!1,c=0,h=n(),f=()=>i.focusManager.isFocused()&&("always"===e.networkMode||a.isOnline())&&e.canRun(),d=()=>l(e.networkMode)&&e.canRun(),p=e=>{"pending"===h.status&&(r?.(),h.resolve(e))},v=e=>{"pending"===h.status&&(r?.(),h.reject(e))},m=()=>new Promise(t=>{r=e=>{("pending"!==h.status||f())&&t(e)},e.onPause?.()}).then(()=>{r=void 0,"pending"===h.status&&e.onContinue?.()}),g=()=>{let r;if("pending"!==h.status)return;let i=0===c?e.initialPromise:void 0;try{r=i??e.fn()}catch(e){r=Promise.reject(e)}Promise.resolve(r).then(p).catch(r=>{if("pending"!==h.status)return;let i=e.retry??3*!t.isServer,a=e.retryDelay??o,n="function"==typeof a?a(c,r):a,l=!0===i||"number"==typeof i&&c<i||"function"==typeof i&&i(c,r);s||!l?v(r):(c++,e.onFail?.(c,r),(0,t.sleep)(n).then(()=>f()?void 0:m()).then(()=>{s?v(r):g()}))})};return{promise:h,status:()=>h.status,cancel:t=>{if("pending"===h.status){let r=new u(t);v(r),e.onCancel?.(r)}},continue:()=>(r?.(),h),cancelRetry:()=>{s=!0},continueRetry:()=>{s=!1},canStart:d,start:()=>(d()?g():m().then(g),h)}}e.s(["CancelledError",()=>u,"canFetch",()=>l,"createRetryer",()=>c],36553);var h=e.i(80166),f=class{#n;destroy(){this.clearGcTimeout()}scheduleGc(){this.clearGcTimeout(),(0,t.isValidTimeout)(this.gcTime)&&(this.#n=h.timeoutManager.setTimeout(()=>{this.optionalRemove()},this.gcTime))}updateGcTime(e){this.gcTime=Math.max(this.gcTime||0,e??(t.isServer?1/0:3e5))}clearGcTimeout(){this.#n&&(h.timeoutManager.clearTimeout(this.#n),this.#n=void 0)}};e.s(["Removable",()=>f],88587);var d=class extends f{#o;#l;#u;#c;#h;#f;#d;constructor(e){super(),this.#d=!1,this.#f=e.defaultOptions,this.setOptions(e.options),this.observers=[],this.#c=e.client,this.#u=this.#c.getQueryCache(),this.queryKey=e.queryKey,this.queryHash=e.queryHash,this.#o=m(this.options),this.state=e.state??this.#o,this.scheduleGc()}get meta(){return this.options.meta}get promise(){return this.#h?.promise}setOptions(e){if(this.options={...this.#f,...e},this.updateGcTime(this.options.gcTime),this.state&&void 0===this.state.data){let e=m(this.options);void 0!==e.data&&(this.setState(v(e.data,e.dataUpdatedAt)),this.#o=e)}}optionalRemove(){this.observers.length||"idle"!==this.state.fetchStatus||this.#u.remove(this)}setData(e,r){let i=(0,t.replaceData)(this.state.data,e,this.options);return this.#p({data:i,type:"success",dataUpdatedAt:r?.updatedAt,manual:r?.manual}),i}setState(e,t){this.#p({type:"setState",state:e,setStateOptions:t})}cancel(e){let r=this.#h?.promise;return this.#h?.cancel(e),r?r.then(t.noop).catch(t.noop):Promise.resolve()}destroy(){super.destroy(),this.cancel({silent:!0})}reset(){this.destroy(),this.setState(this.#o)}isActive(){return this.observers.some(e=>!1!==(0,t.resolveEnabled)(e.options.enabled,this))}isDisabled(){return this.getObserversCount()>0?!this.isActive():this.options.queryFn===t.skipToken||this.state.dataUpdateCount+this.state.errorUpdateCount===0}isStatic(){return this.getObserversCount()>0&&this.observers.some(e=>"static"===(0,t.resolveStaleTime)(e.options.staleTime,this))}isStale(){return this.getObserversCount()>0?this.observers.some(e=>e.getCurrentResult().isStale):void 0===this.state.data||this.state.isInvalidated}isStaleByTime(e=0){return void 0===this.state.data||"static"!==e&&(!!this.state.isInvalidated||!(0,t.timeUntilStale)(this.state.dataUpdatedAt,e))}onFocus(){let e=this.observers.find(e=>e.shouldFetchOnWindowFocus());e?.refetch({cancelRefetch:!1}),this.#h?.continue()}onOnline(){let e=this.observers.find(e=>e.shouldFetchOnReconnect());e?.refetch({cancelRefetch:!1}),this.#h?.continue()}addObserver(e){this.observers.includes(e)||(this.observers.push(e),this.clearGcTimeout(),this.#u.notify({type:"observerAdded",query:this,observer:e}))}removeObserver(e){this.observers.includes(e)&&(this.observers=this.observers.filter(t=>t!==e),this.observers.length||(this.#h&&(this.#d?this.#h.cancel({revert:!0}):this.#h.cancelRetry()),this.scheduleGc()),this.#u.notify({type:"observerRemoved",query:this,observer:e}))}getObserversCount(){return this.observers.length}invalidate(){this.state.isInvalidated||this.#p({type:"invalidate"})}async fetch(e,r){let i;if("idle"!==this.state.fetchStatus&&this.#h?.status()!=="rejected"){if(void 0!==this.state.data&&r?.cancelRefetch)this.cancel({silent:!0});else if(this.#h)return this.#h.continueRetry(),this.#h.promise}if(e&&this.setOptions(e),!this.options.queryFn){let e=this.observers.find(e=>e.options.queryFn);e&&this.setOptions(e.options)}let s=new AbortController,a=e=>{Object.defineProperty(e,"signal",{enumerable:!0,get:()=>(this.#d=!0,s.signal)})},n=()=>{let e,i=(0,t.ensureQueryFn)(this.options,r),s=(a(e={client:this.#c,queryKey:this.queryKey,meta:this.meta}),e);return(this.#d=!1,this.options.persister)?this.options.persister(i,s,this):i(s)},o=(a(i={fetchOptions:r,options:this.options,queryKey:this.queryKey,client:this.#c,state:this.state,fetchFn:n}),i);this.options.behavior?.onFetch(o,this),this.#l=this.state,("idle"===this.state.fetchStatus||this.state.fetchMeta!==o.fetchOptions?.meta)&&this.#p({type:"fetch",meta:o.fetchOptions?.meta}),this.#h=c({initialPromise:r?.initialPromise,fn:o.fetchFn,onCancel:e=>{e instanceof u&&e.revert&&this.setState({...this.#l,fetchStatus:"idle"}),s.abort()},onFail:(e,t)=>{this.#p({type:"failed",failureCount:e,error:t})},onPause:()=>{this.#p({type:"pause"})},onContinue:()=>{this.#p({type:"continue"})},retry:o.options.retry,retryDelay:o.options.retryDelay,networkMode:o.options.networkMode,canRun:()=>!0});try{let e=await this.#h.start();if(void 0===e)throw Error(`${this.queryHash} data is undefined`);return this.setData(e),this.#u.config.onSuccess?.(e,this),this.#u.config.onSettled?.(e,this.state.error,this),e}catch(e){if(e instanceof u){if(e.silent)return this.#h.promise;else if(e.revert){if(void 0===this.state.data)throw e;return this.state.data}}throw this.#p({type:"error",error:e}),this.#u.config.onError?.(e,this),this.#u.config.onSettled?.(this.state.data,e,this),e}finally{this.scheduleGc()}}#p(e){let t=t=>{switch(e.type){case"failed":return{...t,fetchFailureCount:e.failureCount,fetchFailureReason:e.error};case"pause":return{...t,fetchStatus:"paused"};case"continue":return{...t,fetchStatus:"fetching"};case"fetch":return{...t,...p(t.data,this.options),fetchMeta:e.meta??null};case"success":let r={...t,...v(e.data,e.dataUpdatedAt),dataUpdateCount:t.dataUpdateCount+1,...!e.manual&&{fetchStatus:"idle",fetchFailureCount:0,fetchFailureReason:null}};return this.#l=e.manual?r:void 0,r;case"error":let i=e.error;return{...t,error:i,errorUpdateCount:t.errorUpdateCount+1,errorUpdatedAt:Date.now(),fetchFailureCount:t.fetchFailureCount+1,fetchFailureReason:i,fetchStatus:"idle",status:"error",isInvalidated:!0};case"invalidate":return{...t,isInvalidated:!0};case"setState":return{...t,...e.state}}};this.state=t(this.state),r.notifyManager.batch(()=>{this.observers.forEach(e=>{e.onQueryUpdate()}),this.#u.notify({query:this,type:"updated",action:e})})}};function p(e,t){return{fetchFailureCount:0,fetchFailureReason:null,fetchStatus:l(t.networkMode)?"fetching":"paused",...void 0===e&&{error:null,status:"pending"}}}function v(e,t){return{data:e,dataUpdatedAt:t??Date.now(),error:null,isInvalidated:!1,status:"success"}}function m(e){let t="function"==typeof e.initialData?e.initialData():e.initialData,r=void 0!==t,i=r?"function"==typeof e.initialDataUpdatedAt?e.initialDataUpdatedAt():e.initialDataUpdatedAt:0;return{data:t,dataUpdateCount:0,dataUpdatedAt:r?i??Date.now():0,error:null,errorUpdateCount:0,errorUpdatedAt:0,fetchFailureCount:0,fetchFailureReason:null,fetchMeta:null,isInvalidated:!1,status:r?"success":"pending",fetchStatus:"idle"}}e.s(["Query",()=>d,"fetchState",()=>p],86491)},69230,e=>{"use strict";var t=e.i(75555),r=e.i(40143),i=e.i(86491),s=e.i(15823),a=e.i(93803),n=e.i(19273),o=e.i(80166),l=class extends s.Subscribable{constructor(e,t){super(),this.options=t,this.#c=e,this.#v=null,this.#m=(0,a.pendingThenable)(),this.bindMethods(),this.setOptions(t)}#c;#g=void 0;#y=void 0;#b=void 0;#S;#O;#m;#v;#T;#F;#R;#E;#w;#C;#D=new Set;bindMethods(){this.refetch=this.refetch.bind(this)}onSubscribe(){1===this.listeners.size&&(this.#g.addObserver(this),u(this.#g,this.options)?this.#I():this.updateResult(),this.#U())}onUnsubscribe(){this.hasListeners()||this.destroy()}shouldFetchOnReconnect(){return c(this.#g,this.options,this.options.refetchOnReconnect)}shouldFetchOnWindowFocus(){return c(this.#g,this.options,this.options.refetchOnWindowFocus)}destroy(){this.listeners=new Set,this.#P(),this.#x(),this.#g.removeObserver(this)}setOptions(e){let t=this.options,r=this.#g;if(this.options=this.#c.defaultQueryOptions(e),void 0!==this.options.enabled&&"boolean"!=typeof this.options.enabled&&"function"!=typeof this.options.enabled&&"boolean"!=typeof(0,n.resolveEnabled)(this.options.enabled,this.#g))throw Error("Expected enabled to be a boolean or a callback that returns a boolean");this.#M(),this.#g.setOptions(this.options),t._defaulted&&!(0,n.shallowEqualObjects)(this.options,t)&&this.#c.getQueryCache().notify({type:"observerOptionsUpdated",query:this.#g,observer:this});let i=this.hasListeners();i&&h(this.#g,r,this.options,t)&&this.#I(),this.updateResult(),i&&(this.#g!==r||(0,n.resolveEnabled)(this.options.enabled,this.#g)!==(0,n.resolveEnabled)(t.enabled,this.#g)||(0,n.resolveStaleTime)(this.options.staleTime,this.#g)!==(0,n.resolveStaleTime)(t.staleTime,this.#g))&&this.#_();let s=this.#Q();i&&(this.#g!==r||(0,n.resolveEnabled)(this.options.enabled,this.#g)!==(0,n.resolveEnabled)(t.enabled,this.#g)||s!==this.#C)&&this.#k(s)}getOptimisticResult(e){var t,r;let i=this.#c.getQueryCache().build(this.#c,e),s=this.createResult(i,e);return t=this,r=s,(0,n.shallowEqualObjects)(t.getCurrentResult(),r)||(this.#b=s,this.#O=this.options,this.#S=this.#g.state),s}getCurrentResult(){return this.#b}trackResult(e,t){return new Proxy(e,{get:(e,r)=>(this.trackProp(r),t?.(r),"promise"===r&&(this.trackProp("data"),this.options.experimental_prefetchInRender||"pending"!==this.#m.status||this.#m.reject(Error("experimental_prefetchInRender feature flag is not enabled"))),Reflect.get(e,r))})}trackProp(e){this.#D.add(e)}getCurrentQuery(){return this.#g}refetch({...e}={}){return this.fetch({...e})}fetchOptimistic(e){let t=this.#c.defaultQueryOptions(e),r=this.#c.getQueryCache().build(this.#c,t);return r.fetch().then(()=>this.createResult(r,t))}fetch(e){return this.#I({...e,cancelRefetch:e.cancelRefetch??!0}).then(()=>(this.updateResult(),this.#b))}#I(e){this.#M();let t=this.#g.fetch(this.options,e);return e?.throwOnError||(t=t.catch(n.noop)),t}#_(){this.#P();let e=(0,n.resolveStaleTime)(this.options.staleTime,this.#g);if(n.isServer||this.#b.isStale||!(0,n.isValidTimeout)(e))return;let t=(0,n.timeUntilStale)(this.#b.dataUpdatedAt,e);this.#E=o.timeoutManager.setTimeout(()=>{this.#b.isStale||this.updateResult()},t+1)}#Q(){return("function"==typeof this.options.refetchInterval?this.options.refetchInterval(this.#g):this.options.refetchInterval)??!1}#k(e){this.#x(),this.#C=e,!n.isServer&&!1!==(0,n.resolveEnabled)(this.options.enabled,this.#g)&&(0,n.isValidTimeout)(this.#C)&&0!==this.#C&&(this.#w=o.timeoutManager.setInterval(()=>{(this.options.refetchIntervalInBackground||t.focusManager.isFocused())&&this.#I()},this.#C))}#U(){this.#_(),this.#k(this.#Q())}#P(){this.#E&&(o.timeoutManager.clearTimeout(this.#E),this.#E=void 0)}#x(){this.#w&&(o.timeoutManager.clearInterval(this.#w),this.#w=void 0)}createResult(e,t){let r,s=this.#g,o=this.options,l=this.#b,c=this.#S,d=this.#O,p=e!==s?e.state:this.#y,{state:v}=e,m={...v},g=!1;if(t._optimisticResults){let r=this.hasListeners(),a=!r&&u(e,t),n=r&&h(e,s,t,o);(a||n)&&(m={...m,...(0,i.fetchState)(v.data,e.options)}),"isRestoring"===t._optimisticResults&&(m.fetchStatus="idle")}let{error:y,errorUpdatedAt:b,status:S}=m;r=m.data;let O=!1;if(void 0!==t.placeholderData&&void 0===r&&"pending"===S){let e;l?.isPlaceholderData&&t.placeholderData===d?.placeholderData?(e=l.data,O=!0):e="function"==typeof t.placeholderData?t.placeholderData(this.#R?.state.data,this.#R):t.placeholderData,void 0!==e&&(S="success",r=(0,n.replaceData)(l?.data,e,t),g=!0)}if(t.select&&void 0!==r&&!O)if(l&&r===c?.data&&t.select===this.#T)r=this.#F;else try{this.#T=t.select,r=t.select(r),r=(0,n.replaceData)(l?.data,r,t),this.#F=r,this.#v=null}catch(e){this.#v=e}this.#v&&(y=this.#v,r=this.#F,b=Date.now(),S="error");let T="fetching"===m.fetchStatus,F="pending"===S,R="error"===S,E=F&&T,w=void 0!==r,C={status:S,fetchStatus:m.fetchStatus,isPending:F,isSuccess:"success"===S,isError:R,isInitialLoading:E,isLoading:E,data:r,dataUpdatedAt:m.dataUpdatedAt,error:y,errorUpdatedAt:b,failureCount:m.fetchFailureCount,failureReason:m.fetchFailureReason,errorUpdateCount:m.errorUpdateCount,isFetched:m.dataUpdateCount>0||m.errorUpdateCount>0,isFetchedAfterMount:m.dataUpdateCount>p.dataUpdateCount||m.errorUpdateCount>p.errorUpdateCount,isFetching:T,isRefetching:T&&!F,isLoadingError:R&&!w,isPaused:"paused"===m.fetchStatus,isPlaceholderData:g,isRefetchError:R&&w,isStale:f(e,t),refetch:this.refetch,promise:this.#m,isEnabled:!1!==(0,n.resolveEnabled)(t.enabled,e)};if(this.options.experimental_prefetchInRender){let t=void 0!==C.data,r="error"===C.status&&!t,i=e=>{r?e.reject(C.error):t&&e.resolve(C.data)},n=()=>{i(this.#m=C.promise=(0,a.pendingThenable)())},o=this.#m;switch(o.status){case"pending":e.queryHash===s.queryHash&&i(o);break;case"fulfilled":(r||C.data!==o.value)&&n();break;case"rejected":r&&C.error===o.reason||n()}}return C}updateResult(){let e=this.#b,t=this.createResult(this.#g,this.options);if(this.#S=this.#g.state,this.#O=this.options,void 0!==this.#S.data&&(this.#R=this.#g),(0,n.shallowEqualObjects)(t,e))return;this.#b=t;let r=()=>{if(!e)return!0;let{notifyOnChangeProps:t}=this.options,r="function"==typeof t?t():t;if("all"===r||!r&&!this.#D.size)return!0;let i=new Set(r??this.#D);return this.options.throwOnError&&i.add("error"),Object.keys(this.#b).some(t=>this.#b[t]!==e[t]&&i.has(t))};this.#L({listeners:r()})}#M(){let e=this.#c.getQueryCache().build(this.#c,this.options);if(e===this.#g)return;let t=this.#g;this.#g=e,this.#y=e.state,this.hasListeners()&&(t?.removeObserver(this),e.addObserver(this))}onQueryUpdate(){this.updateResult(),this.hasListeners()&&this.#U()}#L(e){r.notifyManager.batch(()=>{e.listeners&&this.listeners.forEach(e=>{e(this.#b)}),this.#c.getQueryCache().notify({query:this.#g,type:"observerResultsUpdated"})})}};function u(e,t){return!1!==(0,n.resolveEnabled)(t.enabled,e)&&void 0===e.state.data&&("error"!==e.state.status||!1!==t.retryOnMount)||void 0!==e.state.data&&c(e,t,t.refetchOnMount)}function c(e,t,r){if(!1!==(0,n.resolveEnabled)(t.enabled,e)&&"static"!==(0,n.resolveStaleTime)(t.staleTime,e)){let i="function"==typeof r?r(e):r;return"always"===i||!1!==i&&f(e,t)}return!1}function h(e,t,r,i){return(e!==t||!1===(0,n.resolveEnabled)(i.enabled,e))&&(!r.suspense||"error"!==e.state.status)&&f(e,r)}function f(e,t){return!1!==(0,n.resolveEnabled)(t.enabled,e)&&e.isStaleByTime((0,n.resolveStaleTime)(t.staleTime,e))}e.s(["QueryObserver",()=>l])},12598,e=>{"use strict";var t=e.i(71645),r=e.i(43476),i=t.createContext(void 0),s=e=>{let r=t.useContext(i);if(e)return e;if(!r)throw Error("No QueryClient set, use QueryClientProvider to set one");return r},a=({client:e,children:s})=>(t.useEffect(()=>(e.mount(),()=>{e.unmount()}),[e]),(0,r.jsx)(i.Provider,{value:e,children:s}));e.s(["QueryClientProvider",()=>a,"useQueryClient",()=>s])},69637,54440,e=>{"use strict";let t;e.i(47167);var r=e.i(71645),i=e.i(19273),s=e.i(40143),a=e.i(12598);e.i(43476);var n=r.createContext((t=!1,{clearReset:()=>{t=!1},reset:()=>{t=!0},isReset:()=>t})),o=r.createContext(!1);o.Provider;var l=(e,t)=>void 0===t.state.data,u=e=>{if(e.suspense){let t=e=>"static"===e?e:Math.max(e??1e3,1e3),r=e.staleTime;e.staleTime="function"==typeof r?(...e)=>t(r(...e)):t(r),"number"==typeof e.gcTime&&(e.gcTime=Math.max(e.gcTime,1e3))}},c=(e,t)=>e.isLoading&&e.isFetching&&!t,h=(e,t)=>e?.suspense&&t.isPending,f=(e,t,r)=>t.fetchOptimistic(e).catch(()=>{r.clearReset()});function d(e,t,l){let d,p=r.useContext(o),v=r.useContext(n),m=(0,a.useQueryClient)(l),g=m.defaultQueryOptions(e);m.getDefaultOptions().queries?._experimental_beforeQuery?.(g);let y=m.getQueryCache().get(g.queryHash);g._optimisticResults=p?"isRestoring":"optimistic",u(g),d=y?.state.error&&"function"==typeof g.throwOnError?(0,i.shouldThrowError)(g.throwOnError,[y.state.error,y]):g.throwOnError,(g.suspense||g.experimental_prefetchInRender||d)&&!v.isReset()&&(g.retryOnMount=!1),r.useEffect(()=>{v.clearReset()},[v]);let b=!m.getQueryCache().get(g.queryHash),[S]=r.useState(()=>new t(m,g)),O=S.getOptimisticResult(g),T=!p&&!1!==e.subscribed;if(r.useSyncExternalStore(r.useCallback(e=>{let t=T?S.subscribe(s.notifyManager.batchCalls(e)):i.noop;return S.updateResult(),t},[S,T]),()=>S.getCurrentResult(),()=>S.getCurrentResult()),r.useEffect(()=>{S.setOptions(g)},[g,S]),h(g,O))throw f(g,S,v);if((({result:e,errorResetBoundary:t,throwOnError:r,query:s,suspense:a})=>e.isError&&!t.isReset()&&!e.isFetching&&s&&(a&&void 0===e.data||(0,i.shouldThrowError)(r,[e.error,s])))({result:O,errorResetBoundary:v,throwOnError:g.throwOnError,query:y,suspense:g.suspense}))throw O.error;if(m.getDefaultOptions().queries?._experimental_afterQuery?.(g,O),g.experimental_prefetchInRender&&!i.isServer&&c(O,p)){let e=b?f(g,S,v):y?.promise;e?.catch(i.noop).finally(()=>{S.updateResult()})}return g.notifyOnChangeProps?O:S.trackResult(O)}e.s(["defaultThrowOnError",()=>l,"ensureSuspenseTimers",()=>u,"fetchOptimistic",()=>f,"shouldSuspend",()=>h,"willFetch",()=>c],54440),e.s(["useBaseQuery",()=>d],69637)},6112,e=>{"use strict";e.i(13876);var t=e.i(58647);function r(e){return(0,t.useDatablockByName)(e)}e.s(["useDatablock",()=>r])},61921,e=>{e.v(e=>Promise.resolve().then(()=>e(29055)))},25147,e=>{e.v(t=>Promise.all(["static/chunks/8c435435e00c1d09.js"].map(t=>e.l(t))).then(()=>t(63724)))},18599,e=>{e.v(t=>Promise.all(["static/chunks/13f8b467e8aa89cb.js"].map(t=>e.l(t))).then(()=>t(42585)))},84968,e=>{e.v(t=>Promise.all(["static/chunks/6e9a6efec350bf8d.js"].map(t=>e.l(t))).then(()=>t(90208)))},59197,e=>{e.v(t=>Promise.all(["static/chunks/0be79f7f5e0597a7.css","static/chunks/1cf33c843f96e1c9.js"].map(t=>e.l(t))).then(()=>t(94247)))}]);