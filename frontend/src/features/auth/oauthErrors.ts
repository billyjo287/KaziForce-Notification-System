import { useTranslation } from 'react-i18next';

/** Words for the codes the server adds to /login or /register after a failed attempt. */
export function useOAuthError(code: string | null): string | null {
  const { t } = useTranslation();
  if (!code) return null;
  const known = [
    'no_account',
    'cancelled',
    'expired',
    'email_not_verified',
    'account_suspended',
    'provider_off',
  ];
  return t(`auth.social.errors.${known.includes(code) ? code : 'other'}`);
}
