import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  hasPendingAccountSchemaMigrations,
  linkT2Account,
  openAccountDatabase,
  unlinkT2Account,
} from "../relay/accountDatabase.js";

function main(): void {
  const { values } = parseArgs({
    options: {
      "discord-id": { type: "string" },
      guid: { type: "string" },
      name: { type: "string" },
      unlink: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || !values["discord-id"] || !values.guid) {
    console.log(
      "Usage: npm run accounts:link-t2 -- --discord-id <Discord user ID> --guid <Tribes 2 GUID> [--name <player name>]",
    );
    console.log(
      "       npm run accounts:link-t2 -- --unlink --discord-id <Discord user ID> --guid <GUID>",
    );
    console.log(
      "Reads AUTH_DATABASE_PATH. The account must have signed in with Discord once.",
    );
    if (!values.help) process.exitCode = 1;
    return;
  }

  const filename = path.resolve(
    process.env.AUTH_DATABASE_PATH || ".relay/accounts/app.sqlite",
  );
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "Account database not found. Start the relay and sign in with Discord first.",
      );
    }
    throw error;
  }
  // Do not create a fresh database for a mistyped path or follow a symlink.
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(
      "Account database must be an existing nonempty SQLite file",
    );
  }
  const database = openAccountDatabase(filename);
  try {
    if (hasPendingAccountSchemaMigrations(database)) {
      throw new Error(
        "Account database has not been migrated yet. Start the relay with Discord sign-in enabled first.",
      );
    }
    if (values.unlink) {
      const removed = unlinkT2Account(
        database,
        values["discord-id"],
        values.guid,
      );
      console.log(
        removed
          ? `Unlinked Tribes 2 GUID ${values.guid} from Discord account ${values["discord-id"]}.`
          : `Tribes 2 GUID ${values.guid} was not linked to Discord account ${values["discord-id"]}.`,
      );
      return;
    }
    const { discordId, accounts } = linkT2Account(
      database,
      values["discord-id"],
      values.guid,
      values.name?.trim() || null,
    );
    console.log(`Discord account ${discordId} now has Tribes 2 accounts:`);
    console.table(
      accounts.map((account) => ({
        GUID: account.guid,
        Name: account.name ?? "—",
        "Linked (UTC)": new Date(account.linkedAt).toISOString().slice(0, 10),
      })),
    );
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(
    error instanceof Error
      ? error.message
      : "Could not update Tribes 2 account link",
  );
  process.exitCode = 1;
}
