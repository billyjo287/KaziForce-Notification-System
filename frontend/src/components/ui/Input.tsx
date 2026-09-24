import { useId, type InputHTMLAttributes, type Ref } from 'react';
import { describedBy } from '../../lib/describedBy';
import { ErrorText, HelpText } from './Field';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Always visible above the field (never a placeholder-only label). */
  label: string;
  help?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ label, help, error, className = '', ...props }: InputProps) {
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
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(helpId, errorId)}
        className={`min-h-12 w-full rounded-xl border-2 bg-surface px-4 text-lg text-ink ${
          error ? 'border-urgent' : 'border-line-strong'
        } ${className}`}
        {...props}
      />
    </div>
  );
}
