import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { refreshSession } from '../../lib/api';
import { usePageTitle } from '../../lib/usePageTitle';
import { homePath, useAuth } from '../../stores/auth';
import { AuthLayout, StepHeading } from './AuthLayout';
import './strings';

/**
 * Back from Google or GitHub: the server has set the login cookie, so this page fetches the
 * login token with it and goes to the person's home (or onboarding for a new account).
 */
export default function OAuthDonePage() {
  const { t } = useTranslation();
  usePageTitle(t('auth.social.finishing'));
  const navigate = useNavigate();
  const setJustLoggedIn = useAuth((s) => s.setJustLoggedIn);

  useEffect(() => {
    void (async () => {
      const ok = await refreshSession();
      const user = useAuth.getState().user;
      if (!ok || !user) {
        navigate('/login?oauth_error=expired', { replace: true });
        return;
      }
      setJustLoggedIn(true);
      navigate(user.onboardingCompleted ? homePath(user.role) : '/onboarding', { replace: true });
    })();
  }, [navigate, setJustLoggedIn]);

  return (
    <AuthLayout>
      <StepHeading title={t('auth.social.finishing')} />
      <p role="status" className="text-lg">
        {t('auth.social.finishingBody')}
      </p>
    </AuthLayout>
  );
}
