/** Private capabilities and local identity scopes also work on HTTP/LAN hosts. */
export function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
