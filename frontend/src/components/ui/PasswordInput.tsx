import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { describedBy } from '../../lib/describedBy';
import { ErrorText, HelpText } from './Field';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  help?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

/** Password field with a "Show" button (easier than typing it twice, especially on phones). */
export function PasswordInput({ label, help, error, ...props }: PasswordInputProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
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
      <div className="flex gap-2">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(helpId, errorId)}
          className={`min-h-12 w-full min-w-0 rounded-xl border-2 bg-surface px-4 text-lg text-ink ${
            error ? 'border-urgent' : 'border-line-strong'
          }`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={id}
          className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl border-2 border-line-strong bg-surface px-3 font-bold hover:bg-canvas"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-5" />
          ) : (
            <Eye aria-hidden="true" className="size-5" />
          )}
          {t('auth.showPassword')}
        </button>
      </div>
    </div>
  );
}
