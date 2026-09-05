import { describe, expect, it } from "vitest";
import { isRelayRecording, parseDemoHeaderDate } from "./demoDate";

describe("demo header dates", () => {
  it("reads the retail style as UTC", () => {
    expect(parseDemoHeaderDate("Aug-30-2026 3:52AM")).toBe(
      "2026-08-30T03:52:00.000Z",
    );
    expect(parseDemoHeaderDate("May-16-2025 5:04PM")).toBe(
      "2025-05-16T17:04:00.000Z",
    );
    expect(parseDemoHeaderDate("Jan-1-2026 12:00AM")).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(parseDemoHeaderDate("Jan-1-2026 12:30PM")).toBe(
      "2026-01-01T12:30:00.000Z",
    );
  });

  it("refuses anything else", () => {
    expect(parseDemoHeaderDate("2026-08-30T03:52:00Z")).toBeNull();
    expect(parseDemoHeaderDate("Foo-30-2026 3:52AM")).toBeNull();
    expect(parseDemoHeaderDate("")).toBeNull();
  });

  it("knows the relay's recorder by name", () => {
    expect(isRelayRecording("MapGenius")).toBe(true);
    expect(isRelayRecording("mapgenius")).toBe(true);
    expect(isRelayRecording("Slush")).toBe(false);
    expect(isRelayRecording(null)).toBe(false);
  });
});
