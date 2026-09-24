import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLiveStatus } from '../../lib/liveConnection';
import { useOnline } from '../../lib/useOnline';

/**
 * Shown while the device has no connection, or while the live connection for new alerts is
 * reconnecting (PRD 6.9). `forceShow` is for the component gallery.
 */
export function OfflineBanner({ forceShow = false }: { forceShow?: boolean }) {
  const { t } = useTranslation();
  const online = useOnline();
  const reconnecting = useLiveStatus((s) => s.status === 'reconnecting');
  const visible = forceShow || !online || reconnecting;

  return (
    <div role="status">
      {visible && (
        <p className="mb-4 flex items-center gap-3 rounded-xl border-2 border-important-bar bg-important-soft px-4 py-3 font-bold text-important">
          <WifiOff aria-hidden="true" className="size-6 shrink-0" />
          {t(!online || forceShow ? 'offline.message' : 'offline.reconnecting')}
        </p>
      )}
    </div>
  );
}
