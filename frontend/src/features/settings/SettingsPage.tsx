import { ChevronRight, LogOut, MonitorSmartphone } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useUpdateLanguage } from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { HelpText } from '../../components/ui/Field';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { LANGUAGES, type Language } from '../../i18n';
import { api } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { sidePath, useAuth, type AuthNotice } from '../../stores/auth';
import { useSettings, type TextSize } from '../../stores/settings';
import { showToast } from '../../stores/toasts';

const TEXT_SIZES: TextSize[] = ['normal', 'large'];

/**
 * Settings shared by all three sides: profile link, language, text size, reduce motion, and
 * logging out (here or on every device). Notification settings arrive in Phase 6.
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('settings.title'));
  const { textSize, reduceMotion, setTextSize, setReduceMotion } = useSettings();
  const textSizeId = useId();
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);
  const updateLanguage = useUpdateLanguage();
  const navigate = useNavigate();
  const errorMessage = useApiErrorMessage();
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = () => showToast({ message: t('settings.saved') });

  async function logOut(everywhere: boolean) {
    setBusy(true);
    try {
      await api.post(everywhere ? '/auth/logout-all' : '/auth/logout');
      const notice: AuthNotice = everywhere ? 'loggedOutAll' : 'loggedOut';
      queryClient.clear(); // forget this person's data on this device
      clear(notice);
      navigate('/login', { replace: true });
    } catch (error) {
      showToast({ message: errorMessage(error) });
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-3xl font-bold">{t('settings.title')}</h1>

      {user && user.role !== 'admin' && (
        <Link
          to={`${sidePath(user.role)}/settings/profile`}
          className="mb-6 flex min-h-16 items-center gap-4 rounded-xl border border-line bg-surface p-5 hover:border-line-strong"
        >
          <span className="flex-1">
            <span className="block text-xl font-bold">
              {t(user.role === 'business' ? 'settings.companyLink' : 'settings.profileLink')}
            </span>
            <span className="block text-ink-muted">
              {t(
                user.role === 'business' ? 'settings.companyLinkHelp' : 'settings.profileLinkHelp',
              )}
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="size-6 shrink-0 text-ink-muted" />
        </Link>
      )}

      <Card>
        <h2 className="mb-5 text-xl font-bold">{t('settings.display')}</h2>
        <div className="flex flex-col gap-8">
          <Select
            label={t('settings.language.label')}
            help={t('settings.language.help')}
            value={i18n.language}
            options={LANGUAGES.map((lng) => ({
              value: lng,
              label: t(`languages.${lng}`),
              lang: lng,
            }))}
            onValueChange={(lng) => {
              void i18n.changeLanguage(lng as Language).then(confirm);
              // Remember it on the account too, so emails and SMS use it (and other devices).
              if (user) updateLanguage.mutate(lng as Language);
            }}
          />

          {/* Two choices: big radio buttons are simpler than a dropdown. */}
          <fieldset aria-describedby={`${textSizeId}-help`}>
            <legend className="text-lg font-bold">{t('settings.textSize.label')}</legend>
            <HelpText id={`${textSizeId}-help`}>{t('settings.textSize.help')}</HelpText>
            <div className="mt-3 flex flex-wrap gap-3">
              {TEXT_SIZES.map((size) => (
                <label
                  key={size}
                  className="flex min-h-12 min-w-40 flex-1 cursor-pointer items-center gap-3 rounded-xl border-2 sm:flex-none border-line-strong bg-surface px-4 font-bold has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
                >
                  <input
                    type="radio"
                    name="text-size"
                    value={size}
                    checked={textSize === size}
                    onChange={() => {
                      setTextSize(size);
                      confirm();
                    }}
                    className="size-5 accent-(--kf-primary) focus-visible:outline-none"
                  />
                  <span className={size === 'large' ? 'text-xl' : ''}>
                    {t(`settings.textSize.${size}`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Switch
            label={t('settings.reduceMotion.label')}
            help={t('settings.reduceMotion.help')}
            checked={reduceMotion}
            onCheckedChange={(on) => {
              setReduceMotion(on);
              confirm();
            }}
          />
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-5 text-xl font-bold">{t('settings.account')}</h2>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-start gap-2">
            <Button variant="secondary" onClick={() => logOut(false)} disabled={busy}>
              <LogOut aria-hidden="true" className="size-5" />
              {t('settings.logout')}
            </Button>
            <p className="text-ink-muted">{t('settings.logoutHelp')}</p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Button variant="danger" onClick={() => setLogoutAllOpen(true)} disabled={busy}>
              <MonitorSmartphone aria-hidden="true" className="size-5" />
              {t('settings.logoutAll')}
            </Button>
            <p className="text-ink-muted">{t('settings.logoutAllHelp')}</p>
          </div>
        </div>
      </Card>

      <Dialog
        open={logoutAllOpen}
        onOpenChange={setLogoutAllOpen}
        title={t('settings.logoutAllTitle')}
        description={t('settings.logoutAllBody')}
      >
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setLogoutAllOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => logOut(true)} disabled={busy}>
            {t('settings.logoutAllConfirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
