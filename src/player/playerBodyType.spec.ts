import { describe, expect, it } from "vitest";
import { resolvePlayerBodyType } from "./playerBodyType";
import { useJiggle } from "../state/jiggleStore";

describe("player chest slider selection", () => {
  it.each([
    ["light_male.dts", "male"],
    ["medium_male.dts", "male"],
    ["light_female.dts", "female"],
    ["medium_female.dts", "female"],
    ["bioderm_light.dts", "bioderm"],
    ["bioderm_medium.dts", "bioderm"],
    ["bioderm_heavy.dts", "bioderm"],
  ])("routes %s to %s", (shapeName, expected) => {
    expect(resolvePlayerBodyType({ shapeName })).toBe(expected);
  });

  it("distinguishes heavy female and male selections sharing the same mesh", () => {
    const blocks = new Map<number, Record<string, unknown>>([
      [
        191,
        {
          sounds: Array.from({ length: 32 }, (_, i) => (i === 19 ? 50 : null)),
        },
      ],
      [
        194,
        {
          sounds: Array.from({ length: 32 }, (_, i) => (i === 19 ? 51 : null)),
        },
      ],
      [50, { filename: "fx/armor/breath_uw" }],
      [51, { filename: "fx\\armor\\breath_fem_uw.wav" }],
    ]);
    const player = {
      shapeName: "heavy_male.dts",
      dataBlock: "heavy_male.dts",
      dataBlockId: 194,
    };
    expect(resolvePlayerBodyType(player, (id) => blocks.get(id))).toBe(
      "female",
    );
    expect(
      resolvePlayerBodyType({ ...player, dataBlockId: 191 }, (id) =>
        blocks.get(id),
      ),
    ).toBe("male");
    expect(
      resolvePlayerBodyType({
        shapeName: "heavy_male.dts",
        dataBlock: "HeavyFemaleHumanArmor",
      }),
    ).toBe("female");
  });

  it("falls back safely when custom or incomplete datablocks omit the discriminator", () => {
    expect(
      resolvePlayerBodyType(
        { shapeName: "heavy_male.dts", dataBlockId: 9 },
        () => undefined,
      ),
    ).toBe("male");
  });

  it("changes one group without changing the others", () => {
    useJiggle.getState().setSize("female", 2.5);
    expect(useJiggle.getState().sizes).toEqual({
      male: 1,
      female: 2.5,
      bioderm: 1,
    });
    useJiggle.getState().setSize("female", 1);
  });
});
