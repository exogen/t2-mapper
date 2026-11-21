import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";
import { ClipTrimTimeline } from "./ClipTrimTimeline";

function render(
  overrides: Partial<ComponentProps<typeof ClipTrimTimeline>> = {},
) {
  return renderToStaticMarkup(
    <ClipTrimTimeline
      durationMs={5000}
      startMs={1000}
      endMs={4000}
      playheadMs={2000}
      jumps={[]}
      jumpTransitions={new Set()}
      onPause={vi.fn()}
      onTrim={vi.fn()}
      onSeek={vi.fn()}
      onToggleJump={vi.fn()}
      {...overrides}
    />,
  );
}

it("shows the selected camera span and a separate playhead on the take's full timeline", () => {
  const markup = render();
  expect(markup).not.toContain(">Start ");
  expect(markup).not.toContain(">End ");
  expect(markup.match(/role="slider"/g)).toHaveLength(3);
  for (const label of ["Clip start", "Clip end", "Seek clip"])
    expect(markup).toContain(`aria-label="${label}"`);
  expect(markup).toContain('aria-valuetext="2.000s"');
});

it("clamps an out-of-range playhead to the selected span", () => {
  const markup = render({ playheadMs: 5000 });
  expect(markup).toMatch(/aria-label="Seek clip"[^>]*aria-valuemin="1000"/);
  expect(markup).toMatch(/aria-label="Seek clip"[^>]*aria-valuetext="4.000s"/);
});

it("shows hard cut and transition choices at their original positions, with trimmed markers disabled", () => {
  const markup = render({
    jumps: [
      { timeMs: 1000, jump: "quickCam", transitionEndMs: 1200 },
      { timeMs: 2000, jump: "resume", transitionEndMs: 2200 },
      { timeMs: 3000, jump: "cameraChange", transitionEndMs: 3200 },
      { timeMs: 4000, jump: "quickCam", transitionEndMs: 4200 },
    ],
    jumpTransitions: new Set([3000]),
  });
  const markers =
    markup.match(/<button[^>]*data-type="clip-jump"[^>]*>.*?<\/button>/g) ?? [];
  expect(markers).toHaveLength(4);
  expect(markers[0]).not.toContain('disabled=""');
  expect(markers[1]).toContain('aria-pressed="false"');
  expect(markers[1]).toContain('title="Hard cut – click to toggle"');
  expect(markers[1]).toContain('style="left:40%"');
  expect(markers[1]).toContain('d="M12 4.3v15.4"');
  expect(markers[2]).toContain('aria-pressed="true"');
  expect(markers[2]).toContain('title="Transition – click to toggle"');
  expect(markers[2]).toContain('style="left:60%"');
  expect(markers[2]).toContain("<svg");
  expect(markers[2]).not.toContain('d="M12 4.3v15.4"');
  expect(markers[3]).toContain('disabled=""');
});

it("keeps a visible transition tail editable and does not show unusably short transitions", () => {
  const markup = render({
    startMs: 1100,
    endMs: 1300,
    jumps: [
      { timeMs: 800, jump: "cameraChange", transitionEndMs: 1100 },
      { timeMs: 1000, jump: "quickCam", transitionEndMs: 1200 },
      { timeMs: 1299.75, jump: "resume", transitionEndMs: 1500 },
    ],
    jumpTransitions: new Set([800, 1000, 1299.75]),
  });
  const markers = markup.match(/<button[^>]*data-type="clip-jump"[^>]*>/g)!;
  expect(markers[0]).toContain('disabled=""');
  expect(markers[1]).toContain('aria-pressed="true"');
  expect(markers[1]).not.toContain('disabled=""');
  expect(markers[2]).toContain('disabled=""');
  expect(markers[2]).toContain('aria-pressed="false"');
});
