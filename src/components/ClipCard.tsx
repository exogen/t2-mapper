import { IoCalendarNumberOutline } from "react-icons/io5";
import { LuClock, LuUser } from "react-icons/lu";
import { PiGlobe } from "react-icons/pi";
import { TbMovie } from "react-icons/tb";
import type { ClipView } from "../../relay/clipTypes";
import { clipShareUrl } from "../stream/clipApi";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { recordedDayLabel } from "./demoFormat";
import { clipSummary } from "./clipFormat";
import { MissionPreviewTileArt } from "./PreviewTileArt";
import { RecordingMatchDetails } from "./RecordingMatchDetails";
import { RecordingDeleteButton } from "./RecordingDeleteButton";
import { ClipTitleEditButton } from "./ClipTitleEditor";
import cardStyles from "./DemoCard.module.css";
import tileStyles from "./PreviewTile.module.css";
import styles from "./ClipCard.module.css";

export function ClipCard({
  clip,
  demo,
  creatorName = clip.creatorName,
  canEdit = false,
  onDelete,
  deleting = false,
}: {
  clip: ClipView;
  demo?: DemoIndexEntry;
  creatorName?: string;
  canEdit?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const { mission, matchTitle, matchups, createdAt, duration } = clipSummary(
    clip,
    demo,
  );
  return (
    <div
      className={`${tileStyles.Tile} ${cardStyles.Card}`}
      data-clip-card
      data-has-title={!!matchTitle}
      data-action-count={Number(canEdit) + Number(!!onDelete)}
    >
      <a href={clipShareUrl(clip)} className={cardStyles.Link}>
        <MissionPreviewTileArt mission={mission}>
          <TbMovie className={tileStyles.TilePlaceholder} aria-hidden />
        </MissionPreviewTileArt>
        <span className={`${tileStyles.TileBody} ${cardStyles.Body}`}>
          <span className={`${tileStyles.TileTitle} ${cardStyles.Mission}`}>
            <span className={styles.Title} title={clip.title}>
              {clip.title}
            </span>
          </span>
          <RecordingMatchDetails matchTitle={matchTitle} matchups={matchups} />
          {clip.state !== "ready" && (
            <span
              className={styles.Status}
              data-failed={clip.state === "failed"}
              title={clip.error}
            >
              {clip.state === "processing"
                ? "Preparing clip…"
                : "Could not prepare clip"}
            </span>
          )}
          <span className={tileStyles.TileDetails}>
            <span className={tileStyles.TileMetaItem}>
              <IoCalendarNumberOutline
                className={tileStyles.TileMetaIcon}
                aria-hidden
              />
              <time className={tileStyles.TileMetaText} dateTime={createdAt}>
                Clipped {recordedDayLabel(createdAt)}
              </time>
            </span>
            {duration && (
              <span className={tileStyles.TileDuration}>
                <LuClock
                  className={tileStyles.TileCompactMetaIcon}
                  aria-label="Duration"
                />
                {duration}
              </span>
            )}
          </span>
          {(creatorName || demo?.server) && (
            <span className={tileStyles.TileSource}>
              {creatorName && (
                <span className={tileStyles.TileMetaItem}>
                  <LuUser className={tileStyles.TileRecorderIcon} aria-hidden />
                  <span className={tileStyles.TileMetaText} title={creatorName}>
                    {creatorName}
                  </span>
                </span>
              )}
              {demo?.server && (
                <span className={tileStyles.TileMetaItem}>
                  <PiGlobe className={tileStyles.TileMetaIcon} aria-hidden />
                  <span className={tileStyles.TileMetaText} title={demo.server}>
                    {demo.server}
                  </span>
                </span>
              )}
            </span>
          )}
        </span>
      </a>
      {(canEdit || onDelete) && (
        <div
          className={cardStyles.Actions}
          role="group"
          aria-label="Clip actions"
          aria-busy={deleting}
        >
          {canEdit && (
            <ClipTitleEditButton
              clip={clip}
              className={cardStyles.EditButton}
              iconClassName={cardStyles.EditIcon}
              disabled={deleting}
            />
          )}
          {onDelete && (
            <RecordingDeleteButton
              kind="clip"
              label={clip.title}
              deleting={deleting}
              onDelete={onDelete}
            />
          )}
        </div>
      )}
    </div>
  );
}
