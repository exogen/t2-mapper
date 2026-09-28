import { describe, expect, it } from "vitest";
import { ServerPasswords } from "./serverPasswords";

const server = {
  address: "192.0.2.1:28000",
  name: "My Server",
  passwordRequired: true,
};

describe("ServerPasswords", () => {
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
