/**
 * Focus bridge to the demo dropdown: DemoSelect registers its input's
 * focus here, and the landing page's search button invokes it (the two
 * live in unrelated subtrees, so a ref can't reach across).
 */
let _focus: (() => void) | null = null;

export function registerDemoSelectFocus(focus: (() => void) | null): void {
  _focus = focus;
}

export function focusDemoSelect(): void {
  _focus?.();
}
