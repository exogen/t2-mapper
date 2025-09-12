"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  getActualResourcePath,
  getResourceList,
  getSource,
} from "@/src/manifest";
import { parseTerrainBuffer } from "@/src/terrain";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { getTerrainFile, iterObjects, parseMissionScript } from "@/src/mission";

const BASE_URL = "/t2-mapper";
const RESOURCE_ROOT_URL = `${BASE_URL}/base/`;

function getUrlForPath(resourcePath: string) {
  resourcePath = getActualResourcePath(resourcePath);
  const sourcePath = getSource(resourcePath);
  if (!sourcePath) {
    return `${RESOURCE_ROOT_URL}${resourcePath}`;
  } else {
    return `${RESOURCE_ROOT_URL}@vl2/${sourcePath}/${resourcePath}`;
  }
}

function terrainTextureToUrl(name: string) {
  name = name.replace(/^terrain\./, "");
  try {
    return getUrlForPath(`textures/terrain/${name}.png`);
  } catch (err) {
    return `${BASE_URL}/black.png`;
  }
}

function textureToUrl(name: string) {
  try {
    return getUrlForPath(`textures/${name}.png`);
  } catch (err) {
    return `${BASE_URL}/black.png`;
  }
}

function uint16ToFloat32(src: Uint16Array) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    out[i] = src[i] / 65535;
  }
  return out;
}

async function loadMission(name: string) {
  const res = await fetch(getUrlForPath(`missions/${name}.mis`));
  const missionScript = await res.text();
  return parseMissionScript(missionScript);
}

async function loadTerrain(fileName: string) {
  const res = await fetch(getUrlForPath(`terrains/${fileName}`));
  const terrainBuffer = await res.arrayBuffer();
  return parseTerrainBuffer(terrainBuffer);
}

function resizeRendererToDisplaySize(renderer) {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
  }
  return needResize;
}

const excludeMissions = new Set([
  "SkiFree",
  "SkiFree_Daily",
  "SkiFree_Randomizer",
]);

const missions = getResourceList()
  .map((resourcePath) => resourcePath.match(/^missions\/(.+)\.mis$/))
  .filter(Boolean)
  .map((match) => match[1])
  .filter((name) => !excludeMissions.has(name));

export default function HomePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [missionName, setMissionName] = useState("TWL2_WoodyMyrk");
  const threeContext = useRef<Record<string, any>>({});

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });

    const textureLoader = new THREE.TextureLoader();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      2000
    );

    function setupColor(tex) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; // Still need this for tiling to work
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() ?? 16;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    }

    function setupMask(data) {
      const tex = new THREE.DataTexture(
        data,
        256,
        256,
        THREE.RedFormat, // 1 channel
        THREE.UnsignedByteType // 8-bit
      );

      // Masks should stay linear
      tex.colorSpace = THREE.NoColorSpace;

      // Set tiling / sampling. For NPOT sizes, disable mips or use power-of-two.
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.generateMipmaps = false; // if width/height are not powers of two
      tex.minFilter = THREE.LinearFilter; // avoid mips if generateMipmaps=false
      tex.magFilter = THREE.LinearFilter;

      tex.needsUpdate = true;

      return tex;
    }

    const skyColor = "rgba(209, 237, 255, 1)";
    const groundColor = "rgba(186, 200, 181, 1)";
    const intensity = 2;
    const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
    scene.add(light);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 10;
    controls.maxDistance = 1000;
    camera.position.set(0, 0, 512);
    controls.target.set(0, -128, 0);
    controls.update();

    const keys = { w: false, a: false, s: false, d: false };

    const onKeyDown = (e) => {
      if (e.code === "KeyW") keys.w = true;
      if (e.code === "KeyA") keys.a = true;
      if (e.code === "KeyS") keys.s = true;
      if (e.code === "KeyD") keys.d = true;
    };

    const onKeyUp = (e) => {
      if (e.code === "KeyW") keys.w = false;
      if (e.code === "KeyA") keys.a = false;
      if (e.code === "KeyS") keys.s = false;
      if (e.code === "KeyD") keys.d = false;
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    const moveSpeed = 1;

    const animate = (t) => {
      // Determine direction relative to camera orientation
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0; // constrain to XZ plane
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, camera.up).normalize();

      let move = new THREE.Vector3();
      if (keys.w) move.add(forward);
      if (keys.s) move.add(forward.clone().negate());
      if (keys.a) move.add(right.clone().negate());
      if (keys.d) move.add(right);

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(moveSpeed);
        camera.position.add(move);
        controls.target.add(move); // shift the orbit target, too
      }

      controls.update();

      if (resizeRendererToDisplaySize(renderer)) {
        const canvas = renderer.domElement;
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
      }

      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);

    threeContext.current = {
      scene,
      renderer,
      setupColor,
      setupMask,
      textureLoader,
    };

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      controls.dispose();
    };
  }, []);

  useEffect(() => {
    const { scene, setupColor, setupMask, textureLoader } =
      threeContext.current;

    let cancel = false;
    let root: THREE.Group;

    async function loadMap() {
      const mission = await loadMission(missionName);
      const terrainFile = getTerrainFile(mission);
      const terrain = await loadTerrain(terrainFile);

      const layerCount = terrain.textureNames.length;

      const baseTextures = terrain.textureNames.map((name) => {
        return setupColor(textureLoader.load(terrainTextureToUrl(name)));
      });

      const alphaTextures = terrain.alphaMaps.map((data) => setupMask(data));

      // Geometry: a simple plane (512x512 meters to match Tribes 2 scale)
      const planeSize = 1024;
      const geom = new THREE.PlaneGeometry(planeSize, planeSize, 256, 256);
      geom.rotateX(-Math.PI / 2);

      const f32HeightMap = uint16ToFloat32(terrain.heightMap);

      const heightMap = new THREE.DataTexture(
        f32HeightMap,
        256,
        256,
        THREE.RedFormat,
        THREE.FloatType
      );
      heightMap.colorSpace = THREE.NoColorSpace;
      heightMap.generateMipmaps = false;
      heightMap.needsUpdate = true;

      // Start with a standard material; assign map to trigger USE_MAP/vMapUv
      const mat = new THREE.MeshStandardMaterial({
        // map: base0,
        displacementMap: heightMap,
        map: heightMap,
        displacementScale: 1024,
        displacementBias: -128,
      });

      // Inject our 4-layer blend before lighting
      mat.onBeforeCompile = (shader) => {
        // uniforms for 4 albedo maps + 3 alpha masks
        baseTextures.forEach((tex, i) => {
          shader.uniforms[`albedo${i}`] = { value: tex };
        });
        alphaTextures.forEach((tex, i) => {
          if (i > 0) {
            shader.uniforms[`mask${i}`] = { value: tex };
          }
        });

        // Add per-texture tiling uniforms
        baseTextures.forEach((tex, i) => {
          shader.uniforms[`tiling${i}`] = {
            value: Math.min(
              512,
              { 0: 16, 1: 16, 2: 32, 3: 64, 4: 64, 5: 64 }[i]
            ),
          };
        });

        // Declare our uniforms at the top of the fragment shader
        shader.fragmentShader =
          `
uniform sampler2D albedo0;
uniform sampler2D albedo1;
uniform sampler2D albedo2;
uniform sampler2D albedo3;
uniform sampler2D albedo4;
uniform sampler2D albedo5;
uniform sampler2D mask1;
uniform sampler2D mask2;
uniform sampler2D mask3;
uniform sampler2D mask4;
uniform sampler2D mask5;
uniform float tiling0;
uniform float tiling1;
uniform float tiling2;
uniform float tiling3;
uniform float tiling4;
uniform float tiling5;
` + shader.fragmentShader;

        // Replace the default map sampling block with our layered blend.
        // We rely on vMapUv provided by USE_MAP.
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          `
  // Sample base albedo layers (sRGB textures auto-decoded to linear)
  vec2 baseUv = vMapUv;
  vec3 c0 = texture2D(albedo0, baseUv * vec2(tiling0)).rgb;
  ${
    layerCount > 1
      ? `vec3 c1 = texture2D(albedo1, baseUv * vec2(tiling1)).rgb;`
      : ""
  }
  ${
    layerCount > 2
      ? `vec3 c2 = texture2D(albedo2, baseUv * vec2(tiling2)).rgb;`
      : ""
  }
  ${
    layerCount > 3
      ? `vec3 c3 = texture2D(albedo3, baseUv * vec2(tiling3)).rgb;`
      : ""
  }
  ${
    layerCount > 4
      ? `vec3 c4 = texture2D(albedo4, baseUv * vec2(tiling4)).rgb;`
      : ""
  }
  ${
    layerCount > 5
      ? `vec3 c5 = texture2D(albedo5, baseUv * vec2(tiling5)).rgb;`
      : ""
  }

  // Sample linear masks (use R channel)
  float a1 = texture2D(mask1, baseUv).r;
  ${layerCount > 1 ? `float a2 = texture2D(mask2, baseUv).r;` : ""}
  ${layerCount > 2 ? `float a3 = texture2D(mask3, baseUv).r;` : ""}
  ${layerCount > 3 ? `float a4 = texture2D(mask4, baseUv).r;` : ""}
  ${layerCount > 4 ? `float a5 = texture2D(mask5, baseUv).r;` : ""}

  // Bottom-up compositing: each mask tells how much the higher layer replaces lower
  ${layerCount > 1 ? `vec3 blended = mix(c0, c1, clamp(a1, 0.0, 1.0));` : ""}
  ${layerCount > 2 ? `blended = mix(blended, c2, clamp(a2, 0.0, 1.0));` : ""}
  ${layerCount > 3 ? `blended = mix(blended, c3, clamp(a3, 0.0, 1.0));` : ""}
  ${layerCount > 4 ? `blended = mix(blended, c4, clamp(a4, 0.0, 1.0));` : ""}
  ${layerCount > 5 ? `blended = mix(blended, c5, clamp(a5, 0.0, 1.0));` : ""}

  // Assign to diffuseColor before lighting
  diffuseColor.rgb = ${layerCount > 1 ? "blended" : "c0"};
`
        );
      };

      root = new THREE.Group();

      const mesh = new THREE.Mesh(geom, mat);
      root.add(mesh);

      for (const obj of iterObjects(mission.objects)) {
        const getProperty = (name) =>
          obj.properties.find((p) => p.target.name === name);

        switch (obj.className) {
          case "WaterBlock": {
            break;
            const position = getProperty("position").value;
            const scale = getProperty("scale").value;
            const rotation = getProperty("rotation").value;
            const surfaceTexture = getProperty("surfaceTexture").value;

            const [x, y, z] = position.split(" ").map((s) => parseFloat(s));

            const [ax, ay, az, angle] = rotation
              .split(" ")
              .map((s) => parseFloat(s));

            const q = new THREE.Quaternion();
            q.setFromAxisAngle(new THREE.Vector3(ax, az, ay), angle);

            const [scaleX, scaleY, scaleZ] = scale
              .split(" ")
              .map((s) => parseFloat(s) / 2);

            const geometry = new THREE.BoxGeometry(scaleX, scaleZ, scaleY);
            const material = new THREE.MeshStandardMaterial({
              map: setupColor(textureLoader.load(textureToUrl(surfaceTexture))),
            });
            const water = new THREE.Mesh(geometry, material);
            water.position.set(x, z, y);
            water.quaternion.copy(q);

            root.add(water);
            break;
          }
        }
      }

      if (cancel) {
        return;
      }

      scene.add(root);
    }

    loadMap();

    return () => {
      cancel = true;
      root.removeFromParent();
    };
  }, [missionName]);

  return (
    <main>
      <canvas ref={canvasRef} id="canvas" />
      <select
        id="missionList"
        value={missionName}
        onChange={(e) => setMissionName(e.target.value)}
      >
        {missions.map((missionName) => (
          <option key={missionName}>{missionName}</option>
        ))}
      </select>
    </main>
  );
}
