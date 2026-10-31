import { DIFLoader, type DIFModel } from "./dif/difLoader";
import { textureToUrl } from "./loaders";
import { loadSharedTexture } from "./engine/textures";

/** Start referenced textures alongside embedded lightmaps, including preloads. */
export class InteriorLoader extends DIFLoader {
  override parse(buffer: ArrayBuffer): DIFModel {
    const model = super.parse(buffer);
    const paths = new Set(
      model.surfaceMeshes.map((mesh) => mesh.material.resourcePath),
    );
    for (const path of paths) void loadSharedTexture(textureToUrl(path));
    return model;
  }
}
