import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ChoiceCards } from '../../components/ui/ChoiceCards';
import { Dialog } from '../../components/ui/Dialog';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { showToast } from '../../stores/toasts';
import { AlertCard } from '../alerts/AlertCard';
import { useAudienceSize, useSendAnnouncement, type Audience } from './adminApi';
import './strings';

const AUDIENCES: Audience[] = ['everyone', 'worker', 'business'];
const MAX_MESSAGE = 1000;

/**
 * Announcements (PRD FR-2.4): who gets it, a title and a message, and a live preview of the alert
 * as people will see it. "Send" asks once, because an announcement cannot be taken back.
 */
export default function AnnouncementsPage() {
  const { t } = useTranslation();
  usePageTitle(t('admin.announce.title'));
  const [audience, setAudience] = useState<Audience>('everyone');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<{ title?: string; message?: string }>({});
  const [confirming, setConfirming] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const { data: people } = useAudienceSize(audience);
  const send = useSendAnnouncement();
  const errorMessage = useApiErrorMessage();

  function check(event: FormEvent) {
    event.preventDefault();
    const found = {
      title:
        title.trim().length < 3
          ? t(title.trim() ? 'validation.titleMin' : 'validation.required')
          : undefined,
      message: message.trim() ? undefined : t('validation.required'),
    };
    setErrors(found);
    if (!found.title && !found.message) setConfirming(true);
  }

  async function sendNow() {
    setSendError(undefined);
    try {
      await send.mutateAsync({ audience, title: title.trim(), message: message.trim() });
      setConfirming(false);
      setTitle('');
      setMessage('');
      showToast({ message: t('admin.announce.sent') });
    } catch (e) {
      setSendError(errorMessage(e));
    }
  }

  const count = people ?? 0;

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold">{t('admin.announce.title')}</h1>
      <p className="mt-2 mb-6 text-lg text-ink-muted">{t('admin.announce.intro')}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <form onSubmit={check} noValidate className="flex flex-col gap-6">
            <ChoiceCards<Audience>
              legend={t('admin.announce.audience')}
              help={
                people === undefined
                  ? t('admin.announce.reachLoading')
                  : t('admin.announce.reach', { count })
              }
              name="audience"
              value={audience}
              onChange={setAudience}
              choices={AUDIENCES.map((a) => ({
                value: a,
                label: t(`admin.announce.audiences.${a}`),
              }))}
            />
            <Input
              label={t('admin.announce.titleLabel')}
              help={t('admin.announce.titleHelp')}
              error={errors.title}
              value={title}
              maxLength={120}
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((old) => ({ ...old, title: undefined }));
              }}
            />
            <div className="flex flex-col gap-1">
              <Textarea
                label={t('admin.announce.message')}
                help={t('admin.announce.messageHelp')}
                error={errors.message}
                value={message}
                maxLength={MAX_MESSAGE}
                rows={5}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setErrors((old) => ({ ...old, message: undefined }));
                }}
              />
              <p className="text-ink-muted" aria-live="polite">
                {t('admin.announce.left', { count: MAX_MESSAGE - message.length })}
              </p>
            </div>
            <Button type="submit" size="lg" disabled={people === undefined}>
              {t('admin.announce.send', { count })}
            </Button>
          </form>
        </Card>

        <section aria-labelledby="preview-title">
          <h2 id="preview-title" className="mb-3 text-xl font-bold">
            {t('admin.announce.preview')}
          </h2>
          {/* The real alert card, so the preview is exactly what people will see. */}
          <div inert>
            <AlertCard
              alert={{
                id: 'preview',
                priority: 'low',
                type: 'announcement',
                title: title.trim() || t('admin.announce.previewEmpty'),
                body: message.trim() || '…',
                sender: t('admin.announce.sender'),
                createdAt: new Date(),
                readAt: null,
              }}
              selected={false}
              onOpen={() => undefined}
            />
          </div>
        </section>
      </div>

      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('admin.announce.confirmTitle')}
        description={`${t('admin.announce.reach', { count })} ${t('admin.announce.confirmBody')}`}
      >
        <div className="flex flex-col gap-4">
          {sendError && <FormAlert>{sendError}</FormAlert>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void sendNow()} disabled={send.isPending}>
              {t('admin.announce.confirm')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
