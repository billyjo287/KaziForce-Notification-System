import { Mail, MessageSquareText, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { ChoiceCards } from '../../components/ui/ChoiceCards';
import { DemoCodeBox } from '../../components/ui/DemoCodeBox';
import { FormAlert } from '../../components/ui/FormAlert';
import { apiErrorCode } from '../../lib/api';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import type { CodeChannel, CodeOption, CodeSent } from '../../types/api';
import { StepHeading } from './AuthLayout';
import { CodeInput } from './CodeInput';

/** Chrome on Android can read the code from the SMS by itself (the WebOTP API). */
interface OtpCredential {
  code: string;
}

/**
 * "Where should we send your code?" (when there is a choice), then "Enter the code". Shared by
 * log-in (SMS or email) and sign-up (email). The code is checked as soon as the sixth digit is
 * typed or pasted; "Send a new code" and "Send it by email instead" wait 30 seconds.
 */
export function CodeSteps({
  greetingName,
  options,
  initialSent,
  title,
  step,
  send,
  verify,
  onRestart,
}: {
  greetingName?: string;
  options: CodeOption[];
  /** Sign-up: the first code is sent with the sign-up itself. */
  initialSent?: CodeSent;
  title?: string;
  step?: { step: number; total: number };
  send: (channel: CodeChannel) => Promise<CodeSent>;
  /** Logs in (or creates the account) and leaves the page; throws if the code is not right. */
  verify: (code: string, rememberDevice: boolean) => Promise<void>;
  onRestart: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const [choice, setChoice] = useState<CodeChannel>(options[0]?.channel ?? 'email');
  const [sent, setSent] = useState<CodeSent | null>(initialSent ?? null);
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(() =>
    initialSent ? Date.now() + initialSent.resendInSeconds * 1000 : 0,
  );
  const [now, setNow] = useState(() => Date.now());
  const codeBox = useRef<HTMLInputElement>(null);
  const autoSent = useRef(false);
  const lastChecked = useRef('');

  async function sendBy(channel: CodeChannel) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await send(channel);
      if (sent) setNotice(t('auth.code.resent'));
      setSent(result);
      setCode('');
      setFieldError(null);
      lastChecked.current = '';
      setResendAt(Date.now() + result.resendInSeconds * 1000);
      setNow(Date.now());
      return true;
    } catch (e) {
      setError(errorMessage(e));
      if (apiErrorCode(e) === 'login_code_expired') setExpired(true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Only one way to send it (no verified phone): no question to ask, send it at once.
  useEffect(() => {
    if (sent || options.length !== 1 || autoSent.current) return;
    autoSent.current = true;
    void sendBy(options[0]!.channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The "Send a new code in 25 s" countdown.
  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waitSeconds > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android Chrome: fill in the code from the SMS when it arrives (the person still sees it).
  useEffect(() => {
    if (sent?.channel !== 'sms' || !('OTPCredential' in window)) return;
    const abort = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: abort.signal } as CredentialRequestOptions)
      .then((credential) => {
        const otp = credential as unknown as OtpCredential | null;
        if (otp?.code) setCode(otp.code.replace(/\D/g, '').slice(0, 6));
      })
      .catch(() => {}); // not supported, cancelled or timed out: typing works as usual
    return () => abort.abort();
  }, [sent]);

  async function check(value: string) {
    if (!/^\d{6}$/.test(value)) {
      setFieldError(t('auth.code.invalid'));
      codeBox.current?.focus();
      return;
    }
    lastChecked.current = value;
    setFieldError(null);
    setError(null);
    setBusy(true);
    try {
      await verify(value, remember);
    } catch (e) {
      setBusy(false);
      if (apiErrorCode(e) === 'login_code_expired') {
        setExpired(true);
        setError(errorMessage(e));
      } else {
        setFieldError(errorMessage(e));
        codeBox.current?.focus();
        codeBox.current?.select();
      }
    }
  }

  // Checked as soon as the sixth digit arrives (typed, pasted or filled in from the SMS).
  useEffect(() => {
    if (code.length === 6 && code !== lastChecked.current && !busy && !expired) void check(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const restart = (
    <Button
      variant={expired ? 'primary' : 'ghost'}
      size={expired ? 'lg' : 'md'}
      onClick={onRestart}
    >
      <RotateCcw aria-hidden="true" className="size-5" />
      {t('auth.code.restart')}
    </Button>
  );

  if (!sent) {
    // Choosing, or waiting for the only way to be sent.
    return (
      <>
        <StepHeading
          {...step}
          title={t('auth.code.chooseTitle')}
          intro={greetingName ? t('auth.code.chooseIntro', { name: greetingName }) : undefined}
          focusOnShow
        />
        {error && <FormAlert>{error}</FormAlert>}
        {options.length > 1 && (
          <form
            noValidate
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void sendBy(choice);
            }}
          >
            <ChoiceCards<CodeChannel>
              legend={t('auth.code.chooseTitle')}
              hideLegend
              name="channel"
              value={choice}
              onChange={setChoice}
              choices={options.map((o) => ({
                value: o.channel,
                label: o.channel === 'sms' ? t('auth.code.sms') : t('auth.code.email'),
                help: t('auth.code.to', { to: o.to }),
                icon: o.channel === 'sms' ? MessageSquareText : Mail,
              }))}
            />
            <Button type="submit" size="lg" disabled={busy || expired}>
              {busy ? t('auth.code.sending') : t('auth.code.send')}
            </Button>
          </form>
        )}
        {options.length === 1 && !error && (
          <p role="status" className="text-lg">
            {t('auth.code.sending')}
          </p>
        )}
        {restart}
      </>
    );
  }

  const other = options.find((o) => o.channel !== sent.channel);
  return (
    <>
      <StepHeading
        {...step}
        title={title ?? t('auth.code.enterTitle')}
        intro={
          sent.channel === 'sms'
            ? t('auth.code.sentSms', { to: sent.to })
            : t('auth.code.sentEmail', { to: sent.to })
        }
        focusOnShow
      />
      {sent.demoCode && <DemoCodeBox code={sent.demoCode} />}
      {notice && !error && <FormAlert tone="success">{notice}</FormAlert>}
      {error && <FormAlert>{error}</FormAlert>}
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void check(code);
        }}
      >
        <CodeInput
          ref={codeBox}
          label={t('auth.code.label')}
          help={t('auth.code.help')}
          error={fieldError ?? undefined}
          value={code}
          onChange={(value) => {
            setCode(value);
            if (fieldError) setFieldError(null);
          }}
          disabled={expired}
        />
        <Checkbox
          label={t('auth.code.remember')}
          help={t('auth.code.rememberHelp')}
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        <Button type="submit" size="lg" disabled={busy || expired}>
          {busy ? t('auth.code.checking') : t('auth.code.submit')}
        </Button>
      </form>
      <div className="flex flex-col items-start gap-2">
        {!expired && (
          <>
            <Button
              variant="ghost"
              disabled={busy || waitSeconds > 0}
              onClick={async () => {
                if (await sendBy(sent.channel)) codeBox.current?.focus();
              }}
            >
              {waitSeconds > 0
                ? t('auth.code.resendIn', { seconds: waitSeconds })
                : t('auth.code.resend')}
            </Button>
            {other && (
              <Button
                variant="ghost"
                disabled={busy || waitSeconds > 0}
                onClick={() => void sendBy(other.channel)}
              >
                {other.channel === 'email' ? t('auth.code.useEmail') : t('auth.code.useSms')}
              </Button>
            )}
          </>
        )}
        {restart}
      </div>
    </>
  );
}
