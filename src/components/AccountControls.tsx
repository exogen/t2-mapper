import { useEffect } from "react";
import { FaCrown, FaDiscord } from "react-icons/fa6";
import {
  consumeAccountSignInError,
  refreshAccount,
  signInWithDiscord,
  signOutAccount,
  useAppAccount,
} from "../state/appAccountStore";
import buttonStyles from "./Button.module.css";
import styles from "./AccountControls.module.css";

export function AccountControls() {
  const account = useAppAccount((state) => state);

  useEffect(() => {
    void refreshAccount().then(consumeAccountSignInError);
    // Pick up account changes in other tabs without a request on every focus.
    const onFocus = () => void refreshAccount({ onlyIfStale: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Older relays return a cross-origin 404 without CORS headers. Wait until
  // account support is confirmed before showing this optional section.
  if (account.enabled !== true) return null;

  const pending = account.pending != null;
  return (
    <section className={styles.Root} aria-label="Account">
      {account.user ? (
        <div className={styles.Profile}>
          {account.user.image && (
            <img
              className={styles.Avatar}
              src={account.user.image}
              alt=""
              width={32}
              height={32}
              referrerPolicy="no-referrer"
            />
          )}
          <div className={styles.Identity}>
            <span className={styles.Name}>{account.user.name}</span>
            <span className={styles.Handle}>
              @{account.user.discordUsername}
            </span>
          </div>
          {account.user.role === "admin" && (
            <span
              className={styles.Role}
              role="img"
              aria-label="Admin"
              title="Admin"
            >
              <FaCrown aria-hidden focusable="false" />
            </span>
          )}
          <button
            type="button"
            className={styles.SignOut}
            onClick={() => void signOutAccount()}
            disabled={pending}
          >
            <span className={buttonStyles.ButtonLabel}>
              {account.pending === "sign-out" ? "Signing out…" : "Sign out"}
            </span>
          </button>
        </div>
      ) : account.status !== "error" ? (
        <button
          type="button"
          className={styles.DiscordButton}
          onClick={() => void signInWithDiscord()}
          disabled={pending || account.status === "loading"}
          aria-busy={account.pending === "sign-in"}
        >
          <FaDiscord aria-hidden focusable="false" />
          <span>
            {account.pending === "sign-in"
              ? "Opening Discord…"
              : "Sign in with Discord"}
          </span>
        </button>
      ) : null}
      {account.error && (
        <div className={styles.Error} role="alert">
          <span>{account.error}</span>
          {account.status === "error" && (
            <button
              type="button"
              className={buttonStyles.SmallButton}
              onClick={() => void refreshAccount()}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </section>
  );
}
