import { X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
}

/**
 * Accessible dialog (focus is trapped inside, Esc closes it, focus returns afterwards).
 * On phones it rises from the bottom like a sheet, within thumb reach.
 */
export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  const { t } = useTranslation();

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <RadixDialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink shadow-xl sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="flex items-start justify-between gap-4">
            <RadixDialog.Title className="text-2xl font-bold">{title}</RadixDialog.Title>
            <RadixDialog.Close
              aria-label={t('common.close')}
              className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-lg hover:bg-canvas"
            >
              <X aria-hidden="true" className="size-6" />
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="mt-2 text-lg text-ink-muted">
              {description}
            </RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          {children && <div className="mt-5">{children}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;
