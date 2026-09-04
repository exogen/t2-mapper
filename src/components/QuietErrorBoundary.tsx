import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createLogger } from "../logger";

const log = createLogger("QuietErrorBoundary");

/**
 * Renders `fallback` (nothing by default) when a subtree throws, so an
 * optional section can fail without taking the page with it. Pairs
 * with Suspense around a suspending query: the fallback covers the
 * wait, this covers the failure.
 */
export class QuietErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; label?: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.warn(
      "%s failed: %s %s",
      this.props.label ?? "Section",
      error.message,
      info.componentStack,
    );
  }

  render() {
    return this.state.hasError
      ? (this.props.fallback ?? null)
      : this.props.children;
  }
}
