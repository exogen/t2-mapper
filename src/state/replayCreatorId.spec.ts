import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getReplayCreatorId } from "./replayCreatorId";

const COOKIE = "mapgenius.replay.client";
let jar: Map<string, string>;
let writes: string[];
let random: ReturnType<typeof vi.fn>;

beforeEach(() => {
  jar = new Map();
  writes = [];
  random = vi.fn((bytes: Uint8Array) => bytes.fill(0xab));
  vi.stubGlobal("crypto", { getRandomValues: random });
  vi.stubGlobal("location", { protocol: "http:" });
  vi.stubGlobal("document", {
    get cookie() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(value: string) {
      writes.push(value);
      const [pair] = value.split(";");
      const separator = pair.indexOf("=");
      jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

it.each(["http:", "https:"])(
  "creates a host-only session cookie on %s",
  (protocol) => {
    vi.stubGlobal("location", { protocol });
    expect(getReplayCreatorId()).toBe("ab".repeat(24));
    expect(writes).toEqual([
      `${COOKIE}=${"ab".repeat(24)}; Path=/; SameSite=Strict${protocol === "https:" ? "; Secure" : ""}`,
    ]);
    expect(writes[0]).not.toMatch(/Domain|Expires|Max-Age/i);
  },
);

it("reuses the cookie across module reloads and reads another tab's current value", async () => {
  const first = getReplayCreatorId();
  vi.resetModules();
  const otherTab = await import("./replayCreatorId");
  expect(otherTab.getReplayCreatorId()).toBe(first);
  expect(random).toHaveBeenCalledOnce();
  jar.set(COOKIE, "cd".repeat(24));
  expect(getReplayCreatorId()).toBe("cd".repeat(24));
  expect(otherTab.getReplayCreatorId()).toBe("cd".repeat(24));
  expect(writes).toHaveLength(1);
});

it.each(["", "AB".repeat(24), "ab".repeat(23), "private-id"])(
  "rejects an existing invalid cookie %j without minting another identity",
  (value) => {
    jar.set(COOKIE, value);
    expect(() => getReplayCreatorId()).toThrow("cookie is invalid");
    expect(random).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  },
);

it("fails clearly when the browser refuses to retain the session cookie", () => {
  vi.stubGlobal("document", {
    get cookie() {
      return "";
    },
    set cookie(_value: string) {},
  });
  expect(() => getReplayCreatorId()).toThrow("Cookies must be enabled");
});

it("fails clearly when cookie access is blocked", () => {
  vi.stubGlobal("document", {
    get cookie(): string {
      throw new DOMException("Blocked", "SecurityError");
    },
  });
  expect(() => getReplayCreatorId()).toThrow("Cookies must be enabled");
  expect(random).not.toHaveBeenCalled();
});
