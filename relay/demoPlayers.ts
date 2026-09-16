import { parseColorSegments } from "./shared.js";

export type DemoPlayerRoster = ReadonlyMap<
  number,
  {
    readonly rawName: string;
  }
>;

/** Drop control/color bytes while preserving Latin-1 and Unicode names. */
export function sanitizePlayerName(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code >= 0x20 && (code < 0x7f || code > 0x9f)) out += raw[i];
  }
  return out.trim();
}

/** The stock server and tag-change scripts mark the official tribe tag with c7. */
export function taglessPlayerName(raw: string): string {
  return sanitizePlayerName(
    parseColorSegments(raw, { taggedColors: true })
      .filter((segment) => segment.colorCode !== 7)
      .map((segment) => segment.text)
      .join(""),
  );
}

/** Count unique tag-less names; keep full aliases searchable. Client IDs are
 * retained only to exclude the recorder reliably across their name changes. */
export class DemoPlayers {
  private namesByClient = new Map<number, Set<string>>();
  private recorderClientId: number | null = null;
  private recorderName: string;

  constructor(recorderName: string) {
    this.recorderName = sanitizePlayerName(recorderName);
  }

  sample(roster: DemoPlayerRoster, recorderClientId: number | null = null) {
    if (recorderClientId != null && recorderClientId > 0)
      this.recorderClientId = recorderClientId;
    for (const [clientId, { rawName }] of roster) {
      const name = sanitizePlayerName(rawName);
      if (!name) continue;
      let names = this.namesByClient.get(clientId);
      if (!names) this.namesByClient.set(clientId, (names = new Set()));
      names.add(rawName);
    }
  }

  private *aliases(): Generator<string> {
    for (const [clientId, names] of this.namesByClient) {
      if (this.recorderClientId != null) {
        if (clientId === this.recorderClientId) continue;
      } else if (
        [...names].some(
          (name) => sanitizePlayerName(name) === this.recorderName,
        )
      ) {
        // Name matching is provisional. A later authoritative client ID
        // must be able to restore an unrelated client's matching name.
        continue;
      }
      yield* names;
    }
  }

  get count(): number {
    const names = new Set<string>();
    for (const raw of this.aliases()) {
      const name = taglessPlayerName(raw);
      if (name) names.add(name);
    }
    return names.size;
  }

  metadata(): { playerCount: number; players: string[] } {
    const names = new Set<string>();
    for (const name of this.aliases()) names.add(sanitizePlayerName(name));
    return {
      playerCount: this.count,
      players: [...names].sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" }),
      ),
    };
  }

  clear() {
    this.namesByClient.clear();
    this.recorderClientId = null;
  }
}
