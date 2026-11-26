import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { UnfurlCards } from "../relay/linkPreviewCards.js";
import {
  resolvePreviewUrl,
  resolveUnfurls,
  type UnfurlSource,
} from "../relay/linkPreviewRules.js";

function readHead(html: string, url: string): UnfurlSource {
  // Template content stays inert. Only selected strings cross into the UI.
  const template = document.createElement("template");
  template.innerHTML = html;
  const tags: [string, string][] = [];
  for (const meta of template.content.querySelectorAll("meta")) {
    const key = meta.getAttribute("name") ?? meta.getAttribute("property");
    const value = meta.getAttribute("content") ?? meta.getAttribute("value");
    if (key && value !== null) tags.push([key, value]);
  }
  const link = (rel: string) =>
    template.content
      .querySelector(`link[rel~="${rel}" i]`)
      ?.getAttribute("href") ?? undefined;
  return {
    url,
    tags,
    title: template.content.querySelector("title")?.textContent ?? undefined,
    icon: link("icon"),
    touchIcon: link("apple-touch-icon"),
  };
}

const form = document.querySelector<HTMLFormElement>("#preview-editor")!;
const cardsElement = document.querySelector<HTMLElement>("#unfurl-cards")!;
const cards = createRoot(cardsElement);
const { iconUrl, iconSrc } = cardsElement.dataset;
const imageSrc = (url: string) => (url === iconUrl && iconSrc ? iconSrc : url);
const status = document.querySelector<HTMLElement>("#preview-status")!;
let currentRevision = 0;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const url = resolvePreviewUrl(String(data.get("url")));
  if (!url) {
    status.textContent = "Use an absolute HTTP or HTTPS page URL.";
    return;
  }
  const source = readHead(String(data.get("html")), url);
  const revision = ++currentRevision;
  const widths = new Map<string, number>();
  const render = () =>
    cards.render(
      createElement(UnfurlCards, {
        source,
        measuredWidths: new Map(widths),
        imageSrc,
      }),
    );
  render();
  status.textContent =
    source.tags.length || source.title || source.icon || source.touchIcon
      ? "Previews updated."
      : "No recognized metadata found.";

  // Use real image dimensions where the browser can load the specified URL.
  const { slack, messages } = resolveUnfurls(source);
  const imageUrls = new Set([slack.image?.url, messages.image?.url]);
  for (const imageUrl of imageUrls) {
    if (!imageUrl) continue;
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      if (revision !== currentRevision) return;
      widths.set(imageUrl, image.naturalWidth);
      render();
    };
    image.src = imageSrc(imageUrl);
  }
});
