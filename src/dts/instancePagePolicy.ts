import { performanceTuning } from "../performanceTuning";

/** Runtime page-retirement policy; frame counts are independent of recording. */
export const DTS_PAGE_RETIRE_AFTER_FRAMES =
  performanceTuning.dtsInstancePages.retireAfterFrames;
export const DTS_PAGE_SWEEP_EVERY_FRAMES =
  performanceTuning.dtsInstancePages.sweepEveryFrames;
