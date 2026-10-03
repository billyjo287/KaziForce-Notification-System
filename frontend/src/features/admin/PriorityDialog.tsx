import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { ChoiceCards } from '../../components/ui/ChoiceCards';
import { Dialog } from '../../components/ui/Dialog';
import { FormAlert } from '../../components/ui/FormAlert';
import { PRIORITY_STYLE } from '../alerts/priorityStyle';
import { PRIORITIES, type Priority } from '../alerts/types';
import './strings';

interface PriorityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initial: Priority;
  confirmLabel: string;
  /** Throws with a plain message if saving fails (shown in the dialog). */
  onConfirm: (priority: Priority) => Promise<void>;
}

/** Pick "Urgent", "Important" or "For later" (colour + icon + word, one line of help each). */
export function PriorityDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  confirmLabel,
  onConfirm,
}: PriorityDialogProps) {
  const { t } = useTranslation();
  const [priority, setPriority] = useState<Priority>(initial);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState(open);
  // Each time it opens, start from the current priority.
  if (open !== shownFor) {
    setShownFor(open);
    if (open) {
      setPriority(initial);
      setError(undefined);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onConfirm(priority);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <form onSubmit={submit} className="flex flex-col gap-6">
        {error && <FormAlert>{error}</FormAlert>}
        <ChoiceCards<Priority>
          legend={t('admin.spam.releasePriority')}
          name="priority"
          value={priority}
          onChange={setPriority}
          choices={PRIORITIES.map((p) => ({
            value: p,
            label: t(`priority.${p}`),
            help: t(`admin.priorityHelp.${p}`),
            icon: PRIORITY_STYLE[p].icon,
          }))}
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
