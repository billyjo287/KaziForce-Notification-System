import { Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { showToast } from '../../stores/toasts';
import './strings';

/** The file name the server suggests, e.g. "kaziforce-my-data-2026-11-07.json". */
function fileName(disposition: string | undefined) {
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? 'kaziforce-my-data.json';
}

/**
 * "Download my data" (Kenya Data Protection Act 2019, right of access; BT-11): one file with
 * everything KaziForce keeps about the person (GET /api/me/export). Saved straight to the phone or
 * computer, like any download.
 */
export function DownloadMyData() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await api.get<Blob>('/me/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName(res.headers['content-disposition'] as string | undefined);
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast({ message: t('settings.myData.done') });
    } catch {
      showToast({ message: t('settings.myData.error') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" onClick={() => void download()} disabled={busy}>
        <Download aria-hidden="true" className="size-5" />
        {busy ? t('settings.myData.busy') : t('settings.myData.button')}
      </Button>
      <p className="text-ink-muted">{t('settings.myData.help')}</p>
    </div>
  );
}
