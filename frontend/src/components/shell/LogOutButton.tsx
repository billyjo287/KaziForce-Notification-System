import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLogOut } from '../../lib/useLogOut';
import { headerButtonClasses } from '../headerButtonStyles';

/** Log out of this device, from any page. ("Log out of all devices" stays in Settings.) */
export function LogOutButton({
  compact = false,
  wide = false,
}: {
  compact?: boolean;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  const { logOut, busy } = useLogOut();
  return (
    <button
      type="button"
      onClick={() => void logOut()}
      disabled={busy}
      className={`${headerButtonClasses(compact)} ${wide ? 'w-full justify-center' : ''}`}
    >
      <LogOut aria-hidden="true" className="size-5 shrink-0" />
      {t('settings.logout')}
    </button>
  );
}
