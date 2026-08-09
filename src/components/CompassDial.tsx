import type { ReactNode, Ref } from "react";
import styles from "./CompassDial.module.css";

const SIZE = 72;
const C = SIZE / 2;
const LETTER_RADIUS = 26;

function radialLine(deg: number, r1: number, r2: number): string {
  const a = (deg * Math.PI) / 180;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  return (
    `M${(C + r1 * sin).toFixed(2)} ${(C - r1 * cos).toFixed(2)}` +
    `L${(C + r2 * sin).toFixed(2)} ${(C - r2 * cos).toFixed(2)}`
  );
}

function tickPath(stepDeg: number, r1: number, r2: number, skipDeg: number) {
  const parts: string[] = [];
  for (let deg = 0; deg < 360; deg += stepDeg) {
    if (deg % skipDeg !== 0) parts.push(radialLine(deg, r1, r2));
  }
  return parts.join("");
}

const MINOR_TICKS = tickPath(15, 19, 21, 45);
const MAJOR_TICKS = tickPath(45, 18, 21.5, 360);

/**
 * Transform attribute value for imperative rotor writes via `rotorRef`.
 */
export function rotorTransform(headingDeg: number): string {
  return `rotate(${-headingDeg} ${C} ${C})`;
}

const LETTERS: Array<{ letter: string; deg: number }> = [
  { letter: "N", deg: 0 },
  { letter: "E", deg: 90 },
  { letter: "S", deg: 180 },
  { letter: "W", deg: 270 },
];

/**
 * The compass dial visual: a translucent face with tick rings and rotating
 * cardinal letters below a fixed forward notch. Rotate it either
 * declaratively via `deg` (heading in degrees) or imperatively through
 * `rotorRef` with `rotate(-deg 36 36)` transform attribute writes. Children
 * overlay the center (clock, degree readout).
 */
export function CompassDial({
  deg,
  rotorRef,
  children,
}: {
  deg?: number;
  rotorRef?: Ref<SVGGElement>;
  children?: ReactNode;
}) {
  return (
    <div className={styles.CompassDial}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle className={styles.Face} cx={C} cy={C} r={35} />
        <circle className={styles.OuterRing} cx={C} cy={C} r={35} />
        <circle className={styles.InnerRing} cx={C} cy={C} r={17.5} />
        <g
          ref={rotorRef}
          transform={deg != null ? rotorTransform(deg) : undefined}
        >
          <path className={styles.MinorTicks} d={MINOR_TICKS} />
          <path className={styles.MajorTicks} d={MAJOR_TICKS} />
          {LETTERS.map(({ letter, deg: letterDeg }) => {
            const a = (letterDeg * Math.PI) / 180;
            const x = C + LETTER_RADIUS * Math.sin(a);
            const y = C - LETTER_RADIUS * Math.cos(a);
            return (
              <text
                key={letter}
                className={letter === "N" ? styles.NorthLetter : styles.Letter}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {letter}
              </text>
            );
          })}
        </g>
        <path
          className={styles.Notch}
          d={`M${C - 3} 0.5L${C + 3} 0.5L${C} 5Z`}
        />
      </svg>
      {children}
    </div>
  );
}
