import { Effect } from "postprocessing";

export function createCrtPhosphorMask() {
  return new Effect(
    "CrtPhosphorMask",
    /* glsl */ `
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float column = mod(floor(uv.x * resolution.x), 3.0);
        vec3 phosphor = 1.0 - step(0.5, abs(vec3(0.0, 1.0, 2.0) - column));
        vec3 mask = mix(vec3(0.55), vec3(1.15), phosphor);
        outputColor = vec4(inputColor.rgb * mask, inputColor.a);
      }
    `,
  );
}
