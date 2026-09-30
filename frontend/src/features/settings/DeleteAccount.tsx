import { ShieldCheck, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCancelDeletion, useRequestDeletion } from './settingsApi';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { useAuth } from '../../stores/auth';
import { showToast } from '../../stores/toasts';
import './strings';

/**
 * Account deletion (Kenya Data Protection Act 2019, PRD NFR-2): asks for the password, then the
 * account is deleted after 14 days. Until then this shows the day and a "Keep my account" button.
 */
export function DeleteAccount() {
  const { t, i18n } = useTranslation();
  const user = useAuth((s) => s.user);
  const request = useRequestDeletion();
  const cancel = useCancelDeletion();
  const errorMessage = useApiErrorMessage();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === 'sw' ? 'sw-KE' : 'en-KE', {
      timeZone: 'Africa/Nairobi',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      setPassword('');
      setError(undefined);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!password) {
      setError(t('validation.required'));
      return;
    }
    request.mutate(password, {
      onSuccess: ({ user: updated }) => {
        close(false);
        showToast({
          message: t('settings.delete.requested', { date: day(updated.deletionScheduledFor!) }),
        });
      },
      onError: (e) => setError(errorMessage(e)),
    });
  }

  if (user?.deletionScheduledFor) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border-2 border-urgent bg-urgent-soft p-4">
        <p className="text-lg font-bold">
          {t('settings.delete.pending', { date: day(user.deletionScheduledFor) })}
        </p>
        <p>{t('settings.delete.pendingHelp')}</p>
        <Button
          onClick={() =>
            cancel.mutate(undefined, {
              onSuccess: () => showToast({ message: t('settings.delete.kept') }),
              onError: (e) => showToast({ message: errorMessage(e) }),
            })
          }
          disabled={cancel.isPending}
        >
          <ShieldCheck aria-hidden="true" className="size-5" />
          {t('settings.delete.keep')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden="true" className="size-5" />
        {t('settings.delete.button')}
      </Button>
      <p className="text-ink-muted">{t('settings.delete.help')}</p>

      <Dialog
        open={open}
        onOpenChange={close}
        title={t('settings.delete.dialogTitle')}
        description={t('settings.delete.dialogBody')}
      >
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          <PasswordInput
            label={t('settings.delete.password')}
            help={t('settings.delete.passwordHelp')}
            error={error}
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(undefined);
            }}
          />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="danger" disabled={request.isPending}>
              {t('settings.delete.confirm')}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
