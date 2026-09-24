import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnline } from '../../lib/useOnline';

/**
 * Shown while the device has no connection (PRD 6.9). Phase 3 also uses it while the live
 * connection (Socket.IO) is reconnecting. `forceShow` is for the component gallery.
 */
export function OfflineBanner({ forceShow = false }: { forceShow?: boolean }) {
  const { t } = useTranslation();
  const online = useOnline();
  const visible = forceShow || !online;

  return (
    <div role="status">
      {visible && (
        <p className="mb-4 flex items-center gap-3 rounded-xl border-2 border-important-bar bg-important-soft px-4 py-3 font-bold text-important">
          <WifiOff aria-hidden="true" className="size-6 shrink-0" />
          {t('offline.message')}
        </p>
      )}
    </div>
  );
}
