import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { FormAlert } from '../../components/ui/FormAlert';
import { Textarea } from '../../components/ui/Textarea';

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  reasonHelp: string;
  confirmLabel: string;
  /** Resolves when done; rejects with a readable message to show in the dialog. */
  onConfirm: (reason: string) => Promise<void>;
}

/** "Are you sure?" for serious admin actions. A written reason is required (goes to AuditLog). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  reasonHelp,
  confirmLabel,
  onConfirm,
}: ReasonDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 5) {
      setFieldError(t('validation.reason'));
      return;
    }
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <form onSubmit={confirm} noValidate className="flex flex-col gap-4">
        {error && <FormAlert>{error}</FormAlert>}
        <Textarea
          label={t('admin.user.reason')}
          help={reasonHelp}
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={fieldError}
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="danger" disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
