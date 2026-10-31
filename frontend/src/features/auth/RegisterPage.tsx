import {
  ArrowLeft,
  Briefcase,
  Check,
  Circle,
  Lightbulb,
  Mail,
  MessageSquareText,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { ChoiceCards } from '../../components/ui/ChoiceCards';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { api, apiErrorCode } from '../../lib/api';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAuth } from '../../stores/auth';
import type { CodeChannel, CodeSent, Session, SignupCodeStep } from '../../types/api';
import { AuthLayout, StepHeading } from './AuthLayout';
import { CodeSteps } from './CodeSteps';
import { isCommonPassword, parseIdentifier, rememberAccount, suggestEmail } from './identifier';

type SignUpRole = 'worker' | 'business';
type StepName = 'role' | 'email' | 'exists' | 'name' | 'password' | 'send' | 'code';
const TOTAL = 6;
const STEP_NUMBER: Record<StepName, number> = {
  role: 1,
  email: 2,
  exists: 2,
  name: 3,
  password: 4,
  send: 5,
  code: 6,
};

/** What was typed so far (never the password): kept if the page reloads or the network drops. */
interface Draft {
  step: StepName;
  role?: SignUpRole;
  email: string;
  name: string;
  /** Step 5: where the code goes, and the phone number for SMS. */
  channel?: CodeChannel;
  phone?: string;
}
const DRAFT = 'kf.signupDraft';
function loadDraft(): Draft | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT) ?? 'null') as Draft | null;
    // The password and a code cannot survive a reload: continue from the password.
    if (saved) {
      const later = saved.step === 'send' || saved.step === 'code';
      return { ...saved, step: later ? 'password' : saved.step };
    }
    return null;
  } catch {
    return null;
  }
}
function saveDraft(draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(DRAFT, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT);
  } catch {
    // storage blocked: nothing kept
  }
}

/**
 * Sign-up, one question per screen (GOV.UK "one thing per page"):
 * 1 looking for work or hiring, 2 email (with "Did you mean gmail.com?", and "You already have
 * an account" instead of an error), 3 name, 4 password (rules ticked off while typing),
 * 5 the code by email or by SMS (with the phone number and consent; ADR 0015), 6 the code.
 * The account is created only after the code. Admins are never created here (only by the seed
 * script).
 */
export default function RegisterPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('auth.register.title'));
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuth((s) => s.setSession);
  const errorMessage = useApiErrorMessage();

  // From the log-in page ("We cannot find an account" -> Create an account): email filled in.
  const fromLogin = (location.state as { email?: string } | null)?.email ?? '';
  const [draft, setDraft] = useState<Draft>(
    () => loadDraft() ?? { step: 'role', email: fromLogin, name: '' },
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<SignupCodeStep | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  useEffect(() => saveDraft(draft), [draft]);

  const update = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));
  function goTo(step: StepName) {
    setError(null);
    setFieldError(null);
    setConsentError(null);
    update({ step });
  }
  const step = { step: STEP_NUMBER[draft.step], total: TOTAL };

  const back = (to: StepName) => (
    <Button variant="ghost" onClick={() => goTo(to)} className="self-start">
      <ArrowLeft aria-hidden="true" className="size-5" />
      {t('auth.back')}
    </Button>
  );

  async function onEmail(event: { preventDefault: () => void }, email = draft.email.trim()) {
    event.preventDefault();
    const who = parseIdentifier(email);
    if (!who || who.kind !== 'email') {
      setFieldError(t(email ? 'validation.email' : 'validation.required'));
      return;
    }
    // "gmial.com": ask once; pressing Continue again keeps what was typed.
    const better = suggestEmail(who.value);
    if (better && suggestion === null) {
      setSuggestion(better);
      return;
    }
    setFieldError(null);
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.post<{ exists: boolean }>('/auth/check', {
        identifier: who.value,
      });
      update({ email: who.value, step: data.exists ? 'exists' : 'name' });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function onName(event: React.FormEvent) {
    event.preventDefault();
    const name = draft.name.trim();
    if (name.length < 2) {
      setFieldError(t(name ? 'validation.nameMin' : 'validation.required'));
      return;
    }
    if (name.length > 80) {
      setFieldError(t('validation.tooLong'));
      return;
    }
    update({ name });
    goTo('password');
  }

  const longEnough = password.length >= 8;
  const notCommon = password.length > 0 && !isCommonPassword(password);

  async function onPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!longEnough) {
      setFieldError(t(password ? 'validation.passwordMin' : 'validation.required'));
      return;
    }
    if (!notCommon) {
      setFieldError(t('auth.register.passwordCommon'));
      return;
    }
    if (password.length > 128) {
      setFieldError(t('validation.tooLong'));
      return;
    }
    goTo('send');
  }

  const channel = draft.channel ?? 'email';

  // Step 5: send the code (the account details go with it; nothing is saved before the code).
  async function onSend(event: React.FormEvent) {
    event.preventDefault();
    let phone: string | undefined;
    if (channel === 'sms') {
      const who = parseIdentifier(draft.phone ?? '');
      const phoneError =
        who?.kind === 'phone'
          ? null
          : t(draft.phone ? 'apiErrors.phone_invalid' : 'validation.required');
      setFieldError(phoneError);
      setConsentError(consent ? null : t('auth.register.consentNeeded'));
      if (phoneError || !consent) return;
      phone = who!.value;
    }
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.post<Session | SignupCodeStep>('/auth/register', {
        role: draft.role,
        name: draft.name,
        email: draft.email,
        password,
        language: i18n.language,
        channel,
        ...(phone && { phone, consentSms: true }),
      });
      if ('codeRequired' in data) {
        setChallenge(data);
        setBusy(false);
        update({ step: 'code' });
      } else {
        finish(data);
      }
    } catch (e) {
      setBusy(false);
      const code = apiErrorCode(e);
      if (code === 'email_taken') goTo('exists');
      else if (code === 'phone_taken' || code === 'phone_invalid') setFieldError(errorMessage(e));
      else setError(errorMessage(e));
    }
  }

  function finish(data: Session) {
    saveDraft(null);
    setSession(data);
    navigate('/onboarding', { replace: true });
  }

  if (draft.step === 'code' && challenge) {
    return (
      <AuthLayout>
        <CodeSteps
          step={step}
          // SMS sign-up: "Send it by email instead" too (the email is then the one confirmed).
          options={
            challenge.sent.channel === 'sms'
              ? [challenge.sent, { channel: 'email', to: draft.email }]
              : [challenge.sent]
          }
          initialSent={challenge.sent}
          send={async (by) =>
            (
              await api.post<CodeSent>('/auth/register/resend', {
                challengeId: challenge.challengeId,
                channel: by,
              })
            ).data
          }
          verify={async (code, rememberDevice) => {
            const { data } = await api.post<Session>('/auth/register/code', {
              challengeId: challenge.challengeId,
              code,
              rememberDevice,
            });
            if (rememberDevice) {
              rememberAccount({ name: draft.name.split(' ')[0] ?? draft.name, email: draft.email });
            }
            finish(data);
          }}
          onRestart={() => {
            setChallenge(null);
            setPassword('');
            goTo('password');
          }}
        />
      </AuthLayout>
    );
  }

  if (draft.step === 'send') {
    return (
      <AuthLayout>
        <StepHeading
          {...step}
          title={t('auth.code.chooseTitle')}
          intro={t('auth.register.sendIntro')}
          focusOnShow
        />
        {error && <FormAlert>{error}</FormAlert>}
        <form onSubmit={(e) => void onSend(e)} noValidate className="flex flex-col gap-5">
          <ChoiceCards<CodeChannel>
            legend={t('auth.code.chooseTitle')}
            hideLegend
            name="channel"
            value={channel}
            onChange={(value) => {
              update({ channel: value });
              setFieldError(null);
              setConsentError(null);
            }}
            choices={[
              {
                value: 'email',
                label: t('auth.code.email'),
                help: t('auth.register.byEmailHelp', { to: draft.email }),
                icon: Mail,
              },
              {
                value: 'sms',
                label: t('auth.code.sms'),
                help: t('auth.register.bySmsHelp'),
                icon: MessageSquareText,
              },
            ]}
          />
          {channel === 'sms' && (
            <>
              <Input
                label={t('auth.register.phone')}
                help={t('auth.register.phoneHelp')}
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={draft.phone ?? ''}
                onChange={(e) => {
                  update({ phone: e.target.value });
                  if (fieldError) setFieldError(null);
                }}
                error={fieldError ?? undefined}
              />
              <Checkbox
                label={t('auth.register.consent')}
                help={t('auth.register.consentHelp')}
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  if (e.target.checked) setConsentError(null);
                }}
                error={consentError ?? undefined}
              />
            </>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? t('auth.code.sending') : t('auth.code.send')}
          </Button>
        </form>
        {back('password')}
      </AuthLayout>
    );
  }

  if (draft.step === 'exists') {
    return (
      <AuthLayout>
        <StepHeading
          title={t('auth.register.existsTitle')}
          intro={t('auth.register.existsBody', { email: draft.email })}
          focusOnShow
        />
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            onClick={() => {
              saveDraft(null);
              navigate('/login', { state: { identifier: draft.email } });
            }}
          >
            {t('auth.register.logInInstead')}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => goTo('email')}>
            {t('auth.register.useAnother')}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (draft.step === 'email') {
    return (
      <AuthLayout>
        <StepHeading
          {...step}
          title={t('auth.register.emailTitle')}
          intro={t('auth.register.emailIntro')}
          focusOnShow
        />
        {error && <FormAlert>{error}</FormAlert>}
        <form onSubmit={(e) => void onEmail(e)} noValidate className="flex flex-col gap-5">
          <Input
            label={t('auth.register.email')}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={draft.email}
            onChange={(e) => {
              update({ email: e.target.value });
              setSuggestion(null);
              if (fieldError) setFieldError(null);
            }}
            error={fieldError ?? undefined}
          />
          {suggestion && (
            <div
              role="status"
              className="flex flex-col gap-3 rounded-xl border-2 border-important-bar bg-important-soft p-4"
            >
              <p className="flex items-start gap-2 text-lg font-bold">
                <Lightbulb aria-hidden="true" className="mt-1 size-5 shrink-0" />
                {t('auth.register.didYouMean', { suggestion })}
              </p>
              <Button
                variant="secondary"
                className="self-start"
                onClick={(e) => {
                  update({ email: suggestion });
                  setSuggestion('');
                  void onEmail(e, suggestion);
                }}
              >
                {t('auth.register.useSuggestion')}
              </Button>
            </div>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? t('auth.login.checking') : t('auth.login.continue')}
          </Button>
        </form>
        {back('role')}
      </AuthLayout>
    );
  }

  if (draft.step === 'name') {
    return (
      <AuthLayout>
        <StepHeading {...step} title={t('auth.register.nameTitle')} focusOnShow />
        <form onSubmit={onName} noValidate className="flex flex-col gap-5">
          <Input
            label={t('auth.register.name')}
            help={t('auth.register.nameHelp')}
            name="name"
            autoComplete="name"
            value={draft.name}
            onChange={(e) => {
              update({ name: e.target.value });
              if (fieldError) setFieldError(null);
            }}
            error={fieldError ?? undefined}
          />
          <Button type="submit" size="lg">
            {t('auth.login.continue')}
          </Button>
        </form>
        {back('email')}
      </AuthLayout>
    );
  }

  if (draft.step === 'password') {
    const rules = [
      { ok: longEnough, label: t('auth.register.ruleLength') },
      { ok: notCommon, label: t('auth.register.ruleCommon') },
    ];
    return (
      <AuthLayout>
        <StepHeading {...step} title={t('auth.register.passwordTitle')} focusOnShow />
        {error && <FormAlert>{error}</FormAlert>}
        <form onSubmit={onPassword} noValidate className="flex flex-col gap-5">
          {/* For password managers: which account this new password belongs to. */}
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={draft.email}
            readOnly
            hidden
          />
          <PasswordInput
            label={t('auth.register.password')}
            help={t('auth.register.passwordHelp')}
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            error={fieldError ?? undefined}
          />
          <ul className="flex flex-col gap-2">
            {rules.map((rule) => (
              <li
                key={rule.label}
                className={`flex items-center gap-2 text-lg ${rule.ok ? 'font-bold text-kf-primary-text' : 'text-ink-muted'}`}
              >
                {rule.ok ? (
                  <Check aria-hidden="true" className="size-5 shrink-0" />
                ) : (
                  <Circle aria-hidden="true" className="size-5 shrink-0" />
                )}
                {rule.label}
                <span className="sr-only">{rule.ok ? ' ✓' : ''}</span>
              </li>
            ))}
          </ul>
          <Button type="submit" size="lg">
            {t('auth.login.continue')}
          </Button>
        </form>
        {back('name')}
      </AuthLayout>
    );
  }

  // Step 1: looking for work or hiring.
  return (
    <AuthLayout>
      <StepHeading {...step} title={t('auth.register.roleQuestion')} />
      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.role) goTo('email');
          else setFieldError(t('validation.choose'));
        }}
      >
        <ChoiceCards<SignUpRole>
          legend={t('auth.register.roleQuestion')}
          hideLegend
          name="role"
          value={draft.role}
          error={fieldError ?? undefined}
          onChange={(role) => {
            update({ role });
            setFieldError(null);
          }}
          choices={[
            {
              value: 'worker',
              label: t('auth.register.worker'),
              help: t('auth.register.workerHelp'),
              icon: UserRound,
            },
            {
              value: 'business',
              label: t('auth.register.business'),
              help: t('auth.register.businessHelp'),
              icon: Briefcase,
            },
          ]}
        />
        <Button type="submit" size="lg">
          {t('auth.login.continue')}
        </Button>
      </form>
      <p className="text-lg">
        {t('auth.register.haveAccount')}{' '}
        <Link to="/login" className="font-bold text-kf-primary-text underline underline-offset-4">
          {t('auth.register.login')}
        </Link>
      </p>
    </AuthLayout>
  );
}
