import {
  USER_DEMO_UPLOAD_PATH,
  type UserDemoUploadResponse,
} from "../../relay/userDemoTypes";
import { appApiBaseUrl } from "../account/authClient";
import { refreshAccount } from "../state/appAccountStore";

const UNREADABLE_RESPONSE =
  "The upload response could not be read. Check your demo list before retrying.";

/** Bind private requests to the account whose upload page initiated them. */
export function userDemoUploadsUrl(ownerDiscordId: string, id?: string): URL {
  const url = new URL(
    id
      ? `${USER_DEMO_UPLOAD_PATH}/${encodeURIComponent(id)}`
      : USER_DEMO_UPLOAD_PATH,
    appApiBaseUrl,
  );
  url.searchParams.set("owner", ownerDiscordId);
  return url;
}

/** Stream the original file to the relay; validation and publication happen there. */
export async function uploadUserDemo(
  file: File,
  ownerDiscordId: string,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<UserDemoUploadResponse> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;

    function finish(action: () => void) {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", cancel);
      request.onload = null;
      request.onerror = null;
      request.ontimeout = null;
      request.onabort = null;
      request.upload.onprogress = null;
      action();
    }

    function cancel() {
      if (settled) return;
      finish(() => reject(signal.reason));
      request.abort();
    }

    signal.addEventListener("abort", cancel, { once: true });
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status === 401) void refreshAccount();
      let response: unknown;
      try {
        response = JSON.parse(request.responseText);
      } catch {
        finish(() => reject(new Error(UNREADABLE_RESPONSE)));
        return;
      }
      if (request.status >= 200 && request.status < 300) {
        if (
          !response ||
          typeof response !== "object" ||
          !("demo" in response) ||
          !response.demo ||
          typeof response.demo !== "object" ||
          !("id" in response.demo) ||
          typeof response.demo.id !== "string"
        ) {
          finish(() => reject(new Error(UNREADABLE_RESPONSE)));
          return;
        }
        finish(() => resolve(response as UserDemoUploadResponse));
      } else {
        const message =
          response &&
          typeof response === "object" &&
          "error" in response &&
          typeof response.error === "string"
            ? response.error
            : "The demo could not be uploaded. Check your demo list before retrying.";
        finish(() => reject(new Error(message)));
      }
    };
    request.onerror = () =>
      finish(() =>
        reject(
          new Error(
            "The upload connection failed. Check your demo list before retrying.",
          ),
        ),
      );
    request.ontimeout = () =>
      finish(() =>
        reject(
          new Error(
            "The upload timed out. Check your demo list before retrying.",
          ),
        ),
      );
    request.onabort = () =>
      finish(() => reject(new DOMException("Upload canceled", "AbortError")));
    try {
      signal.throwIfAborted();
      const url = userDemoUploadsUrl(ownerDiscordId);
      url.searchParams.set("filename", file.name);
      request.open("POST", url);
      request.withCredentials = true;
      request.timeout = 5 * 60_000 + 10_000;
      request.setRequestHeader("Content-Type", "application/octet-stream");
      signal.throwIfAborted();
      request.send(file);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
