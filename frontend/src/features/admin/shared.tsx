// Pieces every admin page uses. Each admin page is its own file, so opening one does not
// download the others.
import { CloudOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import './strings';

export function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      role="alert"
      icon={CloudOff}
      title={title}
      body={t('apiErrors.network')}
      action={
        <Button variant="secondary" onClick={onRetry}>
          {t('common.tryAgain')}
        </Button>
      }
    />
  );
}
