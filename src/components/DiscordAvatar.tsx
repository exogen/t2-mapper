import { useState } from "react";
import { FaDiscord } from "react-icons/fa6";

export function DiscordAvatar({
  src,
  size,
  className,
  fallbackClassName,
}: {
  src?: string | null;
  size: number;
  className: string;
  fallbackClassName: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <FaDiscord
        className={fallbackClassName}
        size={size}
        aria-hidden
        focusable="false"
      />
    );
  }
  return (
    <img
      className={className}
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
