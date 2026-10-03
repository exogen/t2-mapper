import { stripTaggedStringMarkup } from "./streamHelpers";

/** Arguments must have their tagged-string references resolved first. */
export function isClassicModInfoMessage(args: readonly string[]): boolean {
  return (
    args.length >= 5 &&
    args[0] === "MsgLoadInfo" &&
    args[1] === "" &&
    /^Classic {2}\d+\.\d+$/.test(stripTaggedStringMarkup(args[3]))
  );
}

/** Recognize only messages with a known server-name field. */
export function getServerNameFromMessage(
  args: readonly string[],
): string | null {
  if (
    args.length < 5 ||
    args[4].startsWith("\x01") ||
    (args[0] !== "MsgMissionDropInfo" && !isClassicModInfoMessage(args))
  )
    return null;
  return stripTaggedStringMarkup(args[4]).trim() || null;
}
