import { describe, expect, it } from "vitest";
import { parseMarkup } from "./GuiMarkup";

const s1 = `<spush><color:00CCFF>Map by: FlyingElmo
Flyersfan leave me alone now pls
Website:<spop> <color:99CCFF><a:www.planettribes.com/elmo>Part of the <spush><color:ffffff>Double Threat<spop> Pack</a><spop>`;

describe("GuiMarkup", () => {
  describe("parseMarkup", () => {
    it("converts markup to JSX", () => {
      expect(parseMarkup(s1)).toEqual(
        <span>
          <span style={{ color: "#00CCFF" }}>
            {`Map by: FlyingElmo\nFlyersfan leave me alone now pls\nWebsite:`}
          </span>{" "}
          <span style={{ color: "#99CCFF" }}>
            <a
              href="http://www.planettribes.com/elmo"
              rel="noopener noreferrer"
              target="_blank"
            >
              {`Part of the `}
              <span style={{ color: "#ffffff" }}>Double Threat</span> Pack
            </a>
          </span>
        </span>,
      );
    });
  });
});
