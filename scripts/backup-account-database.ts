import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  createAccountDatabaseBackup,
  openAccountDatabase,
} from "../relay/accountDatabase.js";
import {
  loadAccountBackupConfig,
  startAccountBackups,
} from "../relay/accountBackup.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      upload: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || (!values.out && !values.upload)) {
    console.log(
      "Usage: npm run accounts:backup -- --out=/private/path/accounts.sqlite [--upload]",
    );
    console.log("       npm run accounts:backup -- --upload");
    console.log(
      "Reads AUTH_DATABASE_PATH; --upload requires the dedicated private ACCOUNT_BACKUP_R2_* bucket.",
    );
    if (!values.help) process.exitCode = 1;
    return;
  }
  const source = path.resolve(
    process.env.AUTH_DATABASE_PATH || ".relay/accounts/app.sqlite",
  );
  const stat = fs.statSync(source);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(
      "Account database must already exist and contain a SQLite database",
    );
  }
  const config = values.upload ? loadAccountBackupConfig() : null;
  if (values.upload && !config) {
    throw new Error("--upload requires all four ACCOUNT_BACKUP_R2_* settings");
  }
  const database = openAccountDatabase(source);
  try {
    if (values.out) {
      await createAccountDatabaseBackup(database, values.out);
      console.log(
        `Verified account database backup saved to ${path.resolve(values.out)}`,
      );
    }
    if (config) {
      const backups = startAccountBackups(database, config);
      try {
        await backups.run();
        console.log(
          "Verified account database backup uploaded to the private bucket",
        );
      } finally {
        await backups.stop();
      }
    }
  } finally {
    database.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Account database backup failed",
  );
  process.exitCode = 1;
});
