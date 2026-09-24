import { CircleCheck, X } from 'lucide-react';
import { Toast } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { useToasts } from '../../stores/toasts';

// Long enough for an older user to read the message and reach "Undo" (it also pauses while
// the pointer or keyboard focus is on it).
const DURATION_MS = 8000;

/** Shows the messages from the toast store. Press F8 to jump to a message with the keyboard. */
export function Toaster() {
  const { t } = useTranslation();
  const toasts = useToasts((s) => s.toasts);
  const remove = useToasts((s) => s.remove);

  return (
    <Toast.Provider duration={DURATION_MS} swipeDirection="down" label={t('common.close')}>
      {toasts.map((toast) => (
        <Toast.Root
          key={toast.id}
          onOpenChange={(open) => {
            if (!open) remove(toast.id);
          }}
          className="flex items-center gap-3 rounded-xl bg-ink p-3 pl-4 text-canvas shadow-xl"
        >
          <CircleCheck aria-hidden="true" className="size-6 shrink-0" />
          <Toast.Title className="flex-1">{toast.message}</Toast.Title>
          {toast.actionLabel && toast.onAction && (
            <Toast.Action
              altText={toast.actionLabel}
              onClick={toast.onAction}
              className="min-h-11 shrink-0 rounded-lg border-2 border-canvas px-4 font-bold hover:bg-canvas hover:text-ink"
            >
              {toast.actionLabel}
            </Toast.Action>
          )}
          <Toast.Close
            aria-label={t('common.close')}
            className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-canvas/15"
          >
            <X aria-hidden="true" className="size-5" />
          </Toast.Close>
        </Toast.Root>
      ))}
      {/* Above the phone bottom menu; bottom-right on larger screens. */}
      <Toast.Viewport className="fixed inset-x-3 bottom-20 z-50 flex flex-col gap-2 outline-none md:inset-x-auto md:right-6 md:bottom-6 md:w-md" />
    </Toast.Provider>
  );
}

export default Toaster;
