/**
 * Game asset handling for add-vl2: the file filter, VL2 archive
 * listing/extraction (plan first, then apply, so a dry run reports exactly
 * what an apply would do), and the precedence check that says which
 * existing resources an archive would shadow.
 */
import fs from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import unzipper from "unzipper";
import { normalizePath } from "@/src/stringUtils";
import {
  archiveSortKey,
  resolveResourcePath,
  winningSource,
  type ResourceEntry,
} from "./manifest";

export const EXTRACTED_BASE_DIR = "docs/base";

/**
 * Files the map tool never uses. Archives that are nothing but such files
 * — player skins, voice binds — are indistinguishable from useful ones by
 * type, so don't add those at all. Random scripts are typically fine,
 * since they're small (and other scripts may expect them to be available).
 */
export const assetIgnoreList = ignore().add(`
fonts/
lighting/
prefs/
.DS_Store
*.dso
*.gui
*.ico
*.ml
*.nav
*.txt
*.md
*.db
.gitattributes
.gitignore
`);

/** Source extension → the converted file the app actually loads. */
const DERIVED_EXTENSIONS: Record<string, string> = {
  ".dif": ".glb",
  ".dts": ".glb",
  ".wav": ".m4a",
};

/** The converted sibling a source file gets, or null if it has none. */
export function derivedPath(sourcePath: string): string | null {
  const ext = path.extname(sourcePath).toLowerCase();
  const derived = DERIVED_EXTENSIONS[ext];
  return derived ? sourcePath.slice(0, -ext.length) + derived : null;
}

export function isDerivedFile(filePath: string): boolean {
  return Object.values(DERIVED_EXTENSIONS).includes(
    path.extname(filePath).toLowerCase(),
  );
}

export interface ArchiveEntry {
  /** Normalized (forward-slash) path inside the archive. */
  path: string;
  size: number;
  read: () => Promise<Buffer>;
}

/** The archive's files that survive the asset filter. */
export async function listArchiveEntries(
  archivePath: string,
): Promise<ArchiveEntry[]> {
  const archive = await unzipper.Open.file(archivePath);
  // Last entry wins for a duplicated path (how the engine's zip reader
  // behaves too), so this is keyed by path.
  const entries = new Map<string, ArchiveEntry>();
  for (const entry of archive.files) {
    if (entry.type === "Directory") continue;
    const resourcePath = normalizePath(entry.path).replace(/^\.\//, "");
    if (
      path.isAbsolute(resourcePath) ||
      resourcePath.split("/").some((seg) => seg === "..")
    ) {
      throw new Error(`Refusing archive entry outside its root: ${entry.path}`);
    }
    if (assetIgnoreList.ignores(resourcePath)) continue;
    entries.set(resourcePath, {
      path: resourcePath,
      size: entry.uncompressedSize,
      read: () => entry.buffer(),
    });
  }
  return [...entries.values()];
}

/**
 * Every file under `dir` that passes the asset filter (so host junk like
 * .DS_Store is neither counted nor removed), as normalized paths relative
 * to it.
 */
export async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const rel = normalizePath(
      path.relative(dir, path.join(entry.parentPath, entry.name)),
    );
    if (!assetIgnoreList.ignores(rel)) out.push(rel);
  }
  return out.sort();
}

export interface ExtractPlan {
  outDir: string;
  /** Entries whose bytes differ from (or are absent in) outDir. */
  write: { entry: ArchiveEntry; reason: "new" | "changed" }[];
  unchanged: string[];
  /**
   * Files in outDir the archive no longer has — stale sources plus the
   * derived files of any removed or changed source (so it gets
   * reconverted).
   */
  remove: string[];
}

/** Compare the archive against an existing extraction (if any). */
export async function planExtract(
  entries: ArchiveEntry[],
  outDir: string,
): Promise<ExtractPlan> {
  const existing = new Set(await listFiles(outDir));
  const plan: ExtractPlan = { outDir, write: [], unchanged: [], remove: [] };
  const keep = new Set<string>();
  for (const entry of entries) {
    keep.add(entry.path);
    if (!existing.has(entry.path)) {
      plan.write.push({ entry, reason: "new" });
      continue;
    }
    const current = await fs.readFile(path.join(outDir, entry.path));
    if (current.length === entry.size && current.equals(await entry.read())) {
      plan.unchanged.push(entry.path);
      const derived = derivedPath(entry.path);
      if (derived && existing.has(derived)) keep.add(derived);
    } else {
      plan.write.push({ entry, reason: "changed" });
    }
  }
  for (const file of existing) {
    if (!keep.has(file)) plan.remove.push(file);
  }
  plan.remove.sort();
  return plan;
}

export async function applyExtract(plan: ExtractPlan): Promise<void> {
  for (const file of plan.remove) {
    await fs.rm(path.join(plan.outDir, file), { force: true });
  }
  for (const { entry } of plan.write) {
    const outFile = path.join(plan.outDir, entry.path);
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, await entry.read());
  }
  await removeEmptyDirs(plan.outDir);
}

async function removeEmptyDirs(dir: string): Promise<boolean> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  let empty = true;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (await removeEmptyDirs(path.join(dir, entry.name))) continue;
    }
    empty = false;
  }
  if (empty) await fs.rmdir(dir);
  return empty;
}

export interface PrecedenceRow {
  /** Path inside the archive. */
  path: string;
  /** The other copy's source: a VL2 path under @vl2, or "(loose)". */
  source: string;
  /** Where the other copy is on disk. */
  otherFile: string;
  /**
   * Whether the two copies are byte-identical — a shadow that changes
   * nothing. Filled in by compareShadowed(); undefined until then.
   */
  identical?: boolean;
}

export interface PrecedenceReport {
  /** Resources this archive will override (it sorts higher than the current winner). */
  shadows: PrecedenceRow[];
  /** Resources the archive ships but a higher-sorting source still wins. */
  shadowedBy: PrecedenceRow[];
  /** Another VL2 with the same basename elsewhere under @vl2 — ambiguous order. */
  sameName: string[];
}

/**
 * Where the archive's files land in the engine's layering order relative
 * to what the manifest holds now. `archiveRelPath` is the archive's path
 * under @vl2 (ignored as a source when it is already present, i.e. an
 * update).
 */
export function precedenceReport(
  resources: Record<string, ResourceEntry>,
  archiveRelPath: string,
  entryPaths: string[],
  baseDir = EXTRACTED_BASE_DIR,
): PrecedenceReport {
  const report: PrecedenceReport = {
    shadows: [],
    shadowedBy: [],
    sameName: [],
  };
  const newKey = archiveSortKey(archiveRelPath);
  const sameName = new Set<string>();
  for (const entryPath of entryPaths) {
    const entry = resources[entryPath.toLowerCase()];
    if (!entry) continue;
    const [firstSeen, ...tuples] = entry;
    const others = tuples.filter(([source]) => source !== archiveRelPath);
    if (others.length === 0) continue;
    const otherEntry = [firstSeen, ...others] as ResourceEntry;
    const { source } = winningSource(otherEntry);
    const otherKey = archiveSortKey(source);
    const row: PrecedenceRow = {
      path: entryPath,
      source: source || "(loose)",
      otherFile: resolveResourcePath(baseDir, otherEntry),
    };
    if (source && otherKey === newKey) {
      sameName.add(source);
    } else if (!source || otherKey < newKey) {
      report.shadows.push(row);
    } else {
      report.shadowedBy.push(row);
    }
  }
  report.sameName = [...sameName];
  return report;
}

/**
 * Mark each overlapping row as identical or not by comparing the
 * archive's bytes with the other copy on disk (size first, then a full
 * compare — exact, and the overlap set is small). A missing other copy
 * counts as different.
 */
export async function compareShadowed(
  report: PrecedenceReport,
  entries: ArchiveEntry[],
): Promise<void> {
  const byPath = new Map(entries.map((e) => [e.path, e]));
  for (const row of [...report.shadows, ...report.shadowedBy]) {
    const entry = byPath.get(row.path);
    if (!entry) continue;
    let other: Buffer;
    try {
      other = await fs.readFile(row.otherFile);
    } catch {
      row.identical = false;
      continue;
    }
    row.identical =
      other.length === entry.size && other.equals(await entry.read());
  }
}
