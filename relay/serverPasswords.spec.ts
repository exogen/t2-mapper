import { describe, expect, it, vi } from "vitest";
import { ServerPasswords } from "./serverPasswords";
import { connLog } from "./logger";
import { BitStream } from "t2-demo-parser";
import { buildConnectChallengeRequest } from "./protocol";
import { GAME_PROTOCOL_VERSION } from "./shared";

const server = {
  address: "192.0.2.1:28000",
  name: "My Server",
  passwordRequired: true,
};

describe("ServerPasswords", () => {
  it("treats an empty address override as unusable without falling back to a name password", () => {
    const passwords = new ServerPasswords(
      '{"192.0.2.1:28000":"","My Server":"name-secret"}',
    );
    expect(passwords.getPassword(server)).toBe("");
    expect(passwords.hasPassword(server)).toBe(false);
    expect(
      passwords.hasPassword({ ...server, address: "192.0.2.2:28000" }),
    ).toBe(true);
  });

  it.each(["x".repeat(256), "secret\u0100", "secret\u0000suffix"])(
    "rejects passwords that cannot round-trip through the protocol without revealing them",
    (password) => {
      expect(
        () => new ServerPasswords(JSON.stringify({ "My Server": password })),
      ).toThrow(
        new Error(
          "T2_SERVER_PASSWORDS passwords must be at most 255 single-byte characters without NUL",
        ),
      );
    },
  );

  it("preserves the largest supported single-byte password in a real challenge", () => {
    const password = "\xff".repeat(255);
    const passwords = new ServerPasswords(
      JSON.stringify({ "My Server": password }),
    );
    const bs = new BitStream(
      buildConnectChallengeRequest(
        GAME_PROTOCOL_VERSION,
        123,
        passwords.getPassword(server),
      ),
    );
    bs.readU8();
    bs.readU32();
    bs.readU32();
    expect(bs.readString()).toBe(password);
    expect(bs.readFlag()).toBe(false);
  });

  it.each([
    [undefined, server, "disabled", undefined, true],
    [
      '{"192.0.2.1:28000":"private-secret"}',
      server,
      "selected",
      "address",
      false,
    ],
    ['{"My Server":"private-secret"}', server, "selected", "name", false],
    ['{"Other Server":"private-secret"}', server, "missing", undefined, true],
    ['{"My Server":""}', server, "empty", "name", true],
    [
      '{"My Server":"private-secret"}',
      undefined,
      "unknown-server",
      undefined,
      true,
    ],
    [
      '{"My Server":"private-secret"}',
      { ...server, passwordRequired: false },
      "not-required",
      undefined,
      false,
    ],
  ] as const)(
    "logs a safe lookup outcome for %s",
    (raw, info, outcome, matchedBy, warn) => {
      const infoLog = vi.spyOn(connLog, "info").mockImplementation(() => {});
      const warnLog = vi.spyOn(connLog, "warn").mockImplementation(() => {});
      try {
        const passwords = new ServerPasswords(raw);
        expect(passwords.getPasswordForConnection(server.address, info)).toBe(
          passwords.getPassword(info),
        );
        expect(warn ? warnLog : infoLog).toHaveBeenCalledWith(
          expect.objectContaining({
            address: server.address,
            outcome,
            matchedBy,
          }),
          expect.any(String),
        );
        expect(
          JSON.stringify([infoLog.mock.calls, warnLog.mock.calls]),
        ).not.toContain("private-secret");
      } finally {
        vi.restoreAllMocks();
      }
    },
  );

  it.each([undefined, "", "  ", "{}"])(
    "defaults to no passwords for %j",
    (raw) => {
      const passwords = new ServerPasswords(raw);
      expect(passwords.enabled).toBe(false);
      expect(passwords.getPassword(server)).toBeUndefined();
    },
  );

  it("matches exact names and prefers the address, including the default port", () => {
    const passwords = new ServerPasswords(
      JSON.stringify({
        "My Server": "name-secret",
        "192.0.2.1:28000": "address-secret",
      }),
    );
    expect(passwords.getPassword(server)).toBe("address-secret");
    expect(passwords.getPassword({ ...server, address: "192.0.2.1" })).toBe(
      "address-secret",
    );
    expect(
      passwords.getPassword({ ...server, address: "192.0.2.1:28001" }),
    ).toBe("name-secret");
    expect(
      passwords.getPassword({
        ...server,
        address: "192.0.2.2",
        name: "my server",
      }),
    ).toBeUndefined();
  });

  it("does not send secrets to open or unknown servers or mutate public metadata", () => {
    const passwords = new ServerPasswords('{"My Server":"private-secret"}');
    const before = JSON.stringify(server);
    expect(passwords.getPassword(server)).toBe("private-secret");
    expect(
      passwords.getPassword({ ...server, passwordRequired: false }),
    ).toBeUndefined();
    expect(passwords.getPassword(undefined)).toBeUndefined();
    expect(JSON.stringify(server)).toBe(before);
    expect(JSON.stringify(passwords)).toBe("{}");
  });

  it("preserves password whitespace and treats prototype names as ordinary keys", () => {
    const passwords = new ServerPasswords(
      '{"My Server":"  secret  ","__proto__":"other-secret"}',
    );
    expect(passwords.getPassword(server)).toBe("  secret  ");
    expect(passwords.getPassword({ ...server, name: "__proto__" })).toBe(
      "other-secret",
    );
    expect(
      passwords.getPassword({ ...server, name: "constructor" }),
    ).toBeUndefined();
  });

  it.each([
    '{"private-secret":',
    '["private-secret"]',
    '"private-secret"',
    "null",
    "42",
    '{"private-secret":42}',
    '{"":"private-secret"}',
  ])("rejects invalid config without including its contents: %s", (raw) => {
    expect(() => new ServerPasswords(raw)).toThrow(
      new Error(
        "T2_SERVER_PASSWORDS must be a JSON object of string passwords",
      ),
    );
  });
});
