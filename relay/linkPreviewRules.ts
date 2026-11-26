import type { LinkPreviewImage, LinkPreviewMetadata } from "./linkPreview.js";

export interface UnfurlSource {
  url: string;
  title?: string;
  tags: readonly (readonly [string, string])[];
  icon?: string;
  touchIcon?: string;
}

export function resolvePreviewUrl(value: string | undefined, base?: string) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value, base);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    return undefined;
  }
}

/** Shared by the generated head and the local rules, so tag order stays in sync. */
export function linkPreviewSource(m: LinkPreviewMetadata): UnfurlSource {
  const title = m.title === m.siteName ? m.title : `${m.title} – ${m.siteName}`;
  const properties = {
    "og:site_name": m.siteName,
    "og:type": m.type,
    "og:title": m.title,
    "og:description": m.description,
    "og:url": m.url,
    "og:image": m.image.url,
    "og:image:alt": m.image.alt,
    "og:image:type": m.image.type,
    "og:image:width": m.image.width,
    "og:image:height": m.image.height,
  };
  return {
    url: m.url,
    title,
    tags: [
      ...Object.entries(properties).flatMap(([name, value]) =>
        value === undefined ? [] : [[name, String(value)] as const],
      ),
      ["description", m.description],
      ...(m.twitterCard ? [["twitter:card", m.twitterCard] as const] : []),
      ["twitter:title", m.title],
      ["twitter:description", m.description],
      ["twitter:image", m.image.url],
      ["twitter:image:alt", m.image.alt],
      ["theme-color", "#186c7d"],
    ],
  };
}

function trimBytes(text: string, bytes: number, lines: number) {
  const limited = text.split(/\r?\n/).slice(0, lines).join("\n");
  const encoder = new TextEncoder();
  if (limited === text && encoder.encode(text).length <= bytes) return text;
  let result = "";
  let remaining = bytes - encoder.encode("…").length;
  for (const char of limited) {
    remaining -= encoder.encode(char).length;
    if (remaining < 0) break;
    result += char;
  }
  return `${result.trimEnd()}…`;
}

function readImages(
  source: UnfurlSource,
  root: "og:image" | "twitter:image",
  discord = false,
) {
  const images: LinkPreviewImage[] = [];
  const aliases =
    root === "og:image"
      ? ["og:image:url", "og:image:secure_url"]
      : ["twitter:image:src"];
  let image: LinkPreviewImage | undefined;
  for (const [key, value] of source.tags) {
    if (key === root || aliases.includes(key)) {
      const url =
        discord && !/^https?:\/\/|^\//i.test(value)
          ? undefined
          : resolvePreviewUrl(value, source.url);
      image = url ? { url, alt: "" } : undefined;
      if (image) images.push(image);
      if (discord && key !== root) image = undefined;
    } else if (image) {
      if (key === `${root}:alt`) image.alt = value;
      if (key === `${root}:type`) image.type = value;
      const size = Number(value);
      if (Number.isSafeInteger(size) && size > 0) {
        if (key === `${root}:width`) image.width = size;
        if (key === `${root}:height`) image.height = size;
      }
    }
  }
  return images;
}

function isSvg(image: LinkPreviewImage) {
  return (
    image.type?.toLowerCase().split(";")[0] === "image/svg+xml" ||
    /\.svgz?$/i.test(new URL(image.url).pathname)
  );
}

export function resolveUnfurls(
  source: UnfurlSource,
  measuredWidths: ReadonlyMap<string, number> = new Map(),
) {
  const hostname = new URL(source.url).hostname;
  const first = (...names: string[]) =>
    source.tags
      .find(([name, value]) => names.includes(name) && value.trim())?.[1]
      .trim() ?? "";
  const last = (name: string) =>
    source.tags.findLast(([key]) => key === name)?.[1].trim() ?? "";
  const prefer = (...names: string[]) =>
    names.map((name) => first(name)).find(Boolean) ?? "";
  const twitterCard = last("twitter:card");
  const siteName = first("og:site_name");
  const fallbackTitle = source.title?.trim() ?? "";
  const fallbackDescription = first("description");

  // Discord orders aliases by their position in the document.
  let discordTitle = first("og:title", "twitter:title");
  let discordDescription = first("og:description", "twitter:description");
  if (
    !discordTitle &&
    !discordDescription &&
    fallbackTitle &&
    fallbackDescription
  ) {
    discordTitle = fallbackTitle;
    discordDescription = fallbackDescription;
  }
  const discordImages = readImages(source, "og:image", true).filter(
    (image) => !isSvg(image),
  );
  if (!discordImages.length)
    discordImages.push(
      ...readImages(source, "twitter:image", true)
        .filter((image) => !isSvg(image))
        .slice(0, 1),
    );
  const discordLayout =
    twitterCard === "photo" && discordImages.length
      ? "photo"
      : discordImages.length > 1
        ? "gallery"
        : twitterCard === "summary_large_image"
          ? "large"
          : "compact";
  const accent = last("theme-color");

  // Slack Web observations: OG wins over Twitter, summary omits images,
  // and visible images are center-cropped. Sizes come from image bytes.
  const images = readImages(source, "og:image");
  const twitterImages = readImages(source, "twitter:image");
  const slackTitle = prefer("og:title", "twitter:title") || fallbackTitle;
  const slackDescription = prefer(
    "og:description",
    "twitter:description",
    "description",
  );
  const icon = resolvePreviewUrl(source.icon, source.url);
  const candidate = images[0] ?? twitterImages[0];
  const slackImage =
    candidate &&
    twitterCard !== "summary" &&
    !isSvg(candidate) &&
    (!slackDescription ||
      (measuredWidths.get(candidate.url) ?? Infinity) >= 202)
      ? candidate
      : undefined;
  const slackVisible =
    !/<\/?[a-z][^>]*>/i.test(slackDescription) &&
    Boolean(slackDescription || slackImage);

  // Apple documents OG artwork and icon fallbacks for ordinary web links.
  // Its 150px guidance is used as a local heuristic, not a platform contract.
  const messagesImage = images[0];
  const small =
    messagesImage &&
    (measuredWidths.get(messagesImage.url) ?? messagesImage.width ?? Infinity) <
      150;
  const messagesIcon = resolvePreviewUrl(source.touchIcon, source.url) ?? icon;

  return {
    discord: {
      visible: Boolean(
        discordTitle || discordDescription || discordImages.length,
      ),
      title: trimBytes(discordTitle, 70, 3),
      description: trimBytes(discordDescription, 350, 20),
      siteName,
      images: discordImages.slice(0, 4),
      layout: discordLayout,
      accent: /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(accent) ? accent : undefined,
    },
    slack: {
      visible: slackVisible,
      title: slackTitle,
      description: Array.from(slackDescription).slice(0, 700).join(""),
      siteName: siteName || hostname,
      image: slackImage,
      icon,
    },
    messages: {
      title: first("og:title") || fallbackTitle || hostname,
      domain: hostname,
      image: small ? undefined : messagesImage,
      icon: messagesIcon ?? (small ? messagesImage.url : undefined),
    },
  };
}
