/** Compare shape-local eye queries with the old world/inverse path on Massive. */
import fs from "node:fs/promises";
import { launchApp, loadDemoScript } from "./lib/browserApp";

const output = process.argv[2] ?? "/private/tmp/dts-eye-positions";
const browser = await launchApp({ protocolTimeout: 240000 });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument(
    "performance.setResourceTimingBufferSize(10000)",
  );
  await page.goto("http://localhost:3000/?mode=demo", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await page.evaluate(`(async () => { ${loadDemoScript("https://demos.tribes2.online/demos/the-cut-back-to-ymir_20260906T0129_s5-massive_2b28bf.rec")}
    engine.engineStore.getState().setPlaybackStatus("paused");
    engine.engineStore.getState().seekPlayback(1500);
  })()`);
  await page
    .waitForNetworkIdle({ idleTime: 1500, timeout: 60000 })
    .catch(() => {});
  const result: any = await page.evaluate(`(async () => {
    const urls = performance.getEntriesByType("resource").map(r => r.name);
    const resolve = p => urls.find(n => n.includes(p)) ?? p;
    const { DTSShape, DTSAnimationTransform } = await import(resolve("/src/dts/dtsModel.ts"));
    const { getOwnNodePosition } = await import(resolve("/src/sceneNodes.ts"));
    const { Vector3, Matrix4 } = await import(resolve("/node_modules/.vite/deps/three.js"));
    const fiber = await import(resolve("/node_modules/.vite/deps/@react-three_fiber.js"));
    const state = [...fiber._roots.values()][0].store.getState();
    state.setFrameloop("never");
    const pairs = [], out = new Vector3();
    state.scene.traverse(root => {
      if (!(root instanceof DTSShape)) return;
      const eye = root.getNodeByName("eye");
      if (eye) pairs.push({ root, eye });
    });
    if (!pairs.length) throw new Error("No eyes loaded");
    const world = () => { for (const {root, eye} of pairs) root.worldToLocal(eye.getWorldPosition(out)); };
    const local = () => { for (const {root, eye} of pairs) getOwnNodePosition(root, eye, out); };
    const samples = { world: [], local: [] }, counts = {};
    for (const name of ["world", "local", "local", "world", "world", "local"]) {
      const run = name === "world" ? world : local;
      for (let i = 0; i < 20; i++) run();
      const start = performance.now();
      for (let i = 0; i < 100; i++) run();
      samples[name].push((performance.now() - start) / 100);
    }
    const multiply = Matrix4.prototype.multiplyMatrices, invert = Matrix4.prototype.invert;
    for (const [name, run] of [["world", world], ["local", local]]) {
      const count = { matrixProducts: 0, inverses: 0 };
      Matrix4.prototype.multiplyMatrices = function(...args) { count.matrixProducts++; return multiply.apply(this, args); };
      Matrix4.prototype.invert = function(...args) { count.inverses++; return invert.apply(this, args); };
      try { run(); } finally { Matrix4.prototype.multiplyMatrices = multiply; Matrix4.prototype.invert = invert; }
      counts[name] = count;
    }
    let maxDifference = 0, changedFrames = 0;
    const positions = new Map();
    for (let frame = 0; frame < 8; frame++) {
      let changed = false;
      for (const {root, eye} of pairs) {
        root.position.x += 0.004;
        const helper = root.getNode(0)?.parent;
        if (helper instanceof DTSAnimationTransform) {
          helper.position.x += 0.004;
          helper.matrixWorldNeedsUpdate = true;
        }
        const actual = getOwnNodePosition(root, eye, new Vector3());
        const expected = root.worldToLocal(eye.getWorldPosition(new Vector3()));
        maxDifference = Math.max(maxDifference, actual.distanceTo(expected));
        if (positions.has(eye) && !positions.get(eye).equals(actual)) changed = true;
        positions.set(eye, actual);
      }
      if (changed) changedFrames++;
    }
    return { eyes: pairs.length, samples, counts, changedFrames, maxDifference };
  })()`);
  await fs.writeFile(
    `${output}.json`,
    JSON.stringify({ result, errors }, null, 2),
  );
  console.log(JSON.stringify({ result, errors }, null, 2));
  if (
    errors.length ||
    result.maxDifference > 1e-8 ||
    result.changedFrames !== 7
  )
    throw new Error("Eye-position regression; see report");
} finally {
  await browser.close();
}
