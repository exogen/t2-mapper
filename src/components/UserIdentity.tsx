import type { AccountPublicProfile } from "../../relay/accountTypes";
import { FaDiscord } from "react-icons/fa6";
import styles from "./UserIdentity.module.css";

export function UserIdentity({
  user,
  variant = "compact",
}: {
  user: AccountPublicProfile;
  variant?: "compact" | "page";
}) {
  const page = variant === "page";
  const Name = page ? "h1" : "span";
  const avatarSize = page ? 64 : 32;
  return (
    <div className={styles.Root} data-variant={variant}>
      {user.image && (
        <img
          className={styles.Avatar}
          src={user.image}
          alt=""
          width={avatarSize}
          height={avatarSize}
          referrerPolicy="no-referrer"
        />
      )}
      <div className={styles.Identity}>
        <Name className={styles.Name}>{user.name}</Name>
        {page ? (
          <a
            className={styles.SocialBadge}
            href={`https://discord.com/users/${user.discordId}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open Discord profile in a new tab"
          >
            <FaDiscord role="img" aria-label="Discord" focusable="false" />
            <span className={styles.BadgeText}>{user.discordUsername}</span>
          </a>
        ) : (
          <span className={styles.Handle}>@{user.discordUsername}</span>
        )}
      </div>
    </div>
  );
}
