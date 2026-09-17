import { parseColorSegments } from "../stream/streamHelpers";

/**
 * Shared text palette from main.css (c1–c9). Index
 * 0 is intentionally absent: a code-0 segment is the "default" color and
 * inherits the surrounding text color rather than forcing teal — most names
 * carry no color code and parse to a single code-0 segment.
 */
const SEGMENT_COLORS: Record<number, string> = {
  1: "var(--tribes-color-1)",
  2: "var(--tribes-color-2)",
  3: "var(--tribes-color-3)",
  4: "var(--tribes-color-4)",
  5: "var(--tribes-color-5)",
  6: "var(--tribes-color-6)",
  7: "var(--tribes-color-7)",
  8: "var(--tribes-color-8)",
  9: "var(--tribes-color-9)",
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
