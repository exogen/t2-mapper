import { authClient, AUTH_REQUEST_TIMEOUT_MS } from "./authClient";
import {
  DISCORD_SIGN_IN_STORAGE_KEY,
  discordSignInUrl,
  notifyDiscordSignIn,
  readDiscordSignInAttempt,
} from "./discordSignIn";
import "./discordSignInPage.css";

const title = document.getElementById("sign-in-title")!;
const message = document.getElementById("sign-in-message")!;
const spinner = document.getElementById("sign-in-spinner")!;
const retryButton = document.getElementById(
  "sign-in-retry",
) as HTMLButtonElement;
const closeButton = document.getElementById(
  "sign-in-close",
) as HTMLButtonElement;
const returnLink = document.getElementById(
  "sign-in-return",
) as HTMLAnchorElement;
const url = new URL(window.location.href);
returnLink.href = new URL("../../", url).href;
const failed =
  url.searchParams.has("accountError") || url.searchParams.has("error");
let attemptId = readDiscordSignInAttempt(url.hash.slice(1));
let request: AbortController | null = null;

function forgetAttempt() {
  try {
    sessionStorage.removeItem(DISCORD_SIGN_IN_STORAGE_KEY);
  } catch {
    // The callback fragment still works when storage is disabled.
  }
}

function showMessage(heading: string, text: string, retry = false) {
  title.textContent = heading;
  message.textContent = text;
  spinner.hidden = true;
  retryButton.hidden = !retry;
  closeButton.hidden = !attemptId;
  returnLink.hidden = attemptId !== null;
}

async function startSignIn() {
  if (!attemptId || request) return;
  const currentAttempt = attemptId;
  const controller = new AbortController();
  request = controller;
  const timeout = window.setTimeout(
    () => controller.abort(),
    AUTH_REQUEST_TIMEOUT_MS,
  );
  title.textContent = "Sign in with Discord";
  message.textContent = "Connecting to Discord…";
  spinner.hidden = false;
  retryButton.hidden = true;
  closeButton.hidden = true;
  try {
    sessionStorage.setItem(DISCORD_SIGN_IN_STORAGE_KEY, currentAttempt);
  } catch {
    // Normal success and error callback URLs also carry the attempt fragment.
  }
  notifyDiscordSignIn(currentAttempt, "opened");
  try {
    const result = await authClient.signIn.social(
      {
        provider: "discord",
        disableRedirect: true,
        callbackURL: discordSignInUrl(currentAttempt, "complete").href,
        errorCallbackURL: discordSignInUrl(currentAttempt, "error").href,
      },
      { signal: controller.signal },
    );
    if (controller.signal.aborted) throw new Error("Sign-in request cancelled");
    if (result.error || !result.data?.url)
      throw new Error("Sign-in unavailable");
    const authorizationUrl = new URL(result.data.url);
    if (
      authorizationUrl.origin !== "https://discord.com" ||
      authorizationUrl.username ||
      authorizationUrl.password ||
      !["/oauth2/authorize", "/api/oauth2/authorize"].includes(
        authorizationUrl.pathname,
      )
    ) {
      throw new Error("Unexpected authorization URL");
    }
    window.location.replace(authorizationUrl.href);
  } catch {
    if (controller.signal.reason === "window-closed") return;
    showMessage(
      "Could not open Discord",
      "Please check your connection and try again. Your original page is still open.",
      true,
    );
    notifyDiscordSignIn(currentAttempt, "error");
  } finally {
    window.clearTimeout(timeout);
    if (request === controller) request = null;
  }
}

closeButton.addEventListener("click", () => window.close());
retryButton.addEventListener("click", () => void startSignIn());
window.addEventListener("pagehide", () => request?.abort("window-closed"));

// A provider may sever the opener relationship. Completion uses an independent
// same-origin channel, and Discord never needs access to the original page.
window.opener = null;

if (failed && !attemptId) {
  try {
    attemptId = readDiscordSignInAttempt(
      sessionStorage.getItem(DISCORD_SIGN_IN_STORAGE_KEY),
    );
  } catch {
    // The global error URL can still show a useful message without storage.
  }
}

if (window.top !== window) {
  showMessage(
    "Open sign-in in a window",
    "Return to MapGenius and use the Sign in with Discord button.",
  );
} else if (failed || url.searchParams.has("complete")) {
  forgetAttempt();
  window.history.replaceState(null, "", url.pathname);
  showMessage(
    failed
      ? "Sign-in was not completed"
      : attemptId
        ? "Returning to MapGenius"
        : "Return to MapGenius",
    attemptId
      ? "Return to your original MapGenius page. You can close this window."
      : "You can return to MapGenius and try signing in again.",
    failed && attemptId !== null,
  );
  if (attemptId) {
    notifyDiscordSignIn(attemptId, failed ? "error" : "complete");
    window.close();
  }
} else if (!attemptId) {
  showMessage(
    "Return to MapGenius",
    "Return to MapGenius to start a new sign-in.",
  );
} else {
  void startSignIn();
}
