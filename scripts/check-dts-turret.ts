/** Check RiverDance's plasma turret and a mounted MPB through EntityScene.
 * Compare separate meshes, merged meshes and GPU instances at fixed poses. */
import fs from "node:fs/promises";
import { launchApp } from "./lib/browserApp";

const output = process.argv[2] ?? "/private/tmp/dts-turret";
const browser = await launchApp({ protocolTimeout: 240000 });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(String(error));
    console.error(error);
  });
  page.on("console", (m) => {
    if (/Error|Failed|IFL|fixture/.test(m.text())) console.log(m.text());
  });
  await page.evaluateOnNewDocument(
    "performance.setResourceTimingBufferSize(10000)",
  );
  await page.setViewport({ width: 1100, height: 850 });
  await page.goto("http://localhost:3000/?mission=RiverDance&dtsInstancing=0", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await page
    .waitForNetworkIdle({ idleTime: 2000, timeout: 60000 })
    .catch(() => {});
  const result: any = await page.evaluate(`
(async () => {
  const urls = performance.getEntriesByType("resource").map((r) => r.name),
    resolve = (p) => urls.find((n) => n.includes(p)) ?? p;
  const fiber = await import(
    resolve("/node_modules/.vite/deps/@react-three_fiber.js")
  );
  const three = await import(resolve("/node_modules/.vite/deps/three.js"));
  const { DTSShape, isDTSMeshBatch, DTSRigidMeshBatch, DTSStaticMeshBatch } =
    await import(resolve("/src/dts/dtsModel.ts"));
  const { installDTSAnimatedInstances } = await import(
    resolve("/src/dts/dtsAnimatedInstances.ts")
  );
  const { DTSAnimationMixer } = await import(
    resolve("/src/dts/dtsAnimationMixer.ts")
  );
  const { gameEntityStore } = await import(
    resolve("/src/state/gameEntityStore.ts")
  );
  const state = [...fiber._roots.values()][0].store.getState(),
    { scene, gl } = state;
  let shapes = [];
  const find = () => {
    shapes = [];
    scene.traverse((n) => {
      if (
        n instanceof DTSShape &&
        n.data.materials.some((m) => m.name.includes("barrel_fusion_large"))
      )
        shapes.push(n);
    });
  };
  const deadline = performance.now() + 60000;
  while (!shapes.length) {
    find();
    if (performance.now() > deadline)
      throw new Error(
        "No plasma turrets: " + gameEntityStore.getState().missionName,
      );
    await new Promise(requestAnimationFrame);
  }
  // vehicle.cs mounts the station on Mount2 and turret on Mount1.
  // Add the real assets through EntityScene, with a plasma image on the turret.
  gameEntityStore.getState().setEntities([
    {
      id: "mount-fixture",
      className: "WheeledVehicle",
      renderType: "Shape",
      shapeName: "vehicle_land_mpbase.dts",
      shapeType: "WheeledVehicle",
      position: [0, 0, 500],
    },
    {
      id: "mount-fixture-station",
      className: "StaticShape",
      renderType: "Shape",
      shapeName: "station_inv_mpb.dts",
      mountObjectId: "mount-fixture",
      mountNode: 2,
    },
    {
      id: "mount-fixture-turret",
      className: "Turret",
      renderType: "Shape",
      shapeName: "turret_base_mpb.dts",
      shapeType: "Turret",
      mountObjectId: "mount-fixture",
      mountNode: 1,
      imageSlots: [
        { shapeName: "turret_fusion_large.dts", mountPoint: 0, dataBlockId: 0 },
      ],
    },
  ]);
  let fixtureShapes = [];
  while (fixtureShapes.length < 4) {
    fixtureShapes = [];
    scene.getObjectByName("mount-fixture")?.traverse((n) => {
      if (n instanceof DTSShape) fixtureShapes.push(n);
    });
    if (performance.now() > deadline)
      throw new Error("MPB fixture did not load");
    await new Promise(requestAnimationFrame);
  }
  // A player with nonstandard image slots/mounts, and an object mount that
  // shares a point with another object and an image. This exercises the UI
  // paths that a standalone DTS comparison cannot cover.
  const testImages = [];
  testImages[0] = {
    shapeName: "weapon_disc.dts",
    mountPoint: 2,
    dataBlockId: 0,
  };
  testImages[2] = {
    shapeName: "pack_upgrade_satchel.dts",
    mountPoint: 1,
    dataBlockId: 0,
  };
  testImages[4] = {
    shapeName: "weapon_energy.dts",
    mountPoint: 7,
    dataBlockId: 0,
    mountOffset: { position: [-2, 0, 0], quaternion: [0, 0, 0, 1] },
  };
  testImages[7] = {
    shapeName: "flag.dts",
    mountPoint: 0,
    dataBlockId: 0,
    mountOffset: {
      position: [2, 0, 0],
      quaternion: [0, 0, Math.sin(0.2), Math.cos(0.2)],
    },
  };
  gameEntityStore.getState().setEntities([
    {
      id: "player-mount-fixture",
      className: "Player",
      renderType: "Player",
      shapeName: "light_male.dts",
      position: [20, 0, 500],
      imageSlots: testImages,
    },
    {
      id: "shared-mount-fixture",
      className: "StaticShape",
      renderType: "Shape",
      shapeName: "turret_base_mpb.dts",
      position: [40, 0, 500],
      imageSlots: [testImages[7]],
    },
    {
      id: "shared-a",
      className: "StaticShape",
      renderType: "Shape",
      shapeName: "weapon_disc.dts",
      mountObjectId: "shared-mount-fixture",
      mountNode: 0,
    },
    {
      id: "shared-b",
      className: "StaticShape",
      renderType: "Shape",
      shapeName: "weapon_energy.dts",
      mountObjectId: "shared-mount-fixture",
      mountNode: 0,
    },
    {
      id: "shared-grandchild",
      className: "StaticShape",
      renderType: "Shape",
      shapeName: "pack_upgrade_satchel.dts",
      mountObjectId: "shared-a",
      mountNode: 31,
    },
  ]);
  const descendants = (id) => {
    const found = [];
    scene.getObjectByName(id)?.traverse((n) => {
      if (n instanceof DTSShape) found.push(n);
    });
    return found;
  };
  while (
    descendants("player-mount-fixture").length !== 5 ||
    descendants("shared-mount-fixture").length !== 5
  ) {
    if (performance.now() > deadline)
      throw new Error(
        "Missing player/shared/nested mount content: " +
          JSON.stringify({
            player: descendants("player-mount-fixture").length,
            shared: descendants("shared-mount-fixture").length,
          }),
      );
    await new Promise(requestAnimationFrame);
  }
  await new Promise((r) => setTimeout(r, 1500));
  state.setFrameloop("never");
  scene.updateMatrixWorld(true);
  const allShapes = [];
  scene.traverse((n) => {
    if (n instanceof DTSShape) {
      n.setImageAnimationTime(0);
      allShapes.push(n);
    }
  });
  const inventory = allShapes.map((n) => ({
    name: n.name,
    materials: n.data.materials.map((m) => m.name),
    position: n.getWorldPosition(new three.Vector3()).toArray(),
  }));
  const player = descendants("player-mount-fixture")[0];
  const imageRoots = [];
  player.traverse((n) => {
    if (n.userData.imageMount) imageRoots.push(n);
  });
  const { ShapeLoader } = await import(resolve("/src/shapeLoader.ts"));
  const { shapeToUrl } = await import(resolve("/src/loaders.ts"));
  const { getDTSImageMountTransform } = await import(
    resolve("/src/dts/dtsMount.ts")
  );
  const loader = new ShapeLoader();
  for (const image of testImages.filter(Boolean)) {
    const source = await loader.loadAsync(shapeToUrl(image.shapeName));
    const root = imageRoots.find((r) => {
      let matches = false;
      r.traverse((n) => {
        if (n instanceof DTSShape && n.data === source.data) matches = true;
      });
      return matches;
    });
    if (!root) throw new Error("Missing player image: " + image.shapeName);
    const nameIndex = player.data.names.findIndex(
      (n) => n.toLowerCase() === "mount" + image.mountPoint,
    );
    const nodeIndex = player.data.nodes.findIndex(
      (n) => n.nameIndex === nameIndex,
    );
    const expected = nodeIndex === -1 ? player : player.getNode(nodeIndex);
    if (root.parent !== expected)
      throw new Error("Wrong player mount: " + image.shapeName);
    const matrix = getDTSImageMountTransform(source.data, image.mountOffset);
    if (!root.matrix.equals(matrix))
      throw new Error("Image offset not applied: " + image.shapeName);
  }
  const turret = shapes[0];
  for (const shape of shapes)
    for (let i = 0; i < shape.data.objects.length; i++) {
      const name = shape.data.names[shape.data.objects[i].nameIndex];
      if (/^Hulk/i.test(name) && shape.getShapeObject(i).opacity !== 0)
        throw new Error("Healthy plasma turret shows " + name);
    }
  const center = turret.localToWorld(new three.Vector3(0, 1.1, 0));
  const camera = new three.PerspectiveCamera(48, 1100 / 850, 0.1, 2000);
  camera.position.copy(turret.localToWorld(new three.Vector3(2.5, 2.5, 4)));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const handle = installDTSAnimatedInstances(scene, gl),
    ctx = gl.getContext();
  const rows = [],
    images = [],
    comparisons = [];
  const capture = (name) => {
    gl.render(scene, camera);
    images.push({ name, png: gl.domElement.toDataURL() });
    rows.push({
      name,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      glError: ctx.getError(),
    });
    const pixels = new Uint8Array(
      ctx.drawingBufferWidth * ctx.drawingBufferHeight * 4,
    );
    ctx.readPixels(
      0,
      0,
      ctx.drawingBufferWidth,
      ctx.drawingBufferHeight,
      ctx.RGBA,
      ctx.UNSIGNED_BYTE,
      pixels,
    );
    return pixels;
  };
  const compare = (a, b, name) => {
    let changed = 0,
      total = 0,
      max = 0;
    for (let i = 0; i < a.length; i += 4) {
      let different = false;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(a[i + c] - b[i + c]);
        different ||= d > 3;
        total += d;
        max = Math.max(max, d);
      }
      changed += Number(different);
    }
    comparisons.push({
      name,
      changedPixels: changed,
      meanChannelDifference: total / ((a.length / 4) * 3),
      max,
    });
  };
  handle.pool.enabled = false;
  capture("native");
  handle.pool.enabled = true;
  capture("instanced");
  const details = [];
  turret.traverse((n) => {
    if (n.isMesh) {
      let visible = true;
      for (let p = n; p; p = p.parent) visible &&= p.visible;
      details.push({
        name: n.name,
        visible,
        parentVisible: n.parent?.visible,
        object: n.binding?.objectIndex,
        mat: n.binding?.materialIndex,
        decal: n.binding?.decalIndex,
        decalFrame: turret.decalFrames[n.binding?.decalIndex],
        opacity: turret.getShapeObject(n.binding?.objectIndex)?.opacity,
        material: Array.isArray(n.material)
          ? n.material.map((m) => m.name)
          : n.material.name,
        map: n.material.map
          ? {
              name: n.material.map.name,
              image: !!n.material.map.image,
              source: n.material.map.source.uuid,
              version: n.material.map.version,
            }
          : null,
        indices: n.geometry.index?.count,
        bind: n.bindings?.map((b) => [b.objectIndex, b.materialIndex]),
      });
    }
  });
  let batchEnabled = true;
  for (const Type of [DTSRigidMeshBatch, DTSStaticMeshBatch]) {
    const update = Type.prototype.updateBatch;
    Type.prototype.updateBatch = function (shape, detail) {
      update.call(this, shape, batchEnabled ? detail : -1);
    };
  }
  const check = (name) => {
    handle.pool.enabled = false;
    batchEnabled = false;
    const separate = capture(name + "-separate");
    batchEnabled = true;
    const merged = capture(name + "-merged");
    handle.pool.enabled = true;
    const instanced = capture(name + "-instanced");
    compare(separate, merged, name + "-merging");
    compare(merged, instanced, name + "-instancing");
  };
  check("plasma");
  const sample = (shape, name, position) => {
    const clip = shape.animations.find((c) => c.name.toLowerCase() === name);
    if (!clip) throw new Error("Missing fixture sequence: " + name);
    const mixer = new DTSAnimationMixer(shape),
      action = mixer.clipAction(clip).play();
    action.paused = true;
    action.time = clip.duration * position;
    mixer.update(0);
  };
  const mpb = fixtureShapes.find((n) => n.data.names.includes("ChassisPitch"));
  const station = fixtureShapes.find((n) =>
    n.data.names.includes("DumExtendPlatform"),
  );
  const base = fixtureShapes.find((n) => n.data.names.includes("BaseMain64"));
  for (const shape of fixtureShapes) sample(shape, "deploy", 1);
  sample(base, "activate", 1);
  scene.updateMatrixWorld(true);
  const focus = (shape, center, eye) => {
    camera.position.copy(shape.localToWorld(new three.Vector3(...eye)));
    camera.lookAt(shape.localToWorld(new three.Vector3(...center)));
    camera.updateMatrixWorld(true);
  };
  focus(mpb, [0, 2, 0], [13, 10, -18]);
  check("mpb");
  focus(station, [0, 1, 0], [4, 3, -7]);
  check("mpb-station");
  focus(base, [0, 2, 0], [4, 5, 7]);
  check("mpb-turret");
  sample(player, "root", 0);
  scene.updateMatrixWorld(true);
  focus(player, [0, 1, 0], [5, 3, 7]);
  check("player-mounts");
  // Exercise enabled damage decals as well as the healthy turret's hidden hulks.
  sample(turret, "visibility", 1);
  sample(turret, "damage", 1);
  scene.updateMatrixWorld(true);
  focus(turret, [0, 1.1, 0], [2.5, 2.5, 4]);
  check("plasma-damaged");
  const mounts = [];
  scene.traverse((n) => {
    if (n.userData.objectMount)
      mounts.push({ rotation: n.rotation.toArray(), parent: n.parent?.name });
  });
  handle.dispose();
  return {
    mission: gameEntityStore.getState().missionName,
    turrets: shapes.length,
    center: center.toArray(),
    rows,
    comparisons,
    mounts,
    inventory,
    details,
    ifl: turret.imageAnimations.map((a) => ({
      material: a.materialIndex,
      frames: a.frames.length,
      controlled: a.sequenceControlled,
    })),
    images,
  };
})();
  `);
  for (const image of result.images)
    await fs.writeFile(
      `${output}-${image.name}.png`,
      Buffer.from(image.png.split(",")[1], "base64"),
    );
  delete result.images;
  await fs.writeFile(
    `${output}.json`,
    JSON.stringify({ ...result, errors }, null, 2),
  );
  console.log(
    JSON.stringify(
      { comparisons: result.comparisons, mounts: result.mounts, errors },
      null,
      2,
    ),
  );
  if (errors.length || result.rows.some((r: { glError: number }) => r.glError))
    throw new Error("Mounted DTS rendering produced browser or WebGL errors");
  if (
    result.comparisons.some(
      (c: { meanChannelDifference: number }) => c.meanChannelDifference > 0.1,
    )
  )
    throw new Error("Mounted DTS rendering differs between rendering paths");
} finally {
  await browser.close();
}
