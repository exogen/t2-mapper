import {
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxItem,
  ComboboxItemCheck,
  ComboboxPopover,
  ComboboxProvider,
  ComboboxSelect,
  ComboboxSelectArrow,
} from "@ariakit/react";
import {
  useEffect,
  useId,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { useTouchDevice } from "./useTouchDevice";
import styles from "./Select.module.css";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectGroup = {
  label: string;
  options: readonly SelectOption[];
};

export type SelectSeparator = { separator: true };

export type SelectItem = SelectOption | SelectGroup | SelectSeparator;

type SelectProps = Pick<
  ComponentPropsWithoutRef<"select">,
  | "id"
  | "name"
  | "disabled"
  | "title"
  | "className"
  | "aria-label"
  | "aria-labelledby"
  | "aria-describedby"
> & {
  size?: "default" | "small";
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectItem[];
};

/** Styled Ariakit menus on desktop; the browser's own picker on touch devices. */
export function Select(props: SelectProps) {
  const touch = useTouchDevice();
  const generatedId = useId();
  const {
    options,
    value,
    onChange,
    className,
    size = "default",
    ...controlProps
  } = props;
  const id = props.id ?? generatedId;

  if (touch) {
    const renderOption = (option: SelectOption) => (
      <option
        key={option.value}
        value={option.value}
        disabled={option.disabled}
      >
        {option.label}
      </option>
    );
    return (
      <select
        {...controlProps}
        id={id}
        data-select="native"
        data-size={size}
        className={`${styles.Trigger} ${styles.Native} ${className ?? ""}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option, index) =>
          "separator" in option ? (
            <hr key={`separator-${index}`} aria-hidden="true" />
          ) : "options" in option ? (
            <optgroup key={option.label} label={option.label}>
              {option.options.map(renderOption)}
            </optgroup>
          ) : (
            renderOption(option)
          ),
        )}
      </select>
    );
  }

  return <DesktopSelect {...props} id={id} />;
}

function DesktopSelect({
  options,
  value,
  onChange,
  className,
  disabled,
  size = "default",
  ...controlProps
}: SelectProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const selectedOption = options
    .flatMap((option) =>
      "separator" in option
        ? []
        : "options" in option
          ? option.options
          : [option],
    )
    .find((option) => option.value === value);
  const renderOption = (option: SelectOption) => (
    <ComboboxItem
      key={option.value}
      value={option.value}
      disabled={option.disabled}
      focusOnHover
      className={styles.Item}
    >
      <ComboboxItemCheck className={styles.Check} />
      <span>{option.label}</span>
    </ComboboxItem>
  );

  return (
    <ComboboxProvider
      selectedValue={value}
      setSelectedValue={onChange}
      open={open && !disabled}
      setOpen={setOpen}
      placement="bottom-start"
    >
      <ComboboxSelect
        {...controlProps}
        disabled={disabled}
        data-select="custom"
        data-size={size}
        className={`${styles.Trigger} ${className ?? ""}`}
      >
        <span className={styles.Value}>{selectedOption?.label ?? value}</span>
        <ComboboxSelectArrow className={styles.Arrow} />
      </ComboboxSelect>
      <ComboboxPopover
        portal
        fixed
        gutter={5}
        fitViewport
        className={styles.Popover}
        aria-label={controlProps["aria-label"]}
        aria-labelledby={controlProps["aria-labelledby"]}
        data-select-owner={controlProps.id}
        data-size={size}
      >
        {options.map((option, index) =>
          "separator" in option ? (
            <hr
              key={`separator-${index}`}
              aria-hidden="true"
              className={styles.Separator}
            />
          ) : "options" in option ? (
            <ComboboxGroup key={option.label} className={styles.Group}>
              <ComboboxGroupLabel className={styles.GroupLabel}>
                {option.label}
              </ComboboxGroupLabel>
              {option.options.map(renderOption)}
            </ComboboxGroup>
          ) : (
            renderOption(option)
          ),
        )}
      </ComboboxPopover>
    </ComboboxProvider>
  );
}
