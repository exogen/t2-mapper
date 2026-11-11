import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { Select } from "./Select";

const device = vi.hoisted(() => ({ touch: false }));

vi.mock("./useTouchDevice", () => ({
  useTouchDevice: () => device.touch,
}));

beforeEach(() => {
  device.touch = false;
});

const options = [
  { value: "", label: "Choose a limit…", disabled: true },
  {
    label: "Frame rates",
    options: [
      { value: "20", label: "20 FPS" },
      { value: "60", label: "60 FPS" },
    ],
  },
];

it("renders a named desktop combobox button with its description and selected label", () => {
  const html = renderToStaticMarkup(
    <Select
      id="frame-limit"
      aria-labelledby="frame-limit-label"
      aria-describedby="frame-limit-help"
      title="Maximum frame rate"
      value="60"
      options={options}
      onChange={() => {}}
    />,
  );
  const trigger = html.match(/<button[^>]*>/)?.[0];
  expect(trigger).toContain('id="frame-limit"');
  expect(trigger).toContain('role="combobox"');
  expect(trigger).toContain('type="button"');
  expect(trigger).toContain('aria-labelledby="frame-limit-label"');
  expect(trigger).toContain('aria-describedby="frame-limit-help"');
  expect(trigger).toContain('aria-expanded="false"');
  expect(trigger).toContain('title="Maximum frame rate"');
  expect(html).toContain(">60 FPS</span>");
});

it("displays the label of an empty-string desktop selection", () => {
  const html = renderToStaticMarkup(
    <Select
      aria-label="Player heatmap"
      value=""
      options={[
        { value: "", label: "Disabled" },
        { value: "42", label: "Storm player" },
      ]}
      onChange={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Player heatmap"');
  expect(html).toContain(">Disabled</span>");
});

it("finds the selected desktop label across decorative separators", () => {
  const html = renderToStaticMarkup(
    <Select
      aria-label="Player"
      value="alice"
      options={[
        { value: "", label: "Anyone" },
        { separator: true },
        { value: "recorder", label: "Recorder" },
        { separator: true },
        { value: "alice", label: "Alice" },
      ]}
      onChange={() => {}}
    />,
  );
  expect(html).toContain(">Alice</span>");
});

it("disables the desktop trigger without losing its selected label", () => {
  const html = renderToStaticMarkup(
    <Select
      aria-label="Frame limit"
      value="20"
      options={options}
      disabled
      onChange={() => {}}
    />,
  );
  expect(html.match(/<button[^>]*>/)?.[0]).toContain('disabled=""');
  expect(html).toContain(">20 FPS</span>");
});

it("uses a real native select with groups and the selected numeric string on touch devices", () => {
  device.touch = true;
  const html = renderToStaticMarkup(
    <Select
      id="frame-limit"
      name="fpsLimit"
      aria-labelledby="frame-limit-label"
      aria-describedby="frame-limit-help"
      title="Maximum frame rate"
      value="20"
      options={options}
      onChange={() => {}}
    />,
  );
  const control = html.match(/<select[^>]*>/)?.[0];
  expect(control).toContain('id="frame-limit"');
  expect(control).toContain('name="fpsLimit"');
  expect(control).toContain('aria-labelledby="frame-limit-label"');
  expect(control).toContain('aria-describedby="frame-limit-help"');
  expect(control).toContain('title="Maximum frame rate"');
  expect(html).toContain('<optgroup label="Frame rates">');
  expect(html).toContain(">60 FPS</option>");
  expect(html).not.toContain("<button");
  const selected = html.match(/<option[^>]*selected=""[^>]*>[^<]*<\/option>/g);
  expect(selected).toHaveLength(1);
  expect(selected![0]).toContain('value="20"');
  expect(selected![0]).toContain(">20 FPS</option>");
});

it("keeps an empty disabled placeholder selected in the native picker", () => {
  device.touch = true;
  const html = renderToStaticMarkup(
    <Select
      aria-label="Frame limit"
      value=""
      options={options}
      onChange={() => {}}
    />,
  );
  const selected = html.match(/<option[^>]*selected=""[^>]*>[^<]*<\/option>/g);
  expect(selected).toHaveLength(1);
  expect(selected![0]).toContain('value=""');
  expect(selected![0]).toContain('disabled=""');
  expect(selected![0]).toContain("Choose a limit…");
});

it("renders native separators without adding selectable options", () => {
  device.touch = true;
  const html = renderToStaticMarkup(
    <Select
      aria-label="Player"
      value="recorder"
      options={[
        { value: "", label: "Anyone" },
        { separator: true },
        { value: "recorder", label: "Recorder" },
        { separator: true },
        { value: "alice", label: "Alice" },
      ]}
      onChange={() => {}}
    />,
  );
  expect(html.match(/<hr aria-hidden="true"\/>/g)).toHaveLength(2);
  expect(html.match(/<option /g)).toHaveLength(3);
  expect(html).toContain('value="recorder" selected="">Recorder</option>');
});

it("forwards a disabled state and accessible name to the native control", () => {
  device.touch = true;
  const html = renderToStaticMarkup(
    <Select
      aria-label="Frame limit"
      value="20"
      options={options}
      disabled
      onChange={() => {}}
    />,
  );
  const control = html.match(/<select[^>]*>/)?.[0];
  expect(control).toContain('disabled=""');
  expect(control).toContain('aria-label="Frame limit"');
});
