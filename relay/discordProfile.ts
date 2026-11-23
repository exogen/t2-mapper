import type Database from "better-sqlite3";
import type { AuthContext } from "better-auth";
import { decryptOAuthToken, setTokenUtil } from "better-auth/oauth2";

interface DiscordGrant {
  accessToken: string | null;
  accessTokenExpiresAt: string | number | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: string | number | null;
}

/** Read a Discord profile using the stored grant, even without an app session. */
export function discordProfileReader(
  database: Database.Database,
  authContext: Promise<AuthContext<any>>,
) {
  const readGrant = database.prepare(`
    SELECT "accessToken", "accessTokenExpiresAt", "refreshToken", "refreshTokenExpiresAt"
    FROM "account" WHERE "id" = ? AND "userId" = ? AND "providerId" = 'discord'
  `);
  const saveGrant = database.prepare(`
    UPDATE "account" SET "accessToken" = @accessToken, "accessTokenExpiresAt" = @accessTokenExpiresAt,
      "refreshToken" = @refreshToken, "refreshTokenExpiresAt" = @refreshTokenExpiresAt,
      "updatedAt" = @updatedAt
    WHERE "id" = @accountId AND "accessToken" IS @previousAccessToken
      AND "refreshToken" IS @previousRefreshToken
  `);

  return async (userId: string, accountId: string) => {
    const grant = readGrant.get(accountId, userId) as DiscordGrant | undefined;
    if (!grant) return null;
    const context = await authContext;
    const provider = context.socialProviders.find(({ id }) => id === "discord");
    if (!provider) return null;

    const expiresSoon =
      grant.accessTokenExpiresAt != null &&
      new Date(grant.accessTokenExpiresAt).getTime() - Date.now() < 5_000;
    let accessToken: string | undefined;
    if (
      grant.refreshToken &&
      provider.refreshAccessToken &&
      (!grant.accessToken || expiresSoon)
    ) {
      const refreshToken = await decryptOAuthToken(grant.refreshToken, context);
      const tokens = await provider.refreshAccessToken(refreshToken);
      if (!tokens.accessToken) return null;
      // A sign-in can replace the grant while Discord is handling the refresh.
      const { changes } = saveGrant.run({
        accountId,
        previousAccessToken: grant.accessToken,
        previousRefreshToken: grant.refreshToken,
        accessToken: await setTokenUtil(tokens.accessToken, context),
        accessTokenExpiresAt:
          tokens.accessTokenExpiresAt?.toISOString() ?? null,
        refreshToken: tokens.refreshToken
          ? await setTokenUtil(tokens.refreshToken, context)
          : grant.refreshToken,
        refreshTokenExpiresAt:
          tokens.refreshTokenExpiresAt?.toISOString() ??
          grant.refreshTokenExpiresAt,
        updatedAt: new Date().toISOString(),
      });
      if (!changes) return null;
      accessToken = tokens.accessToken;
    } else if (grant.accessToken) {
      accessToken = await decryptOAuthToken(grant.accessToken, context);
    }

    return accessToken ? provider.getUserInfo({ accessToken }) : null;
  };
}
