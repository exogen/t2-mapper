import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  openAccountDatabase,
  setAccountRole,
} from "../relay/accountDatabase.js";

import type { AccountRole } from "../relay/accountTypes.js";

function main(): void {
  const { values } = parseArgs({
    options: {
      "discord-id": { type: "string" },
      role: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || !values["discord-id"] || !values.role) {
    console.log(
      "Usage: npm run accounts:set-role -- --discord-id <Discord user ID> --role <admin|user>",
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
    const account = setAccountRole(
      database,
      values["discord-id"],
      values.role as AccountRole,
    );
    console.log(
      `Discord account ${account.discordId} now has role ${account.role}.`,
    );
    console.log("The new role applies on the next account or admin request.");
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(
    error instanceof Error ? error.message : "Could not update account role",
  );
  process.exitCode = 1;
}
