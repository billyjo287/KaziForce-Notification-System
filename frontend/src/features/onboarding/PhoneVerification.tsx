import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSendPhoneCode, useVerifyPhone } from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { formatPhone, normalizeKenyanPhone } from '../../lib/phone';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import type { User } from '../../types/api';

interface PhoneVerificationProps {
  onVerified: (user: User) => void;
  /** Heading level inside the page (onboarding uses h1, profile pages h2). */
  headingLevel?: 'h1' | 'h2';
}

/**
 * Phone number + consent, then a 6-digit SMS code (PRD FR-1). In mock mode the code is printed
 * in the backend console instead of being sent.
 */
export function PhoneVerification({
  onVerified,
  headingLevel: Heading = 'h2',
}: PhoneVerificationProps) {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const sendCode = useSendPhoneCode();
  const verify = useVerifyPhone();
  const [phoneInput, setPhoneInput] = useState('');
  const [consent, setConsent] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    phone?: string;
    consent?: string;
    code?: string;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const codeHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (phone) codeHeading.current?.focus();
  }, [phone]);

  async function requestCode(target: string) {
    setServerError(null);
    try {
      await sendCode.mutateAsync(target);
      setPhone(target);
      return true;
    } catch (error) {
      setServerError(errorMessage(error));
      return false;
    }
  }

  async function onSendCode(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizeKenyanPhone(phoneInput);
    const errors = {
      phone: normalized ? undefined : t('validation.phone'),
      consent: consent ? undefined : t('validation.consent'),
    };
    setFieldErrors(errors);
    if (normalized && consent) await requestCode(normalized);
  }

  async function onVerify(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setFieldErrors({ code: t('validation.code') });
      return;
    }
    setFieldErrors({});
    setServerError(null);
    try {
      const { user } = await verify.mutateAsync(code);
      onVerified(user);
    } catch (error) {
      setServerError(errorMessage(error));
    }
  }

  if (!phone) {
    return (
      <form onSubmit={onSendCode} noValidate className="flex flex-col gap-5">
        {serverError && <FormAlert>{serverError}</FormAlert>}
        <Input
          label={t('onboarding.phone.label')}
          help={t('onboarding.phone.help')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          error={fieldErrors.phone}
        />
        <Checkbox
          label={t('onboarding.phone.consent')}
          help={t('onboarding.phone.consentHelp')}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          error={fieldErrors.consent}
        />
        <Button type="submit" size="lg" disabled={sendCode.isPending}>
          {t('onboarding.phone.send')}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onVerify} noValidate className="flex flex-col gap-5">
      <div>
        <Heading ref={codeHeading} tabIndex={-1} className="text-2xl font-bold outline-none">
          {t('onboarding.phone.codeTitle')}
        </Heading>
        <p className="mt-1 text-lg text-ink-muted">
          {t('onboarding.phone.codeIntro', { phone: formatPhone(phone) })}
        </p>
      </div>
      {serverError && <FormAlert>{serverError}</FormAlert>}
      {resent && !serverError && (
        <FormAlert tone="success">{t('onboarding.phone.codeSent')}</FormAlert>
      )}
      <Input
        label={t('onboarding.phone.codeLabel')}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        error={fieldErrors.code}
        className="max-w-48 text-2xl tracking-[0.3em]"
      />
      <Button type="submit" size="lg" disabled={verify.isPending}>
        {t('onboarding.phone.verify')}
      </Button>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="ghost"
          disabled={sendCode.isPending}
          onClick={async () => setResent(await requestCode(phone))}
        >
          {t('onboarding.phone.resend')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setPhone(null);
            setCode('');
            setResent(false);
            setServerError(null);
          }}
        >
          {t('onboarding.phone.changeNumber')}
        </Button>
      </div>
    </form>
  );
}
