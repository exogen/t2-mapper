import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RangeSlider } from "./RangeSlider";

function sliderButton(html: string) {
  const button = html.match(/<button\b[^>]*\brole="slider"[^>]*>/)?.[0];
  expect(button).toBeDefined();
  return button!;
}

it("names the actual slider button from its visible label and describes its units", () => {
  const html = renderToStaticMarkup(
    <form>
      <label id="volume-label" htmlFor="volume">
        Master volume
      </label>
      <p id="volume-help">Controls the game audio volume.</p>
      <RangeSlider
        id="volume"
        aria-labelledby="volume-label"
        aria-describedby="volume-help"
        aria-valuetext="35 percent"
        min={0}
        max={1}
        step={0.05}
        value={0.35}
        onValueChange={() => {}}
      />
    </form>,
  );
  const thumb = sliderButton(html);
  expect(html).toContain('<label id="volume-label" for="volume">');
  expect(thumb).toContain('id="volume"');
  expect(thumb).toContain('type="button"');
  expect(thumb).toContain('tabindex="0"');
  expect(thumb).toContain('aria-labelledby="volume-label"');
  expect(thumb).toContain('aria-describedby="volume-help"');
  expect(thumb).toContain('aria-valuetext="35 percent"');
});

it("supports a direct accessible name and preserves the setting's numeric bounds", () => {
  const html = renderToStaticMarkup(
    <RangeSlider
      aria-label="Field of view"
      aria-valuetext="90 degrees"
      min={75}
      max={120}
      step={5}
      value={90}
      onValueChange={() => {}}
    />,
  );
  const thumb = sliderButton(html);
  expect(thumb).toContain('aria-label="Field of view"');
  expect(thumb).toContain('aria-valuetext="90 degrees"');
  expect(thumb).toContain('aria-valuemin="75"');
  expect(thumb).toContain('aria-valuemax="120"');
});

it("disables the native thumb button so an unavailable slider cannot remain tabbable", () => {
  const html = renderToStaticMarkup(
    <RangeSlider
      aria-label="Volume"
      min={0}
      max={1}
      step={0.05}
      value={0.5}
      disabled
      onValueChange={() => {}}
    />,
  );
  const thumb = sliderButton(html);
  expect(thumb).toContain('disabled=""');
  expect(thumb).not.toContain('tabindex="0"');
  expect(html).toContain('aria-disabled="true"');
});

it("keeps decimal bounds on the accessible slider without integer conversion", () => {
  const html = renderToStaticMarkup(
    <RangeSlider
      aria-label="Opacity"
      min={0.1}
      max={0.95}
      step={0.05}
      value={0.4}
      onValueChange={() => {}}
    />,
  );
  const thumb = sliderButton(html);
  expect(thumb).toContain('aria-valuemin="0.1"');
  expect(thumb).toContain('aria-valuemax="0.95"');
});
