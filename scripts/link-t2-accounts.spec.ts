import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  linkT2Account,
  migrateAccountSchema,
  openAccountDatabase,
} from "../relay/accountDatabase";

const DISCORD_ID = "126767979894407168";
const OTHER_ID = "234567890123456789";
const project = fileURLToPath(new URL("..", import.meta.url));
const script = fileURLToPath(new URL("./link-t2-accounts.ts", import.meta.url));
let directory: string;
let filename: string;
let guidsFile: string;

interface Link {
  discordId: string;
  guid: string;
  name: string | null;
  createdAt: number;
}

function withDatabase<T>(read: (database: Database.Database) => T): T {
  const database = openAccountDatabase(filename);
  try {
    return read(database);
  } finally {
    database.close();
  }
}

function links(): Link[] {
  return withDatabase(
    (database) =>
      database
        .prepare(
          'SELECT l."discordId", l."guid", t."name", l."createdAt" FROM "t2AccountLink" l JOIN "t2Account" t ON t."guid" = l."guid" ORDER BY l."guid", l."discordId"',
        )
        .all() as Link[],
  );
}

function accountCount(): number {
  return withDatabase(
    (database) =>
      database
        .prepare('SELECT count(*) FROM "t2Account"')
        .pluck()
        .get() as number,
  );
}

async function inventory(namesByGuid: Record<string, string[]>) {
  await fs.writeFile(guidsFile, JSON.stringify({ namesByGuid }));
}

function environment() {
  return {
    ...process.env,
    AUTH_DATABASE_PATH: path.join(directory, "unused-default.sqlite"),
    DEMO_PRIVATE_R2_BUCKET: "",
    DEMO_R2_BUCKET: "",
    DEMO_R2_ACCESS_KEY_ID: "",
    DEMO_R2_SECRET_ACCESS_KEY: "",
    DEMO_R2_ENDPOINT: "",
  };
}

function argumentsFor(database = filename): string[] {
  return [
    "--import=tsx/esm",
    script,
    "--database",
    database,
    "--guids",
    guidsFile,
  ];
}

function run(input = "", database = filename) {
  const result = spawnSync(process.execPath, argumentsFor(database), {
    cwd: project,
    env: environment(),
    input,
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  return result;
}

async function fakeS3(sidecars: Record<string, unknown>) {
  const requests: { method: string; url: URL }[] = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url!, "http://127.0.0.1");
    requests.push({ method: request.method!, url });
    if (request.method !== "GET") {
      response.writeHead(405).end();
    } else if (url.searchParams.get("list-type") === "2") {
      response.writeHead(200, { "Content-Type": "application/xml" }).end(
        `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>${Object.keys(
          sidecars,
        )
          .map((key) => `<Contents><Key>${key}</Key></Contents>`)
          .join("")}</ListBucketResult>`,
      );
    } else {
      const key = decodeURIComponent(
        url.pathname.slice("/private-guids/".length),
      );
      if (!Object.hasOwn(sidecars, key)) response.writeHead(404).end();
      else
        response
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify(sidecars[key]));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const { port } = server.address() as { port: number };
  return {
    endpoint: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function runFromR2(endpoint: string, input: string) {
  const child = spawn(
    process.execPath,
    ["--import=tsx/esm", script, "--database", filename],
    {
      cwd: project,
      env: {
        ...environment(),
        DEMO_R2_ENDPOINT: endpoint,
        DEMO_R2_BUCKET: "public-demos",
        DEMO_R2_PREFIX: "public-prefix/",
        DEMO_PRIVATE_R2_BUCKET: "private-guids",
        DEMO_PRIVATE_R2_PREFIX: "guid-data/",
        DEMO_R2_ACCESS_KEY_ID: "test-access-key",
        DEMO_R2_SECRET_ACCESS_KEY: "test-secret-key",
      },
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (data: string) => {
    stdout += data;
  });
  child.stderr.setEncoding("utf8").on("data", (data: string) => {
    stderr += data;
  });
  const finished = new Promise<{
    status: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
  child.stdin.end(input);
  return finished;
}

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "link-t2-accounts-"));
  filename = path.join(directory, "accounts.sqlite");
  guidsFile = path.join(directory, "guids.json");
  withDatabase((database) => {
    database.exec(`
      CREATE TABLE "user" (id TEXT PRIMARY KEY);
      CREATE TABLE "account" (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES "user" (id),
        providerId TEXT NOT NULL,
        accountId TEXT NOT NULL
      );
    `);
    database.transaction(() => migrateAccountSchema(database))();
  });
  await inventory({ "101": ["Player"] });
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

it("reprompts invalid IDs, links before Discord login, and stores the displayed name", async () => {
  await inventory({
    "101": ["Player.1", "Player", "Old Alias"],
    "202": ["Skipped Player"],
  });
  const result = run(`not-an-id\n1234\n${DISCORD_ID}\n\n`);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("[1/2] GUID 101 — Player");
  expect(result.stdout).toContain("Old Alias");
  expect(result.stdout).not.toContain("Player.1");
  expect(result.stdout).toContain("Enter a numeric Discord user ID");
  expect(result.stdout).toContain(
    `Linked GUID 101 (Player) to Discord ${DISCORD_ID}`,
  );
  expect(result.stdout).toContain("Linked: 1; skipped: 1.");
  expect(links()).toEqual([
    expect.objectContaining({
      discordId: DISCORD_ID,
      guid: "101",
      name: "Player",
    }),
  ]);
  withDatabase((database) => {
    expect(database.prepare('SELECT * FROM "user"').all()).toEqual([]);
    expect(database.prepare('SELECT * FROM "account"').all()).toEqual([]);
  });
  await expect(
    fs.access(path.join(directory, "unused-default.sqlite")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

it("skips an empty response without creating an account or link", () => {
  const result = run("\n");
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("Skipped GUID 101.");
  expect(result.stdout).toContain("Linked: 0; skipped: 1.");
  expect(accountCount()).toBe(0);
  expect(links()).toEqual([]);
});

it("collects and merges private R2 GUID sidecars before prompting for unlinked players", async () => {
  withDatabase((database) =>
    linkT2Account(database, OTHER_ID, "101", "Existing label"),
  );
  const storage = await fakeS3({
    "guid-data/a.rec.guids.json": {
      namesByGuid: {
        "101": ["Already Linked Alias"],
        "202": ["New Player", "Old Alias"],
      },
    },
    "guid-data/b.rec.guids.json": {
      namesByGuid: { "202": ["New Player", "Other Alias"] },
    },
  });
  try {
    const result = await runFromR2(storage.endpoint, `${DISCORD_ID}\n`);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "Collecting player GUIDs and names from private demo sidecars",
    );
    expect(result.stdout).toContain("[1/1] GUID 202 — New Player");
    expect(result.stdout).toContain("Old Alias");
    expect(result.stdout).toContain("Other Alias");
    expect(result.stdout).not.toContain("Already Linked Alias");
    expect(links()).toEqual([
      expect.objectContaining({
        discordId: OTHER_ID,
        guid: "101",
        name: "Existing label",
      }),
      expect.objectContaining({
        discordId: DISCORD_ID,
        guid: "202",
        name: "New Player",
      }),
    ]);
    const listing = storage.requests.find(
      ({ url }) => url.searchParams.get("list-type") === "2",
    )!;
    expect(listing.url.pathname).toMatch(/^\/private-guids\/?$/);
    expect(listing.url.searchParams.get("prefix")).toBe("guid-data/");
    expect(storage.requests.map(({ url }) => url.pathname)).toEqual(
      expect.arrayContaining([
        "/private-guids/guid-data/a.rec.guids.json",
        "/private-guids/guid-data/b.rec.guids.json",
      ]),
    );
    expect(storage.requests.every(({ method }) => method === "GET")).toBe(true);
  } finally {
    await storage.close();
  }
}, 15_000);

it("writes no links or prompts when one private R2 GUID sidecar is malformed", async () => {
  const storage = await fakeS3({
    "guid-data/a.rec.guids.json": { namesByGuid: { "101": ["Valid Player"] } },
    "guid-data/b.rec.guids.json": { namesByGuid: { "202": [42] } },
  });
  try {
    const result = await runFromR2(storage.endpoint, `${DISCORD_ID}\n`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Could not read 1 GUID sidecars; no links were written.",
    );
    expect(result.stdout).not.toContain("Discord ID (Enter to skip):");
    expect(accountCount()).toBe(0);
    expect(links()).toEqual([]);
    expect(storage.requests.every(({ method }) => method === "GET")).toBe(true);
  } finally {
    await storage.close();
  }
}, 15_000);

it("excludes a GUID already linked to any Discord identity", async () => {
  withDatabase((database) =>
    linkT2Account(database, OTHER_ID, "101", "Existing label"),
  );
  await inventory({ "101": ["Already Linked Alias"], "202": ["New Player"] });
  const result = run(`${DISCORD_ID}\n`);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).not.toContain("Already Linked Alias");
  expect(result.stdout).toContain("[1/1] GUID 202 — New Player");
  expect(links()).toEqual([
    expect.objectContaining({
      discordId: OTHER_ID,
      guid: "101",
      name: "Existing label",
    }),
    expect.objectContaining({
      discordId: DISCORD_ID,
      guid: "202",
      name: "New Player",
    }),
  ]);
});

it("asks again for skipped GUIDs while leaving previous links untouched on a rerun", async () => {
  await inventory({ "101": ["Skipped Player"], "202": ["Linked Player"] });
  expect(run(`\n${DISCORD_ID}\n`).status).toBe(0);
  const [previous] = links();
  const again = run(`${OTHER_ID}\n`);
  expect(again.status, again.stderr).toBe(0);
  expect(again.stdout).toContain("[1/1] GUID 101 — Skipped Player");
  expect(again.stdout).not.toContain("Linked Player");
  expect(links()).toEqual([
    expect.objectContaining({
      discordId: OTHER_ID,
      guid: "101",
      name: "Skipped Player",
    }),
    previous,
  ]);
});

it("keeps an existing unlinked account name instead of replacing it with an alias", () => {
  withDatabase((database) => {
    database
      .prepare(
        'INSERT INTO "t2Account" (guid, name, createdAt) VALUES (?, ?, ?)',
      )
      .run("101", "Preferred Name", 1);
  });
  const result = run(`${DISCORD_ID}\n`);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("GUID 101 — Preferred Name");
  expect(result.stdout).toContain("Player");
  expect(links()[0]).toMatchObject({
    discordId: DISCORD_ID,
    name: "Preferred Name",
  });
});

it("leaves nameless GUIDs unlinked", async () => {
  await inventory({ "101": ["", " "] });
  const result = run(`${DISCORD_ID}\n`);
  expect(result.status, result.stderr).toBe(0);
  expect(accountCount()).toBe(0);
  expect(links()).toEqual([]);
});

it.each([false, true])(
  "exits cleanly at EOF, preserving earlier commits (has input: %s)",
  async (hasInput) => {
    await inventory({ "101": ["First"], "202": ["Second"] });
    const result = run(hasInput ? `${DISCORD_ID}\n` : "");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Linked: ${hasInput ? 1 : 0}; skipped: 0.`);
    expect(links()).toEqual(
      hasInput
        ? [
            expect.objectContaining({
              discordId: DISCORD_ID,
              guid: "101",
              name: "First",
            }),
          ]
        : [],
    );
  },
);

it("preserves already committed links when interrupted", async () => {
  await inventory({ "101": ["First"], "202": ["Second"] });
  const child = spawn(process.execPath, argumentsFor(), {
    cwd: project,
    env: environment(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stdout.resume();
  child.stderr.setEncoding("utf8").on("data", (data: string) => {
    stderr += data;
  });
  const finished = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  try {
    child.stdin.write(`${DISCORD_ID}\n`);
    await vi.waitFor(() => expect(links()).toHaveLength(1), { timeout: 5_000 });
    child.kill("SIGINT");
    const result = await finished;
    expect(
      result.code ?? (result.signal === "SIGINT" ? 130 : null),
      stderr,
    ).toBe(130);
    expect(links()[0]).toMatchObject({
      discordId: DISCORD_ID,
      guid: "101",
      name: "First",
    });
    expect(stderr).not.toContain("Error:");
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
    child.stdin.end();
    await finished;
  }
}, 10_000);

it("rejects a missing database path without creating its parent or SQLite file", async () => {
  const missing = path.join(directory, "missing", "accounts.sqlite");
  const result = run(`${DISCORD_ID}\n`, missing);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Account database not found");
  await expect(fs.access(path.dirname(missing))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(accountCount()).toBe(0);
});

it.each([
  "{broken",
  JSON.stringify({ namesByGuid: [] }),
  JSON.stringify({ namesByGuid: { "101": ["Valid"], "0": ["Hidden"] } }),
  JSON.stringify({ namesByGuid: { "101": ["Valid"], "202": [42] } }),
])(
  "rejects malformed GUID inventory before writing any accounts: %s",
  async (text) => {
    await fs.writeFile(guidsFile, text);
    const result = run(`${DISCORD_ID}\n${OTHER_ID}\n`);
    expect(result.status).toBe(1);
    expect(accountCount()).toBe(0);
    expect(links()).toEqual([]);
  },
);
