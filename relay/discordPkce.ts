import type { BetterAuthPlugin } from "better-auth";
import {
  generateCodeChallenge,
  validateAuthorizationCode,
} from "better-auth/oauth2";

/** Remove when Better Auth's Discord adapter forwards its PKCE verifier. */
export function discordPkce() {
  return {
    id: "mapgenius-discord-pkce",
    init({ socialProviders }) {
      return {
        context: {
          socialProviders: socialProviders.map((provider) => {
            if (provider.id !== "discord") return provider;
            const options = provider.options;
            if (!options?.clientId || !options.clientSecret)
              throw new Error(
                "Discord PKCE requires configured client credentials",
              );
            const patched: typeof provider = {
              ...provider,
              // Discord advertises this issuer and S256 in its OAuth metadata.
              issuer: "https://discord.com",
              async createAuthorizationURL(params) {
                if (!params.codeVerifier)
                  throw new Error("Discord OAuth requires a PKCE verifier");
                const url = await provider.createAuthorizationURL({
                  ...params,
                  // Only the server's configured scopes may be requested.
                  scopes: [],
                });
                url.searchParams.set("code_challenge_method", "S256");
                url.searchParams.set(
                  "code_challenge",
                  await generateCodeChallenge(params.codeVerifier),
                );
                return url;
              },
              async validateAuthorizationCode(params) {
                if (!params.codeVerifier)
                  throw new Error("Discord OAuth requires a PKCE verifier");
                return validateAuthorizationCode({
                  ...params,
                  options,
                  tokenEndpoint: "https://discord.com/api/oauth2/token",
                });
              },
            };
            return patched;
          }),
        },
      };
    },
  } satisfies BetterAuthPlugin;
}
