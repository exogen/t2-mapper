/** One socket's navigation. A late server probe must never undo leave/switch. */
export class WatchRequest {
  private generation = 0;
  private probe: Promise<boolean> = Promise.resolve(false);

  private readonly options: {
    isKnown(address: string): boolean;
    probe(address: string): Promise<boolean>;
    checking(address: string): void;
    rejected(address: string): void;
    attach(address: string, channelId?: string): void;
    detach(): void;
  };

  constructor(options: WatchRequest["options"]) {
    this.options = options;
  }

  leave(): void {
    this.generation++;
    this.options.detach();
  }

  async watch(address: string, channelId?: string): Promise<void> {
    const generation = ++this.generation;
    this.options.detach();
    if (!this.options.isKnown(address)) {
      this.options.checking(address);
      // Serialize probes per socket; superseded requests never start a probe.
      this.probe = this.probe
        .catch(() => false)
        .then(() =>
          generation === this.generation ? this.options.probe(address) : false,
        );
      let compatible: boolean;
      try {
        compatible = await this.probe;
      } catch {
        compatible = false;
      }
      if (generation !== this.generation) return;
      if (!compatible) {
        this.options.rejected(address);
        return;
      }
    }
    if (generation === this.generation) this.options.attach(address, channelId);
  }
}
