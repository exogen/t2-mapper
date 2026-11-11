const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
]);

/** Controls that own typed characters and adjustment keys, including portals. */
export function isTypingOrSelecting(target: EventTarget | null | undefined) {
  const element = target as HTMLElement | null | undefined;
  if (!element) return false;
  if (element.isContentEditable || element.tagName === "TEXTAREA") return true;
  if (element.tagName === "SELECT") return true;
  if (element.tagName === "INPUT") {
    const type = (element as HTMLInputElement).type?.toLowerCase() ?? "text";
    if (type === "range" || TEXT_INPUT_TYPES.has(type)) return true;
  }
  if (
    element.closest?.('[role="combobox"], [role="listbox"], [role="option"]')
  ) {
    return true;
  }
  // The playback scrubber deliberately shares arrows with the camera and
  // Space with the transport. Other sliders own their adjustment keys.
  return Boolean(
    element.closest?.('[role="slider"]') &&
    !element.closest?.("[data-playback-seek]"),
  );
}

/** Form controls must not also activate the global playback shortcut. */
export function isPlaybackControl(target: EventTarget | null | undefined) {
  const element = target as HTMLElement | null | undefined;
  return (
    isTypingOrSelecting(target) ||
    Boolean(element?.closest?.("input, textarea, select, button"))
  );
}
