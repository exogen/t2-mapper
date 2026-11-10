import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DemoDropZone } from "./DemoDropZone";

it("keeps local playback's demo-plus-checkpoints file selection", () => {
  const markup = renderToStaticMarkup(
    <DemoDropZone intent="load" onFiles={() => {}}>
      <section>Demo cards</section>
    </DemoDropZone>,
  );
  expect(markup).toContain('accept=".rec,.checkpoints.json"');
  expect(markup).toContain('multiple=""');
  expect(markup).toContain('aria-label="Load demo (.rec)"');
  expect(markup).toContain("Play a demo");
  expect(markup).toContain("Local to your device. It will not be shared.");
  expect(markup).toContain("Drop a .rec file here");
  expect(markup).toContain("Browse…</button>");
});

it("labels uploads as public and selects only one recording", () => {
  const markup = renderToStaticMarkup(
    <DemoDropZone intent="upload" onFiles={() => {}}>
      <section>User demos</section>
    </DemoDropZone>,
  );
  expect(markup).toContain('accept=".rec"');
  expect(markup).not.toContain("multiple=");
  expect(markup).toContain('aria-label="Upload demo (.rec)"');
  expect(markup).toContain("Upload a demo");
  expect(markup).toContain(
    "It will be made public and appear in the demo browser.",
  );
  expect(markup).toContain("Drop a .rec file here");
  expect(markup).toContain("Browse…</button>");
  expect(markup).not.toContain("50 MB");
});

it("disables both the picker and its button while uploads are unavailable", () => {
  const markup = renderToStaticMarkup(
    <DemoDropZone intent="upload" disabled onFiles={() => {}}>
      <section>User demos</section>
    </DemoDropZone>,
  );
  expect(markup.match(/disabled=""/g)).toHaveLength(2);
});

it("hides the picker while a local recording is loading", () => {
  const markup = renderToStaticMarkup(
    <DemoDropZone intent="load" hidePicker onFiles={() => {}}>
      <p>Loading recording</p>
    </DemoDropZone>,
  );
  expect(markup).toContain("Loading recording");
  expect(markup).not.toContain("<button");
  expect(markup).not.toContain("Play a demo");
});
