import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { describedBy } from '../../lib/describedBy';
import { ErrorText, HelpText } from './Field';

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** One line under the label. */
  help?: string;
  icon?: LucideIcon;
}

interface ChoiceCardsProps<T extends string> {
  legend: string;
  help?: string;
  error?: string;
  name: string;
  value: T | undefined;
  choices: Choice<T>[];
  onChange: (value: T) => void;
  /** Visually hide the legend when the page heading already asks the question. */
  hideLegend?: boolean;
  columns?: 1 | 2 | 3;
}

/**
 * Big tappable choices (real radio buttons underneath, so keyboards and screen readers work).
 * Used for onboarding questions and presets: easier than a dropdown for 2 to 4 options.
 */
export function ChoiceCards<T extends string>({
  legend,
  help,
  error,
  name,
  value,
  choices,
  onChange,
  hideLegend = false,
  columns = 1,
}: ChoiceCardsProps<T>) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const grid = columns === 3 ? 'sm:grid-cols-3' : columns === 2 ? 'sm:grid-cols-2' : '';

  return (
    <fieldset aria-describedby={describedBy(helpId, errorId)} className="flex flex-col gap-2">
      <legend className={hideLegend ? 'sr-only' : 'mb-1 text-lg font-bold'}>{legend}</legend>
      {help && helpId && <HelpText id={helpId}>{help}</HelpText>}
      {error && errorId && <ErrorText id={errorId}>{error}</ErrorText>}
      <div className={`grid gap-3 ${grid}`}>
        {choices.map((choice) => {
          const Icon = choice.icon;
          return (
            <label
              key={choice.value}
              className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 border-line-strong bg-surface p-4 transition-colors duration-150 hover:bg-canvas has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={value === choice.value}
                onChange={() => onChange(choice.value)}
                className="mt-1 size-5 shrink-0 accent-(--kf-primary) focus-visible:outline-none"
              />
              {Icon && <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary" />}
              <span className="flex flex-col">
                <span className="text-lg font-bold">{choice.label}</span>
                {choice.help && <span className="text-ink-muted">{choice.help}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
