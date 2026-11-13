import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import { installProfileCanvasClick } from "./profileCanvasClick";

class TestDocument extends EventTarget {
  defaultView = new EventTarget();
}

class TestCanvas extends EventTarget {
  ownerDocument = new TestDocument();
  getBoundingClientRect() {
    return { left: 100, top: 50, right: 500, bottom: 450 };
  }
}

let canvas: TestCanvas;
let activate: Mock<() => void>;
let dispose: () => void;

interface PointerFields {
  pointerId?: number;
  isPrimary?: boolean;
  button?: number;
  clientX?: number;
  clientY?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget;
  getCoalescedEvents?: () => MouseEvent[];
}

function pointer(type: string, fields: PointerFields = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const values = {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: 150,
    clientY: 100,
    target: canvas,
    ...fields,
  };
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(event, key, { value });
  // Node's EventTarget has no DOM tree; dispatch the document capture phase
  // directly with the original hit/capture target preserved above.
  const receiver =
    type === "lostpointercapture" ? canvas : canvas.ownerDocument;
  receiver.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  return event;
}

function click(fields: PointerFields & { detail?: number } = {}) {
  const event = new Event("click", { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({
    pointerId: 1,
    button: 0,
    clientX: 150,
    clientY: 100,
    detail: 1,
    ...fields,
  }))
    Object.defineProperty(event, key, { value });
  canvas.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
}

beforeEach(() => {
  canvas = new TestCanvas();
  activate = vi.fn<() => void>();
  dispose = installProfileCanvasClick(
    canvas as unknown as HTMLCanvasElement,
    activate,
  );
});

afterEach(() => {
  dispose();
  vi.useRealTimers();
});

it("activates on the native click after a completed canvas press", () => {
  pointer("pointerdown");
  expect(activate).not.toHaveBeenCalled();
  pointer("pointerup");
  expect(activate).not.toHaveBeenCalled();
  click();
  expect(activate).toHaveBeenCalledOnce();
  click();
  expect(activate).toHaveBeenCalledOnce();
});

it("does not interpret a drag from outside or an unpaired click as a click", () => {
  click();
  pointer("pointerdown", { target: new EventTarget() });
  pointer("pointerup");
  click();
  expect(activate).not.toHaveBeenCalled();
});

it("remembers maximum travel even when the pointer returns to its origin", () => {
  pointer("pointerdown");
  pointer("pointermove", { clientX: 156 });
  pointer("pointermove");
  pointer("pointerup");
  click();
  expect(activate).not.toHaveBeenCalled();

  pointer("pointerdown");
  pointer("pointermove", { clientX: 153, clientY: 104 });
  pointer("pointerup", { clientX: 153, clientY: 104 });
  click({ clientX: 153, clientY: 104 });
  expect(activate).toHaveBeenCalledOnce();
});

it("includes coalesced movement and the release position in maximum travel", () => {
  pointer("pointerdown");
  pointer("pointermove", {
    getCoalescedEvents: () => [{ clientX: 170, clientY: 100 } as MouseEvent],
  });
  pointer("pointerup");
  click();
  pointer("pointerdown");
  pointer("pointerup", { clientY: 106 });
  click({ clientY: 106 });
  expect(activate).not.toHaveBeenCalled();
});

it.each([
  { clientX: 99 },
  { clientX: 500 },
  { clientY: 49 },
  { clientY: 450 },
  { target: new EventTarget() },
])("rejects an outside release, including captured releases: %j", (release) => {
  pointer("pointerdown", { clientX: 101, clientY: 51 });
  pointer("pointerup", { clientX: 101, clientY: 51, ...release });
  click({ clientX: 101, clientY: 51 });
  expect(activate).not.toHaveBeenCalled();
});

it.each(["pointercancel", "lostpointercapture"])(
  "rejects a press interrupted by %s",
  (type) => {
    pointer("pointerdown");
    pointer(type);
    pointer("pointerup");
    click();
    expect(activate).not.toHaveBeenCalled();
  },
);

it("allows normal capture release after the validated pointerup", () => {
  pointer("pointerdown");
  pointer("pointerup");
  pointer("lostpointercapture");
  click();
  expect(activate).toHaveBeenCalledOnce();
});

it("rejects a multitouch sequence even after it returns to one finger", () => {
  pointer("pointerdown");
  pointer("pointerdown", { pointerId: 2, isPrimary: false });
  pointer("pointerup", { pointerId: 2, isPrimary: false });
  pointer("pointerup");
  click();
  expect(activate).not.toHaveBeenCalled();

  pointer("pointerdown", { pointerId: 3 });
  pointer("pointerup", { pointerId: 3 });
  click({ pointerId: 3 });
  expect(activate).toHaveBeenCalledOnce();
});

it("also rejects a second pointer that joins outside the canvas", () => {
  pointer("pointerdown");
  pointer("pointerdown", {
    pointerId: 2,
    isPrimary: false,
    target: new EventTarget(),
  });
  pointer("pointerup");
  click();
  expect(activate).not.toHaveBeenCalled();
});

it.each([1, 2])("leaves button %i and native context menus alone", (button) => {
  pointer("pointerdown", { button });
  pointer("pointerup", { button });
  click({ button });
  const context = new Event("contextmenu", { cancelable: true });
  const nativeMenu = vi.fn();
  canvas.addEventListener("contextmenu", nativeMenu);
  canvas.dispatchEvent(context);
  expect(context.defaultPrevented).toBe(false);
  expect(nativeMenu).toHaveBeenCalledOnce();
  expect(activate).not.toHaveBeenCalled();
});

it.each(["ctrlKey", "metaKey", "altKey", "shiftKey"] as const)(
  "leaves modified presses alone (%s)",
  (modifier) => {
    pointer("pointerdown", { [modifier]: true });
    pointer("pointerup", { [modifier]: true });
    click({ [modifier]: true });
    expect(activate).not.toHaveBeenCalled();
  },
);

it("cancels activation when the native context menu opens during a press", () => {
  pointer("pointerdown");
  const context = new Event("contextmenu", { cancelable: true });
  canvas.dispatchEvent(context);
  expect(context.defaultPrevented).toBe(false);
  pointer("pointerup");
  click();
  expect(activate).not.toHaveBeenCalled();
});

it("rejects keyboard/synthesized clicks and mismatched pointer clicks", () => {
  pointer("pointerdown");
  pointer("pointerup");
  click({ detail: 0 });
  pointer("pointerdown");
  pointer("pointerup");
  click({ pointerId: 2 });
  expect(activate).not.toHaveBeenCalled();
});

it("accepts a valid native click delivered in a later task", () => {
  vi.useFakeTimers();
  pointer("pointerdown");
  pointer("pointerup");
  vi.advanceTimersByTime(16);
  click();
  expect(activate).toHaveBeenCalledOnce();
});

it("invalidates a completed release when a new press starts elsewhere", () => {
  pointer("pointerdown");
  pointer("pointerup");
  pointer("pointerdown", { target: new EventTarget() });
  pointer("pointerup");
  click();
  expect(activate).not.toHaveBeenCalled();
});

it("clears pending releases and active pointers on blur", () => {
  pointer("pointerdown");
  pointer("pointerup");
  canvas.ownerDocument.defaultView.dispatchEvent(new Event("blur"));
  click();
  pointer("pointerdown");
  canvas.ownerDocument.defaultView.dispatchEvent(new Event("blur"));
  pointer("pointerup");
  click();
  expect(activate).not.toHaveBeenCalled();
});

it("removes its listeners and pending click when disposed", () => {
  pointer("pointerdown");
  pointer("pointerup");
  dispose();
  dispose();
  click();
  pointer("pointerdown");
  pointer("pointerup");
  click();
  expect(activate).not.toHaveBeenCalled();
});
