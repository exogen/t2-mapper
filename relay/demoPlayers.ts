import { sanitizePlayerName, taglessPlayerName } from "./shared.js";

export type DemoPlayerRoster = ReadonlyMap<
  number,
  {
    readonly rawName: string;
    /** Normalized authenticated GUID; absent for smurfs and bots. */
    readonly guid?: string;
  }
>;

/** Count unique tag-less names; keep full aliases searchable. Client IDs are
 * retained only to exclude the recorder reliably across their name changes. */
export class DemoPlayers {
  private namesByClient = new Map<number, Set<string>>();
  private taglessNamesByGuid = new Map<string, Set<string>>();
  /** `guid\nrawName` pairs already folded in, so steady rosters stay cheap. */
  private seenGuidNames = new Set<string>();
  private recorderClientId: number | null = null;
  private recorderName: string;

  constructor(recorderName: string) {
    this.recorderName = sanitizePlayerName(recorderName);
  }

  sample(roster: DemoPlayerRoster, recorderClientId: number | null = null) {
    if (recorderClientId != null && recorderClientId > 0)
      this.recorderClientId = recorderClientId;
    for (const [clientId, { rawName, guid }] of roster) {
      const name = sanitizePlayerName(rawName);
      if (!name) continue;
      let names = this.namesByClient.get(clientId);
      if (!names) this.namesByClient.set(clientId, (names = new Set()));
      names.add(rawName);
      if (guid) this.sampleGuid(guid, rawName);
    }
  }

  private sampleGuid(guid: string, rawName: string): void {
    const seen = `${guid}\n${rawName}`;
    if (this.seenGuidNames.has(seen)) return;
    this.seenGuidNames.add(seen);
    const name = taglessPlayerName(rawName);
    if (!name) return;
    let names = this.taglessNamesByGuid.get(guid);
    if (!names) this.taglessNamesByGuid.set(guid, (names = new Set()));
    names.add(name);
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

  /**
   * Tag-less names per authenticated GUID, the recorder included. Kept out of
   * `metadata()` because that record is published.
   */
  namesByGuid(): Record<string, string[]> {
    return Object.fromEntries(
      [...this.taglessNamesByGuid].map(([guid, names]) => [
        guid,
        [...names].sort((a, b) =>
          a.localeCompare(b, "en", { sensitivity: "base" }),
        ),
      ]),
    );
  }

  clear() {
    this.namesByClient.clear();
    this.taglessNamesByGuid.clear();
    this.seenGuidNames.clear();
    this.recorderClientId = null;
  }
}
