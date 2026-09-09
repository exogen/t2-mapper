import { observeShapeMeshes } from "./dtsScene";
import {
  Color,
  Material,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type Object3D,
  type WebGLRenderer,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { dtsVector } from "./dtsGeometry";
import { DTSMesh, type DTSModel, type DTSShape } from "./dtsModel";

export interface DTSImpostorView {
  direction: Vector3;
  target: WebGLRenderTarget;
}
/** Conventional camera-facing Sprite with the nearest pre-rendered DTS view. */
export class DTSImpostor extends Sprite {
  readonly isDTSImpostor = true;
  detailIndex = -1;
  views: readonly DTSImpostorView[] = [];
  private cameraDirection = new Vector3();
  override copy(source: this, recursive = true): this {
    super.copy(source, recursive);
    this.detailIndex = source.detailIndex;
    this.views = source.views;
    this.material = source.material.clone();
    return this;
  }
  override onBeforeRender(
    _renderer: WebGLRenderer,
    _scene: Scene,
    camera: Camera,
  ): void {
    if (!this.parent || !this.views.length) return;
    camera.getWorldPosition(this.cameraDirection);
    this.parent.worldToLocal(this.cameraDirection);
    this.cameraDirection.sub(this.position).normalize();
    let best = this.views[0],
      score = -Infinity;
    for (const view of this.views) {
      const dot = view.direction.dot(this.cameraDirection);
      if (dot > score) {
        best = view;
        score = dot;
      }
    }
    this.material.map = best.target.texture;
  }
}

/** Generate optional last-detail sprites after textures have loaded. Binary
 * parsing stays usable in Node and without a WebGL context. Until generated,
 * DTSShape renders the billboard's source mesh detail instead of disappearing.
 * The returned disposer releases the generated GPU textures and sprites. */
export function createDTSImpostors(
  model: DTSModel,
  renderer: WebGLRenderer,
): () => void {
  const generated: DTSImpostor[] = [],
    temporaryMaterials: Material[] = [];
  const previousTarget = renderer.getRenderTarget(),
    previousColor = renderer.getClearColor(new Color()),
    previousAlpha = renderer.getClearAlpha(),
    previousAutoClear = renderer.autoClear;
  const source = clone(model.scene) as DTSShape;
  source.position.set(0, 0, 0);
  source.quaternion.identity();
  source.scale.set(1, 1, 1);
  observeShapeMeshes(source, (node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const flat = (material: Material): MeshBasicMaterial => {
      temporaryMaterials.push(material);
      const m = material as MeshBasicMaterial;
      const result = new MeshBasicMaterial({
        map: m.map,
        color: m.color?.getHex() === 0 ? 0xffffff : m.color,
        opacity: m.opacity,
        transparent: m.transparent,
        blending: m.blending,
        side: m.side,
        alphaTest: m.alphaTest,
        depthWrite: m.depthWrite,
        vertexColors: m.vertexColors,
        visible: m.visible,
        toneMapped: false,
      });
      temporaryMaterials.push(result);
      return result;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(flat)
      : flat(mesh.material);
  });
  const scene = new Scene();
  scene.add(source);
  const radius = Math.max(model.data.radius, 0.01),
    center = dtsVector(model.data.center);
  const camera = new OrthographicCamera(
    -radius,
    radius,
    radius,
    -radius,
    0.001,
    radius * 4,
  );
  try {
    renderer.autoClear = true;
    renderer.setClearColor(0, 0);
    for (
      let detailIndex = 0;
      detailIndex < model.data.details.length;
      detailIndex++
    ) {
      const detail = model.data.details[detailIndex],
        billboard = detail.billboard;
      if (
        detail.subShape >= 0 ||
        !billboard ||
        billboard.equatorSteps < 1 ||
        billboard.dimension < 1
      )
        continue;
      source.detailLevel = billboard.detailLevel;
      const directions: Vector3[] = [];
      const polar = billboard.polarSteps;
      for (let equator = 0; equator < billboard.equatorSteps; equator++) {
        const yaw = (equator * Math.PI * 2) / billboard.equatorSteps;
        for (let ring = 0; ring <= 2 * polar; ring++) {
          const pitch = polar
            ? -Math.PI / 2 +
              billboard.polarAngle +
              (ring * (Math.PI / 2 - billboard.polarAngle)) / polar
            : 0;
          directions.push(
            new Vector3(
              Math.sin(yaw) * Math.cos(pitch),
              Math.sin(pitch),
              Math.cos(yaw) * Math.cos(pitch),
            ),
          );
        }
      }
      if (billboard.includePoles)
        directions.push(new Vector3(0, 1, 0), new Vector3(0, -1, 0));
      const sprite = new DTSImpostor(
        new SpriteMaterial({
          transparent: true,
          alphaTest: 0.5,
          depthWrite: true,
          toneMapped: false,
        }),
      );
      sprite.name = `__dts_impostor_${detailIndex}`;
      sprite.detailIndex = detailIndex;
      sprite.position.copy(center);
      sprite.scale.setScalar(radius * 2);
      sprite.visible = false;
      const views: DTSImpostorView[] = [];
      sprite.views = views;
      generated.push(sprite);
      for (const direction of directions) {
        const size = Math.min(
          billboard.dimension,
          renderer.capabilities.maxTextureSize,
        );
        const target = new WebGLRenderTarget(size, size);
        views.push({ direction, target });
        camera.position.copy(center).addScaledVector(direction, radius * 2);
        camera.up.set(
          0,
          Math.abs(direction.y) > 0.999 ? 0 : 1,
          Math.abs(direction.y) > 0.999 ? 1 : 0,
        );
        camera.lookAt(center);
        camera.updateMatrixWorld(true);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
      }
      sprite.material.map = views[0].target.texture;
      model.scene.add(sprite);
    }
  } catch (error) {
    for (const sprite of generated) {
      sprite.removeFromParent();
      sprite.material.dispose();
      for (const view of sprite.views) view.target.dispose();
    }
    throw error;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    renderer.autoClear = previousAutoClear;
    for (const material of temporaryMaterials) material.dispose();
    source.traverse((node) => {
      if (node instanceof DTSMesh) node.disposeGeometry();
    });
  }
  return () => {
    for (const sprite of generated) {
      sprite.removeFromParent();
      sprite.material.dispose();
      for (const view of sprite.views) view.target.dispose();
    }
  };
}

export function isDTSImpostor(object: Object3D): object is DTSImpostor {
  return (object as DTSImpostor).isDTSImpostor === true;
}
