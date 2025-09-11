"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  getActualResourcePath,
  getResourceList,
  getSource,
} from "@/src/manifest";
import { parseTerrainBuffer } from "@/src/terrain";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getTerrainFile, parseMissionScript } from "@/src/mission";

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
  const [missionName, setMissionName] = useState("TWL_Raindance");

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

    async function loadMap() {
      const mission = await loadMission(missionName);
      const terrainFile = getTerrainFile(mission);
      const terrain = await loadTerrain(terrainFile);

      const layerCount = terrain.textureNames.length;

      console.log({ terrain });

      const baseTextures = terrain.textureNames.map((name) => {
        return setupColor(textureLoader.load(terrainTextureToUrl(name)));
      });

      const alphaTextures = terrain.alphaMaps.map((data) => setupMask(data));

      // Geometry: a simple plane (512x512 meters to match Tribes 2 scale)
      const planeSize = 512;
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
        // In Tribes 2, heightmap values are 0-0xFFFF (65535),
        // already converted to 0-1 range by uint16ToFloat32.
        // Scale by 2048 to match Tribes 2's height units in meters
        displacementScale: 512,
        displacementBias: -32,
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
            value: Math.min(32, Math.pow(2, i + 2)),
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

      // for (let gx = -1; gx <= 1; gx++) {
      //   for (let gz = -1; gz <= 1; gz++) {
      //   }
      // }
      const mesh = new THREE.Mesh(geom, mat);
      // mesh.position.set(gx * planeSize, 0, gz * planeSize);
      scene.add(mesh);
    }

    // const displacementMap = textureLoader.load("/heightmap.png");

    // const planeMesh = new THREE.Mesh(
    //   new THREE.PlaneGeometry(256, 256, 256, 256),
    //   new THREE.MeshPhongMaterial({
    //     side: THREE.DoubleSide,
    //     displacementMap: displacementMap,
    //     map: displacementMap,
    //     displacementScale: 50,
    //   })
    // );

    // scene.add(planeMesh);

    const controls = new OrbitControls(camera, renderer.domElement);

    // const geometry = new THREE.BoxGeometry(1, 1, 1);
    // const material = new THREE.MeshPhongMaterial({
    //   color: "rgba(255, 255, 255, 1)",
    // });
    // const cube = new THREE.Mesh(geometry, material);
    // scene.add(cube);

    const skyColor = "rgba(209, 237, 255, 1)";
    const groundColor = "rgba(186, 200, 181, 1)";
    const intensity = 2;
    const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
    scene.add(light);

    // const loader = new GLTFLoader();
    // loader.load("/flagstand.gltf", (gltf) => {
    //   scene.add(gltf.scene); // gltf.scene is a THREE.Group containing the model
    //   camera.position.set(0, 0, 300);
    //   controls.update();
    // });

    camera.position.set(100, 15, 100);
    camera.lookAt(0, 0, -200);
    controls.update();

    const animate = () => {
      // cube.rotation.x += 0.01;
      // cube.rotation.y += 0.01;

      if (resizeRendererToDisplaySize(renderer)) {
        const canvas = renderer.domElement;
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
      }
      controls.update();
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);

    loadMap();
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
