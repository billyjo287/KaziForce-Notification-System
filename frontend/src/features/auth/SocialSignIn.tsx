import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, oauthStartUrl, type OAuthProvider } from '../../lib/api';

/**
 * "Continue with Google" / "Continue with GitHub" (ADR 0022). Shows only the providers the server
 * has keys for, so nothing appears until they are set up. The button is a plain link: the whole
 * page goes to Google or GitHub and comes back logged in (/oauth/done).
 *
 * Sign-up passes the role chosen on the first step; log-in sends none (an unknown account is sent
 * back to sign-up to choose it).
 */
export function SocialSignIn({
  intent,
  role,
  terms,
}: {
  intent: 'login' | 'signup';
  role?: 'worker' | 'business';
  /** Sign-up: the Terms and Privacy box was ticked on the first step. */
  terms?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [providers, setProviders] = useState<OAuthProvider[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await api.get<{ providers: OAuthProvider[] }>('/auth/oauth/providers');
        if (live) setProviders(res.data.providers);
      } catch {
        // No buttons: the password way still works.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (providers.length === 0) return null;
  const lang = i18n.language === 'sw' ? 'sw' : 'en';
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-3 text-ink-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line-strong" />
        {t('auth.social.or')}
        <span className="h-px flex-1 bg-line-strong" />
      </p>
      {providers.map((provider) => (
        <a
          key={provider}
          href={oauthStartUrl(provider, { intent, role, lang, terms })}
          className="flex min-h-14 items-center justify-center gap-3 rounded-xl border-2 border-line-strong bg-surface px-4 text-lg font-bold text-ink hover:bg-surface-sunken"
        >
          {provider === 'google' ? <GoogleIcon /> : <GitHubIcon />}
          {t(`auth.social.${provider}`)}
        </a>
      ))}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-6 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 shrink-0" fill="currentColor">
      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z" />
    </svg>
  );
}
