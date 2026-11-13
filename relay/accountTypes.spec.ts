import { expect, it } from "vitest";
import { isDiscordId } from "./accountTypes";

it("validates numeric Discord IDs without numeric coercion", () => {
  for (const id of [
    "12345678901234567",
    "126767979894407168",
    "12345678901234567890",
  ])
    expect(isDiscordId(id)).toBe(true);
  for (const id of [
    "",
    "exogen",
    "1234567890123456",
    "123456789012345678901",
    "00000000000000000",
    "0126767979894407168",
    "126767979894407168 ",
    "+126767979894407168",
    "1.26767979894407168e17",
    126767979894407168,
    null,
  ])
    expect(isDiscordId(id)).toBe(false);
});
