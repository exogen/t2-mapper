import { describe, expect, it } from "vitest";
import { spokenMapName, spokenName } from "./dataset";

describe("spokenName (commentary display only — never used for matching)", () => {
  it("strips gamer-tag edge decorations", () => {
    expect(spokenName("--Gunther--")).toBe("Gunther");
    expect(spokenName("|HP|")).toBe("HP");
    expect(spokenName("Heat_")).toBe("Heat");
    expect(spokenName("Irvin-")).toBe("Irvin");
  });

  it("joins runs of three-plus spaced-out single characters", () => {
    expect(spokenName("B i s h")).toBe("Bish");
    expect(spokenName("s l u s h")).toBe("slush");
    expect(spokenName("b l a k e")).toBe("blake");
    expect(spokenName("=USA= s l u s h")).toBe("USA= slush");
  });

  it("leaves real multi-word names and short runs alone", () => {
    expect(spokenName("Winged Warrior")).toBe("Winged Warrior");
    expect(spokenName("Gabe Owners")).toBe("Gabe Owners");
    expect(spokenName("Pred X")).toBe("Pred X");
    expect(spokenName("a b")).toBe("a b");
  });

  it("keeps the original when stripping would erase everything", () => {
    expect(spokenName("---")).toBe("---");
  });
});

describe("spokenMapName (speech only — matching uses exact names)", () => {
  it("strips release prefixes", () => {
    expect(spokenMapName("S5_Woodymyrk")).toBe("Woodymyrk");
    expect(spokenMapName("TWL2-Damnation")).toBe("Damnation");
    expect(spokenMapName("DMP2 Firestorm")).toBe("Firestorm");
  });

  it("strips release suffixes", () => {
    expect(spokenMapName("Raindance_nef")).toBe("Raindance");
    expect(spokenMapName("DangerousCrossingLT")).toBe("DangerousCrossing");
    expect(spokenMapName("Katabatic_LT")).toBe("Katabatic");
  });

  it("leaves ordinary names and all-caps tails alone", () => {
    expect(spokenMapName("Katabatic")).toBe("Katabatic");
    expect(spokenMapName("BOLT")).toBe("BOLT");
    expect(spokenMapName("Slapdash")).toBe("Slapdash");
  });
});
