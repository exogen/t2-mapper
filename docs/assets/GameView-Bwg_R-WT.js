const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/PlayerModel-C4jDbboC.js","assets/rolldown-runtime-hePW80VL.js","assets/jsx-runtime-D-_CyhZk.js","assets/events-156d8d12.esm-u8ZdQWGw.js","assets/three.core-D2MYdXnG.js","assets/traditional-BqzB-TXK.js","assets/Html-7-p0wMXb.js","assets/extends-CvVTau-c.js","assets/SettingsProvider-STR3uEYi.js","assets/manifest-CTPEHx6t.js","assets/stringUtils-vX3ozUe5.js","assets/engineStore-TsZbH-7k.js","assets/useQuery-Cgn-QeYs.js","assets/playbackUtils-DCZPIgXN.js","assets/textureUtils-BDyZvo5u.js","assets/loaders-Df6o7-AK.js","assets/logger-Bxdu8KBw.js","assets/mission-YkVy6CTi.js","assets/useAnisotropy-BSWf219v.js","assets/AudioEmitter-CuNATM2w.js","assets/cameraTourStore-D45m1hbf.js","assets/DebugBounds-rkBbCQYv.js","assets/AudioEmitter-DAQByNim.css","assets/DebugSuspense-9LpIrRmQ.js","assets/streamPlaybackStore-CDo7lZK5.js","assets/PlayerModel-Bi7C0zGW.css","assets/ExplosionShape-CyDRGk9w.js","assets/Projectiles-CL2p2by3.js","assets/Texture-dMmR1muP.js","assets/ForceFieldBare-DRCDthIE.js","assets/WaterBlock-Cz-VhdxO.js","assets/scene-B-9Votyg.js","assets/coordinates-bjK4fu3T.js","assets/StreamingController-BBtJ3pR4.js","assets/gameEntityStore-AGl9qJWl.js","assets/gameEntityTypes-qal89oKy.js","assets/DebugElements-BGAxQkkb.js","assets/DebugElements-BP0b5jan.css","assets/Mission-CVvI3lYr.js","assets/ChatSoundPlayer-CND8tv0u.js"])))=>i.map(i=>d[i]);
import{r as e}from"./rolldown-runtime-hePW80VL.js";import{n as t,r as n,t as r}from"./jsx-runtime-D-_CyhZk.js";import{_ as i,a,b as o,c as s,d as c,f as l,g as u,h as d,l as f,m as p,n as m,p as h,s as g,t as _,u as v,y}from"./events-156d8d12.esm-u8ZdQWGw.js";import{t as b}from"./Html-7-p0wMXb.js";import{a as x,i as S}from"./SettingsProvider-STR3uEYi.js";import{t as C}from"./useQuery-Cgn-QeYs.js";import{$n as w,A as T,B as E,Ba as D,Ft as O,Gi as k,H as A,It as j,Ja as M,Ji as N,Kt as P,Lt as F,Nn as I,Pi as L,R,Ri as ee,T as z,Ya as B,et as te,fr as ne,io as re,k as ie,kt as ae,ut as oe,vt as se,zr as ce}from"./three.core-D2MYdXnG.js";import{a as le,d as ue,l as de,o as fe,s as pe,u as me}from"./PlayerModel-C4jDbboC.js";import{S as he,b as ge,o as V,v as _e,x as ve}from"./playbackUtils-DCZPIgXN.js";import{a as H,c as ye,d as be,i as xe,o as Se,r as Ce,s as we,t as Te,u as Ee}from"./textureUtils-BDyZvo5u.js";import{f as De,o as Oe,p as U,s as ke,t as Ae,u as je}from"./loaders-Df6o7-AK.js";import{t as Me}from"./logger-Bxdu8KBw.js";import{n as Ne}from"./stringUtils-vX3ozUe5.js";import"./mission-YkVy6CTi.js";import{a as Pe}from"./engineStore-TsZbH-7k.js";import{t as Fe}from"./extends-CvVTau-c.js";import{t as Ie}from"./Texture-dMmR1muP.js";import{t as W}from"./preload-helper-ChRdW8rs.js";import{t as Le}from"./useAnisotropy-BSWf219v.js";import{d as Re,l as ze}from"./AudioEmitter-CuNATM2w.js";import{n as Be,r as Ve,t as G}from"./cameraTourStore-D45m1hbf.js";import{n as He,t as Ue}from"./DebugBounds-rkBbCQYv.js";import{t as We}from"./DebugSuspense-9LpIrRmQ.js";import{n as Ge}from"./streamPlaybackStore-CDo7lZK5.js";import{h as Ke,m as qe,n as Je,p as Ye,r as Xe,t as Ze}from"./gameEntityStore-AGl9qJWl.js";import{n as Qe,t as $e}from"./commandCircuitStore-BFyh_E-h.js";import{i as et,o as tt,r as nt,s as rt,t as it}from"./InputProducer-CdrWLIcF.js";import{r as at,t as ot}from"./liveConnectionStore-Dfx8ZLZ9.js";import{S as st,t as K}from"./streamHelpers--wQlCJBo.js";import{n as ct,r as lt,t as ut}from"./coordinates-bjK4fu3T.js";import{n as dt,r as ft}from"./StreamEngine-5drA_MiV.js";import{o as pt}from"./usePlayback-CxAxw9mc.js";import{n as mt,r as ht}from"./InputContext-A9W6K8jK.js";import{a as gt,c as _t,f as vt,i as yt,l as bt,n as xt,o as St,r as Ct,s as wt,t as Tt,u as Et}from"./InputControls-Cu_hklsB.js";import{t as Dt}from"./gameEntityTypes-qal89oKy.js";var q=t(),J=r(),Y=e(n(),1);function Ot(e,t){let n;return(...r)=>{window.clearTimeout(n),n=window.setTimeout(()=>e(...r),t)}}function kt({debounce:e,scroll:t,polyfill:n,offsetSize:r}={debounce:0,scroll:!1,offsetSize:!1}){let i=n||(typeof window>`u`?class{}:window.ResizeObserver);if(!i)throw Error(`This browser does not support ResizeObserver out of the box. See: https://github.com/react-spring/react-use-measure/#resize-observer-polyfills`);let[a,o]=(0,Y.useState)({left:0,top:0,width:0,height:0,bottom:0,right:0,x:0,y:0}),s=(0,Y.useRef)({element:null,scrollContainers:null,resizeObserver:null,lastBounds:a,orientationHandler:null}),c=e?typeof e==`number`?e:e.scroll:null,l=e?typeof e==`number`?e:e.resize:null,u=(0,Y.useRef)(!1);(0,Y.useEffect)(()=>(u.current=!0,()=>void(u.current=!1)));let[d,f,p]=(0,Y.useMemo)(()=>{let e=()=>{if(!s.current.element)return;let{left:e,top:t,width:n,height:i,bottom:a,right:c,x:l,y:d}=s.current.element.getBoundingClientRect(),f={left:e,top:t,width:n,height:i,bottom:a,right:c,x:l,y:d};s.current.element instanceof HTMLElement&&r&&(f.height=s.current.element.offsetHeight,f.width=s.current.element.offsetWidth),Object.freeze(f),u.current&&!Pt(s.current.lastBounds,f)&&o(s.current.lastBounds=f)};return[e,l?Ot(e,l):e,c?Ot(e,c):e]},[o,r,c,l]);function m(){s.current.scrollContainers&&(s.current.scrollContainers.forEach(e=>e.removeEventListener(`scroll`,p,!0)),s.current.scrollContainers=null),s.current.resizeObserver&&(s.current.resizeObserver.disconnect(),s.current.resizeObserver=null),s.current.orientationHandler&&(`orientation`in screen&&`removeEventListener`in screen.orientation?screen.orientation.removeEventListener(`change`,s.current.orientationHandler):`onorientationchange`in window&&window.removeEventListener(`orientationchange`,s.current.orientationHandler))}function h(){s.current.element&&(s.current.resizeObserver=new i(p),s.current.resizeObserver.observe(s.current.element),t&&s.current.scrollContainers&&s.current.scrollContainers.forEach(e=>e.addEventListener(`scroll`,p,{capture:!0,passive:!0})),s.current.orientationHandler=()=>{p()},`orientation`in screen&&`addEventListener`in screen.orientation?screen.orientation.addEventListener(`change`,s.current.orientationHandler):`onorientationchange`in window&&window.addEventListener(`orientationchange`,s.current.orientationHandler))}return jt(p,!!t),At(f),(0,Y.useEffect)(()=>{m(),h()},[t,p,f]),(0,Y.useEffect)(()=>m,[]),[e=>{!e||e===s.current.element||(m(),s.current.element=e,s.current.scrollContainers=Mt(e),h())},a,d]}function At(e){(0,Y.useEffect)(()=>{let t=e;return window.addEventListener(`resize`,t),()=>void window.removeEventListener(`resize`,t)},[e])}function jt(e,t){(0,Y.useEffect)(()=>{if(t){let t=e;return window.addEventListener(`scroll`,t,{capture:!0,passive:!0}),()=>void window.removeEventListener(`scroll`,t,!0)}},[e,t])}function Mt(e){let t=[];if(!e||e===document.body)return t;let{overflow:n,overflowX:r,overflowY:i}=window.getComputedStyle(e);return[n,r,i].some(e=>e===`auto`||e===`scroll`)&&t.push(e),[...t,...Mt(e.parentElement)]}var Nt=[`x`,`y`,`top`,`bottom`,`left`,`right`,`width`,`height`],Pt=(e,t)=>Nt.every(n=>e[n]===t[n]);o();function Ft({ref:e,children:t,fallback:n,resize:r,style:i,gl:o,events:l=a,eventSource:u,eventPrefix:p,shadows:b,linear:x,flat:S,legacy:C,orthographic:w,frameloop:T,dpr:E,performance:D,raycaster:O,camera:k,scene:A,onPointerMissed:j,onCreated:M,...N}){Y.useMemo(()=>s(y),[]);let P=c(),[F,I]=kt({scroll:!0,debounce:{scroll:50,resize:0},...r}),L=Y.useRef(null),R=Y.useRef(null);Y.useImperativeHandle(e,()=>L.current);let ee=d(j),[z,B]=Y.useState(!1),[te,ne]=Y.useState(!1);if(z)throw z;if(te)throw te;let re=Y.useRef(null);return h(()=>{let e=L.current;if(I.width>0&&I.height>0&&e){re.current||=g(e);async function n(){await re.current.configure({gl:o,scene:A,events:l,shadows:b,linear:x,flat:S,legacy:C,orthographic:w,frameloop:T,dpr:E,performance:D,raycaster:O,camera:k,size:I,onPointerMissed:(...e)=>ee.current==null?void 0:ee.current(...e),onCreated:e=>{e.events.connect==null||e.events.connect(u?f(u)?u.current:u:R.current),p&&e.setEvents({compute:(e,t)=>{let n=e[p+`X`],r=e[p+`Y`];t.pointer.set(n/t.size.width*2-1,-(r/t.size.height)*2+1),t.raycaster.setFromCamera(t.pointer,t.camera)}}),M?.(e)}}),re.current.render((0,J.jsx)(P,{children:(0,J.jsx)(m,{set:ne,children:(0,J.jsx)(Y.Suspense,{fallback:(0,J.jsx)(_,{set:B}),children:t??null})})}))}n()}}),Y.useEffect(()=>{let e=L.current;if(e)return()=>v(e)},[]),(0,J.jsx)(`div`,{ref:R,style:{position:`relative`,width:`100%`,height:`100%`,overflow:`hidden`,pointerEvents:u?`none`:`auto`,...i},...N,children:(0,J.jsx)(`div`,{ref:F,style:{width:`100%`,height:`100%`},children:(0,J.jsx)(`canvas`,{ref:L,style:{display:`block`},children:n})})})}function It(e){return(0,J.jsx)(i,{children:(0,J.jsx)(Ft,{...e})})}function Lt(e,t,n){let r=u(e=>e.size),i=u(e=>e.viewport),a=typeof e==`number`?e:r.width*i.dpr,o=typeof t==`number`?t:r.height*i.dpr,s=(typeof e==`number`?n:e)||{},{samples:c=0,depth:l,...d}=s,f=l??s.depthBuffer,p=Y.useMemo(()=>{let e=new re(a,o,{minFilter:I,magFilter:I,type:P,...d});return f&&(e.depthTexture=new se(a,o,j)),e.samples=c,e},[]);return Y.useLayoutEffect(()=>{p.setSize(a,o),c&&(p.samples=c)},[c,p,a,o]),Y.useEffect(()=>()=>p.dispose(),[]),p}var Rt=e=>typeof e==`function`,zt=Y.forwardRef(({envMap:e,resolution:t=256,frames:n=1/0,children:r,makeDefault:i,...a},o)=>{let s=u(({set:e})=>e),c=u(({camera:e})=>e),d=u(({size:e})=>e),f=Y.useRef(null);Y.useImperativeHandle(o,()=>f.current,[]);let p=Y.useRef(null),m=Lt(t);Y.useLayoutEffect(()=>{a.manual||f.current.updateProjectionMatrix()},[d,a]),Y.useLayoutEffect(()=>{f.current.updateProjectionMatrix()}),Y.useLayoutEffect(()=>{if(i){let e=c;return s(()=>({camera:f.current})),()=>s(()=>({camera:e}))}},[f,i,s]);let h=0,g=null,_=Rt(r);return l(t=>{_&&(n===1/0||h<n)&&(p.current.visible=!1,t.gl.setRenderTarget(m),g=t.scene.background,e&&(t.scene.background=e),t.gl.render(t.scene,f.current),t.scene.background=g,t.gl.setRenderTarget(null),p.current.visible=!0,h++)}),Y.createElement(Y.Fragment,null,Y.createElement(`orthographicCamera`,Fe({left:d.width/-2,right:d.width/2,top:d.height/2,bottom:d.height/-2,ref:f},a),!_&&r),Y.createElement(`group`,{ref:p},_&&r(m.texture)))}),Bt=e=>typeof e==`function`,Vt=Y.forwardRef(({envMap:e,resolution:t=256,frames:n=1/0,makeDefault:r,children:i,...a},o)=>{let s=u(({set:e})=>e),c=u(({camera:e})=>e),d=u(({size:e})=>e),f=Y.useRef(null);Y.useImperativeHandle(o,()=>f.current,[]);let p=Y.useRef(null),m=Lt(t);Y.useLayoutEffect(()=>{a.manual||(f.current.aspect=d.width/d.height)},[d,a]),Y.useLayoutEffect(()=>{f.current.updateProjectionMatrix()});let h=0,g=null,_=Bt(i);return l(t=>{_&&(n===1/0||h<n)&&(p.current.visible=!1,t.gl.setRenderTarget(m),g=t.scene.background,e&&(t.scene.background=e),t.gl.render(t.scene,f.current),t.scene.background=g,t.gl.setRenderTarget(null),p.current.visible=!0,h++)}),Y.useLayoutEffect(()=>{if(r){let e=c;return s(()=>({camera:f.current})),()=>s(()=>({camera:e}))}},[f,r,s]),Y.createElement(Y.Fragment,null,Y.createElement(`perspectiveCamera`,Fe({ref:f},a),!_&&i),Y.createElement(`group`,{ref:p},_&&i(m.texture)))});function Ht(e,{path:t}){let[n]=p(te,[e],e=>e.setPath(t));return n}Ht.preload=(e,{path:t})=>p.preload(te,[e],e=>e.setPath(t));var Ut={sunLightPointsDown:{value:!0}};function Wt(e){Ut.sunLightPointsDown.value=e}var Gt=Me(`SceneLighting`);function Kt(){let e=(0,q.c)(6),t=Ke(),n,r;if(e[0]===t?(n=e[1],r=e[2]):(n=()=>{t?Gt.debug(`sunData: dir=(%s, %s, %s) color=(%s, %s, %s) ambient=(%s, %s, %s)`,t.direction.x.toFixed(3),t.direction.y.toFixed(3),t.direction.z.toFixed(3),t.color.r.toFixed(3),t.color.g.toFixed(3),t.color.b.toFixed(3),t.ambient.r.toFixed(3),t.ambient.g.toFixed(3),t.ambient.b.toFixed(3)):Gt.debug(`No sunData — using fallback ambient #888`)},r=[t],e[0]=t,e[1]=n,e[2]=r),(0,Y.useEffect)(n,r),!t){let t;return e[3]===Symbol.for(`react.memo_cache_sentinel`)?(t=(0,J.jsx)(`ambientLight`,{color:`#888888`,intensity:1}),e[3]=t):t=e[3],t}let i;return e[4]===t?i=e[5]:(i=(0,J.jsx)(qt,{sunData:t}),e[4]=t,e[5]=i),i}function qt(e){let t=(0,q.c)(29),{sunData:n}=e,r;t[0]===n.direction?r=t[1]:(r=lt(n.direction),t[0]=n.direction,t[1]=r);let[i,a,o]=r,s=Math.sqrt(i*i+a*a+o*o),c=i/s,l=a/s,u=o/s,d;t[2]!==c||t[3]!==l||t[4]!==u?(d=new B(c,l,u),t[2]=c,t[3]=l,t[4]=u,t[5]=d):d=t[5];let f=d,p=-f.x*5e3,m=-f.y*5e3,h=-f.z*5e3,g;t[6]!==p||t[7]!==m||t[8]!==h?(g=new B(p,m,h),t[6]=p,t[7]=m,t[8]=h,t[9]=g):g=t[9];let _=g,v;t[10]!==n.color.b||t[11]!==n.color.g||t[12]!==n.color.r?(v=new A(n.color.r,n.color.g,n.color.b),t[10]=n.color.b,t[11]=n.color.g,t[12]=n.color.r,t[13]=v):v=t[13];let y=v,b;t[14]!==n.ambient.b||t[15]!==n.ambient.g||t[16]!==n.ambient.r?(b=new A(n.ambient.r,n.ambient.g,n.ambient.b),t[14]=n.ambient.b,t[15]=n.ambient.g,t[16]=n.ambient.r,t[17]=b):b=t[17];let x=b,S=f.y<0,C,w;t[18]===S?(C=t[19],w=t[20]):(C=()=>{Wt(S)},w=[S],t[18]=S,t[19]=C,t[20]=w),(0,Y.useEffect)(C,w);let T;t[21]!==y||t[22]!==_?(T=(0,J.jsx)(`directionalLight`,{position:_,color:y,intensity:1,castShadow:!0,"shadow-mapSize-width":8192,"shadow-mapSize-height":8192,"shadow-camera-left":-4096,"shadow-camera-right":4096,"shadow-camera-top":4096,"shadow-camera-bottom":-4096,"shadow-camera-near":100,"shadow-camera-far":12e3,"shadow-bias":-1e-5,"shadow-normalBias":.4,"shadow-radius":2}),t[21]=y,t[22]=_,t[23]=T):T=t[23];let E;t[24]===x?E=t[25]:(E=(0,J.jsx)(`ambientLight`,{color:x,intensity:1}),t[24]=x,t[25]=E);let D;return t[26]!==T||t[27]!==E?(D=(0,J.jsxs)(J.Fragment,{children:[T,E]}),t[26]=T,t[27]=E,t[28]=D):D=t[28],D}function Jt(){let e=(0,q.c)(4),{fpsLimit:t}=x(),n=u(Yt),r,i;return e[0]!==t||e[1]!==n?(r=()=>{if(t==null)return;let e=1e3/t,r=0,i;function a(t){i=requestAnimationFrame(a),t-r>=e&&(r=t-(t-r)%e,n())}return i=requestAnimationFrame(a),()=>cancelAnimationFrame(i)},i=[t,n],e[0]=t,e[1]=n,e[2]=r,e[3]=i):(r=e[2],i=e[3]),(0,Y.useEffect)(r,i),t}function Yt(e){return e.invalidate}function Xt(){return Jt(),null}var Zt={toneMapping:0,outputColorSpace:k};function Qt(e){let t=(0,q.c)(11),{children:n,renderOnDemand:r,dpr:i,onCreated:a}=e,o=r!==void 0&&r,{renderOnDemand:s}=S(),c=o||s,{fpsLimit:l}=x(),u=l!=null&&!c,d=c||u?`demand`:`always`,f;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(f={type:1},t[0]=f):f=t[0];let p;t[1]===n?p=t[2]:(p=(0,J.jsx)(Y.Suspense,{children:n}),t[1]=n,t[2]=p);let m;t[3]===u?m=t[4]:(m=u?(0,J.jsx)(Xt,{}):null,t[3]=u,t[4]=m);let h;return t[5]!==i||t[6]!==a||t[7]!==d||t[8]!==p||t[9]!==m?(h=(0,J.jsxs)(It,{frameloop:d,dpr:i,gl:Zt,shadows:f,onCreated:a,children:[p,m]}),t[5]=i,t[6]=a,t[7]=d,t[8]=p,t[9]=m,t[10]=h):h=t[10],h}var $t=1/32,en=(0,Y.createContext)(null);function tn({children:e}){let t=(0,Y.useRef)(void 0),n=(0,Y.useRef)(0),r=(0,Y.useRef)(0);l((e,i)=>{for(n.current+=i;n.current>=$t;)if(n.current-=$t,r.current++,t.current)for(let e of t.current)e(r.current)});let i=(0,Y.useCallback)(e=>(t.current??=new Set,t.current.add(e),()=>{t.current.delete(e)}),[]),a=(0,Y.useCallback)(()=>r.current,[]),o=(0,Y.useCallback)(()=>n.current/$t,[]),s=(0,Y.useMemo)(()=>({subscribe:i,getTick:a,getTickFraction:o}),[i,a,o]);return(0,J.jsx)(en.Provider,{value:s,children:e})}function nn(e){let t=(0,q.c)(5),n=(0,Y.useContext)(en);if(!n)throw Error(`useTick must be used within a TickProvider`);let r=(0,Y.useEffectEvent)(e),i;t[0]!==n||t[1]!==r?(i=()=>n.subscribe(r),t[0]=n,t[1]=r,t[2]=i):i=t[2];let a;t[3]===n?a=t[4]:(a=[n],t[3]=n,t[4]=a),(0,Y.useEffect)(i,a)}function rn(){let e=(0,Y.useContext)(en);if(!e)throw Error(`useGetTickFraction must be used within a TickProvider`);return e.getTickFraction}function an(e){let t=(0,q.c)(14),{entity:n}=e,{registerCamera:r,unregisterCamera:i}=et(),a=(0,Y.useId)(),o=n.cameraDataBlock,s;t[0]===n.position?s=t[1]:(s=n.position?new B(...n.position):new B,t[0]=n.position,t[1]=s);let c=s,l;t[2]===n.rotation?l=t[3]:(l=n.rotation?new ce(...n.rotation):new ce,t[2]=n.rotation,t[3]=l);let u=l,d,f;t[4]!==o||t[5]!==a||t[6]!==c||t[7]!==r||t[8]!==u||t[9]!==i?(d=()=>{if(o===`Observer`){let e={id:a,position:c,rotation:u};return r(e),()=>{i(e)}}},f=[a,o,r,i,c,u],t[4]=o,t[5]=a,t[6]=c,t[7]=r,t[8]=u,t[9]=i,t[10]=d,t[11]=f):(d=t[10],f=t[11]),(0,Y.useEffect)(d,f);let p=Ve(n.id),m;return t[12]===p?m=t[13]:(m=p?(0,J.jsx)(He,{radius:1.5}):null,t[12]=p,t[13]=m),m}function on(e){let t=(0,q.c)(7),{entity:n}=e,r=Ve(n.id),i;t[0]===n.label?i=t[1]:(i=n.label?(0,J.jsx)(Re,{opacity:.6,children:n.label}):null,t[0]=n.label,t[1]=i);let a;t[2]===r?a=t[3]:(a=r&&(0,J.jsx)(He,{radius:1.5}),t[2]=r,t[3]=a);let o;return t[4]!==i||t[5]!==a?(o=(0,J.jsxs)(J.Fragment,{children:[i,a]}),t[4]=i,t[5]=a,t[6]=o):o=t[6],o}function sn(e){let t=new Float32Array(e.length);for(let n=0;n<e.length;n++)t[n]=e[n]/65535;return t}var cn=`
vec3 torqueLinearToSRGB(vec3 linear) {
  vec3 higher = pow(linear, vec3(1.0/2.4)) * 1.055 - 0.055;
  vec3 lower = linear * 12.92;
  return mix(lower, higher, step(vec3(0.0031308), linear));
}

vec3 torqueSRGBToLinear(vec3 srgb) {
  vec3 higher = pow((srgb + 0.055) / 1.055, vec3(2.4));
  vec3 lower = srgb / 12.92;
  return mix(lower, higher, step(vec3(0.04045), srgb));
}
`,ln=`
float torqueDebugGrid(vec2 uv, float gridSize, float lineWidth) {
  vec2 scaledUV = uv * gridSize;
  vec2 grid = abs(fract(scaledUV - 0.5) - 0.5) / fwidth(scaledUV);
  float line = min(grid.x, grid.y);
  return 1.0 - min(line / lineWidth, 1.0);
}
`,un=256,dn=512,fn=64,pn=150;function mn({shader:e,baseTextures:t,alphaTextures:n,visibilityMask:r,tiling:i,detailTexture:a=null,lightmap:o=null}){e.uniforms.sunLightPointsDown=Ut.sunLightPointsDown;let s=t.length;t.forEach((t,n)=>{e.uniforms[`albedo${n}`]={value:t}});let c=n.length;if(n.forEach((t,n)=>{e.uniforms[`maskPacked${n}`]={value:t}}),r&&(e.uniforms.visibilityMask={value:r}),t.forEach((t,n)=>{e.uniforms[`tiling${n}`]={value:i[n]??32}}),o&&(e.uniforms.terrainLightmap={value:o}),a&&(e.uniforms.detailTexture={value:a},e.uniforms.detailTiling={value:fn},e.uniforms.detailFadeDistance={value:pn},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vTerrainWorldPos;`),e.vertexShader=e.vertexShader.replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
vec4 _terrainPos = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  _terrainPos = instanceMatrix * _terrainPos;
#endif
vTerrainWorldPos = (modelMatrix * _terrainPos).xyz;`)),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec2 vTerrainUv;`),e.vertexShader=e.vertexShader.replace(`#include <uv_vertex>`,`#include <uv_vertex>
vTerrainUv = uv;`),e.fragmentShader=`
varying vec2 vTerrainUv;
${Array.from({length:s},(e,t)=>`uniform sampler2D albedo${t};`).join(`
`)}
${Array.from({length:c},(e,t)=>`uniform sampler2D maskPacked${t};`).join(`
`)}
${Array.from({length:s},(e,t)=>`uniform float tiling${t};`).join(`
`)}
${r?`uniform sampler2D visibilityMask;`:``}
${o?`uniform sampler2D terrainLightmap;`:``}
uniform bool sunLightPointsDown;
${a?`uniform sampler2D detailTexture;
uniform float detailTiling;
uniform float detailFadeDistance;
varying vec3 vTerrainWorldPos;`:``}

${cn}
${ln}

// Global variable to store shadow factor from RE_Direct for use in output calculation
float terrainShadowFactor = 1.0;
`+e.fragmentShader,r){let t=`#include <clipping_planes_fragment>`;e.fragmentShader=e.fragmentShader.replace(t,`${t}
  // Early discard for invisible areas (before fog/lighting)
  float visibility = texture2D(visibilityMask, vTerrainUv).r;
  if (visibility < 0.5) {
    discard;
  }
  `)}e.fragmentShader=e.fragmentShader.replace(`#include <map_fragment>`,`
  // Sample base albedo layers (sRGB textures auto-decoded to linear by Three.js)
  vec2 baseUv = vTerrainUv;
  vec3 c0 = texture2D(albedo0, baseUv * vec2(tiling0)).rgb;
  ${s>1?`vec3 c1 = texture2D(albedo1, baseUv * vec2(tiling1)).rgb;`:``}
  ${s>2?`vec3 c2 = texture2D(albedo2, baseUv * vec2(tiling2)).rgb;`:``}
  ${s>3?`vec3 c3 = texture2D(albedo3, baseUv * vec2(tiling3)).rgb;`:``}
  ${s>4?`vec3 c4 = texture2D(albedo4, baseUv * vec2(tiling4)).rgb;`:``}
  ${s>5?`vec3 c5 = texture2D(albedo5, baseUv * vec2(tiling5)).rgb;`:``}

  // Sample alpha masks from packed RGB textures (3 masks per texture).
  // Add +0.5 texel offset: Torque samples alpha at grid corners (integer indices),
  // but GPU linear filtering samples at texel centers. This offset aligns them.
  vec2 alphaUv = baseUv + vec2(0.5 / ${un}.0);
  vec3 maskRGB0 = texture2D(maskPacked0, alphaUv).rgb;
  float a0 = maskRGB0.r;
  ${s>1?`float a1 = maskRGB0.g;`:``}
  ${s>2?`float a2 = maskRGB0.b;`:``}
  ${s>3?`vec3 maskRGB1 = texture2D(maskPacked1, alphaUv).rgb;
  float a3 = maskRGB1.r;`:``}
  ${s>4?`float a4 = maskRGB1.g;`:``}
  ${s>5?`float a5 = maskRGB1.b;`:``}

  // Torque-style additive weighted blending (blender.cc):
  // result = tex0 * alpha0 + tex1 * alpha1 + tex2 * alpha2 + ...
  // Each layer's alpha map defines its contribution weight.
  vec3 blended = c0 * a0;
  ${s>1?`blended += c1 * a1;`:``}
  ${s>2?`blended += c2 * a2;`:``}
  ${s>3?`blended += c3 * a3;`:``}
  ${s>4?`blended += c4 * a4;`:``}
  ${s>5?`blended += c5 * a5;`:``}

  // Assign to diffuseColor before lighting
  vec3 textureColor = blended;

  ${a?`// Detail texture blending (Torque-style multiplicative blend)
  // Sample detail texture at high frequency tiling
  vec3 detailColor = texture2D(detailTexture, baseUv * detailTiling).rgb;

  // Calculate distance-based fade factor using world positions
  // Torque: distFactor = (zeroDetailDistance - distance) / zeroDetailDistance
  float distToCamera = distance(vTerrainWorldPos, cameraPosition);
  float detailFade = clamp(1.0 - distToCamera / detailFadeDistance, 0.0, 1.0);

  // Torque blending: dst * lerp(1.0, detailTexel, fadeFactor)
  // Detail textures are authored with bright values (~0.8 mean), not 0.5 gray
  // Direct multiplication adds subtle darkening for surface detail
  textureColor *= mix(vec3(1.0), detailColor, detailFade);`:``}

  // Store blended texture in diffuseColor (still in linear space here)
  // We'll convert to sRGB in the output calculation
  diffuseColor.rgb = textureColor;
`),o&&(e.fragmentShader=e.fragmentShader.replace(`#include <lights_lambert_pars_fragment>`,`#include <lights_lambert_pars_fragment>

// Override RE_Direct to extract shadow factor for Torque-style gamma-space lighting
#undef RE_Direct
void RE_Direct_TerrainShadow( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  // Torque lighting (terrLighting.cc): if light points up, terrain gets only ambient
  // This prevents shadow acne from light hitting terrain backfaces
  if (!sunLightPointsDown) {
    terrainShadowFactor = 0.0;
    return;
  }
  // directLight.color = sunColor * shadowFactor (shadow already applied by Three.js)
  // Extract shadow factor by comparing to original sun color
  #if ( NUM_DIR_LIGHTS > 0 )
    vec3 originalSunColor = directionalLights[0].color;
    float sunMax = max(max(originalSunColor.r, originalSunColor.g), originalSunColor.b);
    float shadowedMax = max(max(directLight.color.r, directLight.color.g), directLight.color.b);
    terrainShadowFactor = clamp(shadowedMax / max(sunMax, 0.001), 0.0, 1.0);
  #endif
  // Don't add to reflectedLight - we'll compute lighting in gamma space at output
}
#define RE_Direct RE_Direct_TerrainShadow

`),e.fragmentShader=e.fragmentShader.replace(`#include <lights_fragment_begin>`,`vec3 terrainPreLightDirect = reflectedLight.directDiffuse;
#include <lights_fragment_begin>
// Clear indirect diffuse - we'll compute ambient in gamma space
#if defined( RE_IndirectDiffuse )
  irradiance = vec3(0.0);
#endif
`),e.fragmentShader=e.fragmentShader.replace(`#include <lights_fragment_end>`,`#include <lights_fragment_end>
  // Extract dynamic point/spot light contribution by subtracting what was
  // there before lights ran. directDiffuse now has sun + point lights;
  // terrainPreLightDirect was 0, so the difference is all lights.
  // We'll subtract the sun part below and keep just the point/spot part.
  vec3 terrainAllLightsLinear = reflectedLight.directDiffuse - terrainPreLightDirect;
  // Clear Three.js lighting - we compute sun/ambient in gamma space
  reflectedLight.directDiffuse = vec3(0.0);
  reflectedLight.indirectDiffuse = vec3(0.0);
`)),e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,`// Torque-style terrain lighting: output = clamp(lighting × texture, 0, 1) in sRGB space
{
  // Get texture in sRGB space (undo Three.js linear decode)
  vec3 textureSRGB = torqueLinearToSRGB(diffuseColor.rgb);

  ${o?`
  // Sample terrain lightmap for smooth NdotL
  vec2 lightmapUv = vTerrainUv + vec2(0.5 / ${dn}.0);
  float lightmapNdotL = texture2D(terrainLightmap, lightmapUv).r;

  // Get sun and ambient colors from Three.js lights (these ARE sRGB values from mission file)
  // Three.js interprets them as linear, but the numerical values are preserved
  #if ( NUM_DIR_LIGHTS > 0 )
    vec3 sunColorSRGB = directionalLights[0].color;
  #else
    vec3 sunColorSRGB = vec3(0.7);
  #endif
  vec3 ambientColorSRGB = ambientLightColor;

  // Torque formula (terrLighting.cc:471-483):
  // lighting = ambient + NdotL * shadowFactor * sunColor
  // Clamp lighting to [0,1] before multiplying by texture
  vec3 lightingSRGB = clamp(ambientColorSRGB + lightmapNdotL * terrainShadowFactor * sunColorSRGB, 0.0, 1.0);
  `:`
  // No lightmap - use simple ambient lighting
  vec3 lightingSRGB = ambientLightColor;
  `}

  // Torque formula: output = clamp(lighting × texture, 0, 1) in sRGB/gamma space
  vec3 resultSRGB = clamp(lightingSRGB * textureSRGB, 0.0, 1.0);

  // Convert back to linear for Three.js output pipeline
  outgoingLight = torqueSRGBToLinear(resultSRGB) + totalEmissiveRadiance;
  // Add dynamic point/spot light contributions when present.
  // terrainAllLightsLinear includes both directional + point from Three.js.
  // We only add it when point/spot lights exist to avoid double-counting
  // the sun (already computed in gamma space above). The slight sun
  // double-count when points are active is acceptable — point light
  // intensity dominates near the source.
  #if ( NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
    outgoingLight += terrainAllLightsLinear;
  #endif
}
#include <opaque_fragment>`),e.fragmentShader=e.fragmentShader.replace(`#include <tonemapping_fragment>`,`#if DEBUG_MODE
  // Debug mode: overlay green grid matching terrain grid squares (256x256)
  float gridIntensity = torqueDebugGrid(vTerrainUv, 256.0, 1.5);
  vec3 gridColor = vec3(0.0, 0.8, 0.4); // Green
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gridColor, gridIntensity * 0.1);
#endif

#include <tonemapping_fragment>`)}var hn={0:32,1:32,2:32,3:32,4:32,5:32},gn=(0,Y.memo)(function({displacementMap:e,visibilityMask:t,textureNames:n,alphaTextures:r,detailTextureName:i,lightmap:a}){let{debugMode:o}=S(),s=Le(),c=Ie(n.map(e=>De(e)),e=>{e.forEach(e=>xe(e,{anisotropy:s}))}),l=i?U(i):null,u=Ie(l??Ae,e=>{xe(e,{anisotropy:s})}),d=(0,Y.useCallback)(e=>{mn({shader:e,baseTextures:c,alphaTextures:r,visibilityMask:t,tiling:hn,detailTexture:l?u:null,lightmap:a}),Ee(e,H)},[c,r,t,u,l,a]),f=(0,Y.useMemo)(()=>[n.join(`,`),l??`none`,a?a.id:`nolm`,c.map(e=>e.id).join(`,`)].join(`|`),[n,l,a,c]),p=(0,Y.useRef)(null);return(0,Y.useEffect)(()=>{let e=p.current;e&&(e.defines??={},e.defines.DEBUG_MODE=+!!o,e.needsUpdate=!0)},[o]),(0,Y.useEffect)(()=>{let e=p.current;e&&(e.customProgramCacheKey=()=>f,e.needsUpdate=!0)},[f]),(0,J.jsx)(`meshLambertMaterial`,{ref:p,depthWrite:!0,side:0,defines:{DEBUG_MODE:+!!o},onBeforeCompile:d},`${l?`detail`:`nodetail`}-${a?`lightmap`:`nolightmap`}`)}),_n=(0,Y.memo)(function(e){let t=(0,q.c)(8),{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s}=e,c;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(c=(0,J.jsx)(`meshLambertMaterial`,{color:`rgb(0, 109, 56)`,wireframe:!0}),t[0]=c):c=t[0];let l;return t[1]!==a||t[2]!==o||t[3]!==n||t[4]!==s||t[5]!==i||t[6]!==r?(l=(0,J.jsx)(Y.Suspense,{fallback:c,children:(0,J.jsx)(gn,{displacementMap:n,visibilityMask:r,textureNames:i,alphaTextures:a,detailTextureName:o,lightmap:s})}),t[1]=a,t[2]=o,t[3]=n,t[4]=s,t[5]=i,t[6]=r,t[7]=l):l=t[7],l}),vn=(0,Y.memo)(function(e){let t=(0,q.c)(15),{tileX:n,tileZ:r,blockSize:i,basePosition:a,textureNames:o,geometry:s,displacementMap:c,visibilityMask:l,alphaTextures:u,detailTextureName:d,lightmap:f,visible:p}=e,m=p===void 0||p,h=i/2,g=a.x+n*i+h,_=a.z+r*i+h,v;t[0]!==g||t[1]!==_?(v=[g,0,_],t[0]=g,t[1]=_,t[2]=v):v=t[2];let y=v,b;t[3]!==u||t[4]!==d||t[5]!==c||t[6]!==f||t[7]!==o||t[8]!==l?(b=(0,J.jsx)(_n,{displacementMap:c,visibilityMask:l,textureNames:o,alphaTextures:u,detailTextureName:d,lightmap:f}),t[3]=u,t[4]=d,t[5]=c,t[6]=f,t[7]=o,t[8]=l,t[9]=b):b=t[9];let x;return t[10]!==s||t[11]!==y||t[12]!==b||t[13]!==m?(x=(0,J.jsx)(`mesh`,{position:y,geometry:s,castShadow:!0,receiveShadow:!0,visible:m,children:b}),t[10]=s,t[11]=y,t[12]=b,t[13]=m,t[14]=x):x=t[14],x}),yn=Me(`TerrainBlock`),bn=8,xn=600,X=256,Sn=512,Z=2048;function Cn(e,t){let n=new T,r=(t+1)*(t+1),i=new Float32Array(r*3),a=new Float32Array(r*3),o=new Float32Array(r*2),s=t*t*6,c=new Uint32Array(s),l=0,u=e/t;for(let n=0;n<=t;n++)for(let r=0;r<=t;r++){let s=n*(t+1)+r;i[s*3]=r*u-e/2,i[s*3+1]=e/2-n*u,i[s*3+2]=0,a[s*3]=0,a[s*3+1]=0,a[s*3+2]=1,o[s*2]=r/t,o[s*2+1]=1-n/t}for(let e=0;e<t;e++)for(let n=0;n<t;n++){let r=e*(t+1)+n,i=r+1,a=(e+1)*(t+1)+n,o=a+1;(n^e)&1?(c[l++]=r,c[l++]=a,c[l++]=i,c[l++]=i,c[l++]=a,c[l++]=o):(c[l++]=r,c[l++]=a,c[l++]=o,c[l++]=r,c[l++]=o,c[l++]=i)}return n.setIndex(new ie(c,1)),n.setAttribute(`position`,new O(i,3)),n.setAttribute(`normal`,new O(a,3)),n.setAttribute(`uv`,new O(o,2)),n.rotateX(-Math.PI/2),n.rotateY(-Math.PI/2),n}function wn(e,t,n){let r=e.attributes.position,i=e.attributes.uv,a=e.attributes.normal,o=r.array,s=i.array,c=a.array,l=r.count,u=(e,n)=>(e=Math.max(0,Math.min(255,e)),n=Math.max(0,Math.min(255,n)),t[n*X+e]/65535*Z),d=(e,n)=>{e=Math.max(0,Math.min(255,e)),n=Math.max(0,Math.min(255,n));let r=Math.floor(e),i=Math.floor(n),a=Math.min(r+1,255),o=Math.min(i+1,255),s=e-r,c=n-i,l=t[i*X+r]/65535*Z,u=t[i*X+a]/65535*Z,d=t[o*X+r]/65535*Z,f=t[o*X+a]/65535*Z,p=l*(1-s)+u*s,m=d*(1-s)+f*s;return p*(1-c)+m*c};for(let e=0;e<l;e++){let t=s[e*2],r=s[e*2+1],i=u(Math.floor(t*X)&255,Math.floor(r*X)&255);o[e*3+1]=i;let a=t*255,l=r*255,f=d(a-1,l),p=d(a+1,l),m=d(a,l+1),h=d(a,l-1),g=(p-f)/2,_=(m-h)/2,v=n,y=g,b=Math.sqrt(_*_+v*v+y*y);b>0?(_/=b,v/=b,y/=b):(_=0,v=1,y=0),c[e*3]=_,c[e*3+1]=v,c[e*3+2]=y}r.needsUpdate=!0,a.needsUpdate=!0}function Tn(e,t,n,r,i,a){let o=r.z/i,s=r.x/i,c=r.y,l=Math.sqrt(o*o+s*s);if(l<1e-4)return 1;let u=.5/l,d=o*u,f=s*u,p=c*u,m=e,h=t,g=n+.1,_=X*3;for(let e=0;e<_;e++){if(m+=d,h+=f,g+=p,m<0||m>=X||h<0||h>=X||g>Z)return 1;let e=a(m,h);if(g<e)return 0}return 1}function En(e,t,n){let r=(t,n)=>{let r=Math.max(0,Math.min(255,t)),i=Math.max(0,Math.min(255,n)),a=Math.floor(r),o=Math.floor(i),s=Math.min(a+1,255),c=Math.min(o+1,255),l=r-a,u=i-o,d=e[o*X+a]/65535,f=e[o*X+s]/65535,p=e[c*X+a]/65535,m=e[c*X+s]/65535,h=d*(1-l)+f*l,g=p*(1-l)+m*l;return(h*(1-u)+g*u)*Z},i=new B(-t.x,-t.y,-t.z).normalize(),a=new Uint8Array(Sn*Sn),o=.5;for(let e=0;e<Sn;e++)for(let t=0;t<Sn;t++){let s=t/2+.25,c=e/2+.25,l=r(s,c),u=r(s-o,c),d=r(s+o,c),f=r(s,c-o),p=r(s,c+o),m=(d-u)/(2*o),h=-((p-f)/(2*o)),g=n,_=-m,v=Math.sqrt(h*h+g*g+_*_),y=Math.max(0,h/v*i.x+g/v*i.y+_/v*i.z),b=1;y>0&&(b=Tn(s,c,l,i,n,r)),a[e*Sn+t]=Math.floor(y*b*255)}let s=new oe(a,Sn,Sn,L,D);return s.colorSpace=``,s.generateMipmaps=!0,s.wrapS=E,s.wrapT=E,s.magFilter=I,s.minFilter=I,s.needsUpdate=!0,s}function Dn(e){let t=(0,q.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`terrain`,e],queryFn:()=>(yn.debug(`Loading terrain: %s`,e),je(e))},t[0]=e,t[1]=n);let r=C(n),i,a;return t[2]!==r.data||t[3]!==r.error||t[4]!==r.status||t[5]!==e?(i=()=>{yn.debug(`Query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (data ready)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=r.data,t[3]=r.error,t[4]=r.status,t[5]=e,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,Y.useEffect)(i,a),r}function On(){let e=qe();return e&&e.visibleDistance>0?e.visibleDistance:xn}function kn(e){let t=new Uint8Array(X*X);t.fill(255);for(let n of e){let e=n&255,r=n>>8&255,i=n>>16,a=r*X;for(let n=0;n<i;n++){let r=a+e+n;r<t.length&&(t[r]=0)}}let n=new oe(t,X,X,L,D);return n.colorSpace=``,n.wrapS=n.wrapT=E,n.magFilter=ne,n.minFilter=ne,n.needsUpdate=!0,n}var An=(0,Y.memo)(function(e){let t=(0,q.c)(68),{entity:n}=e,r=n.terrainData,i=Ve(n.id),a=r.terrFileName,o=r.squareSize||bn,s=r.detailTextureName||void 0,c=o*256,d=On(),f=Qe(Mn)?Math.max(d,3072):d,p=u(Nn),m=-o*(X/2),h;t[0]===m?h=t[1]:(h={x:m,z:m},t[0]=m,t[1]=h);let g=h,_;t[2]===r.emptySquareRuns?_=t[3]:(_=r.emptySquareRuns??[],t[2]=r.emptySquareRuns,t[3]=_);let v=_,{data:y}=Dn(a),b;bb0:{if(!y){b=null;break bb0}let e=o*256,n;t[4]!==e||t[5]!==o||t[6]!==y.heightMap?(n=Cn(e,X),wn(n,y.heightMap,o),t[4]=e,t[5]=o,t[6]=y.heightMap,t[7]=n):n=t[7],b=n}let x=b,S,C;t[8]!==o||t[9]!==y?(S=()=>{if(y)return ft(dt(y.heightMap,o)),Pn},C=[y,o],t[8]=o,t[9]=y,t[10]=S,t[11]=C):(S=t[10],C=t[11]),(0,Y.useEffect)(S,C);let T=Ke(),E;bb1:{if(!T){let e;t[12]===Symbol.for(`react.memo_cache_sentinel`)?(e=new B(.57735,-.57735,.57735),t[12]=e):e=t[12],E=e;break bb1}let e;t[13]===T.direction?e=t[14]:(e=lt(T.direction),t[13]=T.direction,t[14]=e);let[n,r,i]=e,a=Math.sqrt(n*n+r*r+i*i),o=n/a,s=r/a,c=i/a,l;t[15]!==c||t[16]!==o||t[17]!==s?(l=new B(o,s,c),t[15]=c,t[16]=o,t[17]=s,t[18]=l):l=t[18],E=l}let D=E,O;bb2:{if(!y){O=null;break bb2}let e;t[19]!==o||t[20]!==D||t[21]!==y.heightMap?(e=En(y.heightMap,D,o),t[19]=o,t[20]=D,t[21]=y.heightMap,t[22]=e):e=t[22],O=e}let k=O,A;bb3:{if(!y){A=null;break bb3}let e;if(t[23]!==y.heightMap){let n=sn(y.heightMap);e=new oe(n,X,X,L,j),e.colorSpace=``,e.generateMipmaps=!1,e.wrapS=ee,e.wrapT=ee,e.needsUpdate=!0,t[23]=y.heightMap,t[24]=e}else e=t[24];A=e}let M=A,N;t[25]===v?N=t[26]:(N=kn(v),t[25]=v,t[26]=N);let P=N,F;t[27]===Symbol.for(`react.memo_cache_sentinel`)?(F=kn([]),t[27]=F):F=t[27];let I=F,R;bb4:{if(!y){R=null;break bb4}let e;t[28]===y.alphaMaps?e=t[29]:(e=Ce(y.alphaMaps),t[28]=y.alphaMaps,t[29]=e),R=e}let z=R,te=2*Math.ceil(f/c)+1,ne=te*te-1,re=(0,Y.useRef)(null),ie;t[30]===Symbol.for(`react.memo_cache_sentinel`)?(ie=new w,t[30]=ie):ie=t[30];let ae=ie,se;t[31]===Symbol.for(`react.memo_cache_sentinel`)?(se={xStart:1/0,xEnd:-1/0,zStart:1/0,zEnd:-1/0},t[31]=se):se=t[31];let ce=(0,Y.useRef)(se),le=(0,Y.useRef)(null),ue;if(t[32]!==g||t[33]!==c||t[34]!==p||t[35]!==f?(ue=()=>{let e=re.current;if(!e)return;let t=p.position.x-g.x,n=p.position.z-g.z,r=Math.floor((t-f)/c),i=Math.ceil((t+f)/c),a=Math.floor((n-f)/c),o=Math.ceil((n+f)/c),s=ce.current;if(e===le.current&&r===s.xStart&&i===s.xEnd&&a===s.zStart&&o===s.zEnd)return;le.current=e,s.xStart=r,s.xEnd=i,s.zStart=a,s.zEnd=o;let l=c/2,u=0;for(let t=r;t<i;t++)for(let n=a;n<o;n++)(t!==0||n!==0)&&(ae.makeTranslation(g.x+t*c+l,0,g.z+n*c+l),e.setMatrixAt(u,ae),u++);e.count=u,e.instanceMatrix.needsUpdate=!0},t[32]=g,t[33]=c,t[34]=p,t[35]=f,t[36]=ue):ue=t[36],l(ue),!y||!x||!M||!z)return yn.debug(`Not ready: terrain=%s geometry=%s displacement=%s alpha=%s`,!!y,!!x,!!M,!!z),null;let de=k??void 0,fe;t[37]!==g||t[38]!==c||t[39]!==s||t[40]!==z||t[41]!==P||t[42]!==M||t[43]!==x||t[44]!==de||t[45]!==y.textureNames?(fe=(0,J.jsx)(vn,{tileX:0,tileZ:0,blockSize:c,basePosition:g,textureNames:y.textureNames,geometry:x,displacementMap:M,visibilityMask:P,alphaTextures:z,detailTextureName:s,lightmap:de}),t[37]=g,t[38]=c,t[39]=s,t[40]=z,t[41]=P,t[42]=M,t[43]=x,t[44]=de,t[45]=y.textureNames,t[46]=fe):fe=t[46];let pe;t[47]!==ne||t[48]!==x?(pe=[x,void 0,ne],t[47]=ne,t[48]=x,t[49]=pe):pe=t[49];let me=k??void 0,he;t[50]!==s||t[51]!==z||t[52]!==M||t[53]!==me||t[54]!==y.textureNames?(he=(0,J.jsx)(_n,{displacementMap:M,visibilityMask:I,textureNames:y.textureNames,alphaTextures:z,detailTextureName:s,lightmap:me}),t[50]=s,t[51]=z,t[52]=M,t[53]=me,t[54]=y.textureNames,t[55]=he):he=t[55];let ge;t[56]!==pe||t[57]!==he?(ge=(0,J.jsx)(`instancedMesh`,{ref:re,args:pe,castShadow:!0,receiveShadow:!0,frustumCulled:!1,children:he}),t[56]=pe,t[57]=he,t[58]=ge):ge=t[58];let V;t[59]!==g||t[60]!==c||t[61]!==i||t[62]!==y?(V=i&&y&&(0,J.jsx)(jn,{heightMap:y.heightMap,blockSize:c,basePosition:g}),t[59]=g,t[60]=c,t[61]=i,t[62]=y,t[63]=V):V=t[63];let _e;return t[64]!==fe||t[65]!==ge||t[66]!==V?(_e=(0,J.jsxs)(J.Fragment,{children:[fe,ge,V]}),t[64]=fe,t[65]=ge,t[66]=V,t[67]=_e):_e=t[67],_e});function jn(e){let t=(0,q.c)(15),{heightMap:n,blockSize:r,basePosition:i}=e,a=0;for(let e=0;e<n.length;e++){let t=n[e]/65535*Z;t>a&&(a=t)}let o=i.x+r/2,s=a/2,c=i.z+r/2,l;t[0]!==o||t[1]!==s||t[2]!==c?(l=[o,s,c],t[0]=o,t[1]=s,t[2]=c,t[3]=l):l=t[3];let u=l,d;t[4]!==r||t[5]!==a?(d=[r,a,r],t[4]=r,t[5]=a,t[6]=d):d=t[6];let f=d,p;t[7]!==u||t[8]!==f?(p={center:u,size:f},t[7]=u,t[8]=f,t[9]=p):p=t[9];let m=p,h;t[10]===m.size?h=t[11]:(h=(0,J.jsx)(Ue,{size:m.size}),t[10]=m.size,t[11]=h);let g;return t[12]!==m.center||t[13]!==h?(g=(0,J.jsx)(`group`,{position:m.center,children:h}),t[12]=m.center,t[13]=h,t[14]=g):g=t[14],g}function Mn(e){return e.active}function Nn(e){return e.camera}function Pn(){return ft(null)}function Fn(e,t){let n=t.surfaceOutsideVisible??!1;e.uniforms.useSceneLighting={value:n},e.uniforms.interiorDebugColor={value:n?new B(0,.4,1):new B(1,.2,0)},e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
${cn}
${ln}
uniform bool useSceneLighting;
uniform vec3 interiorDebugColor;
`),e.fragmentShader=e.fragmentShader.replace(`#include <lights_fragment_maps>`,`// Lightmap handled in custom output calculation
#ifdef USE_LIGHTMAP
  vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
#endif`),e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,`// Torque-style lighting: output = clamp(lighting × texture, 0, 1) in sRGB space
// Get texture in sRGB space (undo Three.js linear decode)
vec3 textureSRGB = torqueLinearToSRGB(diffuseColor.rgb);

// Save Three.js computed direct lighting (includes sun + point/spot lights).
// We'll add it back for point/spot light contribution after our gamma-space calc.
vec3 interiorAllLightsLinear = reflectedLight.directDiffuse;

// Compute lighting in sRGB space
vec3 lightingSRGB = vec3(0.0);

if (useSceneLighting) {
  // Three.js computed: reflectedLight = lighting × texture_linear / PI
  // Extract pure lighting: lighting = reflectedLight × PI / texture_linear
  vec3 totalLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  vec3 safeTexLinear = max(diffuseColor.rgb, vec3(0.001));
  vec3 extractedLighting = totalLight * PI / safeTexLinear;
  // NOTE: extractedLighting is ALREADY sRGB values because mission sun/ambient colors
  // are sRGB values (Torque used them directly in gamma space). Three.js treats them
  // as linear but the numerical values are the same. DO NOT convert to sRGB here!
  // IMPORTANT: Torque clamps scene lighting to [0,1] BEFORE adding to lightmap
  // (sceneLighting.cc line 1785: tmp.clamp())
  lightingSRGB = clamp(extractedLighting, 0.0, 1.0);
}

// Add lightmap contribution (for BOTH outside and inside surfaces)
// In Torque, scene lighting is ADDED to lightmaps for outside surfaces at mission load
// (stored in .ml files). Inside surfaces only have base lightmap. Both need lightmap here.
#ifdef USE_LIGHTMAP
  // Lightmap is stored as linear in Three.js (decoded from sRGB texture), convert back
  lightingSRGB += torqueLinearToSRGB(lightMapTexel.rgb);
#endif
// Torque clamps the sum to [0,1] per channel (sceneLighting.cc lines 1817-1827)
lightingSRGB = clamp(lightingSRGB, 0.0, 1.0);

// Torque formula: output = clamp(lighting × texture, 0, 1) in sRGB/gamma space
vec3 resultSRGB = clamp(lightingSRGB * textureSRGB, 0.0, 1.0);

// Convert back to linear for Three.js output pipeline
vec3 resultLinear = torqueSRGBToLinear(resultSRGB);

// Reassign outgoingLight before opaque_fragment consumes it
// Add dynamic point/spot lights when present (avoid sun double-count otherwise)
outgoingLight = resultLinear + totalEmissiveRadiance;
#if ( NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
  outgoingLight += interiorAllLightsLinear;
#endif

#include <opaque_fragment>`),e.fragmentShader=e.fragmentShader.replace(`#include <tonemapping_fragment>`,`// Debug mode: overlay colored grid on top of normal rendering
// Blue grid = SurfaceOutsideVisible (receives scene ambient light)
// Red grid = inside surface (no scene ambient light)
#if DEBUG_MODE && defined(USE_MAP)
  // gridSize=4 creates 4x4 grid per UV tile, lineWidth=1.5 is ~1.5 pixels wide
  float gridIntensity = torqueDebugGrid(vMapUv, 4.0, 1.5);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, interiorDebugColor, gridIntensity * 0.1);
#endif

#include <tonemapping_fragment>`)}var In=Me(`InteriorInstance`);function Ln(e){let t=(0,q.c)(2),n;return t[0]===e?n=t[1]:(n=Oe(e),t[0]=e,t[1]=n),me(n)}function Rn({materialName:e,material:t,lightMap:n}){let r=S()?.debugMode??!1,i=Le(),a=U(e),o=Ie(a,e=>xe(e,{anisotropy:i})),s=new Set(t?.userData?.flag_names??[]).has(`SelfIlluminating`),c=new Set(t?.userData?.surface_flag_names??[]).has(`SurfaceOutsideVisible`),l=(0,Y.useCallback)(e=>{Ee(e,H),Fn(e,{surfaceOutsideVisible:c})},[c]),u=(0,Y.useRef)(null),d=(0,Y.useRef)(null);(0,Y.useEffect)(()=>{let e=u.current??d.current;e&&(e.defines??={},e.defines.DEBUG_MODE=+!!r,e.needsUpdate=!0)},[r]);let f={DEBUG_MODE:+!!r},p=`${c}`;return s?(0,J.jsx)(`meshBasicMaterial`,{ref:u,map:o,toneMapped:!1,defines:f,onBeforeCompile:l},p):(0,J.jsx)(`meshLambertMaterial`,{ref:d,map:o,lightMap:n,toneMapped:!1,defines:f,onBeforeCompile:l},p)}function zn(e){if(!e)return null;let t=e.emissiveMap;return t&&(t.colorSpace=k),t??null}function Bn(e){let t=(0,q.c)(13),{node:n}=e,r;bb0:{if(!n.material){let e;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[0]=e):e=t[0],r=e;break bb0}if(Array.isArray(n.material)){let e;t[1]===n.material?e=t[2]:(e=n.material.map(Vn),t[1]=n.material,t[2]=e),r=e;break bb0}let e;t[3]===n.material?e=t[4]:(e=zn(n.material),t[3]=n.material,t[4]=e);let i;t[5]===e?i=t[6]:(i=[e],t[5]=e,t[6]=i),r=i}let i=r,a;t[7]!==i||t[8]!==n.material?(a=n.material?(0,J.jsx)(We,{name:`InteriorTexture:${Array.isArray(n.material)?n.material[0]?.userData?.resource_path:n.material?.userData?.resource_path??`?`}`,fallback:(0,J.jsx)(`meshStandardMaterial`,{color:`yellow`,wireframe:!0}),children:Array.isArray(n.material)?n.material.map((e,t)=>(0,J.jsx)(Rn,{materialName:e.userData.resource_path,material:e,lightMap:i[t]},t)):(0,J.jsx)(Rn,{materialName:n.material.userData.resource_path,material:n.material,lightMap:i[0]})}):null,t[7]=i,t[8]=n.material,t[9]=a):a=t[9];let o;return t[10]!==n.geometry||t[11]!==a?(o=(0,J.jsx)(`mesh`,{geometry:n.geometry,castShadow:!0,receiveShadow:!0,children:a}),t[10]=n.geometry,t[11]=a,t[12]=o):o=t[12],o}function Vn(e){return zn(e)}var Hn=(0,Y.memo)(function(e){let t=(0,q.c)(27),{interiorFile:n,ghostIndex:r,isTarget:i}=e,a=Ln(n),{nodes:o}=a,s=S()?.debugMode??!1,c;bb0:{if(!i){c=null;break bb0}let e,n;if(t[0]!==a.scene){let r=new z().setFromObject(a.scene);e=new B,n=new B,r.getCenter(e),r.getSize(n),t[0]=a.scene,t[1]=e,t[2]=n}else e=t[1],n=t[2];let r;t[3]!==e.x||t[4]!==e.y||t[5]!==e.z?(r=[e.x,e.y,e.z],t[3]=e.x,t[4]=e.y,t[5]=e.z,t[6]=r):r=t[6];let o=r,s;t[7]!==n.x||t[8]!==n.y||t[9]!==n.z?(s=[n.x,n.y,n.z],t[7]=n.x,t[8]=n.y,t[9]=n.z,t[10]=s):s=t[10];let l=s,u;t[11]!==o||t[12]!==l?(u={center:o,size:l},t[11]=o,t[12]=l,t[13]=u):u=t[13],c=u}let l=c,u;t[14]===Symbol.for(`react.memo_cache_sentinel`)?(u=[0,-Math.PI/2,0],t[14]=u):u=t[14];let d;t[15]===o?d=t[16]:(d=Object.entries(o).filter(Kn).map(qn),t[15]=o,t[16]=d);let f;t[17]!==s||t[18]!==r||t[19]!==n?(f=s?(0,J.jsxs)(Re,{children:[r,`: `,n]}):null,t[17]=s,t[18]=r,t[19]=n,t[20]=f):f=t[20];let p;t[21]===l?p=t[22]:(p=l&&(0,J.jsx)(`group`,{position:l.center,children:(0,J.jsx)(Ue,{size:l.size})}),t[21]=l,t[22]=p);let m;return t[23]!==d||t[24]!==f||t[25]!==p?(m=(0,J.jsxs)(`group`,{rotation:u,children:[d,f,p]}),t[23]=d,t[24]=f,t[25]=p,t[26]=m):m=t[26],m});function Un(e){let t=(0,q.c)(9),{color:n,label:r}=e,i;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(i=(0,J.jsx)(`boxGeometry`,{args:[10,10,10]}),t[0]=i):i=t[0];let a;t[1]===n?a=t[2]:(a=(0,J.jsx)(`meshStandardMaterial`,{color:n,wireframe:!0}),t[1]=n,t[2]=a);let o;t[3]!==n||t[4]!==r?(o=r?(0,J.jsx)(Re,{color:n,children:r}):null,t[3]=n,t[4]=r,t[5]=o):o=t[5];let s;return t[6]!==a||t[7]!==o?(s=(0,J.jsxs)(`mesh`,{children:[i,a,o]}),t[6]=a,t[7]=o,t[8]=s):s=t[8],s}function Wn(e){let t=(0,q.c)(3),{label:n}=e,r=S()?.debugMode??!1,i;return t[0]!==r||t[1]!==n?(i=r?(0,J.jsx)(Un,{color:`red`,label:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}var Gn=(0,Y.memo)(function(e){let t=(0,q.c)(27),{entity:n}=e,r=n.interiorData,i=Ve(n.id),a;t[0]===r.transform.position?a=t[1]:(a=lt(r.transform.position),t[0]=r.transform.position,t[1]=a);let o=a,s;t[2]===r.transform?s=t[3]:(s=ut(r.transform),t[2]=r.transform,t[3]=s);let c=s,l;t[4]===r.scale?l=t[5]:(l=ct(r.scale),t[4]=r.scale,t[5]=l);let u=l,d=`${r.ghostIndex}: ${r.interiorFile}`,f;t[6]===d?f=t[7]:(f=(0,J.jsx)(Wn,{label:d}),t[6]=d,t[7]=f);let p;t[8]===r.interiorFile?p=t[9]:(p=e=>{In.error(`Failed to load %s: %s`,r.interiorFile,e.message)},t[8]=r.interiorFile,t[9]=p);let m=`InteriorModel:${r.interiorFile}`,h;t[10]===Symbol.for(`react.memo_cache_sentinel`)?(h=(0,J.jsx)(Un,{color:`orange`}),t[10]=h):h=t[10];let g;t[11]!==i||t[12]!==r.ghostIndex||t[13]!==r.interiorFile?(g=(0,J.jsx)(Hn,{interiorFile:r.interiorFile,ghostIndex:r.ghostIndex,isTarget:i}),t[11]=i,t[12]=r.ghostIndex,t[13]=r.interiorFile,t[14]=g):g=t[14];let _;t[15]!==m||t[16]!==g?(_=(0,J.jsx)(We,{name:m,fallback:h,children:g}),t[15]=m,t[16]=g,t[17]=_):_=t[17];let v;t[18]!==_||t[19]!==f||t[20]!==p?(v=(0,J.jsx)(ue,{fallback:f,onError:p,children:_}),t[18]=_,t[19]=f,t[20]=p,t[21]=v):v=t[21];let y;return t[22]!==o||t[23]!==c||t[24]!==u||t[25]!==v?(y=(0,J.jsx)(`group`,{position:o,quaternion:c,scale:u,children:v}),t[22]=o,t[23]=c,t[24]=u,t[25]=v,t[26]=y):y=t[26],y});function Kn(e){let[,t]=e;return t.isMesh}function qn(e){let[t,n]=e;return(0,J.jsx)(Bn,{node:n},t)}var Jn=()=>{},Yn=5,Xn=25,Zn=.05;function Qn(e,t,n){let r=e,i=t,a=n;return[a,a,a,a,a,a,i,i,i,a,a,i,r,i,a,a,i,i,i,a,a,a,a,a,a]}function $n(e,t){let n=new Float32Array(Xn);for(let r=0;r<Xn;r++){let i=e[r*3],a=e[r*3+2],o=1.3-Math.sqrt(i*i+a*a)/t;o<.4?o=0:o>.8&&(o=1),n[r]=o}return n}function er(e,t,n,r){let i=new T,a=new Float32Array(75),o=new Float32Array(50),s=Qn(t,n,r),c=e*2/4;for(let t=0;t<Yn;t++)for(let n=0;n<Yn;n++){let r=t*Yn+n,i=-e+n*c,l=e-t*c,u=e*s[r];a[r*3]=i,a[r*3+1]=u,a[r*3+2]=l,o[r*2]=n,o[r*2+1]=t}tr(a);let l=$n(a,e),u=[];for(let e=0;e<4;e++)for(let t=0;t<4;t++){let n=e*Yn+t,r=n+1,i=n+Yn,a=i+1;u.push(n,i,a),u.push(n,a,r)}return i.setIndex(u),i.setAttribute(`position`,new O(a,3)),i.setAttribute(`uv`,new O(o,2)),i.setAttribute(`alpha`,new O(l,1)),i.computeBoundingSphere(),i}function tr(e){let t=t=>({x:e[t*3],y:e[t*3+1],z:e[t*3+2]}),n=(t,n,r,i)=>{e[t*3]=n,e[t*3+1]=r,e[t*3+2]=i},r=t(1),i=t(3),a=t(5),o=t(6),s=t(8),c=t(9),l=t(15),u=t(16),d=t(18),f=t(19),p=t(21),m=t(23),h=a.x+(r.x-a.x)*.5,g=a.y+(r.y-a.y)*.5,_=a.z+(r.z-a.z)*.5;n(0,o.x+(h-o.x)*2,o.y+(g-o.y)*2,o.z+(_-o.z)*2),h=c.x+(i.x-c.x)*.5,g=c.y+(i.y-c.y)*.5,_=c.z+(i.z-c.z)*.5,n(4,s.x+(h-s.x)*2,s.y+(g-s.y)*2,s.z+(_-s.z)*2),h=p.x+(l.x-p.x)*.5,g=p.y+(l.y-p.y)*.5,_=p.z+(l.z-p.z)*.5,n(20,u.x+(h-u.x)*2,u.y+(g-u.y)*2,u.z+(_-u.z)*2),h=m.x+(f.x-m.x)*.5,g=m.y+(f.y-m.y)*.5,_=m.z+(f.z-m.z)*.5,n(24,d.x+(h-d.x)*2,d.y+(g-d.y)*2,d.z+(_-d.z)*2)}function nr(e){return e.wrapS=ee,e.wrapT=ee,e.minFilter=I,e.magFilter=I,e.colorSpace=``,e.needsUpdate=!0,e}var rr=`
  attribute float alpha;

  uniform vec2 uvOffset;

  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    // Apply UV offset for scrolling
    vUv = uv + uvOffset;
    vAlpha = alpha;

    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // Set depth to far plane so clouds are always visible and behind other geometry
    gl_Position = pos.xyww;
  }
`,ir=`
  uniform sampler2D cloudTexture;
  uniform float debugMode;
  uniform int layerIndex;

  varying vec2 vUv;
  varying float vAlpha;

  // Debug grid using screen-space derivatives for sharp, anti-aliased lines
  float debugGrid(vec2 uv, float gridSize, float lineWidth) {
    vec2 scaledUV = uv * gridSize;
    vec2 grid = abs(fract(scaledUV - 0.5) - 0.5) / fwidth(scaledUV);
    float line = min(grid.x, grid.y);
    return 1.0 - min(line / lineWidth, 1.0);
  }

  void main() {
    vec4 texColor = texture2D(cloudTexture, vUv);

    // Tribes 2 uses GL_MODULATE: final = texture × vertex color
    // Vertex color is white with varying alpha, so:
    // Final RGB = Texture RGB × 1.0 = Texture RGB
    // Final Alpha = Texture Alpha × Vertex Alpha
    float finalAlpha = texColor.a * vAlpha;
    vec3 color = texColor.rgb;

    // Debug mode: overlay R/G/B grid for layers 0/1/2
    if (debugMode > 0.5) {
      float gridIntensity = debugGrid(vUv, 4.0, 1.5);
      vec3 gridColor;
      if (layerIndex == 0) {
        gridColor = vec3(1.0, 0.0, 0.0); // Red
      } else if (layerIndex == 1) {
        gridColor = vec3(0.0, 1.0, 0.0); // Green
      } else {
        gridColor = vec3(0.0, 0.0, 1.0); // Blue
      }
      color = mix(color, gridColor, gridIntensity * 0.5);
    }

    // Output clouds with texture color and combined alpha
    gl_FragColor = vec4(color, finalAlpha);
  }
`;function ar({textureUrl:e,radius:t,heightPercent:n,speed:r,windDirection:i,layerIndex:a}){let{debugMode:o}=S(),{animationEnabled:s}=x(),c=(0,Y.useRef)(null),u=Ie(e,nr),d=(0,Y.useMemo)(()=>er(t,n,n-.05,Zn),[t,n]);(0,Y.useEffect)(()=>()=>{d.dispose()},[d]);let f=(0,Y.useMemo)(()=>new N({uniforms:{cloudTexture:{value:u},uvOffset:{value:new M(0,0)},debugMode:{value:+!!o},layerIndex:{value:a}},vertexShader:rr,fragmentShader:ir,transparent:!0,depthWrite:!1,side:2}),[u,o,a]);return(0,Y.useEffect)(()=>()=>{f.dispose()},[f]),l(s?(e,t)=>{let n=t*1e3/32;c.current??=new M(0,0),c.current.x+=i.x*r*n,c.current.y+=i.y*r*n,c.current.x-=Math.floor(c.current.x),c.current.y-=Math.floor(c.current.y),f.uniforms.uvOffset.value.copy(c.current)}:Jn),(0,J.jsx)(`mesh`,{geometry:d,frustumCulled:!1,renderOrder:10,children:(0,J.jsx)(`primitive`,{object:f,attach:`material`})})}var or=7;function sr(e){let t=(0,q.c)(7),n,r;t[0]===e?(n=t[1],r=t[2]):(n=[`detailMapList`,e],r=()=>ke(e),t[0]=e,t[1]=n,t[2]=r);let i=!!e,a;return t[3]!==n||t[4]!==r||t[5]!==i?(a={queryKey:n,queryFn:r,enabled:i},t[3]=n,t[4]=r,t[5]=i,t[6]=a):a=t[6],C(a)}function cr(e){let t=(0,q.c)(18),{scene:n}=e,{data:r}=sr(n.materialList||void 0),i=(n.visibleDistance>0?n.visibleDistance:500)*.95,a;t[0]===n.cloudLayers?a=t[1]:(a=n.cloudLayers.map(ur),t[0]=n.cloudLayers,t[1]=a);let o=a,s;t[2]===n.cloudLayers?s=t[3]:(s=n.cloudLayers.map(lr),t[2]=n.cloudLayers,t[3]=s);let c=s,u;bb0:{let{x:e,y:r}=n.windVelocity;if(e!==0||r!==0){let n;t[4]!==e||t[5]!==r?(n=new M(r,-e).normalize(),t[4]=e,t[5]=r,t[6]=n):n=t[6],u=n;break bb0}let i;t[7]===Symbol.for(`react.memo_cache_sentinel`)?(i=new M(1,0),t[7]=i):i=t[7],u=i}let d=u,f;bb1:{if(!r){let e;t[8]===Symbol.for(`react.memo_cache_sentinel`)?(e=[],t[8]=e):e=t[8],f=e;break bb1}let e;if(t[9]!==c||t[10]!==o||t[11]!==r){e=[];for(let t=0;t<3;t++){let n=r[or+t];n&&e.push({texture:n,height:c[t],speed:o[t]})}t[9]=c,t[10]=o,t[11]=r,t[12]=e}else e=t[12];f=e}let p=f,m=(0,Y.useRef)(null),h;if(t[13]===Symbol.for(`react.memo_cache_sentinel`)?(h=e=>{let{camera:t}=e;m.current&&m.current.position.copy(t.position)},t[13]=h):h=t[13],l(h),!p||p.length===0)return null;let g;return t[14]!==p||t[15]!==i||t[16]!==d?(g=(0,J.jsx)(`group`,{ref:m,children:p.map((e,t)=>{let n=U(e.texture);return(0,J.jsx)(Y.Suspense,{children:(0,J.jsx)(ar,{textureUrl:n,radius:i,heightPercent:e.height,speed:e.speed,windDirection:d,layerIndex:t})},t)})}),t[14]=p,t[15]=i,t[16]=d,t[17]=g):g=t[17],g}function lr(e,t){return e.heightPercent||[.35,.25,.2][t]}function ur(e,t){return e.speed||[1e-4,2e-4,3e-4][t]}(0,Y.createContext)(null),(0,Y.createContext)(null);function dr(e){let t=e.fogDistance,n=e.visibleDistance>0?e.visibleDistance:1e3,{r,g:i,b:a}=e.fogColor,o=new A().setRGB(r,i,a).convertSRGBToLinear(),s=[];for(let t of e.fogVolumes)t.visibleDistance<=0||t.maxHeight<=t.minHeight||s.push({visibleDistance:t.visibleDistance,minHeight:t.minHeight,maxHeight:t.maxHeight,percentage:1});return{fogDistance:t,visibleDistance:n,fogColor:o,fogVolumes:s,fogLine:s.reduce((e,t)=>Math.max(e,t.maxHeight),0),enabled:n>t}}var fr=Me(`Sky`),pr=!1;function mr(e){return[new A().setRGB(e.r,e.g,e.b),new A().setRGB(e.r,e.g,e.b).convertSRGBToLinear()]}function hr(e){let t=(0,q.c)(8),n;t[0]===e?n=t[1]:(n={queryKey:[`detailMapList`,e],queryFn:()=>(fr.debug(`Loading detail map list: %s`,e),ke(e))},t[0]=e,t[1]=n);let r=C(n),i,a;return t[2]!==e||t[3]!==r.data||t[4]!==r.error||t[5]!==r.status?(i=()=>{fr.debug(`DML query status: %s%s%s file=%s`,r.status,r.error?` error=${r.error.message}`:``,r.data?` (${r.data.length} entries)`:` (no data)`,e)},a=[r.status,r.error,r.data,e],t[2]=e,t[3]=r.data,t[4]=r.error,t[5]=r.status,t[6]=i,t[7]=a):(i=t[6],a=t[7]),(0,Y.useEffect)(i,a),r}var gr=60;function _r({skyBoxFiles:e,fogColor:t,fogState:n}){let r=u(e=>e.camera),i=Ht(e,{path:``}),a=!!t,o=(0,Y.useMemo)(()=>r.projectionMatrixInverse,[r]),s=(0,Y.useMemo)(()=>n?Se(n.fogVolumes):new Float32Array(12),[n]),c=(0,Y.useRef)({skybox:{value:i},fogColor:{value:t??new A(0,0,0)},enableFog:{value:a},inverseProjectionMatrix:{value:o},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:H.cameraHeight,fogVolumeData:{value:s},horizonFogHeight:{value:.18}}),l=(0,Y.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return gr/Math.sqrt(e*e+3600)},[n]);return(0,Y.useEffect)(()=>{c.current.skybox.value=i,c.current.fogColor.value=t??new A(0,0,0),c.current.enableFog.value=a,c.current.fogVolumeData.value=s,c.current.horizonFogHeight.value=l},[i,t,a,s,l]),(0,J.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,J.jsxs)(`bufferGeometry`,{children:[(0,J.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,J.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,J.jsx)(`shaderMaterial`,{uniforms:c.current,vertexShader:`
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.9999, 1.0);
          }
        `,fragmentShader:`
          uniform samplerCube skybox;
          uniform vec3 fogColor;
          uniform bool enableFog;
          uniform mat4 inverseProjectionMatrix;
          uniform mat4 cameraMatrixWorld;
          uniform float cameraHeight;
          uniform float fogVolumeData[12];
          uniform float horizonFogHeight;

          varying vec2 vUv;

          // Convert linear to sRGB for display
          // shaderMaterial does NOT get automatic linear->sRGB output conversion
          // Use proper sRGB transfer function (not simplified gamma 2.2) to match Three.js
          vec3 linearToSRGB(vec3 linear) {
            vec3 low = linear * 12.92;
            vec3 high = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
            return mix(low, high, step(vec3(0.0031308), linear));
          }

          void main() {
            vec2 ndc = vUv * 2.0 - 1.0;
            vec4 viewPos = inverseProjectionMatrix * vec4(ndc, 1.0, 1.0);
            viewPos.xyz /= viewPos.w;
            vec3 direction = normalize((cameraMatrixWorld * vec4(viewPos.xyz, 0.0)).xyz);
            direction = vec3(direction.z, direction.y, -direction.x);
            // Sample skybox - Three.js CubeTexture with SRGBColorSpace auto-converts to linear
            vec4 skyColor = textureCube(skybox, direction);
            vec3 finalColor;

            if (enableFog) {
              vec3 effectiveFogColor = fogColor;

              // Calculate how much fog volume the ray passes through
              // For skybox at "infinite" distance, the relevant height is how much
              // of the volume is above/below camera depending on view direction
              float volumeFogInfluence = 0.0;

              for (int i = 0; i < 3; i++) {
                int offset = i * 4;
                float volVisDist = fogVolumeData[offset + 0];
                float volMinH = fogVolumeData[offset + 1];
                float volMaxH = fogVolumeData[offset + 2];
                float volPct = fogVolumeData[offset + 3];

                if (volVisDist <= 0.0) continue;

                // Check if camera is inside this volume
                if (cameraHeight >= volMinH && cameraHeight <= volMaxH) {
                  // Camera is inside the fog volume
                  // Looking horizontally or up at shallow angles means ray travels
                  // through more fog before exiting the volume
                  float heightAboveCamera = volMaxH - cameraHeight;
                  float heightBelowCamera = cameraHeight - volMinH;
                  float volumeHeight = volMaxH - volMinH;

                  // For horizontal rays (direction.y ≈ 0), maximum fog influence
                  // For rays going up steeply, less fog (exits volume quickly)
                  // For rays going down, more fog (travels through volume below)
                  float rayInfluence;
                  if (direction.y >= 0.0) {
                    // Looking up: influence based on how steep we're looking
                    // Shallow angles = long path through fog = high influence
                    rayInfluence = 1.0 - smoothstep(0.0, 0.3, direction.y);
                  } else {
                    // Looking down: always high fog (into the volume)
                    rayInfluence = 1.0;
                  }

                  // Scale by percentage and volume depth factor
                  volumeFogInfluence += rayInfluence * volPct;
                }
              }

              // Base fog factor from view direction (for haze at horizon)
              // In Torque, the fog "bans" (bands) are rendered as geometry from
              // height 0 (HORIZON) to height 60 (OFFSET_HEIGHT) on the skybox.
              // The skybox corner is at mSkyBoxPt.x = mRadius / sqrt(3).
              //
              // horizonFogHeight is the direction.y value where the fog band ends:
              //   horizonFogHeight = 60 / sqrt(skyBoxPt.x^2 + 60^2)
              //
              // For Firestorm (visDist=600): mRadius=570, skyBoxPt.x=329, horizonFogHeight≈0.18
              //
              // Torque renders the fog bands as geometry with linear vertex alpha
              // interpolation. We use a squared curve (t^2) to create a gentler
              // falloff at the top of the gradient, matching Tribes 2's appearance.
              float baseFogFactor;
              if (direction.y <= 0.0) {
                // Looking at or below horizon: full fog
                baseFogFactor = 1.0;
              } else if (direction.y >= horizonFogHeight) {
                // Above fog band: no fog
                baseFogFactor = 0.0;
              } else {
                // Within fog band: squared curve for gentler falloff at top
                float t = direction.y / horizonFogHeight;
                baseFogFactor = (1.0 - t) * (1.0 - t);
              }

              // Combine base fog with volume fog influence
              // When inside a volume, increase fog intensity
              float finalFogFactor = min(1.0, baseFogFactor + volumeFogInfluence * 0.5);

              finalColor = mix(skyColor.rgb, effectiveFogColor, finalFogFactor);
            } else {
              finalColor = skyColor.rgb;
            }
            // Convert linear result to sRGB for display
            gl_FragColor = vec4(linearToSRGB(finalColor), 1.0);
          }
        `,depthWrite:!1,depthTest:!1})]})}function vr(e){let t=(0,q.c)(13),{materialList:n,fogColor:r,fogState:i}=e,{data:a}=hr(n),o;t[0]===a?o=t[1]:(o=a?[U(a[1]),U(a[3]),U(a[4]),U(a[5]),U(a[0]),U(a[2])]:null,t[0]=a,t[1]=o);let s=o,c;t[2]===a?.[6]?c=t[3]:(c=()=>{let e=a?.[6];if(!e)return;let t=U(e);if(t===Ae)return;let n=Te(t,br);return n.image&&(xe(n,{noColorSpace:!0}),ve(n)),yr},t[2]=a?.[6],t[3]=c);let l;t[4]===a?l=t[5]:(l=[a],t[4]=a,t[5]=l),(0,Y.useEffect)(c,l);let{debugMode:u}=S(),d,f;if(t[6]===u?(d=t[7],f=t[8]):(d=()=>{he.shapeEnvMapDebugUV.value=u},f=[u],t[6]=u,t[7]=d,t[8]=f),(0,Y.useEffect)(d,f),!s)return null;let p;return t[9]!==r||t[10]!==i||t[11]!==s?(p=(0,J.jsx)(_r,{skyBoxFiles:s,fogColor:r,fogState:i}),t[9]=r,t[10]=i,t[11]=s,t[12]=p):p=t[12],p}function yr(){return ge()}function br(e){xe(e,{noColorSpace:!0}),ve(e)}function xr({skyColor:e,fogColor:t,fogState:n}){let r=u(e=>e.camera),i=!!t,a=(0,Y.useMemo)(()=>r.projectionMatrixInverse,[r]),o=(0,Y.useMemo)(()=>n?Se(n.fogVolumes):new Float32Array(12),[n]),s=(0,Y.useMemo)(()=>{if(!n)return .18;let e=n.visibleDistance*.95/Math.sqrt(3);return gr/Math.sqrt(e*e+3600)},[n]),c=(0,Y.useRef)({skyColor:{value:e},fogColor:{value:t??new A(0,0,0)},enableFog:{value:i},inverseProjectionMatrix:{value:a},cameraMatrixWorld:{value:r.matrixWorld},cameraHeight:H.cameraHeight,fogVolumeData:{value:o},horizonFogHeight:{value:s}});return(0,Y.useEffect)(()=>{c.current.skyColor.value=e,c.current.fogColor.value=t??new A(0,0,0),c.current.enableFog.value=i,c.current.fogVolumeData.value=o,c.current.horizonFogHeight.value=s},[e,t,i,o,s]),(0,J.jsxs)(`mesh`,{renderOrder:-1e3,frustumCulled:!1,children:[(0,J.jsxs)(`bufferGeometry`,{children:[(0,J.jsx)(`bufferAttribute`,{attach:`attributes-position`,args:[new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3],count:3,itemSize:3}),(0,J.jsx)(`bufferAttribute`,{attach:`attributes-uv`,args:[new Float32Array([0,0,2,0,0,2]),2],count:3,itemSize:2})]}),(0,J.jsx)(`shaderMaterial`,{uniforms:c.current,vertexShader:`
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.9999, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 skyColor;
          uniform vec3 fogColor;
          uniform bool enableFog;
          uniform mat4 inverseProjectionMatrix;
          uniform mat4 cameraMatrixWorld;
          uniform float cameraHeight;
          uniform float fogVolumeData[12];
          uniform float horizonFogHeight;

          varying vec2 vUv;

          // Convert linear to sRGB for display
          vec3 linearToSRGB(vec3 linear) {
            vec3 low = linear * 12.92;
            vec3 high = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
            return mix(low, high, step(vec3(0.0031308), linear));
          }

          void main() {
            vec2 ndc = vUv * 2.0 - 1.0;
            vec4 viewPos = inverseProjectionMatrix * vec4(ndc, 1.0, 1.0);
            viewPos.xyz /= viewPos.w;
            vec3 direction = normalize((cameraMatrixWorld * vec4(viewPos.xyz, 0.0)).xyz);
            direction = vec3(direction.z, direction.y, -direction.x);

            vec3 finalColor;

            if (enableFog) {
              // Calculate volume fog influence (same logic as SkyBoxTexture)
              float volumeFogInfluence = 0.0;

              for (int i = 0; i < 3; i++) {
                int offset = i * 4;
                float volVisDist = fogVolumeData[offset + 0];
                float volMinH = fogVolumeData[offset + 1];
                float volMaxH = fogVolumeData[offset + 2];
                float volPct = fogVolumeData[offset + 3];

                if (volVisDist <= 0.0) continue;

                if (cameraHeight >= volMinH && cameraHeight <= volMaxH) {
                  float rayInfluence;
                  if (direction.y >= 0.0) {
                    rayInfluence = 1.0 - smoothstep(0.0, 0.3, direction.y);
                  } else {
                    rayInfluence = 1.0;
                  }
                  volumeFogInfluence += rayInfluence * volPct;
                }
              }

              // Base fog factor from view direction
              float baseFogFactor;
              if (direction.y <= 0.0) {
                baseFogFactor = 1.0;
              } else if (direction.y >= horizonFogHeight) {
                baseFogFactor = 0.0;
              } else {
                float t = direction.y / horizonFogHeight;
                baseFogFactor = (1.0 - t) * (1.0 - t);
              }

              // Combine base fog with volume fog influence
              float finalFogFactor = min(1.0, baseFogFactor + volumeFogInfluence * 0.5);

              finalColor = mix(skyColor, fogColor, finalFogFactor);
            } else {
              finalColor = skyColor;
            }

            gl_FragColor = vec4(linearToSRGB(finalColor), 1.0);
          }
        `,depthWrite:!1,depthTest:!1})]})}function Sr(e,t){let{fogDistance:n,visibleDistance:r}=e;return[n,r]}function Cr({fogState:e,enabled:t}){let n=u(e=>e.scene),r=u(e=>e.camera),i=(0,Y.useRef)(null),a=(0,Y.useMemo)(()=>Se(e.fogVolumes),[e.fogVolumes]);return(0,Y.useEffect)(()=>{pr||=(be(),!0)},[]),(0,Y.useEffect)(()=>{we();let[t,o]=Sr(e,r.position.y),s=new F(e.fogColor,t,o);return n.fog=s,i.current=s,ye(r.position.y,a),()=>{n.fog=null,i.current=null,we()}},[n,r,e,a]),(0,Y.useEffect)(()=>{let n=i.current;if(n){if(t){let[t,i]=Sr(e,r.position.y);n.near=t,n.far=i}else n.near=1e10,n.far=1e10}},[t,e,r.position.y]),l(()=>{let n=i.current;if(!n)return;let o=r.position.y;if(ye(o,a,t),t){let[t,r]=Sr(e,o),i=H.fogDistanceScale.value;n.near=i>1?Math.min(t,100):t,n.far=r*i,n.color.copy(e.fogColor)}}),null}var wr=(0,Y.memo)(function({entity:e}){let{skyData:t}=e;fr.debug(`Rendering: materialList=%s, useSkyTextures=%s`,t.materialList,t.useSkyTextures);let{fogEnabled:n}=x(),r=Qe(e=>e.active),i=n&&!r,a=t.materialList||void 0,o=(0,Y.useMemo)(()=>mr(t.skySolidColor),[t.skySolidColor]),s=t.useSkyTextures,c=(0,Y.useMemo)(()=>dr(t),[t]);fr.debug(`fogState: fogColor=(%s, %s, %s) visibleDistance=%d fogDistance=%d enabled=%s volumes=%d`,t.fogColor.r.toFixed(3),t.fogColor.g.toFixed(3),t.fogColor.b.toFixed(3),t.visibleDistance,t.fogDistance,c.enabled,c.fogVolumes.length);let l=(0,Y.useMemo)(()=>mr(t.fogColor),[t.fogColor]),d=o||l,f=c.enabled&&i,p=c.fogColor,m=u(e=>e.scene),h=u(e=>e.gl);(0,Y.useEffect)(()=>{if(f){let e=p.clone();m.background=e,h.setClearColor(e)}else if(d){let e=d[0].clone();m.background=e,h.setClearColor(e)}else m.background=null;return()=>{m.background=null}},[m,h,f,p,d]);let g=o?.[1];return(0,J.jsxs)(J.Fragment,{children:[!r&&a&&s&&a.length>0?(0,J.jsx)(Y.Suspense,{children:(0,J.jsx)(vr,{materialList:a,fogColor:f?p:void 0,fogState:f?c:void 0},a)}):!r&&g?(0,J.jsx)(xr,{skyColor:g,fogColor:f?p:void 0,fogState:f?c:void 0}):null,!r&&(0,J.jsx)(Y.Suspense,{children:(0,J.jsx)(cr,{scene:t})}),c.enabled?(0,J.jsx)(Cr,{fogState:c,enabled:i}):null]})});function Tr(e){let t=(0,q.c)(3),{children:n}=e,{audioEnabled:r}=x(),i;return t[0]!==r||t[1]!==n?(i=r?(0,J.jsx)(Y.Suspense,{children:n}):null,t[0]=r,t[1]=n,t[2]=i):i=t[2],i}var Er=()=>{};function Dr(e,t){let n=(0,q.c)(4),{animationEnabled:r}=x(),i;n[0]!==r||n[1]!==e.rotate||n[2]!==t?(i=e.rotate&&r?()=>{if(t.current){let e=performance.now()/1e3;t.current.rotation.y=e/3*Math.PI*2}}:Er,n[0]=r,n[1]=e.rotate,n[2]=t,n[3]=i):i=n[3],l(i)}function Or(e,t){let n=(0,Y.lazy)(()=>t().then(t=>({default:t[e]}))),r=t=>{let r=(0,q.c)(5),{entity:i}=t,a=`${e}:${i.id}`,o;r[0]===i?o=r[1]:(o=(0,J.jsx)(n,{entity:i}),r[0]=i,r[1]=o);let s;return r[2]!==a||r[3]!==o?(s=(0,J.jsx)(We,{name:a,children:o}),r[2]=a,r[3]=o,r[4]=s):s=r[4],s};return r.displayName=`createLazy(${e})`,r}var kr=Or(`PlayerModel`,()=>W(()=>import(`./PlayerModel-C4jDbboC.js`).then(e=>e.t),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]))),Ar=Or(`ExplosionShape`,()=>W(()=>import(`./ExplosionShape-CyDRGk9w.js`),__vite__mapDeps([26,1,2,3,4,5,0,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]))),jr=Or(`TracerProjectile`,()=>W(()=>import(`./Projectiles-CL2p2by3.js`),__vite__mapDeps([27,1,2,3,4,5,13,14,15,16,9,10,17,28]))),Mr=Or(`SpriteProjectile`,()=>W(()=>import(`./Projectiles-CL2p2by3.js`),__vite__mapDeps([27,1,2,3,4,5,13,14,15,16,9,10,17,28]))),Nr=Or(`ForceFieldBare`,()=>W(()=>import(`./ForceFieldBare-DRCDthIE.js`),__vite__mapDeps([29,1,2,3,4,5,8,9,10,11,15,16,17,28,20,21,23]))),Pr=Or(`AudioEmitter`,()=>W(()=>import(`./AudioEmitter-CuNATM2w.js`).then(e=>e.t),__vite__mapDeps([19,1,2,3,4,5,6,7,8,9,10,11,15,16,17,20,21,22]))),Fr=Or(`WaterBlock`,()=>W(()=>import(`./WaterBlock-Cz-VhdxO.js`),__vite__mapDeps([30,1,2,3,4,5,8,9,10,11,14,15,16,17,7,28,18,20,21,31,32]))),Ir=(0,Y.memo)(function(e){let t=(0,q.c)(27),{entity:n,objectMounts:r}=e;switch(n.renderType){case`Shape`:{let e;return t[0]!==n||t[1]!==r?(e=(0,J.jsx)(Lr,{entity:n,objectMounts:r}),t[0]=n,t[1]=r,t[2]=e):e=t[2],e}case`ForceFieldBare`:{let e;return t[3]===n?e=t[4]:(e=(0,J.jsx)(Nr,{entity:n}),t[3]=n,t[4]=e),e}case`Player`:{let e;return t[5]===n?e=t[6]:(e=(0,J.jsx)(kr,{entity:n}),t[5]=n,t[6]=e),e}case`Explosion`:{let e;return t[7]===n?e=t[8]:(e=(0,J.jsx)(Ar,{entity:n}),t[7]=n,t[8]=e),e}case`Tracer`:{let e;return t[9]===n?e=t[10]:(e=(0,J.jsx)(jr,{entity:n}),t[9]=n,t[10]=e),e}case`Sprite`:{let e;return t[11]===n?e=t[12]:(e=(0,J.jsx)(Mr,{entity:n}),t[11]=n,t[12]=e),e}case`AudioEmitter`:{let e;return t[13]===n?e=t[14]:(e=(0,J.jsx)(Tr,{children:(0,J.jsx)(Pr,{entity:n})}),t[13]=n,t[14]=e),e}case`Camera`:{let e;return t[15]===n?e=t[16]:(e=(0,J.jsx)(an,{entity:n}),t[15]=n,t[16]=e),e}case`WayPoint`:{let e;return t[17]===n?e=t[18]:(e=(0,J.jsx)(on,{entity:n}),t[17]=n,t[18]=e),e}case`TerrainBlock`:{let e;return t[19]===n?e=t[20]:(e=(0,J.jsx)(An,{entity:n}),t[19]=n,t[20]=e),e}case`InteriorInstance`:{let e;return t[21]===n?e=t[22]:(e=(0,J.jsx)(Gn,{entity:n}),t[21]=n,t[22]=e),e}case`Sky`:{let e;return t[23]===n?e=t[24]:(e=(0,J.jsx)(wr,{entity:n}),t[23]=n,t[24]=e),e}case`Sun`:return null;case`WaterBlock`:{let e;return t[25]===n?e=t[26]:(e=(0,J.jsx)(Fr,{entity:n}),t[25]=n,t[26]=e),e}case`MissionArea`:return null;case`None`:return null;default:return null}});function Lr({entity:e,objectMounts:t}){let n=Xe(),r=n===`demo`||n===`live`,i=(0,Y.useRef)(null);if(Dr(e,i),!e.shapeName)throw Error(`Shape entity missing shapeName: ${e.id}`);let a=e.shapeType??`StaticShape`,o=(0,Y.useMemo)(()=>de(e.dataBlockId,e.dataBlock),[e.dataBlockId,e.dataBlock]),s=e.dataBlock?.toLowerCase()===`flag`,c=e.teamId&&e.teamId>0?Ne[e.teamId]:null,l=s&&c?`${c} Flag`:null,u=e.shapeType===`Item`?`pink`:e.threads?`#00ff88`:`yellow`,d=(0,Y.useMemo)(()=>{let n={...t},r=e.imageSlots;if(r)for(let t=0;t<r.length;t++){let i=r[t];!i?.shapeName||i.mountPoint in n||(n[i.mountPoint]=(0,J.jsx)(fe,{shapeName:i.shapeName,imageDataBlockId:i.dataBlockId,entityId:e.id,skinName:i.skinName}))}return Object.keys(n).length>0?n:void 0},[t,e.imageSlots,e.id]),f=(0,Y.useMemo)(()=>{if(e.lightType)return{type:e.lightType,color:e.lightColor??[1,1,1,1],time:e.lightTime??1e3,radius:e.lightRadius??10,onlyStatic:!!e.lightOnlyStatic,isStatic:!!e.isStaticItem}},[e.lightType]);return(0,J.jsx)(_e,{object:e.runtimeObject,shapeName:e.shapeName,type:a,children:(0,J.jsx)(`group`,{ref:e.rotate?i:void 0,children:(0,J.jsx)(pe,{loadingColor:u,streamEntity:r?e:void 0,emap:o,entityId:e.id,skinName:e.skinName,mounted:d,lightConfig:f,children:l?(0,J.jsx)(Re,{opacity:.6,children:l}):null})})})}var Rr={Root:`_Root_yuidw_1`,Distance:`_Distance_yuidw_9`,Icon:`_Icon_yuidw_18`},zr=1.5,Br=U(`commander/MiniIcons/com_flag_grey`),Vr=new B;function Hr(e){let t=(0,q.c)(9),{entity:n}=e,r=(0,Y.useRef)(null),i=(0,Y.useRef)(null),a=(0,Y.useRef)(null),o=u(Ur),s;t[0]!==o||t[1]!==n.iffColor?(s=()=>{if(i.current&&n.iffColor){let{r:e,g:t,b:r}=n.iffColor;i.current.style.backgroundColor=`rgb(${e},${t},${r})`}if(a.current&&r.current){r.current.getWorldPosition(Vr);let e=o.position.distanceTo(Vr);a.current.textContent=e.toFixed(1)}},t[0]=o,t[1]=n.iffColor,t[2]=s):s=t[2],l(s);let c=n.iffColor?`rgb(${n.iffColor.r},${n.iffColor.g},${n.iffColor.b})`:`rgb(200,200,200)`,d;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(d=[0,zr,0],t[3]=d):d=t[3];let f;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,J.jsx)(`span`,{ref:a,className:Rr.Distance}),t[4]=f):f=t[4];let p;t[5]===c?p=t[6]:(p={backgroundColor:c,"--flag-icon-url":`url(${Br})`},t[5]=c,t[6]=p);let m=p,h;return t[7]===m?h=t[8]:(h=(0,J.jsx)(`group`,{ref:r,children:(0,J.jsx)(b,{position:d,center:!0,children:(0,J.jsxs)(`div`,{className:Rr.Root,children:[f,(0,J.jsx)(`div`,{ref:i,className:Rr.Icon,style:m})]})})}),t[7]=m,t[8]=h),h}function Ur(e){return e.camera}function Wr(){let e=(0,q.c)(1),t=Gr,n;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(n=(0,J.jsx)(`group`,{ref:t,children:(0,J.jsx)(Kr,{})}),e[0]=n):n=e[0],n}function Gr(e){Ge.setState({root:e})}var Kr=(0,Y.memo)(function(){let e=Je(),t=(0,Y.useRef)(new Map).current,n=new Set;for(let r of e)n.add(r.id),t.set(r.id,r);for(let e of t.keys())n.has(e)||t.delete(e);let r=new Set,i=new Map;for(let e of t.values()){let n=e.mountObjectId;if(n&&t.has(n)){r.add(e.id);let t=i.get(n);t||(t=new Map,i.set(n,t)),t.set(e.mountNode??0,e)}}return(0,J.jsx)(J.Fragment,{children:[...t.values()].filter(e=>!r.has(e.id)).map(e=>(0,J.jsx)(qr,{entity:e,mountChildren:i.get(e.id)},e.id))})}),qr=(0,Y.memo)(function(e){let t=(0,q.c)(8),{entity:n,mountChildren:r}=e;if(n.debugHidden)return null;if(Dt(n)){let e;t[0]===n?e=t[1]:(e=(0,J.jsx)(Ir,{entity:n}),t[0]=n,t[1]=e);let r;return t[2]!==n.id||t[3]!==e?(r=(0,J.jsx)(`group`,{name:n.id,children:e}),t[2]=n.id,t[3]=e,t[4]=r):r=t[4],r}if(n.renderType===`None`)return null;let i;return t[5]!==n||t[6]!==r?(i=(0,J.jsx)(Yr,{entity:n,mountChildren:r}),t[5]=n,t[6]=r,t[7]=i):i=t[7],i});function Jr({entity:e}){let t=(0,Y.useRef)(!1),[n,r]=(0,Y.useState)(()=>!!(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2));return t.current=n,l(()=>{let n=!!(((`targetRenderFlags`in e?e.targetRenderFlags:void 0)??0)&2);n!==t.current&&(t.current=n,r(n))}),n?(0,J.jsx)(Hr,{entity:e}):null}function Yr(e){let t=(0,q.c)(38),{entity:n,mountChildren:r}=e,i=n.position,a=n.scale,o;bb0:{if(!n.rotation){o=void 0;break bb0}let e;t[0]===n.rotation?e=t[1]:(e=new ce(...n.rotation),t[0]=n.rotation,t[1]=e),o=e}let s=o,c;bb1:{if(!r||r.size===0){c=void 0;break bb1}let e;if(t[2]!==r){e={};for(let[t,n]of r)e[t]=(0,J.jsx)(Y.Suspense,{children:(0,J.jsx)(`group`,{rotation:[Math.PI/2,-Math.PI/2,0],children:(0,J.jsx)(Ir,{entity:n})})},n.id);t[2]=r,t[3]=e}else e=t[3];c=e}let l=c;if(n.renderType===`Shape`&&!n.shapeName){let e=n.id,r;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(r=(0,J.jsx)(`sphereGeometry`,{args:[.3,6,4]}),t[4]=r):r=t[4];let o;t[5]===n.className?o=t[6]:(o=V(n.className),t[5]=n.className,t[6]=o);let c;t[7]===o?c=t[8]:(c=(0,J.jsxs)(`mesh`,{children:[r,(0,J.jsx)(`meshBasicMaterial`,{color:o,wireframe:!0})]}),t[7]=o,t[8]=c);let l;t[9]===n?l=t[10]:(l=(0,J.jsx)(Jr,{entity:n}),t[9]=n,t[10]=l);let u;return t[11]!==n.id||t[12]!==i||t[13]!==s||t[14]!==a||t[15]!==c||t[16]!==l?(u=(0,J.jsxs)(`group`,{name:e,position:i,quaternion:s,scale:a,children:[c,l]}),t[11]=n.id,t[12]=i,t[13]=s,t[14]=a,t[15]=c,t[16]=l,t[17]=u):u=t[17],u}let u;t[18]!==n.className||t[19]!==n.renderType?(u=n.renderType===`Explosion`?null:(0,J.jsxs)(`mesh`,{children:[(0,J.jsx)(`sphereGeometry`,{args:[.5,8,6]}),(0,J.jsx)(`meshBasicMaterial`,{color:V(n.className),wireframe:!0})]}),t[18]=n.className,t[19]=n.renderType,t[20]=u):u=t[20];let d=u,f;t[21]!==n||t[22]!==l?(f=(0,J.jsx)(Ir,{entity:n,objectMounts:l}),t[21]=n,t[22]=l,t[23]=f):f=t[23];let p;t[24]!==d||t[25]!==f?(p=(0,J.jsx)(le,{fallback:d,children:f}),t[24]=d,t[25]=f,t[26]=p):p=t[26];let m;t[27]===n?m=t[28]:(m=(0,J.jsx)(Jr,{entity:n}),t[27]=n,t[28]=m);let h;t[29]!==p||t[30]!==m?(h=(0,J.jsxs)(`group`,{name:`model`,children:[p,m]}),t[29]=p,t[30]=m,t[31]=h):h=t[31];let g;return t[32]!==n.id||t[33]!==i||t[34]!==s||t[35]!==a||t[36]!==h?(g=(0,J.jsx)(`group`,{name:n.id,position:i,quaternion:s,scale:a,children:h}),t[32]=n.id,t[33]=i,t[34]=s,t[35]=a,t[36]=h,t[37]=g):g=t[37],g}function Xr(){let e=(0,q.c)(5),{fov:t}=x(),n=(0,Y.useRef)(null),r,i;e[0]===Symbol.for(`react.memo_cache_sentinel`)?(r=()=>(rt.perspective=n.current,Zr),i=[],e[0]=r,e[1]=i):(r=e[0],i=e[1]),(0,Y.useEffect)(r,i);let a;e[2]===Symbol.for(`react.memo_cache_sentinel`)?(a=[0,256,0],e[2]=a):a=e[2];let o;return e[3]===t?o=e[4]:(o=(0,J.jsx)(Vt,{ref:n,makeDefault:!0,position:a,fov:t}),e[3]=t,e[4]=o),o}function Zr(){rt.perspective=null}var Qr=1024,$r=64;function ei(e){let t=-1024,n=Qr,r=-1024,i=Qr;if(e){let{x:a,y:o,w:s,h:c}=e.area;t=o,n=o+c,r=a,i=a+s}let a=Math.max(n-t,$r),o=Math.max(i-r,$r);return{centerX:(t+n)/2,centerZ:(r+i)/2,width:a*1.2,depth:o*1.2}}var ti=2500,ni=1,ri=5e3,ii=500,ai=.002,oi=.25,si=40,ci=new ce().setFromEuler(new ae(-Math.PI/2,0,0));function li(e,t){let n=e[t];return n!=null&&`pressed`in n&&n.pressed}function ui(){let e=(0,q.c)(7),t=Qe(_i);Et(`toggleCommandCircuit`,gi),Et(`exitCommandCircuit`,hi);let n,r;e[0]===t?(n=e[1],r=e[2]):(n=()=>{t&&(G.getState().cancel(),document.pointerLockElement&&document.exitPointerLock())},r=[t],e[0]=t,e[1]=n,e[2]=r),(0,Y.useEffect)(n,r);let i;e[3]===Symbol.for(`react.memo_cache_sentinel`)?(i=[],e[3]=i):i=e[3],(0,Y.useEffect)(pi,i);let a;e[4]===Symbol.for(`react.memo_cache_sentinel`)?(a=[],e[4]=a):a=e[4],(0,Y.useEffect)(di,a);let o;return e[5]===t?o=e[6]:(o=t?(0,J.jsx)(vi,{}):null,e[5]=t,e[6]=o),o}function di(){return Ze.subscribe(fi)}function fi(e){e.dataSource!==`map`&&$e.getState().deactivate()}function pi(){return G.subscribe(mi)}function mi(e){e.animation&&$e.getState().deactivate()}function hi(){$e.getState().deactivate()}function gi(){$e.getState().toggle()}function _i(e){return e.active}function vi(){let e=(0,q.c)(24),t=(0,Y.useRef)(null),n=Ye(),r,i;e[0]===Symbol.for(`react.memo_cache_sentinel`)?(r=()=>(rt.ortho=t.current,xi),i=[],e[0]=r,e[1]=i):(r=e[0],i=e[1]),(0,Y.useEffect)(r,i);let a=u(bi),[,o]=vt(),s;e[2]===n?s=e[3]:(s=ei(n),e[2]=n,e[3]=s);let c=s,d=Math.min(a.width/c.width,a.height/c.depth),[f]=(0,Y.useState)(yi),p;e[4]!==c.centerX||e[5]!==c.centerZ||e[6]!==f?(p=f?{x:f.position.x,z:f.position.z}:{x:c.centerX,z:c.centerZ},e[4]=c.centerX,e[5]=c.centerZ,e[6]=f,e[7]=p):p=e[7];let m=(0,Y.useRef)(p),h=(0,Y.useRef)(f?.zoom==null?d:Math.min(d*si,Math.max(d*oi,f.zoom))),g=(0,Y.useRef)(f!==null),_=(0,Y.useRef)(d),v;e[8]!==d||e[9]!==c.centerX||e[10]!==c.centerZ?(v=()=>{_.current=d,g.current||(m.current={x:c.centerX,z:c.centerZ},h.current=d)},e[8]=d,e[9]=c.centerX,e[10]=c.centerZ,e[11]=v):v=e[11];let y;e[12]!==d||e[13]!==c?(y=[c,d],e[12]=d,e[13]=c,e[14]=y):y=e[14],(0,Y.useEffect)(v,y);let b;e[15]===o?b=e[16]:(b=()=>{let e=o().commandZoom;if(!e||e.deltaY===0)return;let t=_.current;h.current=Math.min(t*si,Math.max(t*oi,h.current*Math.exp(-e.deltaY*ai))),g.current=!0},e[15]=o,e[16]=b),Et(`commandZoom`,b);let x;e[17]!==c.centerX||e[18]!==c.centerZ||e[19]!==c.depth||e[20]!==c.width||e[21]!==o?(x=(e,n)=>{let r=t.current;if(!r)return;let i=o(),a=ii/h.current*n,s=0,l=0;li(i,`commandPanUp`)&&(l=0-a),li(i,`commandPanDown`)&&(l+=a),li(i,`commandPanLeft`)&&(s=0-a),li(i,`commandPanRight`)&&(s+=a);let u=i.commandPanDrag;u?.dragging&&(u.deltaX!==0||u.deltaY!==0)&&(s-=u.deltaX/h.current,l-=u.deltaY/h.current),Tt(),(s!==0||l!==0)&&(g.current=!0),m.current.x=Math.min(c.centerX+c.width,Math.max(c.centerX-c.width,m.current.x+s)),m.current.z=Math.min(c.centerZ+c.depth,Math.max(c.centerZ-c.depth,m.current.z+l)),r.position.set(m.current.x,ti,m.current.z),r.quaternion.copy(ci),r.zoom=h.current,r.updateProjectionMatrix()},e[17]=c.centerX,e[18]=c.centerZ,e[19]=c.depth,e[20]=c.width,e[21]=o,e[22]=x):x=e[22],l(x);let S;return e[23]===Symbol.for(`react.memo_cache_sentinel`)?(S=(0,J.jsx)(zt,{ref:t,makeDefault:!0,near:ni,far:ri}),e[23]=S):S=e[23],S}function yi(){return tt(window.location.hash)}function bi(e){return e.size}function xi(){rt.ortho=null}function Si(e){let t=(0,q.c)(3),{children:n}=e,{debugMode:r}=S(),i;return t[0]!==n||t[1]!==r?(i=r?(0,J.jsx)(Y.Suspense,{children:n}):null,t[0]=n,t[1]=r,t[2]=i):i=t[2],i}var Ci=Me(`InputConsumer`),wi=200,Ti=Math.PI/2-.01,Ei=45,Di=31,Oi=1/32,ki=2*Math.PI;function Ai(e){return((Math.round(e/ki*65536)|0)<<16>>16)*ki/65536}var ji=new B,Mi=new B,Ni=new B,Pi=new ae(0,0,0,`YXZ`);function Fi(e,t,n,r,i,a,o){if(r===0&&i===0&&a===0)return;let s=Math.sin(t),c=Math.cos(t),l=Math.sin(n),u=Math.cos(n),d=o*Oi;e.x+=(c*r+s*u*i+s*l*a)*d,e.y+=(-s*r+c*u*i+c*l*a)*d,e.z+=(-l*i+u*a)*d}function Ii(){let{moveQueue:e,mode:t,setMode:n}=mt(),r=at(e=>e.adapter),i=at(e=>e.gameStatus),a=at(e=>e.liveReady),o=at(e=>e.sendMoves),s=Pe(),c=u(e=>e.camera),d=rn(),f=(0,Y.useRef)(null),p=(0,Y.useRef)([]),m=(0,Y.useRef)(0),h=(0,Y.useRef)(0),g=(0,Y.useRef)(null),_=(0,Y.useRef)(0),v=(0,Y.useRef)(0),y=(0,Y.useRef)({x:0,y:0,z:0}),b=(0,Y.useRef)(0),x=(0,Y.useRef)(0),S=(0,Y.useRef)({x:0,y:0,z:0}),C=(0,Y.useRef)(!1),w=(0,Y.useRef)({x:0,y:0,z:0}),T=(0,Y.useRef)({x:0,y:0,z:0}),E=(0,Y.useRef)(!1),D=(0,Y.useRef)(null),O=(0,Y.useRef)(0),k=(0,Y.useRef)(0),A=(0,Y.useRef)(0),j=(0,Y.useRef)(0),M=(0,Y.useRef)(0),N=(0,Y.useRef)([!1,!1,!1,!1,!1,!1]),P=!!r&&(i===`connected`||i===`authenticating`);return(0,Y.useEffect)(()=>{if(P&&r){if(f.current===r)return;Ci.info(`wiring adapter to engine store`);let e=ot.getState(),t={source:`live`,duration:1/0,missionName:e.mapName??null,gameType:null,serverDisplayName:e.serverName??null,recorderName:e.warriorName??null,recordingDate:null,streamingPlayback:r};s.getState().setRecording(t),s.getState().setPlaybackStatus(`playing`),f.current=r,C.current=!1,E.current=!1,D.current=null,p.current.length=0,m.current=0,h.current=0,g.current=null,n(`fly`)}else!P&&f.current&&(s.getState().playback.recording?.source===`live`&&s.getState().setRecording(null),f.current=null,C.current=!1,E.current=!1,D.current=null,p.current.length=0,n(`local`))},[P,r,s,n]),(0,Y.useEffect)(()=>{!a&&f.current&&(Ci.info(`mission change: resetting prediction state and mode`),C.current=!1,E.current=!1,D.current=null,p.current.length=0,m.current=0,h.current=0,g.current=null,O.current=0,k.current=0,A.current=0,j.current=0,M.current=0,N.current.fill(!1),n(`fly`))},[a,n]),(0,Y.useEffect)(()=>{if(!P)return Ge.subscribe(e=>{n(e.cameraMode===`orbitOverride`?`follow`:`local`)})},[P,n]),nn(()=>{if(!f.current||i!==`connected`||!a)return;let e=O.current,t=k.current;O.current=0,k.current=0;let n=A.current,r=j.current,s=M.current;A.current=0,j.current=0,M.current=0;let c=[...N.current];N.current.fill(!1);let l=Ai(e),u=Ai(t);_.current+=l-e,v.current+=u-t,b.current=_.current,x.current=v.current,S.current={...y.current};let d=_.current-l,h=v.current-u;Fi(y.current,d,h,n,r,s,80),c[1]=!0;let g=m.current++,C={x:n,y:r,z:s,yaw:e,pitch:t,roll:0,trigger:c,freeLook:!1},P=p.current;P.push({moveIndex:g,move:C,yaw:l,pitch:u,x:n,y:r,z:s}),P.length>Ei&&P.splice(0,P.length-Ei);let F=f.current.lastMoveAck;for(;P.length>0&&P[0].moveIndex<F;)P.shift();if(P.length>0){let e=P.slice(0,Di);o(e.map(e=>e.move),e[0].moveIndex)}let I=f.current.getSnapshot();if(I!==D.current){D.current=I;let e=I?.camera;if(e?.orbitTargetId){let t=I.entities.find(t=>t.id===e.orbitTargetId);t?.position&&(w.current={...T.current},T.current={x:t.position[0],y:t.position[1],z:t.position[2]},E.current||=(w.current={...T.current},!0))}}}),l((r,o)=>{let s=e.current;if(s.length>0){let t=0,n=0,r=0,o=0,l=0,u=0,d=[!1,!1,!1,!1,!1,!1];for(let e of s){t+=e.deltaYaw,n+=e.deltaPitch,Math.abs(e.x)>Math.abs(r)&&(r=e.x),Math.abs(e.y)>Math.abs(o)&&(o=e.y),Math.abs(e.z)>Math.abs(l)&&(l=e.z),u+=e.delta;for(let t=0;t<e.triggers.length;t++)e.triggers[t]&&(d[t]=!0)}if(e.current.length=0,P&&f.current&&i===`connected`&&a){O.current+=t,k.current+=n,A.current=r,j.current=o,M.current=l;for(let e=0;e<d.length;e++)d[e]&&(N.current[e]=!0);_.current+=t,v.current=Math.max(-K,Math.min(K,v.current+n))}else{let e=Ge.getState();if(e.playback){e.cameraMode===`freeFly`?Li(c,t,n,r,o,l,u):e.cameraMode===`orbitOverride`&&(e.orbitOverrideYaw+=t,e.orbitOverridePitch=Math.max(-K,Math.min(K,e.orbitOverridePitch+n)));return}Li(c,t,n,r,o,l,u);return}}if(!P||!f.current||i!==`connected`||!a)return;let l=f.current,u=l.getSnapshot(),m=u?.camera;if(m&&m!==g.current&&typeof m.yaw==`number`&&typeof m.pitch==`number`){g.current=m;let e=l.lastMoveAck;if(e>h.current){h.current=e;let t=p.current;for(;t.length>0&&t[0].moveIndex<e;)t.shift()}_.current=m.yaw,v.current=m.pitch,y.current={x:m.position[0],y:m.position[1],z:m.position[2]};for(let e of p.current)Fi(y.current,_.current,v.current,e.x,e.y,e.z,80),_.current+=e.yaw,v.current=Math.max(-K,Math.min(K,v.current+e.pitch));_.current+=O.current,v.current=Math.max(-K,Math.min(K,v.current+k.current)),b.current=_.current,x.current=v.current,S.current={...y.current},C.current=!0;let r=m.mode===`third-person`?`follow`:`fly`;if(r!==t&&(Ci.info(`server corrected observer mode: %s → %s`,t,r),n(r),f.current&&(f.current.observerMode=r),r===`fly`&&(E.current=!1,D.current=null)),m.orbitTargetId&&!E.current){let e=u.entities.find(e=>e.id===m.orbitTargetId);if(e?.position){let t={x:e.position[0],y:e.position[1],z:e.position[2]};T.current=t,w.current={...t},E.current=!0}}}if(C.current){if(t===`fly`)Ri(r.camera,S.current,y.current,_.current,v.current,d());else if(t===`follow`){if(!E.current)return;zi(r.camera,w.current,T.current,_.current,v.current,d(),m?.orbitDistance??4,m?.orbitTargetId)}}}),(0,Y.useEffect)(()=>()=>{f.current&&=(s.getState().playback.recording?.source===`live`&&s.getState().setRecording(null),null)},[s]),null}function Li(e,t,n,r,i,a,o){if((t!==0||n!==0)&&(Pi.setFromQuaternion(e.quaternion,`YXZ`),Pi.y-=t,Pi.x-=n,Pi.x=Math.max(-Ti,Math.min(Ti,Pi.x)),e.quaternion.setFromEuler(Pi)),r!==0||i!==0||a!==0){e.getWorldDirection(ji),ji.normalize(),Mi.crossVectors(e.up,ji).normalize(),Ni.set(0,0,0),i!==0&&Ni.addScaledVector(ji,i),r!==0&&Ni.addScaledVector(Mi,-r),a!==0&&(Ni.y+=a);let t=Ni.length();t>0&&(Ni.multiplyScalar(Math.min(1,t)/t*wi*o),e.position.add(Ni))}}function Ri(e,t,n,r,i,a){let o=t.x+(n.x-t.x)*a,s=t.y+(n.y-t.y)*a,c=t.z+(n.z-t.z)*a;e.position.set(s,c,o);let[l,u,d,f]=st(r,i);e.quaternion.set(l,u,d,f)}function zi(e,t,n,r,i,a,o,s){let c=t.x+(n.x-t.x)*a,l=t.y+(n.y-t.y)*a,u=t.z+(n.z-t.z)*a+ +(s!=null&&Ze.getState().streamEntities.get(s)?.renderType===`Player`),d=Math.sin(i),f=Math.cos(i),p=Math.sin(r),m=Math.cos(r),h=Math.max(.1,o),g=c-p*f*h,_=l-m*f*h,v=u+d*h;e.position.set(_,v,g);let[y,b,x,S]=st(r,i);e.quaternion.set(y,b,x,S)}var Bi=Me(`CameraTourConsumer`);function Vi(e){return e<.5?4*e*e*e:1-(-2*e+2)**3/2}var Hi=3,Ui=10,Wi=2,Gi=1.8,Ki=50,qi=200,Ji=2,Yi=1.8,Xi=1.2,Zi=.6,Qi=3/4*(2*Math.PI),$i=Qi/Zi,ea=1.5,ta=1.5,na=6,ra=180,ia=1.4,aa=new z,oa=new z,sa=new z,ca=new w,la=new B,ua=new B,da=new B,fa=new B,pa=new B,Q=new ce,ma=new ce,ha=new w,ga=new ae;function _a(e){if(e.orbitCenter)return pa.set(e.orbitCenter[0],e.orbitCenter[1],e.orbitCenter[2]);let t=e.targets[e.currentIndex];return pa.set(t.position[0],t.position[1],t.position[2])}function va(e){return e.orbitRadius??Hi}function ya(e){return va(e)*(Wi/Hi)}function ba(e,t,n){let r=_a(e),i=va(e),a=ya(e);return n.set(r.x+Math.cos(t)*i,r.y+a,r.z+Math.sin(t)*i)}function xa(e,t,n){let r=e.getObjectByName(t.entityId),i=!1;if(r&&r.traverse(e=>{e.geometry&&(i=!0)}),r&&!i){n.orbitCenter=[...t.position],n.orbitRadius=Ui;return}if(r&&i){aa.setFromObject(r),aa.getCenter(la),n.orbitCenter=[la.x,la.y,la.z];let e=ha.copy(r.matrixWorld).invert();oa.makeEmpty(),r.traverse(t=>{t.geometry&&(t.geometry.boundingBox||t.geometry.computeBoundingBox(),sa.copy(t.geometry.boundingBox),ca.multiplyMatrices(e,t.matrixWorld),sa.applyMatrix4(ca),oa.union(sa))}),oa.getSize(ua);let i=ua.y,a=Math.max(ua.x,ua.z),o=i/2+Yi,s=a/2+Xi,c=Math.max(o,s);if(c>200){n.orbitCenter=[...t.position];let e=0;r.traverse(t=>{if(e>0||!t.geometry)return;t.geometry.boundingBox||t.geometry.computeBoundingBox();let n=t.geometry.boundingBox,r=n.max.x-n.min.x,i=n.max.y-n.min.y,a=n.max.z-n.min.z;e=Math.max(r,i,a)});let i=(e/2+Xi)*.75;n.orbitRadius=Math.max(Gi,i)}else n.orbitRadius=Math.max(Gi,c);let l=o>=s?`height`:`spread`,u=c<Gi?` (clamped)`:``;Bi.debug(`%s: size=%s height→%s spread→%s driven by %s → radius=%d%s`,t.label,`${ua.x.toFixed(1)}×${ua.y.toFixed(1)}×${ua.z.toFixed(1)}`,o.toFixed(1),s.toFixed(1),l,n.orbitRadius,u)}else n.orbitCenter=null,n.orbitRadius=null,Bi.debug(`%s: no scene object, fallback radius=%d`,t.label,Hi)}function Sa(e){return ga.setFromQuaternion(e,`YXZ`),ga.z=0,e.setFromEuler(ga)}function Ca(e,t){return ha.lookAt(e,t,fa.set(0,1,0)),ma.setFromRotationMatrix(ha),Sa(ma)}function wa(e,t,n){let r=_a(t),i=ba(t,n,da.clone()),a=e.distanceTo(i);if(a<20)return new R([e.clone(),i],!1,`centripetal`);let o=new B().addVectors(e,i).multiplyScalar(.5);return o.distanceTo(r)>i.distanceTo(r)&&o.lerp(r,.3),o.y+=a*.15,new R([e.clone(),o,i],!1,`centripetal`)}function Ta(e,t){let n=_a(t);return Math.atan2(e.z-n.z,e.x-n.x)}function Ea(e){return Math.max(ta,Math.min(na,e/ra))}function Da(e,t,n,r){let i=e.targets[e.currentIndex];if(!e.curve){e.startPos=[t.position.x,t.position.y,t.position.z],Sa(Q.copy(t.quaternion)),e.startQuat=[Q.x,Q.y,Q.z,Q.w],xa(r,i,e);let n=t.position.clone();e.curve=wa(n,e,Ta(n,e)),e.phaseDuration=Ea(e.curve.getLength()),e.elapsed=0;return}e.elapsed+=n;let a=Math.min(1,Vi(e.elapsed/e.phaseDuration));e.curve.getPointAt(a,da),t.position.copy(da);let o=Vi(Math.min(1,e.elapsed/e.phaseDuration*ia)),s=Ca(da,_a(e));o<1&&e.startQuat?(Q.set(e.startQuat[0],e.startQuat[1],e.startQuat[2],e.startQuat[3]),Q.slerp(s,o),t.quaternion.copy(Q)):t.quaternion.copy(s),e.elapsed>=e.phaseDuration&&(e.phase=`orbiting`,e.elapsed=0,e.orbitStartAngle=Ta(t.position,e))}function Oa(e,t,n){let r=e.targets.length===1,i=e.currentIndex>=e.targets.length-1;e.elapsed+=n;let a=e.orbitStartAngle,o=$i+ea,s;if(e.elapsed<=$i)s=a+e.elapsed*Zi;else{let t=e.elapsed-$i,n=Math.min(1,t/ea),r=t*Zi*(1-n/2);s=a+Qi+r}ba(e,s,da),t.position.copy(da);let c=Ca(da,_a(e));t.quaternion.copy(c),e.elapsed>=o&&(r||i?G.getState().cancel():G.getState().advanceTarget())}function ka(){let e=(0,q.c)(3),t=u(Na),n=u(Ma),r=(0,Y.useRef)(null);Et(`nextStop`,ja),Et(`exitTour`,Aa);let i;return e[0]!==t||e[1]!==n?(i=(e,i)=>{let a=G.getState().animation,o=a?va(a):0,s=a&&o>=Ki?Math.max(1,o/qi):1,c=H.fogDistanceScale.value;if(c!==s){let e=Ji*i;s>c?H.fogDistanceScale.value=Math.min(c+e,s):H.fogDistanceScale.value=Math.max(c-e,s)}if(!a){r.current&&=(Sa(t.quaternion),null);return}r.current=a,a.phase===`traveling`?Da(a,t,i,n):Oa(a,t,i)},e[0]=t,e[1]=n,e[2]=i):i=e[2],l(i),null}function Aa(){G.getState().cancel()}function ja(){let e=G.getState().animation;e&&(e.currentIndex>=e.targets.length-1?G.getState().cancel():G.getState().advanceTarget())}function Ma(e){return e.scene}function Na(e){return e.camera}var Pa=3;function $({map:e}){let t=St,n=u(e=>e.gl.domElement),r=(0,Y.useMemo)(()=>{let n=e.map(e=>{let t=Array.isArray(e.keys)?e.keys:[e.keys];return{name:e.name,bindings:t.map(bt)}}),r={};for(let e of n)r[e.name]=Ct(e.bindings[0]);let i=new Map,a=[],o=[],s=[],c=[],l=[];for(let e of n)for(let t of e.bindings)switch(t.type){case`key`:{let n=i.get(t.code);n||(n=[],i.set(t.code,n)),n.push({action:e,binding:t});break}case`click`:a.push({action:e,binding:t});break;case`drag`:o.push({action:e,binding:t});break;case`pointerLockMove`:s.push({action:e});break;case`scroll`:c.push({action:e});break;case`touch`:l.push({action:e})}function u(e){return e==null||e===!!document.pointerLockElement}function d(e){let{actions:n}=t.getState(),r={};for(let[,t]of i)for(let{action:i,binding:a}of t){let t=e.has(a.code)&&wt(e,a.modifiers),o=n[i.name]?.pressed??!1;t&&!o?(r[i.name]={pressed:!0},_t(i.name)):!t&&o&&(r[i.name]={pressed:!1})}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}let f=-1,p=0,m=0,h=!1;function g(e,n){t.setState(t=>({...t,actions:{...t.actions,[e]:n}}))}function _(e){let t=!!document.pointerLockElement;for(let{action:t,binding:n}of a){if(!u(n.whenPointerLocked))continue;let r=n.button??0;e.button===r&&gt(e,n.modifiers)&&g(t.name,{pressed:!0})}t||(f=e.button,p=e.clientX,m=e.clientY,h=!1)}function v(e){if(document.pointerLockElement){if(s.length>0){let{actions:n}=t.getState(),r={};for(let{action:t}of s){let i=n[t.name];r[t.name]={...i,deltaX:i.deltaX+e.movementX,deltaY:i.deltaY+e.movementY}}t.setState(e=>({...e,actions:{...e.actions,...r}}))}return}if(f<0)return;if(!h){let n=e.clientX-p,r=e.clientY-m;if(Math.abs(n)<Pa&&Math.abs(r)<Pa)return;h=!0;for(let{action:e,binding:n}of a)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].pressed&&g(e.name,{pressed:!1});for(let{action:e,binding:t}of o)u(t.whenPointerLocked)&&(t.button??0)===f&&g(e.name,{dragging:!0,deltaX:0,deltaY:0,startX:p,startY:m})}let{actions:n}=t.getState(),r={};for(let{action:t,binding:i}of o){if(!u(i.whenPointerLocked)||(i.button??0)!==f)continue;let a=n[t.name];r[t.name]={...a,deltaX:a.deltaX+e.movementX,deltaY:a.deltaY+e.movementY}}Object.keys(r).length>0&&t.setState(e=>({...e,actions:{...e.actions,...r}}))}function y(e){let n=!!document.pointerLockElement;for(let{action:n,binding:r}of a){if(!u(r.whenPointerLocked))continue;let i=r.button??0;e.button===i&&t.getState().actions[n.name].pressed&&(_t(n.name),g(n.name,{pressed:!1}))}if(!n&&e.button===f){for(let{action:e,binding:n}of o)u(n.whenPointerLocked)&&(n.button??0)===f&&t.getState().actions[e.name].dragging&&g(e.name,xt());f=-1,h=!1}}function b(e){for(let{action:t}of c)g(t.name,{deltaX:e.deltaX,deltaY:e.deltaY}),_t(t.name)}let x=null,S=0,C=0;function w(e){if(x!==null||l.length===0)return;let t=e.changedTouches[0];if(t){x=t.identifier,S=t.clientX,C=t.clientY;for(let{action:e}of l)g(e.name,{touching:!0,dragging:!1,deltaX:0,deltaY:0})}}function T(e){if(x!==null)for(let n=0;n<e.changedTouches.length;n++){let r=e.changedTouches[n];if(r.identifier!==x)continue;let i=r.clientX-S,a=r.clientY-C;S=r.clientX,C=r.clientY;for(let{action:e}of l){let n=t.getState().actions[e.name];g(e.name,{touching:!0,dragging:!0,deltaX:n.deltaX+i,deltaY:n.deltaY+a})}break}}function E(e){if(x!==null){for(let t=0;t<e.changedTouches.length;t++)if(e.changedTouches[t].identifier===x){x=null;for(let{action:e}of l)g(e.name,yt());break}}}return{actionNames:n.map(e=>e.name),initialActions:r,deriveKeyActions:d,hasKeyBindings:i.size>0,handleMouseDown:_,handleMouseMove:v,handleMouseUp:y,handleWheel:b,handleTouchStart:w,handleTouchMove:T,handleTouchEnd:E,hasMouseBindings:a.length>0||o.length>0||s.length>0,hasScrollBindings:c.length>0,hasTouchBindings:l.length>0}},[e,t]);return(0,Y.useEffect)(()=>{t.setState(e=>({...e,actions:{...e.actions,...r.initialActions}}));let e;return r.hasKeyBindings&&(r.deriveKeyActions(t.getState().keys),e=t.subscribe(e=>e.keys,e=>r.deriveKeyActions(e))),r.hasMouseBindings&&(n.addEventListener(`mousedown`,r.handleMouseDown),document.addEventListener(`mousemove`,r.handleMouseMove),document.addEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.addEventListener(`wheel`,r.handleWheel,{passive:!0}),r.hasTouchBindings&&(n.addEventListener(`touchstart`,r.handleTouchStart,{passive:!0}),document.addEventListener(`touchmove`,r.handleTouchMove,{passive:!0}),document.addEventListener(`touchend`,r.handleTouchEnd,{passive:!0}),document.addEventListener(`touchcancel`,r.handleTouchEnd,{passive:!0})),()=>{e?.(),r.hasMouseBindings&&(n.removeEventListener(`mousedown`,r.handleMouseDown),document.removeEventListener(`mousemove`,r.handleMouseMove),document.removeEventListener(`mouseup`,r.handleMouseUp)),r.hasScrollBindings&&n.removeEventListener(`wheel`,r.handleWheel),r.hasTouchBindings&&(n.removeEventListener(`touchstart`,r.handleTouchStart),document.removeEventListener(`touchmove`,r.handleTouchMove),document.removeEventListener(`touchend`,r.handleTouchEnd),document.removeEventListener(`touchcancel`,r.handleTouchEnd)),t.setState(e=>{let t={...e.actions};for(let e of r.actionNames)delete t[e];return{...e,actions:t}})}},[r,t,n]),null}var Fa=[{name:`moveForward`,keys:[`KeyW`]},{name:`moveBackward`,keys:[`KeyS`]},{name:`moveLeft`,keys:[`KeyA`]},{name:`moveRight`,keys:[`KeyD`]},{name:`moveUp`,keys:[`KeyE`]},{name:`moveDown`,keys:[`KeyQ`]},{name:`adjustSpeed`,keys:[{type:`scroll`}]}],Ia=[{name:`lookUp`,keys:[`ArrowUp`]},{name:`lookDown`,keys:[`ArrowDown`]},{name:`lookLeft`,keys:[`ArrowLeft`]},{name:`lookRight`,keys:[`ArrowRight`]},{name:`dragLook`,keys:[{type:`drag`,button:0}]},{name:`lockedLook`,keys:[{type:`pointerLockMove`}]},{name:`touchLook`,keys:[{type:`touch`}]}],La=[{name:`canvasClick`,keys:[{type:`click`,button:0,whenPointerLocked:!1}]}],Ra=[{name:`camera1`,keys:[`Digit1`]},{name:`camera2`,keys:[`Digit2`]},{name:`camera3`,keys:[`Digit3`]},{name:`camera4`,keys:[`Digit4`]},{name:`camera5`,keys:[`Digit5`]},{name:`camera6`,keys:[`Digit6`]},{name:`camera7`,keys:[`Digit7`]},{name:`camera8`,keys:[`Digit8`]},{name:`camera9`,keys:[`Digit9`]}],za=[{name:`playPause`,keys:[`Space`]},{name:`decreasePlaybackSpeed`,keys:[`Comma`,`Shift-Comma`]},{name:`increasePlaybackSpeed`,keys:[`Period`,`Shift-Period`]}],Ba=[{name:`toggleObserverMode`,keys:[`Space`]}],Va=[{name:`nextPlayer`,keys:[{type:`click`,button:0,whenPointerLocked:!0}]}],Ha=[{name:`nextStop`,keys:[{type:`click`,button:0}]},{name:`exitTour`,keys:[`Escape`]}],Ua=[{name:`toggleCommandCircuit`,keys:[`KeyC`]}],Wa=[{name:`commandPanUp`,keys:[`KeyW`]},{name:`commandPanDown`,keys:[`KeyS`]},{name:`commandPanLeft`,keys:[`KeyA`]},{name:`commandPanRight`,keys:[`KeyD`]},{name:`commandPanDrag`,keys:[{type:`drag`,button:0}]},{name:`commandZoom`,keys:[{type:`scroll`}]},{name:`exitCommandCircuit`,keys:[`Escape`]}];function Ga(){let e=(0,q.c)(35),t=pt(),n=ht(),r=Be(qa),i=Qe(Ka),a=t?.source===`demo`,o=t?.source===`live`,s=!t,c=s&&!r&&!i||o&&n===`fly`,l=!r&&!i,u=!r&&!i,d;e[0]===c?d=e[1]:(d=c&&(0,J.jsx)($,{map:Fa}),e[0]=c,e[1]=d);let f;e[2]===l?f=e[3]:(f=l&&(0,J.jsx)($,{map:Ia}),e[2]=l,e[3]=f);let p;e[4]===u?p=e[5]:(p=u&&(0,J.jsx)($,{map:La}),e[4]=u,e[5]=p);let m;e[6]!==i||e[7]!==s||e[8]!==r?(m=s&&!r&&!i&&(0,J.jsx)($,{map:Ra}),e[6]=i,e[7]=s,e[8]=r,e[9]=m):m=e[9];let h;e[10]!==s||e[11]!==r?(h=s&&!r&&(0,J.jsx)($,{map:Ua}),e[10]=s,e[11]=r,e[12]=h):h=e[12];let g;e[13]===i?g=e[14]:(g=i&&(0,J.jsx)($,{map:Wa}),e[13]=i,e[14]=g);let _;e[15]===a?_=e[16]:(_=a&&(0,J.jsx)($,{map:za}),e[15]=a,e[16]=_);let v;e[17]===o?v=e[18]:(v=o&&(0,J.jsx)($,{map:Ba}),e[17]=o,e[18]=v);let y;e[19]!==n||e[20]!==o?(y=o&&n===`follow`&&(0,J.jsx)($,{map:Va}),e[19]=n,e[20]=o,e[21]=y):y=e[21];let b;e[22]===r?b=e[23]:(b=r&&(0,J.jsx)($,{map:Ha}),e[22]=r,e[23]=b);let x;return e[24]!==d||e[25]!==f||e[26]!==p||e[27]!==m||e[28]!==h||e[29]!==g||e[30]!==_||e[31]!==v||e[32]!==y||e[33]!==b?(x=(0,J.jsxs)(J.Fragment,{children:[d,f,p,m,h,g,_,v,y,b]}),e[24]=d,e[25]=f,e[26]=p,e[27]=m,e[28]=h,e[29]=g,e[30]=_,e[31]=v,e[32]=y,e[33]=b,e[34]=x):x=e[34],x}function Ka(e){return e.active}function qa(e){return e.animation!==null}function Ja(e,t){return(0,Y.lazy)(()=>t().then(t=>({default:t[e]})))}var Ya=Ja(`StreamingController`,()=>W(()=>import(`./StreamingController-BBtJ3pR4.js`),__vite__mapDeps([33,1,2,3,4,5,8,9,10,11,0,6,7,12,13,14,15,16,17,18,19,20,21,22,23,24,25,34,35]))),Xa=Ja(`DebugElements`,()=>W(()=>import(`./DebugElements-BGAxQkkb.js`),__vite__mapDeps([36,1,2,3,4,5,6,7,37]))),Za=Ja(`Mission`,()=>W(()=>import(`./Mission-CVvI3lYr.js`),__vite__mapDeps([38,1,2,12,15,16,9,10,17,11,5,34]))),Qa=Ja(`ChatSoundPlayer`,()=>W(()=>import(`./ChatSoundPlayer-CND8tv0u.js`),__vite__mapDeps([39,1,2,8,9,10,11,5,4,15,16,17,19,3,6,7,20,21,22]))),$a=(0,Y.memo)(function(e){let t=(0,q.c)(24),{dpr:n,onCreated:r,missionName:i,missionType:a,onLoadingChange:o}=e,s=pt(),c=Xe(),l=c===`demo`||c===`live`,u,d;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(u=(0,J.jsx)(Ga,{}),d=(0,J.jsx)(it,{}),t[0]=u,t[1]=d):(u=t[0],d=t[1]);let f;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(f=(0,J.jsx)(Kt,{}),t[2]=f):f=t[2];let p,m,h;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(p=(0,J.jsx)(Y.Suspense,{children:(0,J.jsx)(Wr,{})}),m=(0,J.jsx)(Xr,{}),h=(0,J.jsx)(ui,{}),t[3]=p,t[4]=m,t[5]=h):(p=t[3],m=t[4],h=t[5]);let g;t[6]===Symbol.for(`react.memo_cache_sentinel`)?(g=(0,J.jsx)(Tr,{children:(0,J.jsx)(Qa,{})}),t[6]=g):g=t[6];let _;t[7]===Symbol.for(`react.memo_cache_sentinel`)?(_=(0,J.jsx)(Si,{children:(0,J.jsx)(Xa,{})}),t[7]=_):_=t[7];let v;t[8]===s?v=t[9]:(v=s?(0,J.jsx)(Y.Suspense,{children:(0,J.jsx)(Ya,{recording:s})}):null,t[8]=s,t[9]=v);let y;t[10]!==l||t[11]!==i||t[12]!==a||t[13]!==o?(y=l?null:(0,J.jsx)(Y.Suspense,{children:(0,J.jsx)(Za,{name:i,missionType:a,onLoadingChange:o},`${i}~${a}`)}),t[10]=l,t[11]=i,t[12]=a,t[13]=o,t[14]=y):y=t[14];let b,x;t[15]===Symbol.for(`react.memo_cache_sentinel`)?(b=(0,J.jsx)(ka,{}),x=(0,J.jsx)(Ii,{}),t[15]=b,t[16]=x):(b=t[15],x=t[16]);let S;t[17]!==y||t[18]!==v?(S=(0,J.jsx)(tn,{children:(0,J.jsxs)(nt,{children:[u,d,(0,J.jsxs)(ze,{children:[f,p,m,h,g,_,v,y,b,x]})]})}),t[17]=y,t[18]=v,t[19]=S):S=t[19];let C;return t[20]!==n||t[21]!==r||t[22]!==S?(C=(0,J.jsx)(Qt,{dpr:n,onCreated:r,children:S}),t[20]=n,t[21]=r,t[22]=S,t[23]=C):C=t[23],C});export{$a as GameView};