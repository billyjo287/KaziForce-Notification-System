import { useId, type Ref } from 'react';
import { describedBy } from '../../lib/describedBy';
import { ErrorText, HelpText } from '../../components/ui/Field';

/**
 * The 6-digit code, shown as six boxes. Underneath it is ONE ordinary text box (not six), so
 * pasting, the phone's "fill in code from SMS" suggestion, screen readers and deleting all work
 * as people expect. Only digits are kept; spaces or dashes in a pasted code are dropped.
 */
export function CodeInput({
  label,
  help,
  error,
  value,
  onChange,
  disabled,
  ref,
}: {
  label: string;
  help?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ref?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-lg font-bold">
        {label}
      </label>
      {help && helpId && <HelpText id={helpId}>{help}</HelpText>}
      {error && errorId && <ErrorText id={errorId}>{error}</ErrorText>}
      <div className="group relative w-full max-w-sm">
        <div aria-hidden="true" className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }, (_, i) => {
            const current = i === Math.min(value.length, 5);
            return (
              <span
                key={i}
                className={`grid h-14 place-items-center rounded-xl border-2 bg-surface font-mono text-2xl font-bold transition-colors duration-150 ${
                  error ? 'border-urgent' : value[i] ? 'border-primary' : 'border-line-strong'
                } ${
                  current
                    ? 'group-has-focus-visible:outline-3 group-has-focus-visible:outline-offset-2 group-has-focus-visible:outline-focus'
                    : ''
                }`}
              >
                {value[i] ?? ''}
              </span>
            );
          })}
        </div>
        <input
          ref={ref}
          id={id}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={12}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(helpId, errorId)}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          // Covers the boxes, so a tap anywhere on them puts the cursor here; its own text and
          // cursor are invisible (the boxes show the digits).
          className="absolute inset-0 size-full cursor-text rounded-xl bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
        />
      </div>
    </div>
  );
}
