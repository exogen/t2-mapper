/** Environment variables available in both Vite and Node.js. */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly LOG_LEVEL?: string;
    readonly RELAY_URL?: string;
  }
}
