import type { SVGProps } from "react";

const barProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 42,
  strokeLinecap: "square",
  strokeLinejoin: "round",
} as const;

/**
 * IoWifiSharp with its bars split into separate paths so CSS can light
 * them up individually by signal quality (react-icons draws all three
 * bars as one path, which can't be targeted). Paths carry data-bar
 * ("dot", "1" innermost … "3" outermost).
 */
export function WifiSignalIcon({
  title,
  ...props
}: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width="1em"
      height="1em"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path data-bar="3" d="M448 191.52a288 288 0 0 0-383.44 0" {...barProps} />
      <path
        data-bar="2"
        d="M393.74 259a201.26 201.26 0 0 0-274.92 0"
        {...barProps}
      />
      <path data-bar="1" d="M332.69 320a115 115 0 0 0-152.8 0" {...barProps} />
      <path
        data-bar="dot"
        d="M300.67 384 256 433l-44.34-49a56.73 56.73 0 0 1 88.92 0z"
        fill="currentColor"
      />
    </svg>
  );
}
