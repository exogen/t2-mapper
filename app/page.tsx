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
import { getTerrainFile, iterObjects, parseMissionScript } from "@/src/mission";

const BASE_URL = "/t2-mapper";
const RESOURCE_ROOT_URL = `${BASE_URL}/base/`;

function getUrlForPath(resourcePath: string, fallbackUrl?: string) {
  resourcePath = getActualResourcePath(resourcePath);
  let sourcePath: string;
  try {
    sourcePath = getSource(resourcePath);
  } catch (err) {
    if (fallbackUrl) {
      return fallbackUrl;
    } else {
      throw err;
    }
  }
  if (!sourcePath) {
    return `${RESOURCE_ROOT_URL}${resourcePath}`;
  } else {
    return `${RESOURCE_ROOT_URL}@vl2/${sourcePath}/${resourcePath}`;
  }
}

function interiorToUrl(name: string) {
  const difUrl = getUrlForPath(`interiors/${name}`);
  return difUrl.replace(/\.dif$/i, ".gltf");
}

function terrainTextureToUrl(name: string) {
  name = name.replace(/^terrain\./, "");
  return getUrlForPath(`textures/terrain/${name}.png`, `${BASE_URL}/black.png`);
}

function interiorTextureToUrl(name: string) {
  name = name.replace(/\.\d+$/, "");
  return getUrlForPath(`textures/${name}.png`);
}

function textureToUrl(name: string) {
  try {
    return getUrlForPath(`textures/${name}.png`);
  } catch (err) {
    return `${BASE_URL}/black.png`;
  }
}

async function loadDetailMapList(name: string) {
  const url = getUrlForPath(`textures/${name}`);
  const res = await fetch(url);
  const text = await res.text();
  return text
    .split(/(?:\r\n|\n|\r)/)
    .map((line) => `textures/${line.trim().replace(/\.png$/i, "")}.png`);
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
  const [fogEnabled, setFogEnabled] = useState(true);
  const threeContext = useRef<Record<string, any>>({});

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });

    const textureLoader = new THREE.TextureLoader();
    const gltfLoader = new GLTFLoader();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      2000
    );

    function setupColor(tex, repeat = [1, 1]) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; // Still need this for tiling to work
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(...repeat);
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

    // Free-look camera setup
    camera.position.set(0, 100, 512);

    const keys = {
      w: false, a: false, s: false, d: false,
      shift: false, space: false
    };

    const onKeyDown = (e) => {
      if (e.code === "KeyW") keys.w = true;
      if (e.code === "KeyA") keys.a = true;
      if (e.code === "KeyS") keys.s = true;
      if (e.code === "KeyD") keys.d = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
      if (e.code === "Space") keys.space = true;
    };

    const onKeyUp = (e) => {
      if (e.code === "KeyW") keys.w = false;
      if (e.code === "KeyA") keys.a = false;
      if (e.code === "KeyS") keys.s = false;
      if (e.code === "KeyD") keys.d = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = false;
      if (e.code === "Space") keys.space = false;
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    // Mouse look controls
    let isPointerLocked = false;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const PI_2 = Math.PI / 2;

    const onMouseMove = (e) => {
      if (!isPointerLocked) return;

      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      euler.setFromQuaternion(camera.quaternion);
      euler.y -= movementX * 0.002;
      euler.x -= movementY * 0.002;
      euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
      camera.quaternion.setFromEuler(euler);
    };

    const onPointerLockChange = () => {
      isPointerLocked = document.pointerLockElement === canvas;
    };

    const onCanvasClick = () => {
      if (!isPointerLocked) {
        canvas.requestPointerLock();
      }
    };

    canvas.addEventListener('click', onCanvasClick);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);

    let moveSpeed = 2;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Adjust speed based on wheel direction
      const delta = e.deltaY > 0 ? .75 : 1.25;
      moveSpeed = Math.max(0.025, Math.min(4, moveSpeed * delta));

      // Log the new speed for user feedback
      console.log(`Movement speed: ${moveSpeed.toFixed(3)}`);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });

    const animate = (t) => {
      // Free-look movement
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);

      const right = new THREE.Vector3();
      right.crossVectors(forward, camera.up).normalize();

      let move = new THREE.Vector3();
      if (keys.w) move.add(forward);
      if (keys.s) move.sub(forward);
      if (keys.a) move.sub(right);
      if (keys.d) move.add(right);
      if (keys.space) move.add(camera.up);
      if (keys.shift) move.sub(camera.up);

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(moveSpeed);
        camera.position.add(move);
      }

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
      camera,
      setupColor,
      setupMask,
      textureLoader,
      gltfLoader,
    };

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('wheel', onWheel);
      renderer.setAnimationLoop(null);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const {
      scene,
      camera,
      setupColor,
      setupMask,
      textureLoader,
      gltfLoader,
    } = threeContext.current;

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

      const planeSize = 2048;
      const geom = new THREE.PlaneGeometry(planeSize, planeSize, 256, 256);
      geom.rotateX(-Math.PI / 2);
      geom.rotateY(-Math.PI / 2);

      // Find TerrainBlock properties for empty squares
      let emptySquares: number[] | null = null;
      for (const obj of iterObjects(mission.objects)) {
        if (obj.className === "TerrainBlock") {
          const emptySquaresStr = obj.properties.find((p: any) => p.target.name === "emptySquares")?.value;
          if (emptySquaresStr) {
            emptySquares = emptySquaresStr.split(" ").map((s: string) => parseInt(s))
          }
          break;
        }
      }

      const f32HeightMap = uint16ToFloat32(terrain.heightMap);

      // Create a visibility mask for empty squares
      let visibilityMask: THREE.DataTexture | null = null;
      if (emptySquares) {
        const terrainSize = 256;

        // Create a mask texture (1 = visible, 0 = invisible)
        const maskData = new Uint8Array(terrainSize * terrainSize);
        maskData.fill(255); // Start with everything visible

        for (const squareId of emptySquares) {
          // The squareId encodes position and count:
          // Bits 0-7: X position (starting position)
          // Bits 8-15: Y position
          // Bits 16+: Count (number of consecutive horizontal squares)
          const x = (squareId & 0xFF);
          const y = (squareId >> 8) & 0xFF;
          const count = (squareId >> 16);

          for (let i = 0; i < count; i++) {
            const px = x + i;
            const py = y;
            const index = py * terrainSize + px;
            if (index >= 0 && index < maskData.length) {
              maskData[index] = 0;
            }
          }
        }

        visibilityMask = new THREE.DataTexture(
          maskData,
          terrainSize,
          terrainSize,
          THREE.RedFormat,
          THREE.UnsignedByteType
        );
        visibilityMask.colorSpace = THREE.NoColorSpace;
        visibilityMask.wrapS = visibilityMask.wrapT = THREE.ClampToEdgeWrapping;
        visibilityMask.magFilter = THREE.NearestFilter;
        visibilityMask.minFilter = THREE.NearestFilter;
        visibilityMask.needsUpdate = true;
      }

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
        displacementScale: 2048,
        depthWrite: true,
        // displacementBias: -128,
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

        // Add visibility mask uniform if we have empty squares
        if (visibilityMask) {
          shader.uniforms.visibilityMask = { value: visibilityMask };
        }

        // Add per-texture tiling uniforms
        baseTextures.forEach((tex, i) => {
          shader.uniforms[`tiling${i}`] = {
            value: Math.min(
              512,
              { 0: 16, 1: 16, 2: 32, 3: 32, 4: 32, 5: 32 }[i]
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
${visibilityMask ? 'uniform sampler2D visibilityMask;' : ''}
` + shader.fragmentShader;

        if (visibilityMask) {
          const clippingPlaceholder = '#include <clipping_planes_fragment>';
          shader.fragmentShader = shader.fragmentShader.replace(
            clippingPlaceholder,
            `${clippingPlaceholder}
  // Early discard for invisible areas (before fog/lighting)
  float visibility = texture2D(visibilityMask, vMapUv).r;
  if (visibility < 0.5) {
    discard;
  }
  `
          );
        }

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

      const terrainMesh = new THREE.Mesh(geom, mat);
      root.add(terrainMesh);

      for (const obj of iterObjects(mission.objects)) {
        const getProperty = (name) => {
          const property = obj.properties.find((p) => p.target.name === name);
          // console.log({ name, property });
          return property;
        };

        const getPosition = () => {
          const position = getProperty("position")?.value ?? "0 0 0";
          const [x, z, y] = position.split(" ").map((s) => parseFloat(s));
          return [x, y, z];
        };

        const getScale = () => {
          const scale = getProperty("scale")?.value ?? "1 1 1";
          const [scaleX, scaleZ, scaleY] = scale
            .split(" ")
            .map((s) => parseFloat(s));
          return [scaleX, scaleY, scaleZ];
        };

        const getRotation = (isInterior = false) => {
          const rotation = getProperty("rotation")?.value ?? "1 0 0 0";
          const [ax, az, ay, angle] = rotation
            .split(" ")
            .map((s) => parseFloat(s));

          if (isInterior) {
            // For interiors: Apply coordinate system transformation
            // 1. Convert rotation axis from source coords (ax, az, ay) to Three.js coords
            // 2. Apply -90 Y rotation to align coordinate systems
            const sourceRotation = new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(az, ay, ax),
              -angle * (Math.PI / 180)
            );
            const coordSystemFix = new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              Math.PI / 2
            );
            return coordSystemFix.multiply(sourceRotation);
          } else {
            // For other objects (terrain, etc)
            return new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(ax, ay, -az),
              angle * (Math.PI / 180)
            );
          }
        };

        switch (obj.className) {
          case "TerrainBlock": {
            const [x, y, z] = getPosition();
            camera.position.set(x - 512, y + 256, z - 512);
            const [scaleX, scaleY, scaleZ] = getScale();
            const q = getRotation();
            terrainMesh.position.set(x, y, z);
            terrainMesh.scale.set(scaleX, scaleY, scaleZ);
            terrainMesh.quaternion.copy(q);
            break;
          }
          case "Sky": {
            const materialList = getProperty("materialList")?.value;
            if (materialList) {
              const detailMapList = await loadDetailMapList(materialList);
              const skyLoader = new THREE.CubeTextureLoader();
              const fallbackUrl = `${BASE_URL}/black.png`;
              const texture = skyLoader.load([
                getUrlForPath(detailMapList[1], fallbackUrl), // +x
                getUrlForPath(detailMapList[3], fallbackUrl), // -x
                getUrlForPath(detailMapList[4], fallbackUrl), // +y
                getUrlForPath(detailMapList[5], fallbackUrl), // -y
                getUrlForPath(detailMapList[0], fallbackUrl), // +z
                getUrlForPath(detailMapList[2], fallbackUrl), // -z
              ]);
              scene.background = texture;
            }
            const fogDistance = getProperty("fogDistance")?.value;
            const fogColor = getProperty("fogColor")?.value;
            if (fogDistance && fogColor) {
              const distance = parseFloat(fogDistance);
              const [r, g, b] = fogColor.split(" ").map((s) => parseFloat(s));
              const color = new THREE.Color().setRGB(r, g, b);
              const fog = new THREE.Fog(color, 0, distance * 2);
              if (fogEnabled) {
                scene.fog = fog;
              } else {
                scene._fog = fog;
              }
            }
            break;
          }
          case "InteriorInstance": {
            const [z, y, x] = getPosition();
            const [scaleX, scaleY, scaleZ] = getScale();
            const q = getRotation(true);
            const interiorFile = getProperty("interiorFile").value;
            gltfLoader.load(interiorToUrl(interiorFile), (gltf) => {
              gltf.scene.traverse((o) => {
                if (o.material?.name) {
                  const name = o.material.name;
                  try {
                    const tex = textureLoader.load(interiorTextureToUrl(name));
                    o.material.map = setupColor(tex);
                  } catch (err) {
                    console.error(err);
                  }
                  o.material.needsUpdate = true;
                }
              });
              const interior = gltf.scene;
              interior.position.set(x - 1024, y, z - 1024);
              interior.scale.set(-scaleX, scaleY, -scaleZ);
              interior.quaternion.copy(q);
              root.add(interior);
            });
            break;
          }
          case "WaterBlock": {
            const [z, y, x] = getPosition();
            const [scaleZ, scaleY, scaleX] = getScale();
            const q = getRotation(true);

            const surfaceTexture =
              getProperty("surfaceTexture")?.value ?? "liquidTiles/BlueWater";

            const geometry = new THREE.BoxGeometry(scaleZ, scaleY, scaleX);
            const material = new THREE.MeshStandardMaterial({
              map: setupColor(
                textureLoader.load(textureToUrl(surfaceTexture)),
                [8, 8]
              ),
              // transparent: true,
              opacity: 0.8,
            });
            const water = new THREE.Mesh(geometry, material);

            water.position.set(
              x - 1024 + scaleX / 2,
              y + scaleY / 2,
              z - 1024 + scaleZ / 2
            );
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

  useEffect(() => {
    const { scene } = threeContext.current;
    if (fogEnabled) {
      scene.fog = scene._fog ?? null;
      scene._fog = null;
      scene.needsUpdate = true;
    } else {
      scene._fog = scene.fog;
      scene.fog = null;
      scene.needsUpdate = true;
    }
  }, [fogEnabled]);

  return (
    <main>
      <canvas ref={canvasRef} id="canvas" />
      <div id="controls">
        <select
          id="missionList"
          value={missionName}
          onChange={(e) => setMissionName(e.target.value)}
        >
          {missions.map((missionName) => (
            <option key={missionName}>{missionName}</option>
          ))}
        </select>
        <div className="CheckboxField">
          <input
            id="fogInput"
            type="checkbox"
            checked={fogEnabled}
            onChange={(event) => {
              setFogEnabled(event.target.checked);
            }}
          />
          <label htmlFor="fogInput">Fog?</label>
        </div>
      </div>
    </main>
  );
}
