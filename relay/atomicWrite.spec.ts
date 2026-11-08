import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { atomicWrite } from "./atomicWrite";

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-labels-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

it("replaces the complete file and leaves no temporary copy", () => {
  const file = path.join(directory, "game.json");
  fs.writeFileSync(file, '{"old":true}');
  atomicWrite(file, '{"new":true}');
  expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ new: true });
  expect(fs.readdirSync(directory)).toEqual(["game.json"]);
});

it("keeps the last committed file if syncing the replacement fails", () => {
  const file = path.join(directory, "game.json");
  fs.writeFileSync(file, '{"old":true}');
  vi.spyOn(fs, "fsyncSync").mockImplementationOnce(() => {
    throw new Error("disk unavailable");
  });
  expect(() => atomicWrite(file, '{"new":true}')).toThrow("disk unavailable");
  expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ old: true });
  expect(fs.readdirSync(directory)).toEqual(["game.json"]);
  atomicWrite(file, '{"retried":true}');
  expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ retried: true });
});
