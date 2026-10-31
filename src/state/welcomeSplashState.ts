/**
 * Whether the welcome splash is currently mounted — read imperatively by
 * the canvas click handler to suppress click-to-pointer-lock while the
 * splash invites clicking around it.
 */
let splashOpen = false;

export function isWelcomeSplashOpen(): boolean {
  return splashOpen;
}

export function setWelcomeSplashOpen(open: boolean): void {
  splashOpen = open;
}
