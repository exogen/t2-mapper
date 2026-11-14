import type { SVGProps } from "react";

/** The crest from public/icon.png, centered in a square viewBox. */
export function Tribes2Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-10 0 128 128"
      width="1em"
      height="1em"
      fill="currentColor"
      {...props}
    >
      <path d="M0 64V48C0 28 8 11 23 1c2-2 4-1 6 1l6 6c2 2 1 4-2 6-8 6-15 16-17 26h28v44l4 8v36H28V56H16v8ZM108 64V48C108 28 100 11 85 1c-2-2-4-1-6 1l-6 6c-2 2-1 4 2 6 8 6 15 16 17 26H64v44l-4 8v36h20V56h12v8Z" />
    </svg>
  );
}
