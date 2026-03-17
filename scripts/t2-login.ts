/**
 * Downloads TribesNext account credentials (certificate + encrypted private key)
 * from the auth server using username and password.
 *
 * Usage:
 *   tsx scripts/t2-login.ts [--env <path>] [--update]
 *
 * Reads T2_ACCOUNT_NAME and T2_ACCOUNT_PASSWORD from .env / environment (or prompts).
 *
 * Without --update, prints the env lines to stdout. With --update, writes them
 * to the target env file (default: .env.local).
 *
 * This only needs to be run once — the credentials persist until you change
 * your password or the auth server rotates keys.
 */

import crypto from "node:crypto";
import net from "node:net";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { input, password } from "@inquirer/prompts";

const ROOT = path.resolve(import.meta.dirname, "..");

const { values: args } = parseArgs({
  options: {
    env: { type: "string", default: ".env.local" },
    update: { type: "boolean", default: false },
  },
  strict: true,
});

function errorMessage(e: unknown): string {
  if (e instanceof AggregateError && e.errors.length > 0) {
    return errorMessage(e.errors[0]);
  }
  if (e instanceof Error && e.message) return e.message;
  return String(e);
}

function sha1(data: string): string {
  return crypto.createHash("sha1").update(data).digest("hex");
}

/**
 * Read an env file and return its lines. Returns an empty array if the
 * file doesn't exist.
 */
async function readEnvLines(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines;
  } catch {
    return [];
  }
}

/**
 * Update env file content: replace existing keys in-place, append new ones.
 * Preserves comments, blank lines, and ordering of untouched keys.
 */
function updateEnvLines(
  existingLines: string[],
  updates: Record<string, string>,
): string[] {
  const remaining = new Set(Object.keys(updates));
  const result: string[] = [];

  for (const line of existingLines) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match && remaining.has(match[1])) {
      result.push(`${match[1]}=${updates[match[1]]}`);
      remaining.delete(match[1]);
    } else {
      result.push(line);
    }
  }

  // Append any keys that weren't already in the file
  for (const key of remaining) {
    result.push(`${key}=${updates[key]}`);
  }

  // Ensure file ends with a newline
  if (result[result.length - 1] !== "") {
    result.push("");
  }

  return result;
}

/** Look up the auth server address from tribesnext.com */
async function findAuthServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get("http://www.tribesnext.com/auth", (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        const lines = body.trim().split("\n");
        for (const line of lines) {
          const fields = line.split("\t");
          if (fields.length >= 1 && fields[0].includes(":")) {
            resolve(fields[0]);
            return;
          }
        }
        reject(new Error("Could not parse auth server address from response"));
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Auth server lookup timed out"));
    });
  });
}

/** Download account credentials from the auth server via TCP. */
async function downloadAccount(
  authAddress: string,
  username: string,
  password: string,
): Promise<{ certificate: string; encryptedKey: string }> {
  const [host, portStr] = authAddress.split(":");
  const port = parseInt(portStr, 10);

  // Build the request hash (same as t2csri_downloadAccount)
  const authStored = sha1("3.14159265" + username.toLowerCase() + password);
  const utc = Math.floor(Date.now() / 1000).toString();
  const timeNonce = sha1(utc + username.toLowerCase());
  const requestHash = sha1(authStored + timeNonce);
  const payload = `RECOVER\t${username}\t${utc}\t${requestHash}\n`;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = "";
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    // Overall timeout if we never get any data at all.
    socket.setTimeout(15000);

    socket.connect(port, host, () => {
      socket.write(payload);
    });

    socket.on("data", (data: Buffer) => {
      buffer += data.toString();
      // The auth server doesn't close the connection after responding.
      // Mimic Torque's 700ms idle timeout to detect response completion.
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        socket.destroy();
        processResponse();
      }, 700);
    });

    socket.on("end", () => {
      processResponse();
    });

    socket.on("timeout", () => {
      socket.destroy();
      const err = new Error("Auth server connection timed out");
      (err as any).isNetwork = true;
      reject(err);
    });

    socket.on("error", (err: Error) => {
      (err as any).isNetwork = true;
      reject(err);
    });

    socket.on("close", () => {
      processResponse();
    });

    let processed = false;
    function processResponse() {
      if (processed) return;
      processed = true;
      if (idleTimer) clearTimeout(idleTimer);

      const trimmed = buffer.trim();

      if (trimmed === "RECOVERERROR") {
        reject(
          new Error("Auth server returned RECOVERERROR (malformed request)"),
        );
        return;
      }
      if (trimmed === "NOTFOUND") {
        reject(new Error("Account not found. Check your username."));
        return;
      }
      if (trimmed === "INVALIDPASSWORD") {
        reject(new Error("Invalid password."));
        return;
      }

      // Success response format:
      // Line 1: CERT: <certificate_fields_tab_separated>
      // Line 2: EXP: <encrypted_private_exponent>
      const lines = trimmed.split("\n");
      if (lines.length < 2) {
        reject(
          new Error(
            `Unexpected response from auth server: ${trimmed.slice(0, 200)}`,
          ),
        );
        return;
      }

      let certLine = lines[0];
      let expLine = lines[1];

      // Strip the "CERT: " prefix
      if (certLine.startsWith("CERT:")) {
        certLine = certLine.substring(6).trim();
      }

      // Strip the "EXP: " prefix if present
      if (expLine.startsWith("EXP:")) {
        expLine = expLine.substring(5).trim();
      }

      resolve({
        certificate: certLine,
        encryptedKey: expLine,
      });
    }
  });
}

async function main() {
  const envFilePath = path.resolve(ROOT, args.env!);

  // Credentials come from process.env (loaded via --env-file-if-exists in
  // the npm script, or set manually in the shell environment).
  let username = process.env.T2_ACCOUNT_NAME || "";
  let pw = process.env.T2_ACCOUNT_PASSWORD || "";

  if (!username) {
    username = await input({ message: "TribesNext username:", required: true });
  } else {
    console.log(`Using username: ${username}`);
  }

  if (!pw) {
    pw = await password({ message: "TribesNext password:", mask: "•" });
    if (!pw) {
      console.error("Password is required.");
      process.exit(1);
    }
  } else {
    console.log("Using password from environment");
  }

  const maxRetries = 3;

  // Step 1: Find auth server
  let authAddress = process.env.T2_AUTH_SERVER || "";
  if (authAddress) {
    console.log(`Using auth server from environment: ${authAddress}`);
  } else {
    console.log("Looking up auth server...");
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        authAddress = await findAuthServer();
        console.log(`Auth server: ${authAddress}`);
        break;
      } catch (e) {
        if (attempt < maxRetries) {
          const delay = attempt * 2;
          const msg = errorMessage(e);
          console.warn(
            `Attempt ${attempt} failed: ${msg}, retrying in ${delay}s...`,
          );
          await new Promise((r) => setTimeout(r, delay * 1000));
        } else {
          const msg = errorMessage(e);
          console.error(`Failed to find auth server: ${msg}`);
          process.exit(1);
        }
      }
    }
  }

  // Step 2: Download credentials (retry on network errors)
  console.log("Downloading account credentials...");
  let credentials!: { certificate: string; encryptedKey: string };
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      credentials = await downloadAccount(authAddress, username, pw);
      break;
    } catch (e: any) {
      if (e?.isNetwork && attempt < maxRetries) {
        const delay = attempt * 2;
        const msg = errorMessage(e);
        console.warn(
          `Attempt ${attempt} failed: ${msg}, retrying in ${delay}s...`,
        );
        await new Promise((r) => setTimeout(r, delay * 1000));
      } else {
        const msg = errorMessage(e);
        console.error(`Failed to download credentials: ${msg}`);
        process.exit(1);
      }
    }
  }

  console.log("Successfully downloaded credentials!");

  // Verify the certificate looks valid
  const certFields = credentials.certificate.split("\t");
  if (certFields.length >= 4) {
    console.log(`  Account: ${certFields[0]}`);
    console.log(`  GUID: ${certFields[1]}`);
    console.log(`  Public key length: ${certFields[3].length} hex chars`);
  }

  // Step 3: Output or update the env file
  const certB64 = Buffer.from(credentials.certificate).toString("base64");
  const keyB64 = Buffer.from(credentials.encryptedKey).toString("base64");

  const envVars: Record<string, string> = {
    T2_ACCOUNT_NAME: username,
    T2_ACCOUNT_PASSWORD: pw,
    T2_ACCOUNT_CERTIFICATE: certB64,
    T2_ACCOUNT_ENCRYPTED_KEY: keyB64,
  };

  if (args.update) {
    const existingLines = await readEnvLines(envFilePath);
    const updatedLines = updateEnvLines(
      existingLines.length > 0
        ? existingLines
        : ["# Generated by scripts/t2-login.ts"],
      envVars,
    );

    await fs.writeFile(envFilePath, updatedLines.join("\n"), "utf-8");
    console.log(`\nCredentials written to ${envFilePath}`);
    console.log(
      "The relay server will read these automatically. Run: npm run relay:dev",
    );
  } else {
    console.log("");
    for (const [key, value] of Object.entries(envVars)) {
      console.log(`${key}=${value}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
