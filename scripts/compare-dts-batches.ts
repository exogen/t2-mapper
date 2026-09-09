/** In-session rendering comparison, holding camera, pose and scene fixed. */
import fs from "node:fs/promises";
import { launchApp, loadDemoScript, openApp } from "./lib/browserApp";

const [url, output = "/private/tmp/dts-batch-comparison", seek = "600"] =
  process.argv.slice(2);
if (!url)
  throw new Error(
    "Expected a demo URL, optional output prefix and seek seconds",
  );
const browser = await launchApp({ protocolTimeout: 180000 });
try {
  const page = await openApp(
    browser,
    "http://localhost:3000",
    /Error|Failed|TypeError|Cannot/,
  );
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluate(`(async () => { ${loadDemoScript(url)}
    engine.engineStore.getState().setPlaybackStatus("paused");
    engine.engineStore.getState().seekPlayback(${Number(seek)});
  })()`);
  await page
    .waitForNetworkIdle({ idleTime: 1500, timeout: 60000 })
    .catch(() => {});
  console.log("Scene loaded; comparing fixed frames");
  const result = await page.evaluate(`(async () => {
    const urls = performance.getEntriesByType("resource").map(r => r.name);
    const fiber = await import(urls.find(n => n.includes("/@react-three_fiber.js")));
    const model = await import(urls.find(n => n.includes("/src/dts/dtsModel.ts")));
    const state = [...fiber._roots.values()][0].store.getState();
    const { gl, scene, camera } = state;
    const ctx = gl.getContext(), extension = ctx.getExtension("WEBGL_debug_renderer_info");
    const renderer = extension ? ctx.getParameter(extension.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);
    const batches = [];
    const playerSkins = ["lmale", "lfemale", "lbioderm", "mmale", "mfemale", "mbioderm", "hmale", "hbioderm"];
    const isPlayer = shape => shape.data.materials.some(material => {
      const name = material.name.replaceAll(String.fromCharCode(92), "/").toLowerCase();
      return playerSkins.some(suffix => name.endsWith("/base." + suffix));
    });
    const shapes = [];
    const entities = await import(urls.find(n => n.includes("/src/state/gameEntityStore.ts")));
    const expectedPlayers = [...entities.gameEntityStore.getState().streamEntities.values()]
      .filter(entity => entity.renderType === "Player" && entity.shapeName).length;
    const collect = () => {
      shapes.length = batches.length = 0;
      scene.traverse(node => {
        if (node instanceof model.DTSShape) shapes.push(node);
        if (model.isDTSMeshBatch(node)) batches.push(node);
      });
    };
    const deadline = performance.now() + 30000;
    collect();
    while (shapes.filter(isPlayer).length < expectedPlayers) {
      if (performance.now() > deadline) throw new Error("Player models did not finish loading");
      await new Promise(requestAnimationFrame);
      collect();
    }
    state.setFrameloop("never");
    let enabled = "all";
    for (const Type of [model.DTSRigidMeshBatch, model.DTSStaticMeshBatch]) {
      const update = Type.prototype.updateBatch;
      Type.prototype.updateBatch = function(shape, detail) {
        update.call(this, shape, enabled === "all" || (enabled === "players" && isPlayer(shape)) ? detail : -1);
      };
    }
    const measurements = [];
    for (const mode of ["all", "players", "none", "all", "players", "none"]) {
      enabled = mode;
      for (let i = 0; i < 15; i++) gl.render(scene, camera);
      const times = [];
      for (let i = 0; i < 120; i++) {
        await new Promise(requestAnimationFrame);
        const start = performance.now();
        gl.render(scene, camera);
        times.push(performance.now() - start);
      }
      measurements.push({ batched: mode, renderMS: times.reduce((a,b)=>a+b,0)/times.length,
        drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles });
    }
    // Inspect the same player and compare actual pixels, with its resolved skin.
    const target = batches.find(batch => isPlayer(batch.parent)) || batches[0];
    const shape = target.parent;
    const position = shape.getWorldPosition(camera.position.clone());
    position.y += 1;
    camera.position.copy(position).add({x:3, y:1, z:5});
    camera.lookAt(position);
    camera.updateMatrixWorld(true);
    const capture = mode => {
      enabled = mode;
      gl.render(scene, camera);
      const pixels = new Uint8Array(ctx.drawingBufferWidth * ctx.drawingBufferHeight * 4);
      ctx.readPixels(0,0,ctx.drawingBufferWidth,ctx.drawingBufferHeight,ctx.RGBA,ctx.UNSIGNED_BYTE,pixels);
      return { png: gl.domElement.toDataURL("image/png"), pixels };
    };
    const before = capture("none"), after = capture("all");
    let total = 0, changedPixels = 0, max = 0;
    for (let i = 0; i < before.pixels.length; i+=4) {
      let changed = false;
      for (let c = 0; c < 3; c++) {
        const difference = Math.abs(before.pixels[i+c] - after.pixels[i+c]);
        total += difference; max = Math.max(max, difference);
        changed ||= difference > 3;
      }
      if (changed) changedPixels++;
    }
    return { renderer, measurements, batches: batches.length,
      playerShapes: shapes.filter(isPlayer).length,
      staticBatches: batches.filter(batch => batch instanceof model.DTSStaticMeshBatch).length,
      skinTextures: new Set(batches.map(batch => batch.material.map?.source)).size,
      pixels: { meanChannelDifference: total/(before.pixels.length/4*3), changedPixels, max },
      before: before.png, after: after.png };
  })()`);
  const { before, after, ...metrics } = result as {
    before: string;
    after: string;
    [key: string]: unknown;
  };
  await fs.writeFile(
    `${output}-before.png`,
    Buffer.from(before.split(",")[1], "base64"),
  );
  await fs.writeFile(
    `${output}-after.png`,
    Buffer.from(after.split(",")[1], "base64"),
  );
  await fs.writeFile(`${output}.json`, JSON.stringify(metrics, null, 2));
  console.log(metrics);
} finally {
  await browser.close();
}
