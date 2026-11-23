import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
import {
  DTS_PAGE_RETIRE_AFTER_FRAMES,
  DTS_PAGE_SWEEP_EVERY_FRAMES,
} from "./instancePagePolicy";
export {
  DTS_PAGE_RETIRE_AFTER_FRAMES,
  DTS_PAGE_SWEEP_EVERY_FRAMES,
} from "./instancePagePolicy";

function counters() {
  return {
    pools: 0,
    pages: 0,
    activePages: 0,
    capacity: 0,
    activeCapacity: 0,
    attributeArrayBytes: 0,
    boneArrayBytes: 0,
    morphArrayBytes: 0,
    skinArrayEstimatedBytes: 0,
    skinLayers: 0,
    activeCpuArrayBytes: 0,
    activeGpuTextureBytes: 0,
    pagesCreated: 0,
    pagesDisposed: 0,
    pagesHighWater: 0,
    capacityHighWater: 0,
  };
}
type Counters = ReturnType<typeof counters>;
const total = counters();

function snapshot(values: Counters) {
  const { activeCpuArrayBytes, activeGpuTextureBytes, ...gauges } = values;
  const ownedCpuArrayBytes =
    values.attributeArrayBytes + values.boneArrayBytes + values.morphArrayBytes;
  // Bone/morph typed arrays also back GPU textures: report CPU and texture
  // domains separately. Shared source geometry/maps are excluded entirely.
  const estimatedGpuTextureBytes =
    values.boneArrayBytes +
    values.morphArrayBytes +
    values.skinArrayEstimatedBytes;
  return {
    ...gauges,
    idlePages: values.pages - values.activePages,
    ownedCpuArrayBytes,
    estimatedGpuTextureBytes,
    idleCpuArrayBytes: ownedCpuArrayBytes - activeCpuArrayBytes,
    idleGpuTextureBytes: estimatedGpuTextureBytes - activeGpuTextureBytes,
    retireAfterFrames: DTS_PAGE_RETIRE_AFTER_FRAMES,
    sweepEveryFrames: DTS_PAGE_SWEEP_EVERY_FRAMES,
  };
}

// Only scalars live here. No global registry retains pools, pages, or textures.
registerMetricSource("dtsInstances", () => snapshot(total));

export class InstancePoolMemory {
  private values = counters();
  private disposed = false;

  constructor() {
    this.values.pools++;
    total.pools++;
  }

  getMetrics() {
    return snapshot(this.values);
  }

  createPage(): InstancePageMemory {
    for (const values of [this.values, total]) {
      values.pages++;
      values.pagesCreated++;
      values.pagesHighWater = Math.max(values.pagesHighWater, values.pages);
    }
    return new InstancePageMemory(this);
  }

  adjust(page: InstancePageMemory, sign: number): void {
    const cpu = page.attributeBytes + page.boneBytes + page.morphBytes;
    const gpu = page.boneBytes + page.morphBytes + page.skinBytes;
    // Called on allocation/use transitions, never while reading diagnostics.
    this.adjustValues(this.values, page, sign, cpu, gpu);
    this.adjustValues(total, page, sign, cpu, gpu);
  }

  private adjustValues(
    values: Counters,
    page: InstancePageMemory,
    sign: number,
    cpu: number,
    gpu: number,
  ) {
    values.capacity += sign * page.capacity;
    values.attributeArrayBytes += sign * page.attributeBytes;
    values.boneArrayBytes += sign * page.boneBytes;
    values.morphArrayBytes += sign * page.morphBytes;
    values.skinArrayEstimatedBytes += sign * page.skinBytes;
    values.skinLayers += sign * page.skinLayers;
    if (page.active) {
      values.activePages += sign;
      values.activeCapacity += sign * page.capacity;
      values.activeCpuArrayBytes += sign * cpu;
      values.activeGpuTextureBytes += sign * gpu;
    }
    values.capacityHighWater = Math.max(
      values.capacityHighWater,
      values.capacity,
    );
  }

  removePage(page: InstancePageMemory): void {
    this.adjust(page, -1);
    this.values.pages--;
    this.values.pagesDisposed++;
    total.pages--;
    total.pagesDisposed++;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.values.pools--;
    total.pools--;
  }
}

export class InstancePageMemory {
  capacity = 0;
  attributeBytes = 0;
  boneBytes = 0;
  morphBytes = 0;
  skinBytes = 0;
  skinLayers = 0;
  active = false;
  private disposed = false;
  private owner: InstancePoolMemory;

  constructor(owner: InstancePoolMemory) {
    this.owner = owner;
  }

  update(
    capacity: number,
    attributeBytes: number,
    boneBytes: number,
    morphBytes: number,
    skinBytes: number,
    skinLayers: number,
  ): void {
    if (this.disposed) return;
    if (
      this.capacity === capacity &&
      this.attributeBytes === attributeBytes &&
      this.boneBytes === boneBytes &&
      this.morphBytes === morphBytes &&
      this.skinBytes === skinBytes &&
      this.skinLayers === skinLayers
    )
      return;
    this.owner.adjust(this, -1);
    this.capacity = capacity;
    this.attributeBytes = attributeBytes;
    this.boneBytes = boneBytes;
    this.morphBytes = morphBytes;
    this.skinBytes = skinBytes;
    this.skinLayers = skinLayers;
    this.owner.adjust(this, 1);
  }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.owner.adjust(this, -1);
    this.active = active;
    this.owner.adjust(this, 1);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.owner.removePage(this);
  }
}
