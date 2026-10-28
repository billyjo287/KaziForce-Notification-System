import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Presentation demo only (backend OTP_DEMO_MODE): shows the 6-digit code that a real version
 * would send by SMS or email. Clearly labelled so nobody mistakes it for normal behaviour.
 */
export function DemoCodeBox({ code }: { code: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="rounded-xl border-2 border-dashed border-primary bg-primary-soft p-4"
    >
      <p className="flex items-center gap-2 font-bold">
        <KeyRound aria-hidden="true" className="size-5 shrink-0" />
        {t('demoCode.title')}
      </p>
      <p className="mt-2 font-mono text-3xl font-bold tracking-[0.3em]" data-testid="demo-code">
        {code}
      </p>
      <p className="mt-2 text-ink-muted">{t('demoCode.help')}</p>
    </div>
  );
}
