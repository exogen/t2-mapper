import { describe, expect, it } from "vitest";
import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Texture,
} from "three";
import {
  applyFadeAndCloak,
  getCloakTexture,
  mountedImageCloakAlpha,
  shapeCloakAlpha,
} from "./shapeFadeCloak";

function mesh(material = new MeshBasicMaterial({ map: new Texture() })) {
  return new Mesh(new BoxGeometry(), material);
}

describe("applyFadeAndCloak", () => {
  it("fades by opacity only", () => {
    const body = mesh();
    const root = new Group().add(body);
    applyFadeAndCloak(root, 0.25, 0);
    expect(body.material.opacity).toBe(0.25);
    expect(body.material.transparent).toBe(true);
    expect(body.material.depthWrite).toBe(false);
    expect(body.material.map).not.toBe(getCloakTexture());
    applyFadeAndCloak(root, 1, 0);
    expect(body.material.opacity).toBe(1);
    expect(body.material.transparent).toBe(false);
    expect(body.material.depthWrite).toBe(true);
  });

  it("cloaks the body with the cloak texture at the cloak alpha", () => {
    const original = new Texture();
    const body = mesh(new MeshBasicMaterial({ map: original }));
    const root = new Group().add(body);
    applyFadeAndCloak(root, 1, 1);
    expect(body.material.map).toBe(getCloakTexture());
    expect(body.material.opacity).toBeCloseTo(shapeCloakAlpha(1), 6);
    expect(body.material.opacity).toBeCloseTo(0.125, 6);
    applyFadeAndCloak(root, 1, 0);
    expect(body.material.map).toBe(original);
    expect(body.material.opacity).toBe(1);
  });

  it("lets a fade under 1 replace the cloak alpha (hidden cloakers)", () => {
    const body = mesh();
    const weapon = mesh();
    const mount0 = new Group().add(weapon);
    const root = new Group().add(body, mount0);
    applyFadeAndCloak(root, 0, 1, [{ root: mount0, cloakable: true }]);
    expect(body.material.map).toBe(getCloakTexture());
    expect(body.material.opacity).toBe(0);
    expect(weapon.material.opacity).toBe(0);
    applyFadeAndCloak(root, 0.5, 0.5, [{ root: mount0, cloakable: true }]);
    expect(body.material.opacity).toBe(0.5);
    expect(weapon.material.opacity).toBe(0.5);
  });

  it("leaves additive and cutout materials their own texture", () => {
    const glow = new Texture();
    const glowMesh = mesh(
      new MeshBasicMaterial({ map: glow, blending: AdditiveBlending }),
    );
    const root = new Group().add(glowMesh);
    applyFadeAndCloak(root, 1, 0.5);
    expect(glowMesh.material.map).toBe(glow);
    expect(glowMesh.material.opacity).toBeCloseTo(shapeCloakAlpha(0.5), 6);
  });

  it("only fades cloakable mounted images, keeping their textures", () => {
    const weaponTex = new Texture();
    const weapon = mesh(new MeshBasicMaterial({ map: weaponTex }));
    const flag = mesh();
    const mount0 = new Group().add(weapon);
    const mount2 = new Group().add(flag);
    const body = mesh();
    const root = new Group().add(body, mount0, mount2);
    applyFadeAndCloak(root, 1, 1, [
      { root: mount0, cloakable: true },
      { root: mount2, cloakable: false },
    ]);
    expect(weapon.material.map).toBe(weaponTex);
    expect(weapon.material.opacity).toBeCloseTo(mountedImageCloakAlpha(1), 6);
    expect(weapon.material.opacity).toBeCloseTo(0.15, 6);
    expect(flag.material.opacity).toBe(1);
    expect(body.material.map).toBe(getCloakTexture());
  });
});
