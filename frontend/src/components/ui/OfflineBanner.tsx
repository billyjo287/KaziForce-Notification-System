import { useTranslation } from 'react-i18next';
import { useLiveStatus } from '../../lib/liveConnection';
import { useOnline } from '../../lib/useOnline';
import { useAuth } from '../../stores/auth';

/** Signal bars that fade in one after another; only the first stays strong (weak or no signal). */
function SignalBars() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      {[0, 1, 2, 3].map((i) => (
        <g key={i} opacity={i === 0 ? 1 : 0.3}>
          <rect
            className="kf-fade-in"
            style={{ animationDelay: `${i * 150}ms` }}
            x={4 + i * 9}
            y={30 - i * 7}
            width="6"
            height={6 + i * 7}
            rx="2"
            fill="currentColor"
          />
        </g>
      ))}
    </svg>
  );
}

/**
 * Shown while the device has no connection, or while the live connection for new alerts is
 * reconnecting (PRD 6.9). It goes away by itself when the connection is back. The SMS promise
 * and chip only appear for people who really get SMS (a confirmed phone with SMS among their
 * channels). `forceShow` is for the component gallery.
 */
export function OfflineBanner({ forceShow = false }: { forceShow?: boolean }) {
  const { t } = useTranslation();
  const online = useOnline();
  const reconnecting = useLiveStatus((s) => s.status === 'reconnecting');
  const smsOn = useAuth(
    (s) => !!s.user?.phoneVerified && !!s.user.preference?.channelOrder.includes('sms'),
  );
  const offline = !online || forceShow;

  return (
    <div role="status">
      {offline ? (
        <div className="mb-4 flex items-start gap-3 rounded-kf-lg border-2 border-important-bar bg-important-soft px-4 py-3 text-important">
          <SignalBars />
          <div className="flex flex-col items-start gap-1">
            <p className="text-lg font-bold">{t('offline.title')}</p>
            <p>{t(smsOn ? 'offline.bodySms' : 'offline.body')}</p>
            {smsOn && (
              <p className="mt-1 inline-flex items-center gap-2 rounded-full bg-kf-success-bg px-3 py-1 text-sm font-bold text-kf-success-fg">
                <span aria-hidden="true" className="size-2 rounded-full bg-kf-success-solid" />
                {t('offline.chip')}
              </p>
            )}
          </div>
        </div>
      ) : (
        reconnecting && (
          <p className="mb-4 flex items-center gap-3 rounded-kf-lg border-2 border-important-bar bg-important-soft px-4 py-3 font-bold text-important">
            <SignalBars />
            {t('offline.reconnecting')}
          </p>
        )
      )}
    </div>
  );
}
