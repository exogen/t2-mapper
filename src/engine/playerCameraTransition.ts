import { advancePlayerCameraBlend } from "../stream/playerCameraBlend";

/** Reversible eye-to-orbit transition for a locally followed player. */
export class PlayerCameraTransition {
  private targetId: string | null = null;
  private seekNonce = -1;
  private position = 0;
  private firstPerson = true;

  reset(): void {
    this.targetId = null;
  }

  update(
    targetId: string,
    seekNonce: number,
    firstPerson: boolean,
    deltaSec: number,
  ): number {
    if (this.targetId !== targetId || this.seekNonce !== seekNonce) {
      this.targetId = targetId;
      this.seekNonce = seekNonce;
      this.position = firstPerson ? 0 : 1;
    } else if (firstPerson === this.firstPerson) {
      // Delta on the frame that sees the toggle includes time before it.
      this.position = advancePlayerCameraBlend(
        this.position,
        firstPerson,
        deltaSec,
      );
    }
    this.firstPerson = firstPerson;
    return this.position;
  }
}
