import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button } from '../../components/ui/Button';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { api } from '../../lib/api';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { homePath, useAuth } from '../../stores/auth';
import type { Session } from '../../types/api';
import { AuthLayout } from './AuthLayout';
import { safeNext } from './safeNext';

const schema = z.object({
  email: z.email('validation.email'),
  password: z.string().min(1, 'validation.required'),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const { t } = useTranslation();
  usePageTitle(t('auth.login.title'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const notice = useAuth((s) => s.notice);
  const setSession = useAuth((s) => s.setSession);
  const errorMessage = useApiErrorMessage();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const { data } = await api.post<Session>('/auth/login', values);
      setSession(data);
      const destination = data.user.onboardingCompleted
        ? (safeNext(params.get('next')) ?? homePath(data.user.role))
        : '/onboarding';
      navigate(destination, { replace: true });
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });

  return (
    <AuthLayout>
      <div>
        <h1 className="text-3xl font-bold">{t('auth.login.title')}</h1>
        <p className="mt-2 text-lg text-ink-muted">{t('auth.login.intro')}</p>
      </div>

      {notice && !serverError && (
        <FormAlert tone={notice === 'suspended' ? 'error' : 'success'}>
          {t(`auth.notices.${notice}`)}
        </FormAlert>
      )}
      {serverError && <FormAlert>{serverError}</FormAlert>}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Input
          label={t('auth.login.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email && t(errors.email.message ?? 'validation.required')}
          {...register('email')}
        />
        <PasswordInput
          label={t('auth.login.password')}
          autoComplete="current-password"
          error={errors.password && t(errors.password.message ?? 'validation.required')}
          {...register('password')}
        />
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {t('auth.login.submit')}
        </Button>
      </form>

      <div className="flex flex-col gap-3 text-lg">
        <Link
          to="/forgot-password"
          className="min-h-11 font-bold text-primary underline underline-offset-4"
        >
          {t('auth.login.forgot')}
        </Link>
        <p>
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="font-bold text-primary underline underline-offset-4">
            {t('auth.login.register')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
