import fs from "node:fs";
import path from "node:path";
import { parseArgs, stripVTControlCharacters } from "node:util";
import Database from "better-sqlite3";

interface DiscordUser {
  id: string;
  discordId: string;
  name: string;
  discordUsername: string | null;
  role: string | null;
  createdAt: string | number | null;
}

function displayText(value: string | null): string {
  return stripVTControlCharacters(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .trim();
}

function joinedDate(value: DiscordUser["createdAt"]): string {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().slice(0, 10);
}

function main(): void {
  const { values } = parseArgs({
    options: {
      database: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log("Usage: npm run accounts:list -- [--database <SQLite file>]");
    console.log(
      "Lists Discord users read-only. Uses AUTH_DATABASE_PATH, defaulting to .relay/accounts/app.sqlite.",
    );
    return;
  }

  const filename = path.resolve(
    values.database ||
      process.env.AUTH_DATABASE_PATH ||
      ".relay/accounts/app.sqlite",
  );
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(`Account database not found: ${filename}`);
    throw error;
  }
  if (!stat.isFile() || stat.size === 0)
    throw new Error(
      "Account database must be an existing nonempty SQLite file",
    );

  const database = new Database(filename, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });
  try {
    const tables = database
      .prepare(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('user', 'account')",
      )
      .pluck()
      .get();
    if (tables !== 2)
      throw new Error(
        "Account tables not found. Start the relay with Discord sign-in enabled first.",
      );
    const users = database
      .prepare(
        `SELECT DISTINCT
          u.id, a.accountId AS discordId, u.name, u.discordUsername, u.role, u.createdAt
        FROM "user" u JOIN "account" a ON a.userId = u.id
        WHERE a.providerId = 'discord'
        ORDER BY u.discordUsername COLLATE NOCASE, a.accountId, u.id`,
      )
      .all() as DiscordUser[];

    console.log(`Database: ${filename}`);
    if (users.length === 0) {
      console.log("No Discord users found.");
      return;
    }
    const admins = users.filter((user) => user.role === "admin").length;
    console.log(
      `${users.length} Discord user${users.length === 1 ? "" : "s"} · ${admins} admin${admins === 1 ? "" : "s"}\n`,
    );
    console.table(
      users.map((user) => ({
        Name: displayText(user.name) || "—",
        Handle: user.discordUsername
          ? `@${displayText(user.discordUsername)}`
          : "—",
        "Discord ID": user.discordId,
        Role: displayText(user.role) || "—",
        "Joined (UTC)": joinedDate(user.createdAt),
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
    error instanceof Error ? error.message : "Could not list Discord users",
  );
  process.exitCode = 1;
}
