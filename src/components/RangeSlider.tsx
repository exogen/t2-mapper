import * as Slider from "@radix-ui/react-slider";
import type { AriaAttributes } from "react";
import styles from "./RangeSlider.module.css";

type RangeSliderProps = Pick<
  AriaAttributes,
  "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-valuetext"
> & {
  id?: string;
  name?: string;
  title?: string;
  className?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
};

/** A single-value settings slider, using the same primitive as the timeline. */
export function RangeSlider({
  id,
  name,
  title,
  className,
  min,
  max,
  step = 1,
  value,
  disabled = false,
  onValueChange,
  ...accessibleProps
}: RangeSliderProps) {
  return (
    <Slider.Root
      className={`${styles.Root} ${className ?? ""}`}
      data-range-slider=""
      name={name}
      title={title}
      min={min}
      max={max}
      step={step}
      value={[value]}
      disabled={disabled}
      onValueChange={([nextValue]) => onValueChange(nextValue)}
    >
      <Slider.Track className={styles.Track}>
        <Slider.Range className={styles.Range} />
      </Slider.Track>
      <Slider.Thumb asChild>
        {/* A button is labelable, preserving native label-click focus. */}
        <button
          type="button"
          id={id}
          className={styles.Thumb}
          disabled={disabled}
          {...accessibleProps}
        />
      </Slider.Thumb>
    </Slider.Root>
  );
}
