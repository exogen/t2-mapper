import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LinkPreviewMetadata } from "./linkPreview.js";
import { UnfurlCards } from "./linkPreviewCards.js";
import { linkPreviewSource } from "./linkPreviewRules.js";

const PREVIEW_CSS = `
  :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light}
  *{box-sizing:border-box}
  body{--page:#fff;--text:#22252a;--muted:#646971;--control:#f0f1f3;--control-line:#d7d9dd;--selected:#fff;--focus:#1971c2;--discord-channel:#fff;--discord-card:#f2f3f5;--discord-text:#313338;--discord-provider:#4e5058;--discord-link:#006ce7;--slack-channel:#fff;--slack-text:#1d1c1d;--slack-muted:#616061;--slack-link:#1264a3;--slack-rail:#ddd;--messages-channel:#fff;--messages-bubble:#e9e9eb;--messages-text:#000;--messages-domain:#5f5f63;margin:0;padding:24px 18px;background:var(--page);color:var(--text)}
  body:has(#theme-dark:checked){color-scheme:dark;--page:#1c1d20;--text:#e8e9ec;--muted:#a9adb5;--control:#292b30;--control-line:#454850;--selected:#454850;--focus:#68b5ff;--discord-channel:#313338;--discord-card:#2b2d31;--discord-text:#dbdee1;--discord-provider:#b5bac1;--discord-link:#00a8fc;--slack-channel:#1a1d21;--slack-text:#d1d2d3;--slack-muted:#ababad;--slack-link:#1d9bd1;--slack-rail:#515357;--messages-channel:#000;--messages-bubble:#262628;--messages-text:#fff;--messages-domain:#aaaab0}
  @media(prefers-color-scheme:dark){body:has(#theme-auto:checked){color-scheme:dark;--page:#1c1d20;--text:#e8e9ec;--muted:#a9adb5;--control:#292b30;--control-line:#454850;--selected:#454850;--focus:#68b5ff;--discord-channel:#313338;--discord-card:#2b2d31;--discord-text:#dbdee1;--discord-provider:#b5bac1;--discord-link:#00a8fc;--slack-channel:#1a1d21;--slack-text:#d1d2d3;--slack-muted:#ababad;--slack-link:#1d9bd1;--slack-rail:#515357;--messages-channel:#000;--messages-bubble:#262628;--messages-text:#fff;--messages-domain:#aaaab0}}
  main{max-width:640px;margin:0 auto}
  .controls{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:flex-end;margin-bottom:14px}
  fieldset{padding:0;margin:0;border:0;min-width:0}legend{padding:0;margin-bottom:6px;color:var(--muted);font-size:11px;font-weight:600}
  .segments{display:flex;flex-wrap:wrap;gap:2px;padding:3px;background:var(--control);border:1px solid var(--control-line);border-radius:8px}
  .segments input{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .segments label{padding:5px 9px;border-radius:5px;color:var(--muted);font-size:12px;line-height:18px;cursor:pointer;user-select:none}
  .segments input:checked+label{background:var(--selected);color:var(--text);box-shadow:0 1px 3px #0001}
  .segments input:focus-visible+label{outline:2px solid var(--focus);outline-offset:1px}
  .note{font-size:11px;line-height:1.5;color:var(--muted);margin:0 0 16px}
  .platform{display:none;padding:24px 20px;min-width:0;border-radius:8px}
  body:has(#platform-discord:checked) .discord,body:has(#platform-slack:checked) .slack,body:has(#platform-messages:checked) .messages{display:block}
  .platform a{text-decoration:none}.platform a:hover{text-decoration:underline}
  .platform img{display:block}.platform p{overflow-wrap:anywhere}.platform-title{overflow-wrap:anywhere}
  .discord{background:var(--discord-channel);font-family:"gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif;color:var(--discord-text)}
  .discord-embed{max-width:516px;border:1px solid #0002;border-left:4px solid var(--preview-accent,#186c7d);border-radius:8px;background:var(--discord-card);padding:12px 16px 16px 12px}
  .discord-row{display:flex;align-items:flex-start;gap:16px}.discord-copy{min-width:0;flex:1}
  .discord-provider{font-size:12px;line-height:16px;color:var(--discord-provider);margin-bottom:6px}
  .discord-title{font-size:16px;line-height:20px;font-weight:600;color:var(--discord-link)}
  .discord-description{font-size:14px;line-height:20px;margin:8px 0 0;white-space:pre-wrap}
  .discord-thumbnail{max-width:80px;max-height:80px;width:auto;height:auto;object-fit:contain;flex:none;border-radius:4px}
  .discord-image{margin-top:16px;max-width:100%;max-height:300px;width:auto;height:auto;object-fit:contain;border-radius:4px}
  .slack{background:var(--slack-channel);font-family:Slack-Lato,Lato,"Helvetica Neue",Helvetica,Arial,sans-serif;color:var(--slack-text)}
  .slack-attachment{max-width:520px;position:relative;padding-left:16px}
  .slack-attachment:before{position:absolute;content:"";left:0;top:0;bottom:0;width:4px;border-radius:8px;background:var(--slack-rail)}
  .slack-attachment{display:flex;align-items:flex-start;gap:14px}
  .slack-copy{flex:1;min-width:0}
  .slack-provider{display:flex;align-items:center;gap:5px;font-size:12px;line-height:16px;margin:8px 0 0;color:var(--slack-muted)}
  .slack-provider img{width:14px;height:14px;object-fit:contain}
  .slack-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;line-height:22px;font-weight:700;color:var(--slack-link)}
  .slack-description{font-size:15px;line-height:22px;margin:4px 0 0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
  .slack-image{width:min(106px,27%);aspect-ratio:1;height:auto;object-fit:cover;border-radius:6px;flex:none}
  .messages{background:var(--messages-channel);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;color:var(--messages-text)}
  .messages-bubble{display:block;max-width:300px;overflow:hidden;border-radius:18px;background:var(--messages-bubble);color:var(--messages-text)}
  .messages-bubble:hover{text-decoration:none!important}.messages-copy{padding:11px 13px 12px;min-width:0}
  .messages-title{display:block;font-size:15px;line-height:19px;font-weight:600;color:var(--messages-text)}
  .messages-domain{display:block;color:var(--messages-domain);font-size:12px;line-height:16px;margin-top:4px;overflow-wrap:anywhere}
  .messages-image{width:100%;max-height:220px;object-fit:cover;aspect-ratio:1.6}
  .messages-compact{display:flex;align-items:center}.messages-compact .messages-copy{padding:10px 12px;flex:1}
  .messages-thumbnail{width:40px;height:40px;object-fit:contain;flex:none;margin:10px 12px;border-radius:8px}
  .discord-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin-top:12px}
  .discord-gallery img{width:100%;aspect-ratio:1.6;object-fit:cover;border-radius:4px}
  .editor{display:grid;gap:10px;padding-bottom:18px;margin-bottom:18px;border-bottom:1px solid var(--control-line)}
  .editor label{display:grid;gap:5px;font-size:13px}
  .editor input,.editor textarea,.editor button{font:inherit;color:inherit;background:var(--control);border:1px solid var(--control-line);border-radius:6px;padding:8px}
  .editor textarea{font-family:ui-monospace,monospace;min-height:150px;resize:vertical}
  .editor button{justify-self:start;cursor:pointer}
  .empty{color:var(--muted);font-size:13px;margin:0}
  .metadata{margin-top:18px}.metadata summary{font-size:12px;line-height:20px;color:var(--muted);cursor:pointer}
  .metadata pre{font-size:11px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--control);border-radius:6px;padding:14px;margin:10px 0 0}
  @media(max-width:380px){body{padding:16px 12px}.platform{padding:18px 12px}.discord-row{gap:12px}.discord-thumbnail{max-width:64px;max-height:64px}.controls{gap:10px 14px}.segments label{padding:4px 7px}}
`;

function selection(
  group: string,
  values: readonly [string, string][],
  selected: string,
) {
  return h(
    "div",
    { className: "segments" },
    ...values.flatMap(([value, label]) => [
      h("input", {
        key: `${value}-input`,
        type: "radio",
        id: `${group}-${value}`,
        name: group,
        value,
        defaultChecked: value === selected,
      }),
      h(
        "label",
        { key: `${value}-label`, htmlFor: `${group}-${value}` },
        label,
      ),
    ]),
  );
}

/**
 * Script-free local simulations of standard native unfurls. Only metadata
 * sent to crawlers is displayed; platform clients control the real rendering.
 */
export function LinkPreviewDocument({
  metadata,
  head,
  editor,
  localIcon,
}: {
  metadata: LinkPreviewMetadata;
  head: ReactNode;
  editor?: ReactNode;
  localIcon?: { url: string; src: string };
}) {
  return h(
    "html",
    { lang: "en" },
    h(
      "head",
      null,
      h("meta", { charSet: "utf-8" }),
      h("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      }),
      h("meta", { name: "robots", content: "noindex" }),
      head,
      h("style", null, PREVIEW_CSS),
    ),
    h(
      "body",
      null,
      h(
        "main",
        null,
        h(
          "div",
          { className: "controls" },
          h(
            "fieldset",
            null,
            h("legend", null, "Platform"),
            selection(
              "platform",
              [
                ["discord", "Discord"],
                ["slack", "Slack"],
                ["messages", "Messages"],
              ],
              "discord",
            ),
          ),
          h(
            "fieldset",
            null,
            h("legend", null, "Theme"),
            selection(
              "theme",
              [
                ["auto", "Auto"],
                ["light", "Light"],
                ["dark", "Dark"],
              ],
              "auto",
            ),
          ),
        ),
        h(
          "p",
          { className: "note" },
          "Local simulation from the published metadata. Exact layout varies by app version and device.",
        ),
        editor,
        h(
          "div",
          {
            id: "unfurl-cards",
            "data-icon-url": editor ? localIcon?.url : undefined,
            "data-icon-src": editor ? localIcon?.src : undefined,
          },
          h(UnfurlCards, {
            source: linkPreviewSource(metadata),
            imageSrc: (url) => (url === localIcon?.url ? localIcon.src : url),
          }),
        ),
        !editor &&
          h(
            "details",
            { className: "metadata" },
            h("summary", null, "Generated metadata"),
            h("pre", null, renderToStaticMarkup(head).replace(/></g, ">\n<")),
          ),
      ),
    ),
  );
}
