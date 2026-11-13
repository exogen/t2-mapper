const CLICK_TRAVEL_SQUARED = 5 ** 2;

interface Press {
  pointerId: number;
  x: number;
  y: number;
  dragged: boolean;
}

/** Recognize a click without changing OrbitControls' pointer handling. */
export function installProfileCanvasClick(
  canvas: HTMLCanvasElement,
  onClick: () => void,
): () => void {
  const document = canvas.ownerDocument;
  const pointers = new Set<number>();
  const capture = { capture: true, passive: true };
  let press: Press | undefined;
  let completed: Press | undefined;

  function clearCompleted() {
    completed = undefined;
  }

  function inside(event: MouseEvent) {
    const bounds = canvas.getBoundingClientRect();
    return (
      event.clientX >= bounds.left &&
      event.clientX < bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY < bounds.bottom
    );
  }

  function track(gesture: Press, event: MouseEvent) {
    const x = event.clientX - gesture.x;
    const y = event.clientY - gesture.y;
    gesture.dragged ||= x * x + y * y > CLICK_TRAVEL_SQUARED;
  }

  function down(event: PointerEvent) {
    clearCompleted();
    const first = pointers.size === 0;
    pointers.add(event.pointerId);
    // Once another pointer joins, returning to one finger is still a gesture.
    press = undefined;
    if (
      first &&
      event.target === canvas &&
      event.button === 0 &&
      event.isPrimary &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      inside(event)
    ) {
      press = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dragged: false,
      };
    }
  }

  function move(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    for (const sample of event.getCoalescedEvents?.() ?? [])
      track(press, sample);
    track(press, event);
  }

  function up(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (!press || event.pointerId !== press.pointerId) return;
    const gesture = press;
    press = undefined;
    track(gesture, event);
    // Pointer capture can deliver an outside release to the canvas itself.
    if (
      gesture.dragged ||
      pointers.size !== 0 ||
      event.target !== canvas ||
      !inside(event)
    )
      return;
    completed = gesture;
  }

  function cancel(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (press?.pointerId === event.pointerId) press = undefined;
    clearCompleted();
  }

  function lostCapture(event: PointerEvent) {
    if (press?.pointerId === event.pointerId) press = undefined;
    // OrbitControls normally releases capture during pointerup, before click.
    // A fully validated release remains valid through that normal cleanup.
  }

  function contextMenu() {
    press = undefined;
    clearCompleted();
  }

  function click(event: MouseEvent) {
    const gesture = completed;
    clearCompleted();
    if (
      !gesture ||
      event.button !== 0 ||
      event.detail === 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !inside(event) ||
      ("pointerId" in event && event.pointerId !== gesture.pointerId)
    )
      return;
    track(gesture, event);
    if (!gesture.dragged) onClick();
  }

  function reset() {
    press = undefined;
    pointers.clear();
    clearCompleted();
  }

  document.addEventListener("pointerdown", down, capture);
  document.addEventListener("pointermove", move, capture);
  document.addEventListener("pointerup", up, capture);
  document.addEventListener("pointercancel", cancel, capture);
  canvas.addEventListener("lostpointercapture", lostCapture, { passive: true });
  canvas.addEventListener("click", click, { passive: true });
  canvas.addEventListener("contextmenu", contextMenu, { passive: true });
  document.defaultView?.addEventListener("blur", reset);

  return () => {
    reset();
    document.removeEventListener("pointerdown", down, capture);
    document.removeEventListener("pointermove", move, capture);
    document.removeEventListener("pointerup", up, capture);
    document.removeEventListener("pointercancel", cancel, capture);
    canvas.removeEventListener("lostpointercapture", lostCapture);
    canvas.removeEventListener("click", click);
    canvas.removeEventListener("contextmenu", contextMenu);
    document.defaultView?.removeEventListener("blur", reset);
  };
}
