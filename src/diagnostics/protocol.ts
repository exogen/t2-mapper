import type {
  DiagnosticValue,
  PerformanceObservation,
  PerformanceSnapshot,
} from "./performanceRecorder";

/** JSON-safe automation contract. Type-only imports keep both runtimes separate. */
export type DiagnosticDetails = Record<string, DiagnosticValue>;
export type DiagnosticsReport = PerformanceSnapshot;
export type DiagnosticsObservation = PerformanceObservation;
export type DiagnosticsReading = DiagnosticsReport | DiagnosticsObservation;

export interface DiagnosticsAPI {
  observe(): DiagnosticsObservation;
  snapshot(): DiagnosticsReport;
  reset(): void;
  mark(name: string, details?: DiagnosticDetails): void;
}

export interface DiagnosticsGlobals {
  /** Automation sets this before app startup. Never activated by URL params. */
  __t2DiagnosticsAutomation?: boolean;
  __t2Diagnostics?: DiagnosticsAPI;
}
