/** Browser regression for real DTS categories, textures, animation and fading.
 * Uses the existing dev server; does not build or start another server. */
import fs from "node:fs/promises";
import { launchApp, openApp } from "./lib/browserApp";

const output = process.argv[2] ?? "/private/tmp/dts-shared-shapes";
const browser = await launchApp({ protocolTimeout: 240000 });
try {
  const page = await openApp(
    browser,
    "http://localhost:3000",
    /WebGL|Shader|Error/,
  );
  await page.setViewport({ width: 960, height: 720 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && /WebGL|Shader|GL_INVALID/.test(m.text()))
      errors.push(m.text());
  });
  const result: any = await page.evaluate(`(async () => {
    const urls = performance.getEntriesByType("resource").map(r => r.name);
    const resolve = p => urls.find(n => n.includes(p)) ?? p;
    const fiber = await import(resolve("/@react-three_fiber.js"));
    const three = await import(resolve("/three.js"));
    const { DTSAnimationMixer } = await import("/src/dts/dtsAnimationMixer.ts");
    const { ShapeLoader } = await import(resolve("/src/shapeLoader.ts"));
    const { getUrlForPath } = await import(resolve("/src/loaders.ts"));
    const { processShapeScene, disposeClonedScene } = await import(resolve("/src/stream/playbackUtils.ts"));
    const { installDTSAnimatedInstances } = await import(resolve("/src/dts/dtsAnimatedInstances.ts"));
    const { clone } = await import(resolve("/node_modules/.vite/deps/three_examples_jsm_utils_SkeletonUtils__js.js"));
    const ifl = await import(resolve("/src/iflAtlas.ts"));
    const { applyFadeAndCloak } = await import(resolve("/src/components/shapeFadeCloak.ts"));
    const state = [...fiber._roots.values()][0]?.store.getState();
    state?.setFrameloop("never");
    const gl = new three.WebGLRenderer({ antialias: true });
    gl.setSize(960,720); gl.toneMapping = three.NoToneMapping;
    document.body.appendChild(gl.domElement);
    const ctx = gl.getContext();
    const scenes = [];
    for (const name of ["borg18", "borg19", "flag", "weapon_energy", "ammo_plasma", "vehicle_air_scout", "vehicle_grav_tank", "mortar_explosion", "grenade_flare"]) {
      const model = await new ShapeLoader().loadAsync(getUrlForPath("shapes/" + name + ".dts"));
      const scene = new three.Scene(); scene.background = new three.Color(0x707070);
      scene.add(new three.AmbientLight(0xffffff, 1));
      const size = Math.max(model.bounds.getSize(new three.Vector3()).length(), 1);
      const camera = new three.PerspectiveCamera(45, 960/720, 0.01, size * 100);
      camera.position.set(size*2, size*2, size*4); camera.lookAt(0, size*0.5, 0);
      const shapes = [], mixers = [];
      await ifl.loadShapeImageLists(model);
      for (let i=0; i<8; i++) {
        const shape = clone(model.scene);
        processShapeScene(shape, name, { ignoreDetailSize: true, skinName: name === "flag" ? (i%2 ? "beagle" : "dsword") : undefined });
        shape.position.set((i%4-1.5)*size*0.5, 0, (Math.floor(i/4)-0.5)*size*0.8);
        shape.rotation.y = i * 0.37;
        shape.scale.set(0.8+i*0.03, 0.9+i*0.02, 1);
        const mixer = new DTSAnimationMixer(shape);
        const clip = model.animations.find(c => /ambient|activate|spin|idle/i.test(c.name)) ?? model.animations[0];
        if (clip) mixer.clipAction(clip).play();
        scene.add(shape); shapes.push(shape); mixers.push(mixer);
      }
      scenes.push({name, scene, camera, shapes, mixers});
    }
    // Let image loads initiated by material replacement settle before comparing.
    await new Promise(resolve => setTimeout(resolve, 3000));
    const rows = [];
    for (const fixture of scenes) {
      const { name, scene, camera, shapes, mixers } = fixture;
      const handle = installDTSAnimatedInstances(scene, gl);
      for (const mode of ["normal", "animated", "fade"]) {
        mixers.forEach((m,i) => m.setTime(mode === "normal" ? 0 : i*0.13+0.25));
        shapes.forEach((shape, i) => { shape.time = mode === "normal" ? 0 : i*0.137+0.25; });
        if (mode === "fade") shapes.forEach((s,i) => applyFadeAndCloak(s, 0.2+i*0.1, 0));
        const capture = enabled => {
          handle.pool.enabled = enabled; gl.render(scene, camera);
          const pixels = new Uint8Array(ctx.drawingBufferWidth*ctx.drawingBufferHeight*4);
          ctx.readPixels(0,0,ctx.drawingBufferWidth,ctx.drawingBufferHeight,ctx.RGBA,ctx.UNSIGNED_BYTE,pixels);
          return {pixels, png: gl.domElement.toDataURL("image/png"), calls: gl.info.render.calls, triangles: gl.info.render.triangles};
        };
        const before = capture(false), after = capture(true);
        let changed = 0, total = 0;
        for(let i=0;i<before.pixels.length;i+=4) {
          let different = false;
          for(let c=0;c<3;c++) { const d=Math.abs(before.pixels[i+c]-after.pixels[i+c]); total+=d; different ||= d>3; }
          if(different)changed++;
        }
        rows.push({ name, mode, beforeCalls: before.calls, afterCalls: after.calls, beforeTriangles: before.triangles, afterTriangles: after.triangles,
          changedPixels: changed, meanDifference: total/(before.pixels.length/4*3), pool: {...handle.pool.stats},
          before: mode === "normal" ? before.png : undefined, after: mode === "normal" ? after.png : undefined });
      }
      handle.dispose(); shapes.forEach(disposeClonedScene);
    }
    return {rows, glError: ctx.getError()};
  })()`);
  for (const row of result.rows) {
    for (const mode of ["before", "after"] as const) {
      if (row[mode])
        await fs.writeFile(
          `${output}-${row.name}-${mode}.png`,
          Buffer.from(row[mode].split(",")[1], "base64"),
        );
      delete row[mode];
    }
  }
  await fs.writeFile(
    `${output}.json`,
    JSON.stringify({ ...result, errors }, null, 2),
  );
  console.log(JSON.stringify({ ...result, errors }, null, 2));
  if (
    errors.length ||
    result.glError ||
    result.rows.some(
      (row: any) =>
        row.beforeTriangles !== row.afterTriangles || row.changedPixels > 500,
    )
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
