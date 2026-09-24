import { useId, type InputHTMLAttributes, type Ref } from 'react';
import { describedBy } from '../../lib/describedBy';
import { ErrorText, HelpText } from './Field';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  help?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

/** A large tick box; the whole label is tappable. */
export function Checkbox({ label, help, error, ...props }: CheckboxProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      {error && errorId && <ErrorText id={errorId}>{error}</ErrorText>}
      <label
        htmlFor={id}
        className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 bg-surface p-3 ${
          error ? 'border-urgent' : 'border-line-strong'
        }`}
      >
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(helpId, errorId)}
          className="mt-0.5 size-6 shrink-0 accent-(--kf-primary)"
          {...props}
        />
        <span className="text-lg">{label}</span>
      </label>
      {help && helpId && <HelpText id={helpId}>{help}</HelpText>}
    </div>
  );
}
