import { MeshLambertMaterial, type Material, type Texture } from "three";

export interface DTSMaterialMaps {
  detailMap: Texture | null;
  detailScale: number;
  bumpMap: Texture | null;
  specularMap: Texture | null;
}
const configurations = new WeakMap<
  Material,
  {
    maps: DTSMaterialMaps;
    before: Material["onBeforeCompile"];
    compiled: Material["onBeforeCompile"];
  }
>();

export function getDTSMaterialMapConfiguration(material: Material) {
  const configuration = configurations.get(material);
  return configuration?.compiled === material.onBeforeCompile
    ? configuration
    : undefined;
}
/** Detail mapping is Torque's signed modulation: base * detail * 2. Bump
 * and reflectance maps use Three's conventional Lambert map slots. */
export function applyDTSMaterialMaps(
  target: Material,
  source: DTSMaterialMaps,
): void {
  if (target instanceof MeshLambertMaterial) {
    target.bumpMap = source.bumpMap;
    target.specularMap = source.specularMap;
  }
  if (!source.detailMap) return;
  const before = target.onBeforeCompile,
    key = target.customProgramCacheKey();
  target.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    shader.uniforms.dtsDetailMap = { value: source.detailMap };
    shader.uniforms.dtsDetailScale = { value: source.detailScale };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float dtsDetailScale;\nvarying vec2 vDtsDetailUV;",
      )
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvDtsDetailUV = uv * dtsDetailScale;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D dtsDetailMap;\nvarying vec2 vDtsDetailUV;",
      )
      .replace(
        "#include <map_fragment>",
        "#include <map_fragment>\ndiffuseColor.rgb *= texture2D(dtsDetailMap, vDtsDetailUV).rgb * 2.0;",
      );
  };
  target.customProgramCacheKey = () => `${key}/dts-detail`;
  configurations.set(target, {
    maps: source,
    before,
    compiled: target.onBeforeCompile,
  });
}
