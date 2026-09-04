import { parseColorSegments } from "../stream/streamHelpers";

/**
 * Tribes color-code palette (c1–c9), matching ChatWindow.module.css. Index
 * 0 is intentionally absent: a code-0 segment is the "default" color and
 * inherits the surrounding text color rather than forcing teal — most names
 * carry no color code and parse to a single code-0 segment.
 */
const SEGMENT_COLORS: Record<number, string> = {
  1: "rgb(4, 235, 105)",
  2: "rgb(219, 200, 128)",
  3: "rgb(77, 253, 95)",
  4: "rgb(40, 231, 240)",
  5: "rgb(200, 200, 50)",
  6: "rgb(200, 200, 200)",
  7: "rgb(220, 220, 20)",
  8: "rgb(150, 150, 250)",
  9: "rgb(60, 220, 150)",
};

/**
 * Render a raw (unstripped) player name preserving its embedded color-code
 * segments — for the scoreboard, where clan colors are meaningful. Falls
 * back to plain text when the name has no markup. Official clan tags are
 * color-7 segments and render yellow via the palette; typed "=USA="
 * conventions are indistinguishable from the name and stay name-colored.
 */
export function ColoredName({
  raw,
  tagsOnly = false,
}: {
  raw: string;
  /** Color only the official clan tag (the color-7 segments); every
   *  other segment inherits the surrounding text color — for places
   *  like the timeline, where the tag is worth marking but a smurf's
   *  blue or a full-color name would fight the row's own styling. */
  tagsOnly?: boolean;
}) {
  const segments = parseColorSegments(raw, { taggedColors: true });
  return (
    <>
      {segments.map((seg, i) => {
        const color =
          tagsOnly && seg.colorCode !== CLAN_TAG_COLOR
            ? undefined
            : SEGMENT_COLORS[seg.colorCode];
        return (
          <span key={i} style={color ? { color } : undefined}>
            {seg.text}
          </span>
        );
      })}
    </>
  );
}

/** Stock server.cs wraps the official clan tag in `\c7`. */
const CLAN_TAG_COLOR = 7;
