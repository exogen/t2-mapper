import { useId } from "react";
import choiceStyles from "./ChoiceInput.module.css";
import styles from "./InspectorControls.module.css";

export type RadioOption<Value extends string> = {
  value: Value;
  label: string;
  description?: string;
};

export function SidebarRadioGroup<Value extends string>({
  name,
  legend,
  value,
  onChange,
  options,
  disabled,
}: {
  name: string;
  legend: string;
  value: Value;
  onChange: (value: Value) => void;
  options: readonly RadioOption<Value>[];
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className={styles.RadioGroup} disabled={disabled}>
      <legend>{legend}</legend>
      <div className={styles.ChoiceList}>
        {options.map(({ value: optionValue, label, description }) => {
          const optionId = `${id}-${optionValue}`;
          const descriptionId = `${optionId}-description`;
          return (
            <div className={styles.CheckboxField} key={optionValue}>
              <input
                type="radio"
                name={name}
                id={optionId}
                className={choiceStyles.Radio}
                value={optionValue}
                checked={value === optionValue}
                onChange={() => onChange(optionValue)}
                aria-describedby={description ? descriptionId : undefined}
              />
              <div className={styles.Label}>
                <span>
                  <label htmlFor={optionId}>{label}</label>
                  {description && (
                    <>
                      {" "}
                      <span className={styles.Description} id={descriptionId}>
                        –&nbsp;{description}
                      </span>
                    </>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
