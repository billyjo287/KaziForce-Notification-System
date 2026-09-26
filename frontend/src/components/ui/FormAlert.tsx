import { CircleAlert, CircleCheck } from 'lucide-react';

/**
 * A message above a form: "error" for things like a wrong password (announced at once to
 * screen readers), "success" for confirmations such as "Check your inbox".
 */
export function FormAlert({
  tone = 'error',
  className = '',
  children,
}: {
  tone?: 'error' | 'success';
  className?: string;
  children: string;
}) {
  const Icon = tone === 'error' ? CircleAlert : CircleCheck;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border-2 p-4 font-bold ${className} ${
        tone === 'error'
          ? 'border-urgent bg-urgent-soft text-urgent'
          : 'border-primary bg-primary-soft text-ink'
      }`}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
