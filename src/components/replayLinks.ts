/** Invitations grant spectator access and never carry private creator credentials. */
export function replayInviteUrl(href: string, sessionId: string): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("replay", sessionId);
  return url.href;
}
