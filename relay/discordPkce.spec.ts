import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import type { OAuthProvider } from "better-auth/oauth2";
import { afterEach, expect, it, vi } from "vitest";
import { discordPkce } from "./discordPkce.js";

afterEach(() => vi.unstubAllGlobals());

async function fixture() {
  let original: OAuthProvider | undefined;
  const auth = betterAuth({
    baseURL: "http://localhost:8765",
    secret: "this-is-a-test-secret-with-at-least-thirty-two-bytes",
    telemetry: { enabled: false },
    logger: { disabled: true },
    socialProviders: {
      discord: {
        clientId: "123456789012345678",
        clientSecret: "test-client-secret",
        disableDefaultScope: true,
        scope: ["identify"],
        overrideUserInfoOnSignIn: true,
        mapProfileToUser: (profile) => ({ name: profile.username }),
      },
    },
    plugins: [
      {
        id: "capture-original-provider",
        init(context) {
          original = context.socialProviders.find(({ id }) => id === "discord");
        },
      },
      discordPkce(),
    ],
  });
  const context = await auth.$context;
  return {
    original: original!,
    provider: context.socialProviders.find(({ id }) => id === "discord")!,
  };
}

it("adds S256 to the existing Discord authorization flow and preserves provider behavior", async () => {
  const { original, provider } = await fixture();
  const verifier = "test-verifier-long-enough-for-an-oauth-pkce-authorization";
  const params = {
    state: "browser-bound-state",
    codeVerifier: verifier,
    redirectURI: "http://localhost:8765/api/auth/callback/discord",
  };
  const before = await original.createAuthorizationURL(params);
  const url = await provider.createAuthorizationURL(params);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("code_challenge")).toBe(
    createHash("sha256").update(verifier).digest("base64url"),
  );
  url.searchParams.delete("code_challenge");
  url.searchParams.delete("code_challenge_method");
  expect(url.href).toBe(before.href);
  expect(provider.getUserInfo).toBe(original.getUserInfo);
  expect(provider.accountSubject).toBe(original.accountSubject);
  expect(provider.refreshAccessToken).toBe(original.refreshAccessToken);
  expect(provider.options).toBe(original.options);
  expect(provider.issuer).toBe("https://discord.com");
});

it("sends the recovered verifier with the same client credentials to the token endpoint", async () => {
  const { provider } = await fixture();
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const authorization = await provider.createAuthorizationURL({
    state: "browser-bound-state",
    codeVerifier: verifier,
    redirectURI: "http://localhost:8765/api/auth/callback/discord",
  });
  const fetch = vi.fn(async (input: string | URL, init: RequestInit) => {
    expect(String(input)).toBe("https://discord.com/api/oauth2/token");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("provider-code");
    expect(body.get("code_verifier")).toBe(verifier);
    expect(
      createHash("sha256")
        .update(body.get("code_verifier")!)
        .digest("base64url"),
    ).toBe(authorization.searchParams.get("code_challenge"));
    expect(body.get("redirect_uri")).toBe(
      "http://localhost:8765/api/auth/callback/discord",
    );
    expect(body.get("client_id")).toBe("123456789012345678");
    expect(body.get("client_secret")).toBe("test-client-secret");
    return Response.json({
      access_token: "provider-access-token",
      token_type: "Bearer",
      expires_in: 3600,
    });
  });
  vi.stubGlobal("fetch", fetch);
  const tokens = await provider.validateAuthorizationCode({
    code: "provider-code",
    codeVerifier: verifier,
    redirectURI: "http://localhost:8765/api/auth/callback/discord",
  });
  expect(tokens?.accessToken).toBe("provider-access-token");
  expect(fetch).toHaveBeenCalledOnce();
});

it("ignores client-supplied scopes and requests only the server-configured identity access", async () => {
  const { provider } = await fixture();
  const url = await provider.createAuthorizationURL({
    state: "browser-bound-state",
    codeVerifier: "test-verifier-long-enough-for-an-oauth-pkce-authorization",
    redirectURI: "http://localhost:8765/api/auth/callback/discord",
    scopes: ["email", "bot"],
  });
  expect(url.searchParams.get("scope")).toBe("identify");
});

it("rejects a missing verifier before contacting Discord", async () => {
  const { provider } = await fixture();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    provider.createAuthorizationURL({
      state: "browser-bound-state",
      codeVerifier: "",
      redirectURI: "http://localhost:8765/api/auth/callback/discord",
    }),
  ).rejects.toThrow("PKCE verifier");
  await expect(
    provider.validateAuthorizationCode({
      code: "provider-code",
      redirectURI: "http://localhost:8765/api/auth/callback/discord",
    }),
  ).rejects.toThrow("PKCE verifier");
  expect(fetch).not.toHaveBeenCalled();
});
