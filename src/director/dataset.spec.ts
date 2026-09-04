import { describe, expect, it } from "vitest";
import {
  identityAt,
  playerName,
  spokenMapName,
  spokenName,
  targetIdForName,
} from "./dataset";
import type { DirectorDataset } from "./types";

describe("player identity over time", () => {
  // Target 43 on a Ski Club demo: one client wore it, dropped, and a
  // different client joined into the same slot seven seconds later.
  // The first also renamed mid-way, tag and base name both.
  const dataset = {
    playerNames: [
      {
        targetId: 43,
        clientId: 65824,
        fromSec: 20,
        toSec: 112,
        name: "sakecoorslightman",
        displayName: "saKeCoorsLightMan",
        aliases: ["ben-zergy", "sakecoorslightman"],
        clan: "saKe",
        baseName: "CoorsLightMan",
      },
      {
        targetId: 43,
        clientId: 65839,
        fromSec: 119,
        name: "nofanator",
        displayName: "Nofanator",
        aliases: ["nofanator"],
        baseName: "Nofanator",
      },
    ],
  } as unknown as DirectorDataset;

  it("names whoever wore the target at the time", () => {
    expect(playerName(43, dataset, 60)).toBe("CoorsLightMan");
    expect(playerName(43, dataset, 200)).toBe("Nofanator");
    // Without a time, the latest wearer.
    expect(playerName(43, dataset)).toBe("Nofanator");
    // A message a beat before the first sample still finds them.
    expect(identityAt(43, dataset, 118)?.clientId).toBe(65839);
    expect(identityAt(43, dataset, 117)?.clientId).toBe(65824);
  });

  it("resolves a name to the target of whoever had it then", () => {
    // The old name, from before the rename, still finds the player.
    expect(targetIdForName("Ben-Zergy", dataset, 30)).toBe(43);
    expect(targetIdForName("sakecoorslightman", dataset, 100)).toBe(43);
    // Gone by then: nobody answers to it.
    expect(targetIdForName("Ben-Zergy", dataset, 150)).toBeNull();
    expect(targetIdForName("Nofanator", dataset, 150)).toBe(43);
    expect(targetIdForName("Nobody", dataset)).toBeNull();
  });
});

describe("spokenName (commentary display only — never used for matching)", () => {
  it("strips gamer-tag edge decorations", () => {
    expect(spokenName("--Gunther--")).toBe("Gunther");
    expect(spokenName("|HP|")).toBe("HP");
    expect(spokenName("Heat_")).toBe("Heat");
    expect(spokenName("Irvin-")).toBe("Irvin");
  });

  it("reads pipes and underscores as word breaks", () => {
    // A TTS voice reads "AUTOTAUNT|Cannon" as one garbled word, and an
    // underscored name letter by letter.
    expect(spokenName("AUTOTAUNT|Cannon")).toBe("AUTOTAUNT Cannon");
    expect(spokenName("The_D_e_V_i_L")).toBe("The DeViL");
    expect(spokenName("White__Cracker")).toBe("White Cracker");
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
