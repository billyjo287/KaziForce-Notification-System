import { Mail } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { DemoCodeBox } from '../../components/ui/DemoCodeBox';
import { FormAlert } from '../../components/ui/FormAlert';
import { api } from '../../lib/api';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { useAuth } from '../../stores/auth';
import { showToast } from '../../stores/toasts';
import type { CodeSent, User } from '../../types/api';
import { CodeInput } from './CodeInput';
import './strings';

/**
 * After an SMS sign-up (ADR 0015): "Confirm your email address" on the Home pages and in
 * Settings until it is done (ConfirmEmailReminder.tsx). No email (alerts, daily summary, password reset) is sent to the address before.
 * A 6-digit code to the email, checked as soon as the sixth digit is typed or pasted.
 */
export default function ConfirmEmailBanner() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const errorMessage = useApiErrorMessage();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);
  const lastChecked = useRef('');
  const codeBox = useRef<HTMLInputElement>(null);

  // "Send a new code" after 30 seconds.
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setCanResend(true), sent.resendInSeconds * 1000);
    return () => clearTimeout(timer);
  }, [sent]);

  async function send() {
    setBusy(true);
    setError(null);
    setCanResend(false);
    try {
      if (challengeId) {
        const { data } = await api.post<CodeSent>('/auth/email/resend', { challengeId });
        setSent(data);
      } else {
        const { data } = await api.post<{ challengeId: string; sent: CodeSent }>(
          '/auth/email/send',
        );
        setChallengeId(data.challengeId);
        setSent(data.sent);
      }
      setCode('');
      lastChecked.current = '';
      codeBox.current?.focus();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function check(value: string) {
    lastChecked.current = value;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ user: User }>('/auth/email/code', {
        challengeId,
        code: value,
      });
      showToast({ message: t('auth.confirmEmail.done') });
      setUser(data.user); // the banner goes away
    } catch (e) {
      setBusy(false);
      setError(errorMessage(e));
      codeBox.current?.select();
    }
  }

  useEffect(() => {
    if (code.length === 6 && code !== lastChecked.current && !busy) void check(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (!user) return null;
  return (
    <section
      aria-labelledby="confirm-email"
      className="flex flex-col gap-4 rounded-kf-lg border-2 border-important-bar bg-important-soft p-5"
    >
      <div className="flex items-start gap-3">
        <Mail aria-hidden="true" className="mt-1 size-6 shrink-0" />
        <div>
          <h2 id="confirm-email" className="text-xl font-bold">
            {t('auth.confirmEmail.title')}
          </h2>
          <p className="text-lg">
            {sent
              ? t('auth.confirmEmail.sent', { email: user.email })
              : t('auth.confirmEmail.body', { email: user.email })}
          </p>
        </div>
      </div>
      {error && <FormAlert>{error}</FormAlert>}
      {sent?.demoCode && <DemoCodeBox code={sent.demoCode} />}
      {sent ? (
        <div className="flex flex-col gap-3 sm:max-w-sm">
          <CodeInput
            ref={codeBox}
            label={t('auth.code.label')}
            help={t('auth.code.help')}
            value={code}
            onChange={setCode}
            disabled={busy}
          />
          <Button
            variant="ghost"
            className="self-start"
            disabled={busy || !canResend}
            onClick={() => void send()}
          >
            {t('auth.code.resend')}
          </Button>
        </div>
      ) : (
        <Button className="self-start" disabled={busy} onClick={() => void send()}>
          {busy ? t('auth.code.sending') : t('auth.confirmEmail.send')}
        </Button>
      )}
    </section>
  );
}
