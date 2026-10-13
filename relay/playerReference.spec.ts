import { describe, expect, it } from "vitest";
import {
  PlayerResolver,
  referencePlayer,
  type PlayerRecord,
} from "./playerReference.js";

const alice: PlayerRecord = {
  clientId: 7,
  clientGeneration: 1,
  targetId: 32,
  targetGeneration: 0,
  name: "TAG|Alice",
  rawName: "\x10\x0bTAG|\x08Alice\x11",
  teamId: 1,
};

describe("player references", () => {
  it.each([undefined, "12345"])(
    "tracks renames and color changes with GUID %s",
    (guid) => {
      const ref = referencePlayer({ ...alice, guid }, "connection");
      const renamed = {
        ...alice,
        guid,
        name: "Smurf",
        rawName: "\x0cSmurf",
        teamId: 2,
      };
      const resolver = new PlayerResolver("connection", [renamed]);
      expect(resolver.resolve(ref)).toBe(renamed);
      expect(resolver.display(ref)).toEqual({
        name: "Smurf",
        rawName: "\x0cSmurf",
        teamId: 2,
      });
    },
  );

  it("uses the client identity when a demo roster has no target or GUID", () => {
    const ref = referencePlayer(
      { name: "Before", rawName: "Before", clientId: 4 },
      "demo",
    );
    expect(
      new PlayerResolver("demo", [
        { clientId: 4, name: "After", rawName: "\x0cAfter" },
      ]).display(ref).name,
    ).toBe("After");
  });

  it("tracks a target before any roster/GUID is available", () => {
    const {
      clientId: _clientId,
      clientGeneration: _generation,
      ...target
    } = alice;
    const ref = referencePlayer(target, "demo");
    const renamed = { ...target, name: "New", rawName: "New" };
    expect(new PlayerResolver("demo", [renamed]).resolve(ref)).toBe(renamed);
    expect(
      new PlayerResolver("demo", [{ ...target, targetGeneration: 1 }]).resolve(
        ref,
      ),
    ).toBeUndefined();
  });

  it("rejects a reused connection/target, even with the same name", () => {
    const ref = referencePlayer(alice, "connection");
    const impostor = { ...alice, clientGeneration: 2, targetGeneration: 1 };
    expect(
      new PlayerResolver("connection", [impostor]).resolve(ref),
    ).toBeUndefined();
  });

  it("reconnects by GUID after all names and IDs change", () => {
    const ref = referencePlayer({ ...alice, guid: "12345" }, "old-relay");
    const rejoined = {
      ...alice,
      clientId: 12,
      targetId: 90,
      guid: "12345",
      name: "Renamed",
      rawName: "Renamed",
    };
    expect(
      new PlayerResolver("new-relay", [
        rejoined,
        { ...alice, guid: "99999" },
      ]).resolve(ref),
    ).toBe(rejoined);
  });

  it("reconnects a GUID-less player by their unique base name after changing tags", () => {
    const ref = referencePlayer(alice, "connection");
    const rejoined = {
      ...alice,
      clientId: 12,
      targetId: 90,
      name: "Alice[NEW]",
      rawName: "\x10\x08Alice\x0b[NEW]\x11",
    };
    expect(new PlayerResolver("connection", [rejoined]).resolve(ref)).toBe(
      rejoined,
    );
    expect(new PlayerResolver("new-relay", [rejoined]).resolve(ref)).toBe(
      rejoined,
    );
  });

  it("never matches a contradictory GUID through a name", () => {
    const ref = referencePlayer({ ...alice, guid: "12345" }, "old");
    expect(
      new PlayerResolver("new", [{ ...alice, guid: "99999" }]).resolve(ref),
    ).toBeUndefined();
  });

  it("distinguishes full names but refuses ambiguous base names, full names, or accounts", () => {
    const other = {
      ...alice,
      clientId: 8,
      targetId: 33,
      name: "OTHER|Alice",
      rawName: "\x10\x0bOTHER|\x08Alice\x11",
    };
    const resolver = new PlayerResolver("demo", [alice, other]);
    expect(resolver.byName("TAG|Alice")).toBe(alice);
    expect(resolver.byName("Alice", true)).toBeUndefined();
    expect(
      resolver.matches({ kind: "name", rawName: "Alice", match: "base" }),
    ).toHaveLength(2);
    expect(
      new PlayerResolver("demo", [
        alice,
        { ...other, name: alice.name },
      ]).reference(alice.rawName).kind,
    ).toBe("name");
    const ref = referencePlayer({ ...alice, guid: "12345" }, "old");
    expect(
      new PlayerResolver(
        "new",
        [alice, other].map((p) => ({ ...p, guid: "12345" })),
      ).resolve(ref),
    ).toBeUndefined();
  });

  it("preserves fallback colors when unavailable without exposing a different player's name", () => {
    const ref = referencePlayer(alice, "demo");
    const resolver = new PlayerResolver("demo", [
      { ...alice, name: "Other", rawName: "Other", clientGeneration: 2 },
    ]);
    expect(resolver.display(ref)).toEqual({
      name: alice.name,
      rawName: alice.rawName,
      teamId: undefined,
    });
    expect(resolver.byName("\x0c")).toBeUndefined();
  });

  it("joins a target to an older PLAYERLIST only by an unambiguous full name", () => {
    const roster = { clientId: 7, name: "Alice", rawName: "Alice" };
    const target = {
      targetId: 32,
      targetGeneration: 0,
      name: "Alice",
      rawName: "\x0cAlice",
    };
    const resolver = new PlayerResolver("demo", [roster], [target]);
    expect(resolver.players).toHaveLength(1);
    expect(resolver.byName("Alice")).toMatchObject({
      clientId: 7,
      targetId: 32,
      rawName: "\x0cAlice",
    });
    expect(
      new PlayerResolver(
        "demo",
        [roster, { ...roster, clientId: 8 }],
        [target],
      ).byName("Alice"),
    ).toBeUndefined();
    expect(
      new PlayerResolver(
        "demo",
        [roster],
        [target, { ...target, targetId: 33 }],
      ).byName("Alice"),
    ).toBeUndefined();
    expect(
      new PlayerResolver(
        "demo",
        [{ ...roster, targetId: -1 }],
        [target],
      ).byName("Alice"),
    ).toBeUndefined();
  });

  it("uses target generations from older checkpoints when client generations are absent", () => {
    const ref = referencePlayer({ ...alice, clientGeneration: 3 }, "demo");
    const restored = {
      ...alice,
      clientGeneration: undefined,
      name: "Before rename",
      rawName: "Before rename",
    };
    expect(new PlayerResolver("demo", [restored]).resolve(ref)).toBe(restored);
    expect(
      new PlayerResolver("demo", [
        { ...restored, targetGeneration: 1 },
      ]).resolve(ref),
    ).toBeUndefined();
    expect(
      new PlayerResolver("demo", [
        { ...restored, clientGeneration: 4 },
      ]).resolve(ref),
    ).toBeUndefined();
    const oldRef = referencePlayer(
      { ...alice, clientGeneration: undefined },
      "demo",
    );
    expect(
      new PlayerResolver("demo", [
        { ...restored, targetGeneration: 1 },
      ]).resolve(oldRef),
    ).toBeUndefined();
  });

  it("keeps client identity when its target is temporarily unavailable", () => {
    const ref = referencePlayer(alice, "demo");
    const withoutTarget = {
      ...alice,
      targetId: -1,
      targetGeneration: undefined,
      name: "Renamed",
      rawName: "Renamed",
    };
    expect(new PlayerResolver("demo", [withoutTarget]).display(ref).name).toBe(
      "Renamed",
    );
  });

  it("does not let a name-only roster entry steal a target with an explicit client mapping", () => {
    const unknown = { clientId: 8, name: "Renamed", rawName: "Renamed" };
    const target = {
      targetId: alice.targetId,
      targetGeneration: 0,
      name: "Renamed",
      rawName: "Renamed",
    };
    const resolver = new PlayerResolver("demo", [unknown, alice], [target]);
    expect(resolver.resolve(referencePlayer(alice, "demo"))).toMatchObject({
      clientId: alice.clientId,
      targetId: alice.targetId,
    });
    expect(
      resolver.players.find((p) => p.clientId === 8)?.targetId,
    ).toBeUndefined();
    expect(resolver.byName("Renamed")).toBeUndefined();
  });

  it("retains a confirmed target association when an older demo header's name becomes stale", () => {
    const roster = { clientId: 7, name: "Alice", rawName: "Alice" };
    const target = {
      targetId: 32,
      targetGeneration: 0,
      name: "Alice",
      rawName: "Alice",
    };
    const ref = new PlayerResolver("demo", [roster], [target]).reference(
      "Alice",
    );
    const renamed = new PlayerResolver(
      "demo",
      [roster],
      [{ ...target, name: "Renamed", rawName: "\x0cRenamed" }],
    );
    expect(renamed.display(ref)).toEqual({
      name: "Renamed",
      rawName: "\x0cRenamed",
      teamId: undefined,
    });
    expect(renamed.refresh(ref)).toMatchObject({
      clientId: 7,
      targetId: 32,
      rawName: "\x0cRenamed",
    });
  });
});
