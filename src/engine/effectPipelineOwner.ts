/** Own one optional GPU pipeline, releasing it after an in-flight render ends. */
export class EffectPipelineOwner<T extends { dispose(): void }> {
  private value: T | undefined;
  private retired: T | undefined;
  private active = false;
  private rendering = false;
  private generation = 0;

  get current(): T | undefined {
    return this.value;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.release();
  }

  /** Factory stays lazy: selecting zero-strength effects need not allocate. */
  beginRender(create: () => T): T | undefined {
    if (!this.active || this.rendering) return undefined;
    const generation = this.generation;
    // Construction can synchronously switch stores or turn the master OFF.
    // Reserve ownership before entering it, just as for the render itself.
    this.rendering = true;
    let accepted = false;
    try {
      const pipeline = this.value ?? create();
      if (!this.active || generation !== this.generation) {
        pipeline.dispose();
        return undefined;
      }
      this.value = pipeline;
      accepted = true;
      return pipeline;
    } finally {
      if (!accepted) this.endRender();
    }
  }

  endRender(): void {
    this.rendering = false;
    const retired = this.retired;
    this.retired = undefined;
    retired?.dispose();
  }

  render<R>(create: () => T, render: (pipeline: T) => R): R | undefined {
    const pipeline = this.beginRender(create);
    if (!pipeline) return undefined;
    try {
      return render(pipeline);
    } finally {
      this.endRender();
    }
  }

  /** Store switches release ownership without changing the active policy. */
  release(): void {
    this.generation++;
    const pipeline = this.value;
    this.value = undefined;
    if (!pipeline) return;
    if (this.rendering) this.retired = pipeline;
    else pipeline.dispose();
  }

  dispose(): void {
    this.active = false;
    this.release();
  }
}
