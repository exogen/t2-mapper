import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ClipTrimTimeline } from "./ClipTrimTimeline";

it("shows the selected camera span and a separate playhead on the take's full timeline", () => {
  const markup = renderToStaticMarkup(
    <ClipTrimTimeline
      durationMs={5000}
      startMs={1000}
      endMs={4000}
      playheadMs={2000}
      onPause={vi.fn()}
      onTrim={vi.fn()}
      onSeek={vi.fn()}
    />,
  );
  expect(markup).not.toContain(">Start ");
  expect(markup).not.toContain(">End ");
  expect(markup.match(/role="slider"/g)).toHaveLength(3);
  for (const label of ["Clip start", "Clip end", "Seek clip"])
    expect(markup).toContain(`aria-label="${label}"`);
  expect(markup).toContain('aria-valuetext="2.000s"');
});

it("clamps an out-of-range playhead to the selected span", () => {
  const markup = renderToStaticMarkup(
    <ClipTrimTimeline
      durationMs={5000}
      startMs={1000}
      endMs={4000}
      playheadMs={5000}
      onPause={vi.fn()}
      onTrim={vi.fn()}
      onSeek={vi.fn()}
    />,
  );
  expect(markup).toMatch(/aria-label="Seek clip"[^>]*aria-valuemin="1000"/);
  expect(markup).toMatch(/aria-label="Seek clip"[^>]*aria-valuetext="4.000s"/);
});
