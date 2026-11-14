import type { AccountPublicProfile } from "../../relay/accountTypes";
import type { ReactNode } from "react";
import { FaDiscord } from "react-icons/fa6";
import { Tribes2Icon } from "./Tribes2Icon";
import styles from "./UserIdentity.module.css";

export function UserIdentity({
  user,
  variant = "compact",
  portrait,
}: {
  user: AccountPublicProfile;
  variant?: "compact" | "page";
  /** An optional character canvas displayed beside the page identity. */
  portrait?: ReactNode;
}) {
  const page = variant === "page";
  const hasPortrait = page && portrait != null;
  const Name = page ? "h1" : "span";
  const avatarSize = page ? 64 : 32;
  const avatar = user.image && (
    <img
      className={styles.Avatar}
      src={user.image}
      alt=""
      width={avatarSize}
      height={avatarSize}
      referrerPolicy="no-referrer"
    />
  );
  return (
    <div
      className={styles.Root}
      data-variant={variant}
      data-portrait={hasPortrait || undefined}
    >
      {hasPortrait && portrait}
      {avatar}
      <div className={styles.Identity}>
        <Name className={styles.Name}>{user.name}</Name>
        {page ? (
          <div
            className={styles.AccountBadges}
            role="group"
            aria-label="Linked accounts"
          >
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
            {user.t2AccountNames?.map((name, index) => (
              <span className={styles.T2Badge} key={`${index}:${name}`}>
                <Tribes2Icon
                  role="img"
                  aria-label="Tribes 2"
                  focusable="false"
                />
                <span className={styles.BadgeText}>{name}</span>
              </span>
            ))}
          </div>
        ) : (
          <span className={styles.Handle}>@{user.discordUsername}</span>
        )}
      </div>
    </div>
  );
}
