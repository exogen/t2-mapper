import { useTexture } from "@react-three/drei";
import { DIFLoader, type DIFModel } from "./dif/difLoader";
import { textureToUrl } from "./loaders";

/** Start referenced textures alongside embedded lightmaps, including preloads. */
export class InteriorLoader extends DIFLoader {
  override parse(buffer: ArrayBuffer): DIFModel {
    const model = super.parse(buffer);
    const paths = new Set(
      model.surfaceMeshes.map((mesh) => mesh.material.resourcePath),
    );
    for (const path of paths) useTexture.preload(textureToUrl(path));
    return model;
  }
}
