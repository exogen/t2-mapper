import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createLogger } from "../logger";

const log = createLogger("ShapeErrorBoundary");

/** Error boundary that renders a fallback when shape loading fails. */
export class ShapeErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error("Shape load failed: %s %s", error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
