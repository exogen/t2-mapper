import fs from "node:fs";
import path from "node:path";

/** Commit a small file without exposing partial JSON or acknowledging buffered writes. */
export function atomicWrite(file: string, contents: string): void {
  const temporary = `${file}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, { mode: 0o600 });
    const descriptor = fs.openSync(temporary, "r");
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, file);
    const directory = fs.openSync(path.dirname(file), "r");
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}
