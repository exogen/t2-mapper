import { useEffect, useRef, useState } from "react";
import { FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import { useQuery } from "@tanstack/react-query";
import { loadMission, getUrlForPath, RESOURCE_ROOT_URL } from "../loaders";
import { getStandardTextureResourceKey } from "../manifest";
import {
  GuiMarkup,
  filterMissionStringByMode,
  hasGuiMarkup,
} from "../torqueGuiMarkup";
import type * as AST from "../torqueScript/ast";

function useParsedMission(name: string) {
  return useQuery({
    queryKey: ["parsedMission", name],
    queryFn: () => loadMission(name),
  });
}

function getMissionGroupProps(ast: AST.Program): Record<string, string> {
  for (const node of ast.body) {
    if (node.type !== "ObjectDeclaration") continue;
    const { instanceName, body } = node;
    if (
      instanceName &&
      instanceName.type === "Identifier" &&
      instanceName.name.toLowerCase() === "missiongroup"
    ) {
      const props: Record<string, string> = {};
      for (const item of body) {
        if (item.type !== "Assignment") continue;
        const { target, value } = item;
        if (target.type === "Identifier" && value.type === "StringLiteral") {
          props[target.name.toLowerCase()] = value.value;
        }
      }
      return props;
    }
  }
  return {};
}

function getBitmapUrl(
  bitmap: string | null,
  missionName: string,
): string | null {
  // Try bitmap from pragma comment first (single-player missions use this)
  if (bitmap) {
    try {
      const key = getStandardTextureResourceKey(`textures/gui/${bitmap}`);
      return getUrlForPath(key);
    } catch {}
  }
  // Fall back to Load_<MissionName>.png convention (multiplayer missions)
  try {
    const key = getStandardTextureResourceKey(
      `textures/gui/Load_${missionName}`,
    );
    return getUrlForPath(key);
  } catch {}
  return null;
}

/**
 * Renders a preview image bypassing browser color management, matching how
 * Tribes 2 displayed these textures (raw pixel values, no gamma conversion).
 * Many T2 preview PNGs embed an incorrect gAMA chunk (22727 = gamma 4.4
 * instead of the correct 45455 = gamma 2.2), which causes browsers to
 * over-darken them. `colorSpaceConversion: "none"` ignores gAMA/ICC data.
 */
function RawPreviewImage({
  src,
  alt,
  className = "MapInfoDialog-preview",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => createImageBitmap(blob, { colorSpaceConversion: "none" }))
      .then((bitmap) => {
        if (cancelled) {
          bitmap.close();
          return;
        }
        const canvas = canvasRef.current;
        if (!canvas) {
          bitmap.close();
          return;
        }
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        bitmap.close();
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label={alt}
      style={{ display: isLoaded ? "block" : "none" }}
    />
  );
}

function MusicPlayer({ track }: { track: string }) {
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const url = `${RESOURCE_ROOT_URL}music/${track.toLowerCase()}.mp3`;

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => setAvailable(false));
    }
  };

  return (
    <div className="MapInfoDialog-musicTrack" data-playing={playing}>
      <audio
        ref={audioRef}
        src={url}
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setAvailable(false)}
      />
      <span className="MusicTrackName">{track}</span>
      {available && (
        <button
          className="MapInfoDialog-musicBtn"
          onClick={toggle}
          aria-label={playing ? "Pause music" : "Play music"}
        >
          {playing ? <FaVolumeUp /> : <FaVolumeMute />}
        </button>
      )}
    </div>
  );
}

export function MapInfoDialog({
  open,
  onClose,
  missionName,
  missionType,
}: {
  open: boolean;
  onClose: () => void;
  missionName: string;
  missionType: string;
}) {
  const { data: parsedMission } = useParsedMission(missionName);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
      try {
        document.exitPointerLock();
      } catch {}
    }
  }, [open]);

  // While open: block keyboard events from reaching drei, and handle close keys.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyI" || e.key === "Escape") {
        onClose();
      } else if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        onClose();
        return; // let Cmd-K propagate to open the mission search
      }
      e.stopImmediatePropagation();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [open, onClose]);

  if (!open) return null;

  const missionGroupProps = parsedMission
    ? getMissionGroupProps(parsedMission.ast)
    : {};
  const bitmapUrl = parsedMission
    ? getBitmapUrl(parsedMission.bitmap, missionName)
    : null;
  const displayName = parsedMission?.displayName ?? missionName;
  const typeKey = missionType.toLowerCase();
  const isSinglePlayer = typeKey === "singleplayer";

  const musicTrack = missionGroupProps["musictrack"];

  const missionString = parsedMission?.missionString
    ? filterMissionStringByMode(parsedMission.missionString, missionType)
    : null;

  // Split quote into body text and attribution line.
  // If the quote contains GUI markup tags, render through GuiMarkup instead.
  const rawQuote = parsedMission?.missionQuote?.trim() ?? "";
  const quoteHasMarkup = hasGuiMarkup(rawQuote);
  let quoteText = "";
  let quoteAttrib = "";
  if (!quoteHasMarkup) {
    for (const line of rawQuote.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.match(/^-+\s/)) {
        quoteAttrib = trimmed.replace(/^-+\s*/, "").trim();
      } else if (trimmed) {
        quoteText += (quoteText ? "\n" : "") + trimmed;
      }
    }
  }

  return (
    <div className="MapInfoDialog-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="MapInfoDialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Map Information"
        tabIndex={-1}
      >
        <div className="MapInfoDialog-inner">
          <div className="MapInfoDialog-left">
            {bitmapUrl && isSinglePlayer && (
              <RawPreviewImage
                key={bitmapUrl}
                className="MapInfoDialog-preview--floated"
                src={bitmapUrl}
                alt={`${displayName} preview`}
              />
            )}
            <h1 className="MapInfoDialog-title">{displayName}</h1>
            <div className="MapInfoDialog-meta">
              {parsedMission?.planetName && (
                <span className="MapInfoDialog-planet">
                  {parsedMission.planetName}
                </span>
              )}
            </div>

            {quoteHasMarkup ? (
              <blockquote className="MapInfoDialog-quote">
                <GuiMarkup markup={rawQuote} />
              </blockquote>
            ) : quoteText ? (
              <blockquote className="MapInfoDialog-quote">
                <p>{quoteText}</p>
                {quoteAttrib && <cite>— {quoteAttrib}</cite>}
              </blockquote>
            ) : null}

            {parsedMission?.missionBlurb && (
              <div className="MapInfoDialog-blurb">
                {hasGuiMarkup(parsedMission.missionBlurb) ? (
                  <GuiMarkup markup={parsedMission.missionBlurb.trim()} />
                ) : (
                  <p>{parsedMission.missionBlurb.trim()}</p>
                )}
              </div>
            )}

            {missionString && missionString.trim() && (
              <div className="MapInfoDialog-section">
                <GuiMarkup markup={missionString} />
              </div>
            )}

            {parsedMission?.missionBriefing && (
              <div className="MapInfoDialog-section">
                <h2 className="MapInfoDialog-sectionTitle">Mission Briefing</h2>
                <GuiMarkup markup={parsedMission.missionBriefing} />
              </div>
            )}

            {musicTrack && <MusicPlayer track={musicTrack} />}
          </div>

          {bitmapUrl && !isSinglePlayer && (
            <div className="MapInfoDialog-right">
              <RawPreviewImage
                key={bitmapUrl}
                src={bitmapUrl}
                alt={`${displayName} preview`}
              />
            </div>
          )}
        </div>

        <div className="MapInfoDialog-footer">
          <button className="MapInfoDialog-closeBtn" onClick={onClose}>
            Close
          </button>
          <span className="MapInfoDialog-hint">I or Esc to close</span>
        </div>
      </div>
    </div>
  );
}
