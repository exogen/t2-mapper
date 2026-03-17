import React, { useMemo } from "react";
import { getUrlForPath } from "../loaders";
import { getStandardTextureResourceKey } from "../manifest";
import styles from "./GuiMarkup.module.css";

// Tokenizer

type Token =
  | { type: "text"; value: string }
  | { type: "tag"; name: string; args: string[] };

// spop, spush, lmargin, font, color, bitmap, a, a:wwwlink\t
const validTagNames = new Set([
  "spop",
  "spush",
  "lmargin",
  "font",
  "color",
  "bitmap",
  "a",
  "/a",
]);

export function tokenize(input: string): Token[] {
  const pattern = /<([^><]+)>/g;
  const tokens = input
    .split(pattern)
    .map((text, i) => {
      if (i % 2 === 0) {
        return text ? ({ type: "text", value: text } as Token) : null;
      } else {
        const [name, ...args] = text.split(":");
        if (validTagNames.has(name.toLowerCase())) {
          return { type: "tag", name, args } as Token;
        } else {
          return { type: "text", value: `<${text}>` } as Token;
        }
      }
    })
    .filter((token) => token != null);
  return tokens;
}

// Parser

function parseFontArgs(args: string[]): {
  fontDescription: string;
  fontSize?: number;
} {
  // arg is "FontName:size" — size is after the last colon
  const [fontDescription, fontSizeString] = args;
  const fontSize = fontSizeString
    ? Math.max(11, Math.min(parseInt(fontSizeString.trim(), 10), 16))
    : undefined;
  return {
    fontDescription,
    fontSize,
  };
}

type Node = {
  type: string;
  source?: string;
  style?: Record<string, string | number | undefined>;
  children?: Array<string | Node>;
  value?: any;
};

export function parseMarkup(input: string) {
  const tokens = tokenize(input);
  const rootEl: Node = {
    type: "span",
    source: "root",
    style: {},
    children: [],
  };
  let topEl = rootEl;
  const stack = [topEl];
  const isUsed = (node: Node): boolean => {
    return (
      node.children != null &&
      node.children.some((child) => typeof child === "string" || isUsed(child))
    );
  };
  for (const token of tokens) {
    switch (token.type) {
      case "text":
        topEl.children!.push(token.value);
        break;
      case "tag":
        switch (token.name) {
          case "spush": {
            const span = {
              type: "span",
              source: "spush",
              style: {},
              children: [],
            };
            topEl.children!.push(span);
            topEl = span;
            stack.push(topEl);
            break;
          }
          case "spop": {
            if (topEl.source !== "root") {
              let lastPop = stack.pop()!;
              while (lastPop.source !== "spush") {
                lastPop = stack.pop()!;
              }
              topEl = stack[stack.length - 1];
            }
            break;
          }
          case "lmargin": {
            // const marginLeft = parseInt(token.args[0].trim(), 10) || 0;
            // if (topEl.children.length) {
            //   topEl.style.marginLeft = marginLeft;
            // } else {
            //   const marginNode: Node = {
            //     type: "span",
            //     source: "spush",
            //     style: { marginLeft },
            //     children: [],
            //   };
            //   topEl.children.push(marginNode);
            //   topEl = marginNode;
            //   stack.push(topEl);
            // }
            break;
          }
          case "font": {
            const fontSize = parseFontArgs(token.args).fontSize;
            if (!isUsed(topEl)) {
              topEl.style!.fontSize = fontSize;
            } else {
              const fontNode: Node = {
                type: "span",
                source: "spush",
                style: { fontSize },
                children: [],
              };
              topEl.children!.push(fontNode);
              topEl = fontNode;
              stack.push(topEl);
            }
            break;
          }
          case "color":
            if (!isUsed(topEl)) {
              topEl.style!.color = `#${token.args[0].trim()}`;
            } else {
              const colorNode: Node = {
                type: "span",
                source: "spush",
                style: { color: `#${token.args[0].trim()}` },
                children: [],
              };
              topEl.children!.push(colorNode);
              topEl = colorNode;
              stack.push(topEl);
            }
            break;
          case "bitmap": {
            const bitmap: Node = {
              type: "bitmap",
              value: token.args[0],
            };
            topEl.children!.push(bitmap);
            break;
          }
          case "a": {
            const arg = token.args[0].trim().split("\t");
            const href =
              arg.length === 2 && arg[0] === "wwwlink" ? arg[1] : arg[0];
            const link: Node = {
              type: "a",
              source: "a",
              value: `http://${href}`,
              style: {},
              children: [],
            };
            topEl.children!.push(link);
            topEl = link;
            stack.push(topEl);
            break;
          }
          case "/a": {
            let lastPop = stack.pop()!;
            while (lastPop.source !== "a") {
              lastPop = stack.pop()!;
            }
            topEl = stack[stack.length - 1];
            break;
          }
        }
    }
  }
  return nodeToJsx(rootEl);
}

function nodeToJsx(node: Node): React.ReactNode {
  switch (node.type) {
    case "span":
      return React.createElement(
        "span",
        {
          style: Object.keys(node.style!).length === 0 ? undefined : node.style,
        },
        ...node.children!.map((child) =>
          typeof child === "string" ? child : nodeToJsx(child),
        ),
      );
    case "a":
      return React.createElement(
        "a",
        {
          href: node.value,
          style: Object.keys(node.style!).length === 0 ? undefined : node.style,
          rel: "noopener noreferrer",
          target: "_blank",
        },
        ...node.children!.map((child) =>
          typeof child === "string" ? child : nodeToJsx(child),
        ),
      );
    case "bitmap":
      return <GuiBitmap name={node.value} />;
  }
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

function GuiBitmap({ name }: { name: string }) {
  const url = getBitmapUrl(name);
  if (url) {
    return <img src={url} alt="" className={styles.Bitmap} />;
  }
  if (/bullet/i.test(name)) {
    return <span className={styles.Bullet}>•</span>;
  }
  return null;
}

const guiMarkupTagPattern = /<(?:font|color|bitmap|just|lmargin|a):/i;

/** Whether a string contains Torque GUI markup tags. */
export function hasGuiMarkup(text: string): boolean {
  return guiMarkupTagPattern.test(text);
}

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
  const children = useMemo(() => parseMarkup(markup), [markup]);

  return <div className={styles.GuiMarkup}>{children}</div>;
}
