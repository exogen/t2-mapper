import crypto from "node:crypto";
import { authLog } from "./logger.js";

/**
 * T2csri authentication — reimplements the TribesNext challenge-response
 * flow in TypeScript. The relay acts as the client side.
 *
 * Flow (after Torque-level ConnectAccept):
 *   1. Server sends: t2csri_pokeClient(version)
 *   2. Client sends: certificate in 200-byte chunks via t2csri_sendCertChunk
 *   3. Client sends: t2csri_sendChallenge(clientChallenge)
 *   4. Server sends: encrypted challenge chunks via t2csri_getChallengeChunk
 *   5. Server sends: t2csri_decryptChallenge
 *   6. Client decrypts, verifies, sends: t2csri_challengeResponse(serverChallenge)
 */

export interface AccountCredentials {
  /** Tab-separated: username\tguid\te\tn\tsig */
  certificate: string;
  /** Hex-encoded RSA private exponent (after RC4 decryption). */
  privateKey: string;
}

/**
 * Decrypt the RC4-encrypted private key using the account password.
 *
 * The stored format is `nonce:encryptedHex` where:
 * - nonce = SHA1 of the plaintext private key (used for verification)
 * - encryptedHex = hex-encoded RC4-encrypted private key bytes
 * - RC4 key = SHA1(password + nonce), with 2048 bytes discarded from stream
 *
 * Based on t2csri_decryptAccountKey in clientSide.cs.
 */
export function decryptAccountKey(
  encryptedKeyBase64: string,
  _username: string,
  password: string,
): string {
  // Decode the base64 to get the "nonce:encryptedHex" string
  const stored = Buffer.from(encryptedKeyBase64, "base64").toString("ascii");
  const colonIdx = stored.indexOf(":");
  if (colonIdx === -1) {
    throw new Error("Invalid encrypted key format: missing colon separator");
  }
  const nonce = stored.slice(0, colonIdx);
  const encryptedHex = stored.slice(colonIdx + 1);

  // RC4 key = SHA1(password + nonce) as ASCII hex string (not hex-decoded)
  // T2csri uses strCmp(char, "") to get ASCII values, so the key is the
  // raw 40-char hex string, not the 20-byte decoded value.
  const rc4Key = sha1(password + nonce);

  // Hex-decode the encrypted data
  const encryptedBytes = Buffer.from(encryptedHex, "hex");

  // RC4 decrypt with 2048-byte stream discard
  const decrypted = rc4WithDiscard(
    Buffer.from(rc4Key, "ascii"),
    encryptedBytes,
    2048,
  );

  // Result is the hex-encoded private key
  const privateKeyHex = decrypted.toString("hex");

  // Verify against nonce (nonce = SHA1 of plaintext hex)
  const hash = sha1(privateKeyHex);
  if (hash === nonce) {
    return privateKeyHex;
  }

  // T2csri tries fixing the last nibble/byte if hash doesn't match
  const truncated = privateKeyHex.slice(0, -2);
  for (let i = 0; i < 16; i++) {
    const candidate = truncated + i.toString(16);
    if (sha1(candidate) === nonce) return candidate;
  }
  for (let i = 0; i < 256; i++) {
    const candidate = truncated + i.toString(16).padStart(2, "0");
    if (sha1(candidate) === nonce) return candidate;
  }

  authLog.warn("Private key hash verification failed (password may be wrong)");
  return privateKeyHex;
}

/** Load credentials from environment variables. */
export function loadCredentials(): AccountCredentials | null {
  const certificate = process.env.T2_ACCOUNT_CERTIFICATE;
  const encryptedKey = process.env.T2_ACCOUNT_ENCRYPTED_KEY;
  const username = process.env.T2_ACCOUNT_NAME;
  const password = process.env.T2_ACCOUNT_PASSWORD;

  if (!certificate) {
    authLog.warn("T2_ACCOUNT_CERTIFICATE not set");
    return null;
  }

  let privateKey: string;

  if (encryptedKey && username && password) {
    privateKey = decryptAccountKey(encryptedKey, username, password);
  } else {
    authLog.warn(
      "T2_ACCOUNT_ENCRYPTED_KEY / T2_ACCOUNT_NAME / T2_ACCOUNT_PASSWORD not fully set",
    );
    return null;
  }

  const cert = Buffer.from(certificate, "base64").toString("ascii");
  return { certificate: cert, privateKey };
}

/**
 * Generate a random hex challenge string.
 * Mirrors T2csri's `rand(18446744073709551615).to_s(16)` — a random
 * 64-bit integer converted to hex WITHOUT leading zeros. This is critical:
 * the challenge round-trips through BigInt→hex conversions (`.to_i(16)` /
 * `.to_s(16)`) during RSA encryption/decryption, which strip leading zeros.
 * If we generated "06ab..." it would decrypt as "6ab..." and fail to match.
 */
export function generateChallenge(): string {
  const bytes = crypto.randomBytes(8);
  const num = BigInt("0x" + bytes.toString("hex"));
  return num.toString(16); // no leading zeros, matches Ruby .to_s(16)
}

/** Get the hex representation of an IPv4 address (e.g. "192.168.1.1" -> "c0a80101"). */
export function ipToHex(ip: string): string {
  return ip
    .split(".")
    .map((octet) => parseInt(octet, 10).toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build the client challenge string: random_challenge + server_ip_hex.
 */
export function buildClientChallenge(serverIp: string): {
  fullChallenge: string;
  randomPart: string;
} {
  const randomPart = generateChallenge();
  const ipHex = ipToHex(serverIp);
  return { fullChallenge: randomPart + ipHex, randomPart };
}

/**
 * RSA modular exponentiation: base^exp mod modulus.
 * All values are hex strings.
 */
export function rsaModExp(
  baseHex: string,
  expHex: string,
  modHex: string,
): string {
  const base = BigInt("0x" + baseHex);
  const exp = BigInt("0x" + expHex);
  const mod = BigInt("0x" + modHex);

  const result = modPow(base, exp, mod);
  // No padding — matches T2csri's Ruby `.to_s(16)` which strips leading zeros.
  // Both server and client use unpadded hex throughout the challenge flow.
  return result.toString(16);
}

/** Efficient modular exponentiation using square-and-multiply. */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) {
      result = (result * base) % mod;
    }
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/**
 * Decrypt the server's encrypted challenge using our private key.
 * encrypted = challenge^e mod n (server encrypted with our public key)
 * decrypted = encrypted^d mod n (we decrypt with private key)
 */
export function decryptChallenge(
  encryptedHex: string,
  privateKeyHex: string,
  modulusHex: string,
): string {
  return rsaModExp(encryptedHex, privateKeyHex, modulusHex);
}

/**
 * Process the decrypted challenge from the server.
 * Returns the server challenge portion if valid.
 */
export function processDecryptedChallenge(
  decryptedHex: string,
  originalClientChallenge: string,
): { valid: boolean; serverChallenge: string } {
  // The decrypted value should be: clientChallenge + serverChallenge
  const clientPart = decryptedHex.slice(0, originalClientChallenge.length);

  if (clientPart.toLowerCase() !== originalClientChallenge.toLowerCase()) {
    return { valid: false, serverChallenge: "" };
  }

  const serverChallenge = decryptedHex.slice(originalClientChallenge.length);
  return { valid: true, serverChallenge };
}

/** SHA1 hash of a string, returned as hex. */
function sha1(data: string): string {
  return crypto.createHash("sha1").update(data).digest("hex");
}

/** RC4 encrypt/decrypt with optional stream discard (drop-N). */
function rc4WithDiscard(
  key: Buffer,
  data: Buffer,
  discardBytes: number = 0,
): Buffer {
  // Initialize S-box
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;

  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
  }

  let si = 0;
  j = 0;

  // Discard initial bytes from the keystream
  for (let k = 0; k < discardBytes; k++) {
    si = (si + 1) & 0xff;
    j = (j + S[si]) & 0xff;
    [S[si], S[j]] = [S[j], S[si]];
  }

  // Generate keystream and XOR
  const result = Buffer.alloc(data.length);
  for (let k = 0; k < data.length; k++) {
    si = (si + 1) & 0xff;
    j = (j + S[si]) & 0xff;
    [S[si], S[j]] = [S[j], S[si]];
    result[k] = data[k] ^ S[(S[si] + S[j]) & 0xff];
  }

  return result;
}

/**
 * T2csri authentication state machine.
 * Manages the challenge-response flow over an established connection.
 */
export class T2csriAuth {
  private credentials: AccountCredentials;
  private clientChallenge = "";
  private encryptedChallenge = "";

  constructor(credentials: AccountCredentials) {
    this.credentials = credentials;
  }

  /**
   * Handle t2csri_pokeClient from server.
   * Returns commands to send back (cert chunks + challenge).
   */
  onPokeClient(
    _version: string,
    serverIp: string,
  ): { commands: Array<{ name: string; args: string[] }> } {
    const commands: Array<{ name: string; args: string[] }> = [];

    // Send certificate in 200-byte chunks
    const cert = this.credentials.certificate;
    for (let i = 0; i < cert.length; i += 200) {
      commands.push({
        name: "t2csri_sendCertChunk",
        args: [cert.substring(i, i + 200)],
      });
    }

    // Generate and send client challenge
    const { fullChallenge } = buildClientChallenge(serverIp);
    this.clientChallenge = fullChallenge;
    commands.push({
      name: "t2csri_sendChallenge",
      args: [fullChallenge],
    });

    return { commands };
  }

  /** Handle t2csri_getChallengeChunk from server. */
  onChallengeChunk(chunk: string): void {
    this.encryptedChallenge += chunk;
  }

  /**
   * Handle t2csri_decryptChallenge from server.
   * Returns the challenge response command to send, or null on failure.
   */
  onDecryptChallenge(): {
    command: { name: string; args: string[] };
  } | null {
    // Sanitize: must be hex only
    const challenge = this.encryptedChallenge.toLowerCase();
    authLog.info(
      {
        challengeLen: challenge.length,
        clientChallengeLen: this.clientChallenge.length,
      },
      "Auth: starting challenge decryption",
    );
    for (let i = 0; i < challenge.length; i++) {
      const c = challenge.charCodeAt(i);
      const isHex =
        (c >= 48 && c <= 57) || // 0-9
        (c >= 97 && c <= 102); // a-f
      if (!isHex) {
        authLog.error(
          { charCode: c, pos: i, char: challenge[i] },
          "Invalid characters in server challenge",
        );
        return null;
      }
    }

    // Parse certificate to get modulus (n)
    const fields = this.credentials.certificate.split("\t");
    const modulusHex = fields[3];

    authLog.debug(
      {
        encryptedLen: challenge.length,
        modulusLen: modulusHex?.length,
        privateKeyLen: this.credentials.privateKey.length,
      },
      "Auth: RSA parameters",
    );

    // Decrypt using private key
    const decrypted = decryptChallenge(
      challenge,
      this.credentials.privateKey,
      modulusHex,
    );

    authLog.debug(
      {
        decryptedLen: decrypted.length,
        decryptedPrefix: decrypted.slice(0, 40),
        clientChallenge: this.clientChallenge,
      },
      "Auth: decryption result",
    );

    // Verify client challenge is intact
    const result = processDecryptedChallenge(decrypted, this.clientChallenge);
    if (!result.valid) {
      authLog.error(
        {
          decryptedPrefix: decrypted.slice(0, 40),
          expectedPrefix: this.clientChallenge,
        },
        "Server sent back wrong client challenge",
      );
      return null;
    }

    void result.serverChallenge; // verified

    return {
      command: {
        name: "t2csri_challengeResponse",
        args: [result.serverChallenge],
      },
    };
  }
}
