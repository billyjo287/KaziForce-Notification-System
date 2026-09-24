import { useId, type Ref, type TextareaHTMLAttributes } from 'react';
import { describedBy } from '../../lib/describedBy';
import { ErrorText, HelpText } from './Field';

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  help?: string;
  error?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
  label,
  help,
  error,
  className = '',
  rows = 4,
  ...props
}: TextareaProps) {
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
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(helpId, errorId)}
        className={`w-full rounded-xl border-2 bg-surface px-4 py-3 text-lg text-ink ${
          error ? 'border-urgent' : 'border-line-strong'
        } ${className}`}
        {...props}
      />
    </div>
  );
}
