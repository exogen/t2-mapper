import { FaCrown, FaDiscord } from "react-icons/fa6";
import {
  refreshAccount,
  signInWithDiscord,
  signOutAccount,
  useAppAccount,
} from "../state/appAccountStore";
import buttonStyles from "./Button.module.css";
import styles from "./AccountControls.module.css";

export function AccountControls() {
  const account = useAppAccount((state) => state);

  // Keep the row in place during the initial check; hide it only when the
  // relay explicitly reports that sign-in is disabled.
  if (account.enabled === false) return null;

  const pending = account.pending != null;
  const checking = account.status === "idle" || account.status === "loading";
  const retrying = account.status === "loading" && account.error != null;
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
            className={styles.SecondaryButton}
            onClick={() => void signOutAccount()}
            disabled={pending}
            aria-busy={account.pending === "sign-out"}
          >
            <span className={buttonStyles.ButtonLabel}>Sign out</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.DiscordButton}
          onClick={() => void signInWithDiscord()}
          disabled={
            pending || account.enabled !== true || account.status !== "ready"
          }
          aria-busy={checking || account.pending === "sign-in"}
          title="Sign in in a separate window"
        >
          <FaDiscord aria-hidden focusable="false" />
          <span>Sign in with Discord</span>
        </button>
      )}
      {(account.error || account.signInUrl) && (
        <div className={styles.Error} role="alert">
          <div className={styles.ErrorContent}>
            {account.error && <span>{account.error}</span>}
            {account.signInUrl && (
              <a
                href={account.signInUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open sign-in in a new tab
              </a>
            )}
          </div>
          {(account.status === "error" || retrying) && (
            <button
              type="button"
              className={styles.SecondaryButton}
              onClick={() => void refreshAccount()}
              disabled={checking}
              aria-busy={retrying}
            >
              <span className={buttonStyles.ButtonLabel}>Retry</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
