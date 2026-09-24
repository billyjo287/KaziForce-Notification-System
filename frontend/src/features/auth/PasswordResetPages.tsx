import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { api } from '../../lib/api';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { AuthLayout } from './AuthLayout';

const forgotSchema = z.object({ email: z.email('validation.email') });
const resetSchema = z.object({
  password: z.string().min(8, 'validation.passwordMin').max(128, 'validation.tooLong'),
});

function BackToLogin() {
  const { t } = useTranslation();
  return (
    <Link
      to="/login"
      className="min-h-11 text-lg font-bold text-primary underline underline-offset-4"
    >
      {t('auth.forgot.backToLogin')}
    </Link>
  );
}

/** "Forgot your password?": always the same answer, so nobody can test which emails exist. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  usePageTitle(t('auth.forgot.title'));
  const errorMessage = useApiErrorMessage();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api.post('/auth/forgot-password', values);
      setSent(true);
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });

  return (
    <AuthLayout>
      <div>
        <h1 className="text-3xl font-bold">{t('auth.forgot.title')}</h1>
        <p className="mt-2 text-lg text-ink-muted">{t('auth.forgot.intro')}</p>
      </div>
      {sent ? (
        <FormAlert tone="success">{t('auth.forgot.sent')}</FormAlert>
      ) : (
        <>
          {serverError && <FormAlert>{serverError}</FormAlert>}
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <Input
              label={t('auth.forgot.email')}
              type="email"
              inputMode="email"
              autoComplete="email"
              error={errors.email && t(errors.email.message ?? 'validation.required')}
              {...register('email')}
            />
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {t('auth.forgot.submit')}
            </Button>
          </form>
        </>
      )}
      <BackToLogin />
    </AuthLayout>
  );
}

/** The page the emailed link opens: /reset-password?token=… */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  usePageTitle(t('auth.reset.title'));
  const [params] = useSearchParams();
  const token = params.get('token');
  const errorMessage = useApiErrorMessage();
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api.post('/auth/reset-password', { token, password: values.password });
      setDone(true);
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold">{t('auth.reset.title')}</h1>
      {!token ? (
        <>
          <FormAlert>{t('auth.reset.missingToken')}</FormAlert>
          <Link to="/forgot-password" className={buttonClasses('primary', 'lg')}>
            {t('auth.reset.askAgain')}
          </Link>
        </>
      ) : done ? (
        <>
          <FormAlert tone="success">{t('auth.reset.done')}</FormAlert>
          <Link to="/login" className={buttonClasses('primary', 'lg')}>
            {t('auth.login.submit')}
          </Link>
        </>
      ) : (
        <>
          {serverError && <FormAlert>{serverError}</FormAlert>}
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <PasswordInput
              label={t('auth.reset.password')}
              help={t('auth.reset.passwordHelp')}
              autoComplete="new-password"
              error={errors.password && t(errors.password.message ?? 'validation.required')}
              {...register('password')}
            />
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {t('auth.reset.submit')}
            </Button>
          </form>
          <BackToLogin />
        </>
      )}
    </AuthLayout>
  );
}
