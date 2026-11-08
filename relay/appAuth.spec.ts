import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { DiscordProfile } from "better-auth/social-providers";
import { openAccountDatabase, setAccountRole } from "./accountDatabase.js";

import type { AccountUser } from "./accountTypes.js";
import {
  GAME_PRESENTATION_PATH,
  GamePresentationError,
  type GamePresentationUpdate,
  type PublishedGame,
} from "./gamePresentation.js";
import type { DemoMetadata } from "./demoMetadata.js";
import {
  createAppAuth,
  handleDisabledAppAuth,
  loadAppAuthConfig,
  type AppAuthService,
  purgeExpiredAccountData,
} from "./appAuth.js";

const CLIENT_ID = "123456789012345678";
const ADMIN_ID = "234567890123456789";
const USER_ID = "345678901234567890";
const APP_ORIGIN = "http://localhost:3000";
const SECRET = "this-is-a-test-secret-with-at-least-thirty-two-bytes";
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
});

function env(values: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DISCORD_CLIENT_ID: CLIENT_ID,
    DISCORD_CLIENT_SECRET: "test-client-secret",
    AUTH_SECRET: SECRET,
    ...values,
  };
}

it("keeps login disabled until credentials exist and rejects partial/unsafe configuration", () => {
  expect(
    loadAppAuthConfig({ AUTH_BASE_URL: "https://api.tribes2.online" }),
  ).toBeNull();
  expect(() => loadAppAuthConfig({ DISCORD_CLIENT_ID: CLIENT_ID })).toThrow(
    "together",
  );
  expect(() => loadAppAuthConfig(env({ AUTH_SECRET: "short" }))).toThrow(
    "32 bytes",
  );
  expect(() =>
    loadAppAuthConfig(
      env({ AUTH_TRUSTED_ORIGINS: "https://*.tribes2.online" }),
    ),
  ).toThrow();
  expect(() =>
    loadAppAuthConfig(
      env({ NODE_ENV: "production", AUTH_BASE_URL: "http://localhost:8765" }),
    ),
  ).toThrow("HTTPS origin");
});

async function fixture({
  discordId = USER_ID,
  disabled = false,
  secureCookies = false,
  extraEnv = {} as NodeJS.ProcessEnv,
  onUpdateGamePresentation = undefined as Parameters<
    typeof createAppAuth
  >[0]["onUpdateGamePresentation"],
  onReadDemoPresentation = undefined as Parameters<
    typeof createAppAuth
  >[0]["onReadDemoPresentation"],
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2-app-auth-"));
  const database = openAccountDatabase(path.join(dir, "app.sqlite"));
  let service: AppAuthService | null = null;
  const server = http.createServer(async (req, res) => {
    if (
      disabled
        ? handleDisabledAppAuth(req, res, [APP_ORIGIN])
        : await service?.handle(req, res)
    )
      return;
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected a TCP address");
  const baseURL = `http://127.0.0.1:${address.port}`;
  cleanups.push(async () => {
    service?.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const config = loadAppAuthConfig(
    env({
      AUTH_BASE_URL: secureCookies ? "https://api.tribes2.online" : baseURL,
      AUTH_TRUSTED_ORIGINS: APP_ORIGIN,
      ...extraEnv,
    }),
  )!;
  if (!disabled)
    service = await createAppAuth({
      config,
      database,
      onUpdateGamePresentation,
      onReadDemoPresentation,
    });
  let profile = {
    id: discordId,
    username: "chosen_handle",
    global_name: "Player display name",
    discriminator: "0",
    avatar: "test-avatar",
    email: null,
    verified: false,
  } as unknown as DiscordProfile;
  const originalFetch = globalThis.fetch;
  const providerRequests: string[] = [];
  const codeChallenges = new Set<string>();
  vi.stubGlobal(
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.startsWith("https://discord.com/")) {
        providerRequests.push(url);
        if (url === "https://discord.com/api/oauth2/token") {
          const params = new URLSearchParams(String(init?.body));
          const verifier = params.get("code_verifier");
          expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
          const challenge = createHash("sha256")
            .update(verifier!)
            .digest("base64url");
          expect(codeChallenges.delete(challenge)).toBe(true);
          return Response.json({
            access_token: "provider-access-secret",
            refresh_token: "provider-refresh-secret",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "identify",
          });
        }
        if (decodeURIComponent(url) === "https://discord.com/api/users/@me")
          return Response.json(profile);
        throw new Error(`Unexpected Discord request ${url}`);
      }
      return originalFetch(input, init);
    },
  );
  const cookieJar = new Map<string, string>();
  const request = async (route: string, options: RequestInit = {}) => {
    const response = await originalFetch(`${baseURL}${route}`, {
      redirect: "manual",
      ...options,
      headers: {
        Origin: APP_ORIGIN,
        ...(cookieJar.size
          ? {
              Cookie: [...cookieJar]
                .map(([key, value]) => `${key}=${value}`)
                .join("; "),
            }
          : {}),
        ...options.headers,
      },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const equals = pair.indexOf("=");
      const name = pair.slice(0, equals);
      const value = pair.slice(equals + 1);
      if (!value) cookieJar.delete(name);
      else cookieJar.set(name, value);
    }
    return response;
  };
  const beginLogin = async (additionalData: Record<string, unknown> = {}) => {
    const response = await request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "discord",
        callbackURL: `${APP_ORIGIN}/watch/`,
        errorCallbackURL: `${APP_ORIGIN}/?accountError=discord`,
        additionalData,
      }),
    });
    expect(response.status).toBe(200);
    const authorization = (await response.json()) as { url: string };
    const authorizationURL = new URL(authorization.url);
    expect(authorizationURL.hostname).toBe("discord.com");
    expect(authorizationURL.searchParams.get("scope")).toBe("identify");
    expect(authorizationURL.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    const challenge = authorizationURL.searchParams.get("code_challenge")!;
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    codeChallenges.add(challenge);
    return authorizationURL.searchParams.get("state")!;
  };
  const login = async (additionalData: Record<string, unknown> = {}) => {
    const state = await beginLogin(additionalData);
    const response = await request(
      `/api/auth/callback/discord?code=valid-code&state=${encodeURIComponent(state)}&iss=https%3A%2F%2Fdiscord.com`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${APP_ORIGIN}/watch/`);
    return response;
  };
  return {
    baseURL,
    request,
    account: async () =>
      (
        (await (await request("/api/account")).json()) as {
          user: AccountUser | null;
        }
      ).user,
    login,
    beginLogin,
    cookieJar,
    database,
    config,
    directory: dir,
    requireAdmin: () =>
      service!.requireAdmin({
        cookie: [...cookieJar]
          .map(([key, value]) => `${key}=${value}`)
          .join("; "),
      }),
    providerRequests,
    setProfile: (value: Partial<DiscordProfile>) => {
      profile = { ...profile, ...value };
    },
    restart: async () => {
      service?.close();
      service = await createAppAuth({
        config,
        database,
        onUpdateGamePresentation,
        onReadDemoPresentation,
      });
    },
  };
}

async function echoPresentationUpdate(
  update: GamePresentationUpdate,
): Promise<PublishedGame> {
  return {
    id:
      "gameId" in update
        ? update.gameId
        : (update.demo.gameId ?? "assigned-historical-game"),
    revision: update.expectedRevision + 1,
    presentation: update.presentation,
  };
}

const oldDemo: DemoMetadata = {
  filename: "community-final-2002.rec",
  bytes: 1024,
  recordedAt: "2002-03-01T12:00:00.000Z",
  server: "Historical server",
  address: "old.example:28000",
  games: [
    { mission: "Katabatic", gameType: "CTF", startMs: 0, tournament: false },
  ],
  mod: "base",
  recorder: "Old player",
  durationMs: 600_000,
  players: [],
};

const oldDemoUpdate: GamePresentationUpdate = {
  demo: {
    filename: oldDemo.filename,
    gameIndex: 0,
    mission: "Katabatic",
    startMs: 0,
  },
  expectedRevision: 0,
  presentation: {
    title: "Community final",
    teamNames: { 1: "Storm", 2: "Inferno" },
  },
};

it("requires a fresh admin role to read and edit arbitrarily old published demo details", async () => {
  const read = vi.fn(async () => oldDemo);
  const update = vi.fn(echoPresentationUpdate);
  const app = await fixture({
    onReadDemoPresentation: read,
    onUpdateGamePresentation: update,
  });
  const readPath = `${GAME_PRESENTATION_PATH}?filename=${encodeURIComponent(oldDemo.filename)}`;
  const save = () =>
    app.request(GAME_PRESENTATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(oldDemoUpdate),
    });
  expect((await app.request(readPath)).status).toBe(401);
  expect((await save()).status).toBe(401);
  await app.login();
  expect((await app.request(readPath)).status).toBe(403);
  expect((await save()).status).toBe(403);
  expect(read).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();

  setAccountRole(app.database, USER_ID, "admin");
  const response = await app.request(readPath);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(oldDemo);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
  expect(read).toHaveBeenCalledExactlyOnceWith(oldDemo.filename);
  const saved = await save();
  expect(saved.status).toBe(200);
  expect(await saved.json()).toEqual({
    id: "assigned-historical-game",
    revision: 1,
    presentation: oldDemoUpdate.presentation,
  });
  expect(update).toHaveBeenCalledExactlyOnceWith(oldDemoUpdate);

  setAccountRole(app.database, USER_ID, "user");
  expect((await app.request(readPath)).status).toBe(403);
  expect((await save()).status).toBe(403);
  expect(read).toHaveBeenCalledOnce();
  expect(update).toHaveBeenCalledOnce();
});

it("rejects unsafe or ambiguous published-demo reads before contacting storage", async () => {
  const read = vi.fn(async () => oldDemo);
  const app = await fixture({ onReadDemoPresentation: read });
  await app.login();
  setAccountRole(app.database, USER_ID, "admin");
  for (const query of [
    "",
    "?filename=",
    "?filename=..%2Fold.rec",
    "?filename=%2Fabsolute.rec",
    "?filename=https%3A%2F%2Fattacker.example%2Fold.rec",
    "?filename=external%3Aold.rec",
    "?filename=old.rec&filename=other.rec",
    "?filename=old.rec&url=https%3A%2F%2Fattacker.example",
    "?filename=old.rec%00",
    "?filename=old.json",
  ]) {
    expect(
      (await app.request(`${GAME_PRESENTATION_PATH}${query}`)).status,
      query,
    ).toBe(400);
  }
  const hostile = await app.request(
    `${GAME_PRESENTATION_PATH}?filename=old.rec`,
    {
      headers: { Origin: "https://attacker.example" },
    },
  );
  expect(hostile.status).toBe(403);
  expect(read).not.toHaveBeenCalled();
});

it.each([404, 409, 503] as const)(
  "returns historical storage refusals (%s) without claiming success",
  async (status) => {
    const read = vi.fn(async () => {
      throw new GamePresentationError(status, "Published demo is unavailable");
    });
    const update = vi.fn(async () => {
      throw new GamePresentationError(status, "Published game changed");
    });
    const app = await fixture({
      onReadDemoPresentation: read,
      onUpdateGamePresentation: update,
    });
    await app.login();
    setAccountRole(app.database, USER_ID, "admin");
    const response = await app.request(
      `${GAME_PRESENTATION_PATH}?filename=${oldDemo.filename}`,
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      error: "Published demo is unavailable",
    });
    const saved = await app.request(GAME_PRESENTATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(oldDemoUpdate),
    });
    expect(saved.status).toBe(status);
    expect(await saved.json()).toEqual({ error: "Published game changed" });
  },
);

it("rejects invalid demo locators or combined live/demo targets without mutation", async () => {
  const update = vi.fn(echoPresentationUpdate);
  const app = await fixture({ onUpdateGamePresentation: update });
  await app.login();
  setAccountRole(app.database, USER_ID, "admin");
  if (!("demo" in oldDemoUpdate)) throw new Error("Expected demo fixture");
  const invalidTargets = [
    null,
    [],
    { ...oldDemoUpdate.demo, filename: "../old.rec" },
    { ...oldDemoUpdate.demo, filename: "https://attacker.example/old.rec" },
    { ...oldDemoUpdate.demo, filename: "external:old.rec" },
    { ...oldDemoUpdate.demo, gameIndex: -1 },
    { ...oldDemoUpdate.demo, gameIndex: 0.5 },
    { ...oldDemoUpdate.demo, gameIndex: "0" },
    { ...oldDemoUpdate.demo, mission: null },
    { ...oldDemoUpdate.demo, startMs: -1 },
    { ...oldDemoUpdate.demo, startMs: "0" },
    { ...oldDemoUpdate.demo, missionSequence: 0.5 },
    { ...oldDemoUpdate.demo, gameId: "" },
    { ...oldDemoUpdate.demo, path: "/outside" },
  ];
  for (const value of [
    ...invalidTargets.map((demo) => ({ ...oldDemoUpdate, demo })),
    { ...oldDemoUpdate, gameId: "live-game" },
  ]) {
    const response = await app.request(GAME_PRESENTATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    expect(response.status, JSON.stringify(value)).toBe(400);
  }
  expect(update).not.toHaveBeenCalled();
});

it("returns a disabled account state with credentialed CORS before configuration", async () => {
  const app = await fixture({ disabled: true });
  const response = await app.request("/api/account");
  expect(await response.json()).toEqual({ enabled: false, user: null });
  expect(response.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
  expect(
    (await app.request("/api/account", { method: "OPTIONS" })).status,
  ).toBe(204);
});

it("requires a current admin session for saving shared game details", async () => {
  const update = vi.fn(echoPresentationUpdate);
  const app = await fixture({ onUpdateGamePresentation: update });
  const body = {
    gameId: "game-one",
    expectedRevision: 0,
    presentation: {
      title: "  Tournament final  ",
      teamNames: { 1: " Storm ", 2: "Inferno" },
    },
  };
  const save = () =>
    app.request(GAME_PRESENTATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  expect((await save()).status).toBe(401);
  expect(update).not.toHaveBeenCalled();
  await app.login();
  expect((await save()).status).toBe(403);
  expect(update).not.toHaveBeenCalled();
  setAccountRole(app.database, USER_ID, "admin");
  const response = await save();
  expect(response.status).toBe(200);
  const presentation = {
    title: "Tournament final",
    teamNames: { 1: "Storm", 2: "Inferno" },
  };
  expect(await response.json()).toEqual({
    id: "game-one",
    revision: 1,
    presentation,
  });
  expect(response.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
  expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(update).toHaveBeenCalledExactlyOnceWith({ ...body, presentation });

  setAccountRole(app.database, USER_ID, "user");
  expect((await save()).status).toBe(403);
  setAccountRole(app.database, USER_ID, "admin");
  app.database
    .prepare('UPDATE "session" SET "expiresAt" = ?')
    .run(Date.now() - 1_000);
  expect((await save()).status).toBe(401);
  expect(update).toHaveBeenCalledOnce();
});

it.each([404, 409] as const)(
  "returns a game save conflict/refusal (%s) without claiming success",
  async (status) => {
    const update = vi.fn(async () => {
      throw new GamePresentationError(
        status,
        "Game changed. Reopen the editor.",
      );
    });
    const app = await fixture({ onUpdateGamePresentation: update });
    await app.login();
    setAccountRole(app.database, USER_ID, "admin");
    const response = await app.request(GAME_PRESENTATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: "game-one",
        expectedRevision: 3,
        presentation: {},
      }),
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      error: "Game changed. Reopen the editor.",
    });
    expect(update).toHaveBeenCalledExactlyOnceWith({
      gameId: "game-one",
      expectedRevision: 3,
      presentation: {},
    });
  },
);

it("checks origins, method and JSON media type before updating game details", async () => {
  const update = vi.fn(echoPresentationUpdate);
  const app = await fixture({ onUpdateGamePresentation: update });
  await app.login();
  setAccountRole(app.database, USER_ID, "admin");
  const body = JSON.stringify({
    gameId: "game-one",
    expectedRevision: 0,
    presentation: {},
  });
  for (const Origin of ["", "https://attacker.example"]) {
    const response = await app.request(GAME_PRESENTATION_PATH, {
      method: "POST",
      headers: { Origin, "Content-Type": "application/json" },
      body,
    });
    expect(response.status).toBe(403);
  }
  expect(
    (await app.request(GAME_PRESENTATION_PATH, { method: "PUT" })).status,
  ).toBe(405);
  for (const headers of [
    { "Content-Type": "text/plain" },
    { "Content-Type": "application/json", "Content-Encoding": "gzip" },
  ])
    expect(
      (
        await app.request(GAME_PRESENTATION_PATH, {
          method: "POST",
          headers,
          body,
        })
      ).status,
    ).toBe(415);
  expect(update).not.toHaveBeenCalled();
});

it("rejects malformed game details without invoking the mutation callback", async () => {
  const update = vi.fn(echoPresentationUpdate);
  const app = await fixture({ onUpdateGamePresentation: update });
  await app.login();
  setAccountRole(app.database, USER_ID, "admin");
  const valid = { gameId: "game-one", expectedRevision: 0, presentation: {} };
  const invalid = [
    null,
    [],
    true,
    "wrong shape",
    {},
    { ...valid, gameId: "" },
    { ...valid, gameId: "x".repeat(129) },
    { ...valid, expectedRevision: -1 },
    { ...valid, expectedRevision: 0.5 },
    { ...valid, expectedRevision: "0" },
    { ...valid, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, presentation: [] },
    { ...valid, presentation: { title: false } },
    { ...valid, presentation: { title: "x".repeat(129) } },
    { ...valid, presentation: { title: "line\nbreak" } },
    { ...valid, presentation: { teamNames: ["Storm"] } },
    { ...valid, presentation: { teamNames: { 1: { name: "Storm" } } } },
    { ...valid, presentation: { teamNames: { "01": "Storm" } } },
    { ...valid, presentation: { teamNames: { 1: "x".repeat(65) } } },
    { ...valid, presentation: { unexpected: true } },
    { ...valid, role: "admin" },
  ];
  for (const value of invalid) {
    const response = await app.request(GAME_PRESENTATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    expect(response.status, JSON.stringify(value)).toBe(400);
  }
  expect(
    (
      await app.request(GAME_PRESENTATION_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
  ).toBe(400);
  expect(update).not.toHaveBeenCalled();
});

it("bounds declared and chunked game-detail bodies before invoking the mutation callback", async () => {
  const update = vi.fn(echoPresentationUpdate);
  const app = await fixture({ onUpdateGamePresentation: update });
  await app.login();
  setAccountRole(app.database, USER_ID, "admin");
  const response = await app.request(GAME_PRESENTATION_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "x".repeat(17 * 1024),
  });
  expect(response.status).toBe(413);
  const status = await new Promise<number>((resolve, reject) => {
    const request = http.request(
      `${app.baseURL}${GAME_PRESENTATION_PATH}`,
      {
        method: "POST",
        headers: {
          Origin: APP_ORIGIN,
          "Content-Type": "application/json",
          Cookie: [...app.cookieJar]
            .map(([key, value]) => `${key}=${value}`)
            .join("; "),
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode!));
      },
    );
    request.on("error", reject);
    request.write(
      '{"gameId":"game-one","expectedRevision":0,"presentation":{"title":"',
    );
    request.write("x".repeat(17 * 1024));
    request.end('"}}');
  });
  expect(status).toBe(413);
  expect(update).not.toHaveBeenCalled();
});

it("keeps guests anonymous and rejects admin authorization", async () => {
  const app = await fixture();
  const account = await app.request("/api/account");
  expect(await account.json()).toEqual({ enabled: true, user: null });
  expect(account.headers.get("cache-control")).toBe("no-store");
  expect(account.headers.get("access-control-allow-credentials")).toBe("true");
  await expect(app.requireAdmin()).rejects.toMatchObject({ status: 401 });
  expect((await app.request("/api/admin/status")).status).toBe(404);
  expect((await app.request("/api/auth/get-session")).status).toBe(404);
});

it.each([false, true])(
  "rejects malformed HTTP request targets without crashing (accounts disabled: %s)",
  async (disabled) => {
    const app = await fixture({ disabled });
    const baseURL = new URL(app.baseURL);
    const status = await new Promise<number>((resolve, reject) => {
      const request = http.get(
        {
          hostname: baseURL.hostname,
          port: baseURL.port,
          path: "//[",
        },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode!));
        },
      );
      request.on("error", reject);
    });
    expect(status).toBe(400);
    expect((await app.request("/api/account")).status).toBe(200);
  },
);

it("signs in with Discord, encrypts provider tokens, and revokes the session on signout", async () => {
  const app = await fixture();
  const callback = await app.login({
    role: "admin",
    name: "forged",
    discordUsername: "forged",
  });
  const sessionCookie = callback.headers
    .getSetCookie()
    .find((cookie) => cookie.includes("session_token="));
  expect(sessionCookie).toContain("HttpOnly");
  expect(sessionCookie).toContain("SameSite=Lax");
  expect(sessionCookie).not.toContain("Domain=");
  const account = await app.account();
  expect(account).toMatchObject({
    name: "Player display name",
    discordUsername: "chosen_handle",
    discordId: USER_ID,
    role: "user",
  });
  expect(account).not.toHaveProperty("email");
  const provider = app.database
    .prepare('SELECT "accessToken", "refreshToken" FROM "account"')
    .get() as { accessToken: string; refreshToken: string };
  expect(provider.accessToken).not.toContain("provider-access-secret");
  expect(provider.refreshToken).not.toContain("provider-refresh-secret");
  await expect(app.requireAdmin()).rejects.toMatchObject({ status: 403 });
  expect(
    (
      await app.request("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
  ).toBe(200);
  expect(await app.account()).toBeNull();
  expect(
    app.database.prepare('SELECT COUNT(*) AS count FROM "session"').get(),
  ).toEqual({ count: 0 });
});

it("keeps the session cookie for retry if logout cannot revoke the database session", async () => {
  const app = await fixture();
  await app.login();
  const user = (await app.account())!;
  const cookies = [...app.cookieJar];
  app.database.exec(`
    CREATE TRIGGER fail_session_delete BEFORE DELETE ON "session"
    BEGIN
      SELECT RAISE(FAIL, 'injected session deletion failure');
    END;
  `);

  const failure = await app.request("/api/auth/sign-out", { method: "POST" });
  expect(failure.status).toBe(500);
  expect(failure.headers.getSetCookie()).toEqual([]);
  expect([...app.cookieJar]).toEqual(cookies);
  expect((await app.account())?.id).toBe(user.id);

  app.database.exec("DROP TRIGGER fail_session_delete");
  expect(
    (await app.request("/api/auth/sign-out", { method: "POST" })).status,
  ).toBe(200);
  expect(await app.account()).toBeNull();
  expect(
    app.database.prepare('SELECT COUNT(*) AS count FROM "session"').get(),
  ).toEqual({ count: 0 });
});

it("rechecks database role grants, demotions and expiry for the existing session", async () => {
  const app = await fixture({ discordId: ADMIN_ID });
  await app.login();
  const user = (await app.account())!;
  expect(user.role).toBe("user");
  setAccountRole(app.database, user.discordId, "admin");
  expect((await app.account())?.role).toBe("admin");
  expect(await app.requireAdmin()).toMatchObject({
    id: user.id,
    role: "admin",
  });
  // A session old enough to refresh must renew the browser cookie, not just
  // extend the database row behind the browser's back.
  app.database
    .prepare('UPDATE "session" SET "expiresAt" = ?')
    .run(Date.now() + 27 * 24 * 60 * 60_000);
  const renewed = await app.request("/api/account");
  expect(renewed.status).toBe(200);
  expect(
    renewed.headers
      .getSetCookie()
      .some((cookie) => cookie.includes("session_token=")),
  ).toBe(true);
  setAccountRole(app.database, user.discordId, "user");
  await expect(app.requireAdmin()).rejects.toMatchObject({ status: 403 });
  app.database
    .prepare('UPDATE "session" SET "expiresAt" = ?')
    .run(Date.now() - 1_000);
  expect(await app.account()).toBeNull();
});

it("refreshes Discord names on sign-in without changing account identity", async () => {
  const app = await fixture();
  await app.login();
  const first = (await app.account())!;
  app.setProfile({
    username: "new_handle",
    global_name: "New display name",
    avatar: "new-avatar",
  });
  await app.login();
  const updated = (await app.account())!;
  expect(updated).toMatchObject({
    id: first.id,
    discordId: first.discordId,
    role: "user",
    name: "New display name",
    discordUsername: "new_handle",
  });
  expect(updated.image).toContain("new-avatar");
  expect(
    app.database.prepare('SELECT COUNT(*) AS count FROM "user"').get(),
  ).toEqual({ count: 1 });
});

it("starts former allowlisted identities as users and preserves only database roles across login and restart", async () => {
  const app = await fixture({
    discordId: ADMIN_ID,
    extraEnv: { AUTH_ADMIN_DISCORD_IDS: ADMIN_ID },
  });
  await app.login();
  const user = (await app.account())!;
  expect(user.role).toBe("user");
  await expect(app.requireAdmin()).rejects.toMatchObject({ status: 403 });
  app.database
    .prepare('UPDATE "user" SET "role" = ? WHERE "id" = ?')
    .run("admin", user.id);
  app.setProfile({
    username: "new_admin_handle",
    global_name: "New admin display name",
  });
  await app.login({ role: "user" });
  expect(await app.account()).toMatchObject({
    id: user.id,
    role: "admin",
    discordUsername: "new_admin_handle",
    name: "New admin display name",
  });
  await app.restart();
  expect((await app.account())?.role).toBe("admin");
  expect(await app.requireAdmin()).toMatchObject({
    id: user.id,
    role: "admin",
  });
  // Demotion takes effect for this same cookie, without another login/restart.
  app.database
    .prepare('UPDATE "user" SET "role" = ? WHERE "id" = ?')
    .run("user", user.id);
  expect((await app.account())?.role).toBe("user");
  await expect(app.requireAdmin()).rejects.toMatchObject({ status: 403 });
});

it("rejects untrusted origins, unsafe redirects, extra account routes, and oversized bodies", async () => {
  const app = await fixture();
  const forbidden = await app.request("/api/account", {
    headers: { Origin: "https://attacker.example" },
  });
  expect(forbidden.status).toBe(403);
  expect(forbidden.headers.get("access-control-allow-origin")).toBeNull();
  expect(
    (
      await app.request("/api/auth/sign-out", {
        method: "POST",
        headers: { Origin: "" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await app.request("/api/auth/update-user", {
        method: "POST",
        body: JSON.stringify({ role: "admin" }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await app.request("/api/auth/sign-up/email", {
        method: "POST",
        body: "{}",
      })
    ).status,
  ).toBe(404);
  const redirect = await app.request("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "discord",
      callbackURL: "https://attacker.example",
    }),
  });
  expect(redirect.status).toBe(403);
  expect(
    (
      await app.request("/api/auth/sign-in/social", {
        method: "POST",
        body: "x".repeat(17 * 1024),
      })
    ).status,
  ).toBe(413);
});

it("rejects a callback without its matching OAuth state cookie", async () => {
  const app = await fixture();
  const state = await app.beginLogin();
  app.cookieJar.clear();
  const response = await app.request(
    `/api/auth/callback/discord?code=valid&state=${encodeURIComponent(state)}`,
  );
  expect(response.status).toBe(302);
  expect(await app.account()).toBeNull();
  expect(app.providerRequests).toEqual([]);
});

it.each(["missing", "unknown", "expired"])(
  "returns to the app when OAuth state is %s without contacting Discord",
  async (kind) => {
    const app = await fixture();
    let state: string | undefined;
    if (kind === "unknown") state = "unknown-state";
    if (kind === "expired") {
      state = await app.beginLogin();
      // Expired state is removed by the same scheduled cleanup as abandoned flows.
      app.database.prepare('DELETE FROM "verification"').run();
    }
    const query = new URLSearchParams({ code: "valid-code" });
    if (state) query.set("state", state);
    const response = await app.request(`/api/auth/callback/discord?${query}`);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe(APP_ORIGIN);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("accountError")).toBe("discord");
    expect(await app.account()).toBeNull();
    expect(app.providerRequests).toEqual([]);
  },
);

it("rejects a replayed OAuth callback before exchanging its authorization code", async () => {
  const app = await fixture();
  const state = await app.beginLogin();
  const route = `/api/auth/callback/discord?code=valid-code&state=${encodeURIComponent(state)}`;
  expect((await app.request(route)).status).toBe(302);
  const providerRequestCount = app.providerRequests.length;
  const replay = await app.request(route);
  expect(replay.status).toBe(302);
  expect(
    new URL(replay.headers.get("location")!).searchParams.get("accountError"),
  ).toBe("discord");
  expect(app.providerRequests).toHaveLength(providerRequestCount);
  expect(
    app.database.prepare('SELECT COUNT(*) AS count FROM "session"').get(),
  ).toEqual({ count: 1 });
});

it("rejects an unexpected OAuth issuer before exchanging the authorization code", async () => {
  const app = await fixture();
  const state = await app.beginLogin();
  const query = new URLSearchParams({
    code: "valid-code",
    state,
    iss: "https://attacker.example",
  });
  const response = await app.request(`/api/auth/callback/discord?${query}`);
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location")!);
  expect(location.origin).toBe(APP_ORIGIN);
  expect(location.searchParams.get("error")).toBe("issuer_mismatch");
  expect(await app.account()).toBeNull();
  expect(app.providerRequests).toEqual([]);
});

it("rejects tampered session cookies", async () => {
  const app = await fixture();
  await app.login();
  for (const [name, value] of app.cookieJar) {
    if (name.includes("session_token"))
      app.cookieJar.set(name, `${value}forged`);
  }
  expect(await app.account()).toBeNull();
  await expect(app.requireAdmin()).rejects.toMatchObject({ status: 401 });
});

it("rejects an existing session after its Discord account link is removed", async () => {
  const app = await fixture();
  await app.login();
  const user = (await app.account())!;
  setAccountRole(app.database, user.discordId, "admin");
  app.database.prepare('DELETE FROM "account" WHERE "userId" = ?').run(user.id);

  expect(await app.account()).toBeNull();
  await expect(app.requireAdmin()).rejects.toMatchObject({ status: 401 });
});

it("uses secure host-only session cookies for the production HTTPS endpoint", async () => {
  const app = await fixture({ secureCookies: true });
  const callback = await app.login();
  const cookie = callback.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="))!;
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).not.toContain("Domain=");
  expect(await app.account()).not.toBeNull();
});

it("does not let forged forwarded IP headers bypass the sign-in rate limit", async () => {
  const app = await fixture();
  let response: Response | undefined;
  for (let attempt = 0; attempt < 10; attempt++) {
    response = await app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "discord", callbackURL: APP_ORIGIN }),
    });
    await response.arrayBuffer();
    if (response.status === 429) break;
  }
  expect(response?.status).toBe(429);
  purgeExpiredAccountData(app.database);
  const forged = await app.request("/api/auth/sign-in/social", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": "198.51.100.7",
      "Fly-Client-IP": "198.51.100.8",
      "X-MapGenius-Account-Client-IP": "198.51.100.9",
    },
    body: JSON.stringify({ provider: "discord", callbackURL: APP_ORIGIN }),
  });
  expect(forged.status).toBe(429);
});

it("backs up the previous schema before an additive migration and preserves active sessions", async () => {
  const app = await fixture({ discordId: ADMIN_ID });
  await app.login();
  const user = (await app.account())!;
  app.database
    .prepare('UPDATE "user" SET "role" = ? WHERE "id" = ?')
    .run("admin", user.id);
  app.database.exec('ALTER TABLE "user" DROP COLUMN "discordUsername"');
  await app.restart();
  expect(
    fs.existsSync(path.join(app.directory, "app.sqlite.pre-migration.sqlite")),
  ).toBe(true);
  expect((await app.account())?.role).toBe("admin");
  expect(app.database.inTransaction).toBe(false);
  await app.login();
  expect((await app.account())?.discordUsername).toBe("chosen_handle");
});

it("removes expired sessions and abandoned OAuth state while retaining active data", async () => {
  const app = await fixture();
  await app.login();
  const user = (await app.account())!;
  const now = Date.now();
  app.database
    .prepare(
      'INSERT INTO "session" (id, token, userId, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      "expired-session",
      "expired-token",
      user.id,
      now - 1,
      now - 1_000,
      now - 1_000,
    );
  const verification = app.database.prepare(
    'INSERT INTO "verification" (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
  );
  verification.run(
    "expired-state",
    "expired-state",
    "{}",
    now - 1,
    now - 1_000,
    now - 1_000,
  );
  verification.run(
    "active-state",
    "active-state",
    "{}",
    now + 60_000,
    now,
    now,
  );
  purgeExpiredAccountData(app.database, now);
  expect(
    app.database.prepare('SELECT COUNT(*) AS count FROM "session"').get(),
  ).toEqual({ count: 1 });
  expect(app.database.prepare('SELECT "id" FROM "verification"').all()).toEqual(
    [{ id: "active-state" }],
  );
  expect((await app.account())?.id).toBe(user.id);
});

it("prunes stale rate-limit records on startup and retains recent counters at the cutoff", async () => {
  const app = await fixture();
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60_000;
  const insert = app.database.prepare(
    'INSERT INTO "rateLimit" ("id", "key", "count", "lastRequest") VALUES (?, ?, ?, ?)',
  );
  insert.run("stale", "stale", 60, cutoff - 1);
  insert.run("boundary", "boundary", 60, cutoff);
  insert.run("recent", "recent", 60, now - 30_000);
  insert.run("future", "future", 60, now + 30_000);

  purgeExpiredAccountData(app.database, now);

  expect(
    app.database
      .prepare(
        'SELECT "id", "count", "lastRequest" FROM "rateLimit" ORDER BY "id"',
      )
      .all(),
  ).toEqual([
    { id: "boundary", count: 60, lastRequest: cutoff },
    { id: "future", count: 60, lastRequest: now + 30_000 },
    { id: "recent", count: 60, lastRequest: now - 30_000 },
  ]);

  insert.run("abandoned", "abandoned", 1, cutoff - 1);
  await app.restart();
  expect(
    app.database
      .prepare('SELECT "id" FROM "rateLimit" WHERE "id" = ?')
      .get("abandoned"),
  ).toBeUndefined();
});

it("bounds chunked sign-in bodies without trusting Content-Length", async () => {
  const app = await fixture();
  const status = await new Promise<number>((resolve, reject) => {
    const request = http.request(
      `${app.baseURL}/api/auth/sign-in/social`,
      {
        method: "POST",
        headers: { Origin: APP_ORIGIN, "Content-Type": "application/json" },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode!));
      },
    );
    request.on("error", reject);
    request.write('{"provider":"discord","padding":"');
    request.write("x".repeat(17 * 1024));
    request.end('"}');
  });
  expect(status).toBe(413);
  expect(app.providerRequests).toEqual([]);
});
