import { createAuthClient } from "better-auth/client";

export const appApiBaseUrl =
  process.env.AUTH_API_URL || "http://localhost:8765";
export const AUTH_REQUEST_TIMEOUT_MS = 20_000;
export const authClient = createAuthClient({
  baseURL: appApiBaseUrl,
  fetchOptions: { credentials: "include", timeout: AUTH_REQUEST_TIMEOUT_MS },
});
