import { TbMovie } from "react-icons/tb";
import { LuClock } from "react-icons/lu";
import { PiGlobe } from "react-icons/pi";
import { IoCalendarNumberOutline } from "react-icons/io5";
import { BiSolidEject } from "react-icons/bi";
import { useAppAccount } from "../state/appAccountStore";
import { DiscordAvatar } from "./DiscordAvatar";
import { ClipTitleEditButton } from "./ClipTitleEditor";
import { useClipQuery } from "./useClipQuery";
import { usePublicProfile } from "./usePublicProfile";
import { useDemoIndex } from "./useDemoIndex";
import { useAppNavigation } from "./useAppNavigation";
import { recordedDayLabel } from "./demoFormat";
import { clipSummary } from "./clipFormat";
import headerStyles from "./StreamingMissionInfo.module.css";
import styles from "./StreamingClipInfo.module.css";

export function StreamingClipInfo({ clipId }: { clipId: string }) {
  const query = useClipQuery(clipId);
  const clip = query.data?.id === clipId ? query.data : undefined;
  const account = useAppAccount((state) => state.user);
  const verified = useAppAccount(
    (state) => state.status === "ready" && !state.pending,
  );
  const owner = !!clip && account?.discordId === clip.ownerDiscordId;
  const profile = usePublicProfile(clip?.ownerDiscordId, !owner);
  const creator = owner ? account : profile.data;
  const { data: demos } = useDemoIndex();
  const navigation = useAppNavigation();
  const demo = clip
    ? demos?.find((demo) => demo.filename === clip.sourceDemo)
    : undefined;
  const details = clip ? clipSummary(clip, demo) : null;
  const clippedDate = details ? recordedDayLabel(details.createdAt) : undefined;
  const title =
    clip?.title ?? (query.error ? "Clip unavailable" : "Loading clip…");
  const profileUrl = clip
    ? `?mode=demo&user=${clip.ownerDiscordId}`
    : undefined;

  return (
    <div className={headerStyles.Header} data-clip-header>
      <div className={styles.Info}>
        <div className={styles.TitleRow}>
          <TbMovie className={styles.ClipIcon} aria-label="Clip" />
          <span className={styles.Title} title={title}>
            {title}
          </span>
          {clip && owner && verified && <ClipTitleEditButton clip={clip} />}
        </div>
        {clip && details && (
          <div className={styles.Metadata}>
            <a
              className={styles.Creator}
              href={profileUrl}
              title={`${creator?.name ?? "Clip creator"}’s profile`}
            >
              <DiscordAvatar
                key={creator?.image}
                src={creator?.image}
                size={18}
                className={styles.Avatar}
                fallbackClassName={styles.AvatarFallback}
              />
              <span>{creator?.name ?? "Clip creator"}</span>
            </a>
            <span className={styles.Date} title={clippedDate}>
              <IoCalendarNumberOutline
                className={styles.MetaIcon}
                aria-hidden
              />
              <time dateTime={details.createdAt}>Clipped {clippedDate}</time>
            </span>
            {details.duration && (
              <span className={styles.MetaItem}>
                <LuClock className={styles.MetaIcon} aria-label="Duration" />
                <span>{details.duration}</span>
              </span>
            )}
            {demo?.server && (
              <span className={styles.Server} title={demo.server}>
                <PiGlobe className={styles.MetaIcon} aria-hidden />
                <span>{demo.server}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className={headerStyles.EjectButton}
        title="Eject clip"
        aria-label="Eject clip"
        onClick={navigation.demoIndex}
      >
        <BiSolidEject className={headerStyles.EjectIcon} aria-hidden />
      </button>
    </div>
  );
}
