import { CircleAlert, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { api, apiErrorCode } from '../../lib/api';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { useTimedExit } from '../../lib/useTimedExit';
import { homePath, useAuth } from '../../stores/auth';
import type { CodeSent, LoginCodeStep, Session } from '../../types/api';
import { AuthLayout, StepHeading } from './AuthLayout';
import { CodeSteps } from './CodeSteps';
import {
  forgetAccount,
  formatPhone,
  parseIdentifier,
  rememberAccount,
  rememberedAccount,
  type Identifier,
  type RememberedAccount,
} from './identifier';
import { safeNext } from './safeNext';

type Step =
  | { name: 'who' }
  | { name: 'password'; who: Identifier; remembered?: RememberedAccount }
  | { name: 'notFound'; who: Identifier }
  | { name: 'code'; who: Identifier; challenge: LoginCodeStep };

const NOTICE_MS = 5000;
const shown = (who: Identifier) => (who.kind === 'phone' ? formatPhone(who.value) : who.value);

/**
 * Log in, one question at a time:
 * 1. "Email or phone number" (a device that remembers the person skips this: "Welcome back").
 *    If no account uses it, the page offers to create one with it.
 * 2. The password (with a Caps Lock warning).
 * 3. On a new phone or computer: "Where should we send your code?" (SMS or email) and the code,
 *    with "Remember this phone or computer for 30 days" (CodeSteps).
 */
export default function LoginPage() {
  const { t } = useTranslation();
  usePageTitle(t('auth.login.title'));
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const notice = useAuth((s) => s.notice);
  const setSession = useAuth((s) => s.setSession);
  const setJustLoggedIn = useAuth((s) => s.setJustLoggedIn);
  const clearNotice = useAuth((s) => s.clearNotice);
  // "You are logged out" is only a confirmation: it slides away after 5 seconds. Warnings
  // (suspended, session expired) stay until the person logs in.
  const temporary = notice === 'loggedOut' || notice === 'loggedOutAll';
  const leaving = useTimedExit(temporary, NOTICE_MS, clearNotice);
  const errorMessage = useApiErrorMessage();

  // Sent here by sign-up ("You already have an account"): straight to the password.
  const fromSignup = parseIdentifier(
    (location.state as { identifier?: string } | null)?.identifier ?? '',
  );
  const [step, setStep] = useState<Step>(() => {
    if (fromSignup) return { name: 'password', who: fromSignup };
    const remembered = rememberedAccount();
    return remembered
      ? { name: 'password', who: { kind: 'email', value: remembered.email }, remembered }
      : { name: 'who' };
  });
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  const [wrongTries, setWrongTries] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function loggedIn(data: Session) {
    setSession(data);
    setJustLoggedIn(true);
    const destination = data.user.onboardingCompleted
      ? (safeNext(params.get('next')) ?? homePath(data.user.role))
      : '/onboarding';
    navigate(destination, { replace: true });
  }

  function goTo(next: Step) {
    setServerError(null);
    setStep(next);
  }

  async function onContinue(event: React.FormEvent) {
    event.preventDefault();
    const who = parseIdentifier(typed);
    if (!who) {
      setTypedError(t(typed.trim() ? 'auth.login.identifierInvalid' : 'validation.required'));
      return;
    }
    setTypedError(null);
    setServerError(null);
    setBusy(true);
    try {
      const { data } = await api.post<{ exists: boolean }>('/auth/check', {
        identifier: who.value,
      });
      setPassword('');
      setWrongTries(0);
      goTo(data.exists ? { name: 'password', who } : { name: 'notFound', who });
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onLogIn(event: React.FormEvent) {
    event.preventDefault();
    if (step.name !== 'password') return;
    if (!password) {
      setPasswordError(t('validation.required'));
      return;
    }
    setPasswordError(null);
    setServerError(null);
    setBusy(true);
    try {
      const { data } = await api.post<Session | LoginCodeStep>('/auth/login', {
        identifier: step.who.value,
        password,
      });
      if ('codeRequired' in data) {
        setBusy(false);
        goTo({ name: 'code', who: step.who, challenge: data });
      } else {
        loggedIn(data);
      }
    } catch (error) {
      setBusy(false);
      if (apiErrorCode(error) === 'wrong_credentials') setWrongTries((n) => n + 1);
      setServerError(errorMessage(error));
    }
  }

  const noticeAlert = notice && !serverError && (
    <FormAlert
      tone={notice === 'suspended' ? 'error' : 'success'}
      className={temporary ? (leaving ? 'kf-leave' : 'kf-enter') : undefined}
    >
      {t(`auth.notices.${notice}`)}
    </FormAlert>
  );
  const forgotLink = (
    <Link
      to="/forgot-password"
      state={step.name !== 'who' && step.who.kind === 'email' ? { email: step.who.value } : null}
      className="min-h-11 text-lg font-bold text-kf-primary-text underline underline-offset-4"
    >
      {t('auth.login.forgot')}
    </Link>
  );

  if (step.name === 'code') {
    const { challenge } = step;
    return (
      <AuthLayout>
        <CodeSteps
          greetingName={challenge.firstName}
          options={challenge.options}
          smsUnavailable={!challenge.options.some((o) => o.channel === 'sms')}
          send={async (channel) =>
            (
              await api.post<CodeSent>('/auth/login/send', {
                challengeId: challenge.challengeId,
                channel,
              })
            ).data
          }
          verify={async (code, rememberDevice) => {
            const { data } = await api.post<Session>('/auth/login/code', {
              challengeId: challenge.challengeId,
              code,
              rememberDevice,
            });
            if (rememberDevice)
              rememberAccount({ name: challenge.firstName, email: data.user.email });
            loggedIn(data);
          }}
          onRestart={() => {
            setPassword('');
            goTo({ name: 'password', who: step.who });
          }}
        />
      </AuthLayout>
    );
  }

  if (step.name === 'notFound') {
    return (
      <AuthLayout>
        <StepHeading
          title={t('auth.login.notFoundTitle')}
          intro={t('auth.login.notFoundBody', { identifier: shown(step.who) })}
          focusOnShow
        />
        {step.who.kind === 'phone' && (
          <p className="flex items-start gap-2 text-lg">
            <CircleAlert aria-hidden="true" className="mt-1 size-5 shrink-0" />
            {t('auth.login.notFoundPhone')}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <Link
            to="/register"
            state={step.who.kind === 'email' ? { email: step.who.value } : null}
            className={buttonClasses('primary', 'lg')}
          >
            {t('auth.login.createWithThis')}
          </Link>
          <Button variant="secondary" size="lg" onClick={() => goTo({ name: 'who' })}>
            {t('auth.login.tryAnother')}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (step.name === 'password') {
    const { who, remembered } = step;
    return (
      <AuthLayout>
        <StepHeading
          title={
            remembered
              ? t('auth.login.welcomeBack', { name: remembered.name })
              : t('auth.login.passwordTitle')
          }
          intro={remembered ? t('auth.login.rememberedIntro', { to: remembered.email }) : undefined}
          focusOnShow={!remembered}
        />
        {noticeAlert}
        {serverError && <FormAlert>{serverError}</FormAlert>}
        {wrongTries >= 2 && (
          <p role="status" className="rounded-xl border-2 border-line-strong bg-surface p-4">
            {t('auth.login.forgotHint')}
          </p>
        )}
        {!remembered && (
          <div className="flex items-center gap-3 rounded-xl border-2 border-line bg-surface p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-kf-primary-text">
              <UserRound aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-lg font-bold">{shown(who)}</span>
            <Button variant="ghost" onClick={() => goTo({ name: 'who' })}>
              {t('auth.login.change')}
              <span className="sr-only">: {shown(who)}</span>
            </Button>
          </div>
        )}
        <form onSubmit={onLogIn} noValidate className="flex flex-col gap-5">
          {/* For password managers: which account this password belongs to. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={who.value}
            readOnly
            hidden
          />
          <PasswordInput
            label={t('auth.login.password')}
            name="password"
            autoComplete="current-password"
            autoFocus={!!remembered}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError(null);
            }}
            onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
            onBlur={() => setCapsLock(false)}
            error={passwordError ?? undefined}
          />
          {capsLock && (
            <p role="status" className="-mt-2 flex items-start gap-2 font-bold text-important">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              {t('auth.login.capsLock')}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? t('auth.login.loggingIn') : t('auth.login.submit')}
          </Button>
        </form>
        <div className="flex flex-col items-start gap-3">
          {forgotLink}
          {remembered && (
            <Button
              variant="ghost"
              onClick={() => {
                forgetAccount();
                goTo({ name: 'who' });
              }}
            >
              {t('auth.login.notYou')}
            </Button>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <StepHeading title={t('auth.login.title')} intro={t('auth.login.intro')} />
      {noticeAlert}
      {serverError && <FormAlert>{serverError}</FormAlert>}
      <form onSubmit={onContinue} noValidate className="flex flex-col gap-5">
        <Input
          label={t('auth.login.identifier')}
          help={t('auth.login.identifierHelp')}
          name="identifier"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            if (typedError) setTypedError(null);
          }}
          error={typedError ?? undefined}
        />
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t('auth.login.checking') : t('auth.login.continue')}
        </Button>
      </form>
      <div className="flex flex-col gap-3 text-lg">
        {forgotLink}
        <p>
          {t('auth.login.noAccount')}{' '}
          <Link
            to="/register"
            className="font-bold text-kf-primary-text underline underline-offset-4"
          >
            {t('auth.login.register')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
