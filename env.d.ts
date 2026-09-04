/** Environment variables available in both Vite and Node.js. */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly LOG_LEVEL?: string;
    readonly RELAY_URL?: string;
    readonly CAST_LOCAL_PLAN?: string;
    readonly CAST_BASE_URL?: string;
    readonly CAST_LOOKAHEAD_SEC?: string;
  }
}
