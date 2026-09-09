/** Real-scene A/B comparison, including pool preparation and GPU uploads.
 * node --import=tsx scripts/compare-dts-instances.ts <demo-url> [output] [seek]
 * Uses the already-running local development server. */
import fs from "node:fs/promises";
import { launchApp, loadDemoScript } from "./lib/browserApp";

const [url, output = "/private/tmp/dts-instances", seek = "600"] =
  process.argv.slice(2);
if (!url)
  throw new Error("Expected demo URL, optional output prefix and seek seconds");
const browser = await launchApp({ protocolTimeout: 240000 });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(String(error));
    console.error(String(error));
  });
  page.on("console", (message) => {
    if (/\[instances\]/.test(message.text())) console.log(message.text());
    if (message.type() === "error") console.error(message.text());
    if (
      message.type() === "error" &&
      /WebGL|Shader|GL_INVALID/.test(message.text())
    )
      errors.push(message.text());
  });
  // Preserve the app's exact module URLs through the demo's asset requests.
  await page.evaluateOnNewDocument(
    "performance.setResourceTimingBufferSize(10000)",
  );
  await page.setViewport({ width: 1280, height: 720 });
  // This script owns the adapter so it can alternate native and pooled draws.
  await page.goto("http://localhost:3000/?mode=demo&dtsInstancing=0", {
    waitUntil: "networkidle2",
  });
  await page.evaluate(`(async () => { ${loadDemoScript(url)}
    engine.engineStore.getState().setPlaybackStatus("paused");
    engine.engineStore.getState().seekPlayback(${Number(seek)});
  })()`);
  await page.waitForSelector("canvas", { timeout: 60000 });
  await page
    .waitForNetworkIdle({ idleTime: 1500, timeout: 60000 })
    .catch(() => {});
  console.log("Loaded; comparing native skins and independent poses");
  const session = process.env.DTS_PROFILE
    ? await page.createCDPSession()
    : undefined;
  if (session) {
    await session.send("Profiler.enable");
    await session.send("Profiler.start");
  }
  const result: any = await page.evaluate(`(async () => {
    const urls = performance.getEntriesByType("resource").map(r => r.name);
    const resolve = p => urls.find(n => n.includes(p)) ?? p;
    const fiber = await import(resolve("/node_modules/.vite/deps/@react-three_fiber.js"));
    const model = await import(resolve("/src/dts/dtsModel.ts"));
    const instances = await import(resolve("/src/dts/dtsAnimatedInstances.ts"));
    // A canvas element can exist before Fiber has mounted its render root.
    const rootDeadline = performance.now() + 30000;
    while (!fiber._roots.size) {
      if (performance.now() > rootDeadline) throw new Error("Three scene did not mount");
      await new Promise(requestAnimationFrame);
    }
    const state = [...fiber._roots.values()][0].store.getState();
    const { gl, scene, camera } = state;
    const ctx = gl.getContext(), extension = ctx.getExtension("WEBGL_debug_renderer_info");
    const renderer = extension ? ctx.getParameter(extension.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);
    const bodies = [];
    const collect = () => {
      bodies.length = 0;
      scene.traverse(node => { if (node instanceof model.DTSRigidMeshBatch) bodies.push(node); });
    };
    collect();
    const entities = await import(resolve("/src/state/gameEntityStore.ts"));
    const expectedPlayers = [...entities.gameEntityStore.getState().streamEntities.values()]
      .filter(entity => entity.renderType === "Player" && entity.shapeName).length;
    const isPlayer = shape => shape.data?.materials.some(m => /base\\.(lmale|lfemale|lbioderm|mmale|mfemale|mbioderm|hmale|hbioderm)$/i.test(m.name));
    const deadline = performance.now() + 30000;
    while (bodies.filter(b => isPlayer(b.parent)).length < expectedPlayers) {
      if (performance.now() > deadline) throw new Error("Player models did not finish loading");
      await new Promise(requestAnimationFrame); collect();
    }
    state.setFrameloop("never");
    const handle = instances.installDTSAnimatedInstances(scene, gl);
    let prepareTime = 0, prepares = 0;
    const prepare = handle.pool.prepare.bind(handle.pool);
    handle.pool.prepare = (...args) => {
      const start = performance.now(); prepare(...args);
      prepareTime += performance.now() - start; prepares++;
    };
    const measurements = [];
    for (const enabled of [false, true, false, true]) {
      handle.pool.enabled = enabled;
      for (let i = 0; i < 15; i++) gl.render(scene, camera);
      const times = [];
      prepareTime = prepares = 0;
      for (let i = 0; i < 120; i++) {
        await new Promise(requestAnimationFrame);
        const start = performance.now();
        gl.render(scene, camera);
        times.push(performance.now() - start);
      }
      measurements.push({ instanced: enabled, renderMS: times.reduce((a,b)=>a+b,0)/times.length,
        drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles,
        pool: {...handle.pool.stats}, prepareMS: prepareTime/prepares, memory: {...gl.info.memory} });
      console.info("[instances] demo", JSON.stringify(measurements.at(-1)));
    }
    const capture = (enabled, targetScene = scene, targetCamera = camera, targetHandle = handle) => {
      targetHandle.pool.enabled = enabled;
      gl.render(targetScene, targetCamera);
      const pixels = new Uint8Array(ctx.drawingBufferWidth * ctx.drawingBufferHeight * 4);
      ctx.readPixels(0,0,ctx.drawingBufferWidth,ctx.drawingBufferHeight,ctx.RGBA,ctx.UNSIGNED_BYTE,pixels);
      return { png: gl.domElement.toDataURL("image/png"), pixels };
    };
    const compare = (targetScene = scene, targetCamera = camera, targetHandle = handle) => {
      const before = capture(false, targetScene, targetCamera, targetHandle), after = capture(true, targetScene, targetCamera, targetHandle);
      let total = 0, changedPixels = 0, max = 0;
      for (let i = 0; i < before.pixels.length; i+=4) {
        let changed = false;
        for (let c = 0; c < 3; c++) {
          const difference = Math.abs(before.pixels[i+c] - after.pixels[i+c]);
          total += difference; max = Math.max(max, difference); changed ||= difference > 3;
        }
        if (changed) changedPixels++;
      }
      return { meanChannelDifference: total/(before.pixels.length/4*3), changedPixels, max, before: before.png, after: after.png };
    };
    const wide = compare();
    console.info("[instances] wide pixels compared");
    const target = bodies.find(b => isPlayer(b.parent));
    const center = target.parent.getWorldPosition(camera.position.clone()); center.y += 1;
    camera.position.copy(center).add({x:3, y:1, z:5}); camera.lookAt(center); camera.updateMatrixWorld(true);
    const close = compare();
    console.info("[instances] close pixels compared");
    const pool = {...handle.pool.stats};
    handle.dispose();
    console.info("[instances] demo pool disposed");

    // Scale the same recorded player models/skins to an animated crowd. This
    // isolates shape rendering from the mission and playback simulation.
    const three = await import(resolve("/node_modules/.vite/deps/three.js"));
    const { DTSAnimationMixer } = await import(resolve("/src/dts/dtsAnimationMixer.ts"));
    console.info("[instances] three loaded");
    const skeletonUtils = await import(resolve("/node_modules/.vite/deps/three_examples_jsm_utils_SkeletonUtils__js.js"));
    console.info("[instances] clone utility loaded");
    const crowd = new three.Scene();
    crowd.background = new three.Color(0x30343a);
    const crowdCamera = new three.PerspectiveCamera(55, 1280/720, 0.1, 1000);
    crowdCamera.position.set(30, 32, 65); crowdCamera.lookAt(25, 0, 20);
    const playerBodies = bodies.filter(b => isPlayer(b.parent));
    const mixers = [];
    for (let i = 0; i < 120; i++) {
      const source = playerBodies[i % playerBodies.length].parent;
      if (i % 20 === 0) console.info("[instances] cloning", i);
      // Live materials contain fade bookkeeping with Texture references.
      // Material.clone JSON-serializes userData (including those images), unlike
      // the app's normal clone-before-material-replacement path. These materials
      // are shared below, so omit that throwaway copy during benchmark setup.
      const saved = new Map();
      source.traverse(n => {
        for (const material of n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : []) {
          if (!saved.has(material)) { saved.set(material, material.userData); material.userData = {}; }
        }
      });
      let shape;
      try { shape = skeletonUtils.clone(source); }
      finally { for (const [material, userData] of saved) material.userData = userData; }
      // Keep the actual resolved materials, with their selected skin and shader
      // hooks. SkeletonUtils alone intentionally does not clone shader hooks.
      const originals = []; source.traverse(n => originals.push(n));
      let j = 0;
      shape.traverse(n => { const original = originals[j++]; if (n.isMesh) n.material = original.material; });
      shape.position.set((i % 12)*5, 0, Math.floor(i/12)*5);
      shape.rotation.set(0, (i%5)*0.4, 0);
      const mixer = new DTSAnimationMixer(shape);
      const clip = shape.animations.find(c => /run|forward/i.test(c.name)) || shape.animations[0];
      if (clip) mixer.clipAction(clip).play();
      mixer.setTime(i*0.037);
      mixers.push(mixer); crowd.add(shape);
    }
    const crowdHandle = instances.installDTSAnimatedInstances(crowd, gl);
    console.info("[instances] crowd constructed", mixers.length);
    const crowdMeasurements = [];
    for (const enabled of [false, true, false, true]) {
      crowdHandle.pool.enabled = enabled;
      for (let i = 0; i < 15; i++) gl.render(crowd, crowdCamera);
      const times = [], animationTimes = [];
      for (let frame = 0; frame < 120; frame++) {
        await new Promise(requestAnimationFrame);
        const start = performance.now();
        mixers.forEach((mixer, i) => mixer.setTime(frame/60 + i*0.037));
        const renderStart = performance.now();
        gl.render(crowd, crowdCamera);
        times.push(performance.now() - renderStart); animationTimes.push(renderStart-start);
      }
      crowdMeasurements.push({ instanced: enabled, renderMS: times.reduce((a,b)=>a+b,0)/times.length,
        animationMS: animationTimes.reduce((a,b)=>a+b,0)/times.length,
        drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles, pool: {...crowdHandle.pool.stats} });
      console.info("[instances] crowd", JSON.stringify(crowdMeasurements.at(-1)));
    }
    const crowdView = compare(crowd, crowdCamera, crowdHandle);
    crowdHandle.dispose();
    return { renderer, measurements, playerShapes: bodies.filter(b => isPlayer(b.parent)).length,
      playerSkins: new Set(bodies.filter(b => isPlayer(b.parent)).map(b => b.material.map?.source)).size,
      pool, wide, close, crowdView, crowd: { players: 120, measurements: crowdMeasurements }, glError: ctx.getError() };
  })()`);
  if (session) {
    const { profile } = await session.send("Profiler.stop");
    await fs.writeFile(`${output}.cpuprofile`, JSON.stringify(profile));
  }
  for (const view of ["wide", "close", "crowdView"] as const) {
    for (const mode of ["before", "after"] as const) {
      await fs.writeFile(
        `${output}-${view}-${mode}.png`,
        Buffer.from(result[view][mode].split(",")[1], "base64"),
      );
      delete result[view][mode];
    }
  }
  await fs.writeFile(
    `${output}.json`,
    JSON.stringify({ ...result, errors }, null, 2),
  );
  console.log(JSON.stringify({ ...result, errors }, null, 2));
  if (errors.length || result.glError) process.exitCode = 1;
} finally {
  await browser.close();
}
