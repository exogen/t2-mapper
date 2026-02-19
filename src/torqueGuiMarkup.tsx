import { useMemo } from "react";
import { getUrlForPath } from "./loaders";
import { getStandardTextureResourceKey } from "./manifest";

// Types

interface Style {
  color?: string;
  fontSize?: number;
}

interface Span {
  type: "span";
  text: string;
  style: Style;
}

interface Bitmap {
  type: "bitmap";
  name: string;
}

type Inline = Span | Bitmap;

interface Line {
  align: "left" | "center" | "right";
  /** Container padding-left for non-bullet lines. */
  lmargin: number;
  /** When > 0, a bitmap precedes indented text — render as bullet layout. */
  textIndent: number;
  items: Inline[];
}

// Tokenizer

type Token =
  | { type: "text"; value: string }
  | { type: "newline" }
  | { type: "tag"; name: string; arg: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const re = /<([^>]*)>/g;
  let last = 0;

  const pushText = (text: string) => {
    const parts = text.split("\n");
    parts.forEach((part, i) => {
      if (part) tokens.push({ type: "text", value: part });
      if (i < parts.length - 1) tokens.push({ type: "newline" });
    });
  };

  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) pushText(input.slice(last, m.index));
    last = m.index + m[0].length;
    const raw = m[1].trim();
    const sep = raw.indexOf(":");
    const name = (sep === -1 ? raw : raw.slice(0, sep)).toLowerCase();
    const arg = sep === -1 ? "" : raw.slice(sep + 1);
    tokens.push({ type: "tag", name, arg });
  }

  if (last < input.length) pushText(input.slice(last));
  return tokens;
}

// Parser

function parseFontSize(arg: string): number {
  // arg is "FontName:size" — size is after the last colon
  const last = arg.lastIndexOf(":");
  const size = parseInt(last === -1 ? arg : arg.slice(last + 1), 10) || 14;
  return Math.min(size, 16);
}

function parseMarkup(input: string): Line[] {
  const tokens = tokenize(input);

  // Style state (affected by spush/spop)
  const styleStack: Style[] = [];
  let style: Style = {};

  // Layout state (persistent, not stack-based)
  let align: Line["align"] = "left";
  let lmargin = 0;

  // Current line being accumulated
  let items: Inline[] = [];
  let lineAlign: Line["align"] = "left";
  let lineLmargin = 0;
  let hasBitmap = false;
  let textIndent = 0;

  const lines: Line[] = [];

  const flushLine = () => {
    lines.push({ align: lineAlign, lmargin: lineLmargin, textIndent, items });
    items = [];
    lineAlign = align;
    lineLmargin = lmargin;
    hasBitmap = false;
    textIndent = 0;
  };

  const addSpan = (text: string) => {
    if (!text) return;
    // Merge adjacent spans with identical style
    const prev = items[items.length - 1];
    if (
      prev?.type === "span" &&
      prev.style.color === style.color &&
      prev.style.fontSize === style.fontSize
    ) {
      prev.text += text;
    } else {
      items.push({ type: "span", text, style: { ...style } });
    }
  };

  for (const tok of tokens) {
    if (tok.type === "newline") {
      flushLine();
      continue;
    }
    if (tok.type === "text") {
      addSpan(tok.value.replace(/\t/g, "  "));
      continue;
    }

    const { name, arg } = tok;
    switch (name) {
      case "spush":
        styleStack.push({ ...style });
        break;
      case "spop":
        if (styleStack.length > 0) style = styleStack.pop()!;
        break;
      case "color":
        style = { ...style, color: `#${arg.trim()}` };
        break;
      case "font":
        style = { ...style, fontSize: parseFontSize(arg) };
        break;
      case "lmargin": {
        const px = parseInt(arg, 10) || 0;
        lmargin = px;
        if (hasBitmap && px > 0) {
          // lmargin after a bitmap → bullet indent for this line's text
          textIndent = px;
        } else if (items.length === 0) {
          lineLmargin = px;
        }
        break;
      }
      case "just": {
        const v = arg.trim().toLowerCase();
        if (v === "left" || v === "center" || v === "right") {
          align = v;
          if (items.length === 0) lineAlign = v;
        }
        break;
      }
      case "bitmap":
        hasBitmap = true;
        items.push({ type: "bitmap", name: arg.trim() });
        break;
      case "br":
        flushLine();
        break;
      case "sbreak":
        if (items.length > 0) flushLine();
        flushLine(); // empty spacer line
        break;
      // Intentionally ignored: tab, rmargin, clip, /clip, a, /a
    }
  }

  if (items.length > 0) flushLine();
  return lines;
}

// Bitmap rendering

const bitmapUrlCache = new Map<string, string | null>();

function getBitmapUrl(name: string): string | null {
  if (bitmapUrlCache.has(name)) return bitmapUrlCache.get(name)!;
  let url: string | null;
  try {
    url = getUrlForPath(getStandardTextureResourceKey(`textures/gui/${name}`));
  } catch {
    url = null;
  }
  bitmapUrlCache.set(name, url);
  return url;
}

function GuiBitmapEl({ name }: { name: string }) {
  const url = getBitmapUrl(name);
  if (url) {
    return <img src={url} alt="" className="GuiMarkup-bitmap" />;
  }
  if (/bullet/i.test(name)) {
    return <span className="GuiMarkup-bullet">•</span>;
  }
  return null;
}

function SpanEl({ span }: { span: Span }) {
  const { color, fontSize } = span.style;
  if (!color && !fontSize) return <>{span.text}</>;
  return (
    <span
      style={{
        color,
        fontSize: fontSize != null ? `${fontSize}px` : undefined,
      }}
    >
      {span.text}
    </span>
  );
}

// Public API

/**
 * Filter a mission string by game mode prefix, e.g. `[CTF]`, `[DM Bounty]`.
 * Lines without a prefix are shown for all modes.
 */
export function filterMissionStringByMode(
  str: string,
  missionType: string,
): string {
  const type = missionType.toUpperCase();
  return str
    .split("\n")
    .flatMap((line) => {
      const m = line.match(/^\[([^\]]+)\]/);
      if (m && !m[1].toUpperCase().split(/\s+/).includes(type)) return [];
      return [line.replace(/^\[[^\]]+\]/, "")];
    })
    .join("\n");
}

/** Renders Torque `GuiMLTextCtrl` markup as React elements. */
export function GuiMarkup({ markup }: { markup: string }) {
  const lines = useMemo(() => parseMarkup(markup), [markup]);

  return (
    <div className="GuiMarkup">
      {lines.map((line, i) => {
        const { align, lmargin, textIndent, items } = line;
        const bitmaps = items.filter(
          (it): it is Bitmap => it.type === "bitmap",
        );
        const spans = items.filter((it): it is Span => it.type === "span");
        const hasText = spans.some((s) => s.text.trim().length > 0);

        // Bullet layout: bitmap + lmargin indent + text on the same line
        if (bitmaps.length > 0 && textIndent > 0 && hasText) {
          return (
            <div key={i} className="GuiMarkup-bulletLine">
              <div className="GuiMarkup-bulletIcon">
                {bitmaps.map((b, j) => (
                  <GuiBitmapEl key={j} name={b.name} />
                ))}
              </div>
              <div className="GuiMarkup-bulletText">
                {spans.map((s, j) => (
                  <SpanEl key={j} span={s} />
                ))}
              </div>
            </div>
          );
        }

        // Empty line → vertical spacer
        if (!hasText && bitmaps.length === 0) {
          return <div key={i} className="GuiMarkup-spacer" />;
        }

        return (
          <div
            key={i}
            className="GuiMarkup-line"
            style={{
              textAlign: align !== "left" ? align : undefined,
              paddingLeft: lmargin > 0 ? `${lmargin}px` : undefined,
            }}
          >
            {items.map((item, j) =>
              item.type === "bitmap" ? (
                <GuiBitmapEl key={j} name={item.name} />
              ) : (
                <SpanEl key={j} span={item} />
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
