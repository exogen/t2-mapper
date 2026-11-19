import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useShortcutHelpTrigger } from "./useShortcutHelpTrigger";

const test = vi.hoisted(() => ({
  setInputState: vi.fn(),
  cleanup: undefined as (() => void) | undefined,
}));

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => () => void) => {
    test.cleanup = effect();
  },
}));
vi.mock("../state/inputControls", () => ({
  inputControlsStore: { setState: test.setInputState },
}));

const onOpen = vi.fn();
let openShortcutHelp: ReturnType<typeof useShortcutHelpTrigger>;

beforeEach(() => {
  onOpen.mockClear();
  test.setInputState.mockClear();
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), {
      activeElement: null,
      pointerLockElement: null,
      exitPointerLock: vi.fn(),
      querySelectorAll: vi.fn().mockReturnValue([]),
    }),
  );
  openShortcutHelp = useShortcutHelpTrigger(onOpen);
});

afterEach(() => {
  test.cleanup?.();
  vi.unstubAllGlobals();
});

function press(key: string, fields: KeyboardEventInit = {}) {
  const event = Object.assign(new Event("keydown", { cancelable: true }), {
    key,
    getModifierState: (modifier: string) =>
      modifier === "AltGraph" && fields.modifierAltGraph === true,
    ...fields,
  });
  document.dispatchEvent(event);
  return event;
}

it("opens on the question-mark character regardless of its physical key", () => {
  expect(press("/", { code: "Slash" }).defaultPrevented).toBe(false);
  expect(press("?", { code: "Slash", shiftKey: true }).defaultPrevented).toBe(
    true,
  );
  expect(press("?", { code: "KeyM" }).defaultPrevented).toBe(true);
  expect(press("?", { altKey: true }).defaultPrevented).toBe(true);
  expect(onOpen).toHaveBeenCalledTimes(3);
  expect(onOpen).toHaveBeenLastCalledWith(false);
});

it("defers to focused controls, open dialogs, and modified input", () => {
  Object.assign(document, { activeElement: { tagName: "TEXTAREA" } });
  press("?");
  Object.assign(document, { activeElement: null });
  vi.mocked(document.querySelectorAll).mockReturnValueOnce([
    { getClientRects: () => [1] },
  ] as unknown as NodeListOf<Element>);
  press("?");
  press("?", { repeat: true });
  press("?", { isComposing: true });
  press("?", { metaKey: true });
  press("?", { ctrlKey: true });
  expect(onOpen).not.toHaveBeenCalled();
  expect(test.setInputState).not.toHaveBeenCalled();

  press("?", { ctrlKey: true, altKey: true, modifierAltGraph: true });
  expect(onOpen).toHaveBeenCalledOnce();
});

it("releases movement and reports whether the pointer was locked", () => {
  Object.assign(document, { pointerLockElement: {} });
  press("?");
  expect(test.setInputState).toHaveBeenCalledWith({ keys: new Set() });
  expect(document.exitPointerLock).toHaveBeenCalledOnce();
  expect(onOpen).toHaveBeenCalledWith(true);
});

it("opens from the sidebar button and defers to an open dialog", () => {
  Object.assign(document, { activeElement: { tagName: "TEXTAREA" } });
  expect(openShortcutHelp()).toBe(true);
  expect(onOpen).toHaveBeenCalledWith(false);

  vi.mocked(document.querySelectorAll).mockReturnValueOnce([
    { getClientRects: () => [1] },
  ] as unknown as NodeListOf<Element>);
  expect(openShortcutHelp()).toBe(false);
  expect(onOpen).toHaveBeenCalledOnce();
});

it("defers both openers while another dialog is loading", () => {
  test.cleanup?.();
  const open = useShortcutHelpTrigger(onOpen, true);

  expect(press("?").defaultPrevented).toBe(false);
  expect(open()).toBe(false);
  expect(onOpen).not.toHaveBeenCalled();
  expect(test.setInputState).not.toHaveBeenCalled();
});
