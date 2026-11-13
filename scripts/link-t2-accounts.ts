import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs, stripVTControlCharacters } from "node:util";
import {
  getLinkedT2Guids,
  hasPendingAccountSchemaMigrations,
  linkT2Account,
  openAccountDatabase,
} from "../relay/accountDatabase.js";
import { isDiscordId } from "../relay/accountTypes.js";
import { collectDemoGuidInventory } from "../relay/demoGuidInventory.js";
import {
  readDemoGuidSidecar,
  withoutReconnectNames,
} from "../relay/demoGuids.js";
import {
  loadPrivateDemoStorageConfig,
  PrivateDemoStore,
} from "../relay/privateDemoStore.js";

function displayName(value: string): string {
  return stripVTControlCharacters(value).replace(
    /[\u0000-\u001f\u007f-\u009f]/g,
    " ",
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      database: { type: "string" },
      guids: { type: "string" },
      concurrency: { type: "string", default: "16" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(
      [
        "Usage: npm run accounts:link-t2:interactive -- [options]",
        "",
        "Prompts for a Discord user ID for each unlinked player GUID.",
        "Enter skips a player. Invalid IDs prompt again. Ctrl-C or EOF stops.",
        "Each link and its displayed player name are saved immediately.",
        "Discord users do not need to have signed in yet.",
        "",
        "  --database=FILE       SQLite file (default: AUTH_DATABASE_PATH or .relay/accounts/app.sqlite)",
        "  --guids=FILE          Read a demos:merge-guids JSON export instead of R2",
        "  --concurrency=N       GUID sidecars fetched at once (default: 16)",
        "",
        "Uses private GUID sidecars configured by DEMO_R2_* and DEMO_PRIVATE_R2_BUCKET.",
        "Validates Discord ID format without calling the Discord API.",
      ].join("\n"),
    );
    return;
  }
  const concurrency = Number(values.concurrency);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error("--concurrency must be a positive integer");

  const filename = path.resolve(
    values.database ||
      process.env.AUTH_DATABASE_PATH ||
      ".relay/accounts/app.sqlite",
  );
  const stat = await fs
    .lstat(filename)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT")
        throw new Error(`Account database not found: ${filename}`);
      throw error;
    });
  if (!stat.isFile() || stat.size === 0)
    throw new Error(
      "Account database must be an existing nonempty SQLite file",
    );
  const database = openAccountDatabase(filename);
  try {
    if (hasPendingAccountSchemaMigrations(database))
      throw new Error(
        "Account database has not been migrated yet. Start the updated relay with Discord sign-in enabled first.",
      );

    let namesByGuid: Record<string, string[]>;
    if (values.guids) {
      namesByGuid = readDemoGuidSidecar(
        JSON.parse(await fs.readFile(values.guids, "utf8")),
      ).namesByGuid;
    } else {
      const config = loadPrivateDemoStorageConfig();
      if (!config)
        throw new Error("Missing DEMO_R2_* or DEMO_PRIVATE_R2_BUCKET.");
      console.log(
        "Collecting player GUIDs and names from private demo sidecars…",
      );
      const inventory = await collectDemoGuidInventory(
        new PrivateDemoStore(config),
        {
          concurrency,
          onError: (demoKey, error) => console.error(demoKey, error),
        },
      );
      if (inventory.failed)
        throw new Error(
          `Could not read ${inventory.failed} GUID sidecars; no links were written.`,
        );
      namesByGuid = inventory.namesByGuid;
    }

    const linkedGuids = getLinkedT2Guids(database);
    const candidates = Object.entries(withoutReconnectNames(namesByGuid))
      .filter(([guid]) => !linkedGuids.has(guid))
      .sort(([a], [b]) => a.length - b.length || a.localeCompare(b));
    console.log(`Database: ${filename}`);
    console.log(`${candidates.length} unlinked GUIDs.`);
    if (!candidates.length) return;

    const accountName = database
      .prepare('SELECT "name" FROM "t2Account" WHERE "guid" = ?')
      .pluck();
    const alreadyLinked = database.prepare(
      'SELECT 1 FROM "t2AccountLink" WHERE "guid" = ? LIMIT 1',
    );
    const saveLink = database.transaction(
      (discordId: string, guid: string, name: string) => {
        if (alreadyLinked.get(guid)) return false;
        linkT2Account(database, discordId, guid, name);
        return true;
      },
    );
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      crlfDelay: Infinity,
    });
    const answers = rl[Symbol.asyncIterator]();
    rl.setPrompt("Discord ID (Enter to skip): ");
    let interrupted = false;
    const interrupt = () => {
      interrupted = true;
      rl.close();
    };
    rl.on("SIGINT", interrupt);
    process.once("SIGINT", interrupt);
    let linked = 0;
    let skipped = 0;
    try {
      players: for (const [index, [guid, aliases]] of candidates.entries()) {
        if (alreadyLinked.get(guid)) continue;
        const name =
          (accountName.get(guid) as string | null | undefined)?.trim() ||
          aliases.find((alias) => alias.trim())?.trim();
        if (!name) {
          console.log(`Skipped GUID ${guid}: no player name available.`);
          skipped++;
          continue;
        }
        console.log(
          `\n[${index + 1}/${candidates.length}] GUID ${guid} — ${displayName(name)}`,
        );
        const otherNames = aliases.filter((alias) => alias && alias !== name);
        if (otherNames.length)
          console.log(`Aliases: ${otherNames.map(displayName).join(", ")}`);
        for (;;) {
          rl.prompt();
          const answer = await answers.next();
          if (answer.done || interrupted) break players;
          const discordId = answer.value.trim();
          if (!discordId) {
            skipped++;
            console.log(`Skipped GUID ${guid}.`);
            break;
          }
          if (!isDiscordId(discordId)) {
            console.log(
              "Enter a numeric Discord user ID (17–20 digits), or press Enter to skip.",
            );
            continue;
          }
          if (saveLink.immediate(discordId, guid, name)) {
            linked++;
            console.log(
              `Linked GUID ${guid} (${displayName(name)}) to Discord ${discordId}.`,
            );
          } else {
            skipped++;
            console.log(
              `Skipped GUID ${guid}: it was linked by another process.`,
            );
          }
          break;
        }
      }
    } finally {
      process.removeListener("SIGINT", interrupt);
      rl.close();
    }
    console.log(`\nLinked: ${linked}; skipped: ${skipped}.`);
    if (interrupted) process.exitCode = 130;
  } finally {
    database.close();
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
