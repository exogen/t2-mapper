import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import {
  loadAccountBackupConfig,
  startAccountBackups,
  type AccountBackupConfig,
} from "./accountBackup.js";
import { openAccountDatabase } from "./accountDatabase.js";

const env = {
  ACCOUNT_BACKUP_R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  ACCOUNT_BACKUP_R2_BUCKET: "private-accounts",
  ACCOUNT_BACKUP_R2_ACCESS_KEY_ID: "test-id",
  ACCOUNT_BACKUP_R2_SECRET_ACCESS_KEY: "test-secret",
  DEMO_R2_BUCKET: "public-demos",
};

it("requires explicit complete private-bucket configuration without demo-credential fallback", () => {
  expect(
    loadAccountBackupConfig({ DEMO_R2_BUCKET: "public-demos" }),
  ).toBeNull();
  expect(() =>
    loadAccountBackupConfig({ ACCOUNT_BACKUP_R2_BUCKET: "private-accounts" }),
  ).toThrow(/All four/);
  expect(() =>
    loadAccountBackupConfig({
      ...env,
      ACCOUNT_BACKUP_R2_BUCKET: "public-demos",
    }),
  ).toThrow(/separate private bucket/);
  expect(() =>
    loadAccountBackupConfig({
      ...env,
      ACCOUNT_BACKUP_R2_ENDPOINT: "http://example.com",
    }),
  ).toThrow(/HTTPS/);
  expect(() =>
    loadAccountBackupConfig({ ...env, ACCOUNT_BACKUP_INTERVAL_MS: "0" }),
  ).toThrow(/INTERVAL/);
  expect(loadAccountBackupConfig(env)).toMatchObject({
    bucket: "private-accounts",
    prefix: "accounts/",
    intervalMs: 21_600_000,
  });
});

it("uploads a verified snapshot as a plain known-length PUT and coalesces overlapping backups", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "account-backup-test-"),
  );
  const database = openAccountDatabase(path.join(directory, "accounts.sqlite"));
  database.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('alice')",
  );
  const objects: {
    pathname: string;
    headers: http.IncomingHttpHeaders;
    data: Buffer;
  }[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      objects.push({
        pathname: new URL(request.url!, "http://localhost").pathname,
        headers: request.headers,
        data: Buffer.concat(chunks),
      });
      response.writeHead(200).end();
    });
    request.on("error", (error) => response.destroy(error));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected a TCP address");
  const backups = startAccountBackups(database, {
    ...(loadAccountBackupConfig(env) as AccountBackupConfig),
    endpoint: `http://127.0.0.1:${address.port}`,
  });
  try {
    const first = backups.run();
    expect(backups.run()).toBe(first);
    await first;
    expect(objects).toHaveLength(1);
    expect(objects[0].pathname).toMatch(
      /^\/private-accounts\/accounts\/.+\.sqlite$/,
    );
    expect(objects[0].headers["content-length"]).toBe(
      String(objects[0].data.length),
    );
    expect(objects[0].headers["content-encoding"]).toBeUndefined();
    expect(objects[0].headers["transfer-encoding"]).toBeUndefined();
    expect(objects[0].headers["x-amz-trailer"]).toBeUndefined();
    const restoredFile = path.join(directory, "restored.sqlite");
    fs.writeFileSync(restoredFile, objects[0].data, { mode: 0o600 });
    const restored = new Database(restoredFile, { readonly: true });
    try {
      expect(restored.prepare("SELECT id FROM users").pluck().get()).toBe(
        "alice",
      );
    } finally {
      restored.close();
    }
    expect(
      fs
        .readdirSync(directory)
        .some((name) => name.startsWith(".account-backup-")),
    ).toBe(false);
  } finally {
    await backups.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
