import { zodResolver } from '@hookform/resolvers/zod';
import { Briefcase, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '../../components/ui/Button';
import { ChoiceCards } from '../../components/ui/ChoiceCards';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { api } from '../../lib/api';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAuth } from '../../stores/auth';
import type { Session } from '../../types/api';
import { AuthLayout } from './AuthLayout';

type SignUpRole = 'worker' | 'business';

const schema = z
  .object({
    name: z.string().trim().min(2, 'validation.nameMin').max(80, 'validation.tooLong'),
    email: z.email('validation.email'),
    password: z.string().min(8, 'validation.passwordMin').max(128, 'validation.tooLong'),
    // Typed twice so a typing mistake cannot lock the person out of their new account.
    confirmPassword: z.string().min(1, 'validation.confirmPassword'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'validation.passwordsDiffer',
  });
type Form = z.infer<typeof schema>;

/**
 * Sign-up. Onboarding step 1 ("I'm looking for work" / "I'm hiring") comes first, then name,
 * email and password. Admins are never created here (only by the seed script).
 */
export default function RegisterPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('auth.register.title'));
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const errorMessage = useApiErrorMessage();
  const [role, setRole] = useState<SignUpRole | undefined>();
  const [roleChosen, setRoleChosen] = useState(false);
  const [roleError, setRoleError] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  // Move focus to the new heading when the step changes (screen readers hear the new step).
  useEffect(() => {
    if (roleChosen) heading.current?.focus();
  }, [roleChosen]);

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setServerError(null);
    try {
      // The repeated password is only checked here; the server gets it once.
      const { data } = await api.post<Session>('/auth/register', {
        name,
        email,
        password,
        role,
        language: i18n.language,
      });
      setSession(data);
      navigate('/onboarding', { replace: true });
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });

  if (!roleChosen) {
    return (
      <AuthLayout>
        <div>
          <p className="font-bold text-ink-muted">{t('auth.register.step', { step: 1 })}</p>
          <h1 className="mt-1 text-3xl font-bold">{t('auth.register.roleQuestion')}</h1>
        </div>
        <ChoiceCards<SignUpRole>
          legend={t('auth.register.roleQuestion')}
          hideLegend
          name="role"
          value={role}
          error={roleError ? t('validation.choose') : undefined}
          onChange={(value) => {
            setRole(value);
            setRoleError(false);
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
        <Button size="lg" onClick={() => (role ? setRoleChosen(true) : setRoleError(true))}>
          {t('common.continue')}
        </Button>
        <p className="text-lg">
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" className="font-bold text-primary underline underline-offset-4">
            {t('auth.register.login')}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div>
        <p className="font-bold text-ink-muted">{t('auth.register.step', { step: 1 })}</p>
        <h1 ref={heading} tabIndex={-1} className="mt-1 text-3xl font-bold outline-none">
          {t('auth.register.detailsTitle')}
        </h1>
        <p className="mt-2 text-lg text-ink-muted">
          {role === 'business' ? t('auth.register.business') : t('auth.register.worker')}
        </p>
      </div>

      {serverError && <FormAlert>{serverError}</FormAlert>}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Input
          label={t('auth.register.name')}
          autoComplete="name"
          error={errors.name && t(errors.name.message ?? 'validation.required')}
          {...register('name')}
        />
        <Input
          label={t('auth.register.email')}
          help={t('auth.register.emailHelp')}
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email && t(errors.email.message ?? 'validation.required')}
          {...register('email')}
        />
        <PasswordInput
          label={t('auth.register.password')}
          help={t('auth.register.passwordHelp')}
          autoComplete="new-password"
          error={errors.password && t(errors.password.message ?? 'validation.required')}
          {...register('password')}
        />
        <PasswordInput
          label={t('auth.register.confirmPassword')}
          autoComplete="new-password"
          error={
            errors.confirmPassword && t(errors.confirmPassword.message ?? 'validation.required')
          }
          {...register('confirmPassword')}
        />
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {t('auth.register.submit')}
        </Button>
        <Button variant="ghost" onClick={() => setRoleChosen(false)}>
          {t('common.back')}
        </Button>
      </form>
    </AuthLayout>
  );
}
