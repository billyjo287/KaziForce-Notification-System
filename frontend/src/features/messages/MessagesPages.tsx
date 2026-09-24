import { CloudOff, MessageCircle, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useConversation, useConversations, useSendMessage } from '../../api/hooks';
import { Badge } from '../../components/ui/Badge';
import { BackLink } from '../../components/ui/BackLink';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { FormAlert } from '../../components/ui/FormAlert';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { Textarea } from '../../components/ui/Textarea';
import { relativeTime } from '../../lib/relativeTime';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { sidePath, useAuth } from '../../stores/auth';

function useBasePath() {
  const role = useAuth((s) => s.user?.role ?? 'worker');
  return `${sidePath(role)}/messages`;
}

/** All conversations: one per job application, newest first. */
export function ConversationsPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('messages.title'));
  const base = useBasePath();
  const { data, isPending, isError, refetch } = useConversations();

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-3xl font-bold">{t('messages.title')}</h1>
      {isPending && <CardListSkeleton count={3} />}
      {isError && (
        <EmptyState
          role="alert"
          icon={CloudOff}
          title={t('messages.errorTitle')}
          body={t('apiErrors.network')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('common.tryAgain')}
            </Button>
          }
        />
      )}
      {data?.length === 0 && (
        <EmptyState
          icon={MessageCircle}
          title={t('messages.emptyTitle')}
          body={t('messages.emptyBody')}
        />
      )}
      {data && data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {data.map((c) => (
            <li key={c.applicationId}>
              <article className="relative flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 hover:border-line-strong">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className={`text-lg ${c.unreadCount > 0 ? 'font-bold' : 'font-medium'}`}>
                    <Link
                      to={`${base}/${c.applicationId}`}
                      className="underline-offset-4 after:absolute after:inset-0 after:rounded-xl hover:underline"
                    >
                      {c.with.name}
                    </Link>
                  </h2>
                  {c.unreadCount > 0 && (
                    <Badge tone="success">{t('messages.unread', { count: c.unreadCount })}</Badge>
                  )}
                </div>
                <p className="text-ink-muted">{t('messages.about', { job: c.job.title })}</p>
                {c.lastMessage ? (
                  <p className="line-clamp-2">
                    {c.lastMessage.mine && <span className="font-bold">{t('messages.you')}: </span>}
                    {c.lastMessage.body}
                    <span className="text-ink-muted">
                      {' '}
                      · {relativeTime(new Date(c.lastMessage.sentAt), i18n.language)}
                    </span>
                  </p>
                ) : (
                  <p className="text-ink-muted">{t('messages.noMessages')}</p>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One conversation: messages oldest first, and a simple text box to reply. */
export function ConversationPage() {
  const { t, i18n } = useTranslation();
  const { applicationId = '' } = useParams();
  const base = useBasePath();
  const { data, isPending, isError, refetch } = useConversation(applicationId);
  const send = useSendMessage(applicationId);
  const errorMessage = useApiErrorMessage();
  const [body, setBody] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [sendError, setSendError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  usePageTitle(data ? data.conversation.with.name : t('messages.title'));

  const count = data?.messages.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  async function onSend(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) {
      setFieldError(t('validation.required'));
      return;
    }
    setFieldError(undefined);
    setSendError(null);
    try {
      await send.mutateAsync(text);
      setBody('');
    } catch (error) {
      setSendError(errorMessage(error));
    }
  }

  return (
    <div className="max-w-3xl">
      <BackLink to={base}>{t('messages.back')}</BackLink>
      {isPending && <CardListSkeleton count={2} />}
      {isError && (
        <EmptyState
          role="alert"
          icon={CloudOff}
          title={t('messages.errorTitle')}
          body={t('apiErrors.network')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('common.tryAgain')}
            </Button>
          }
        />
      )}
      {data && (
        <>
          <h1 className="text-3xl font-bold">{data.conversation.with.name}</h1>
          <p className="mt-1 mb-5 text-lg text-ink-muted">
            {t('messages.about', { job: data.conversation.job.title })}
          </p>

          <section
            aria-label={t('messages.title')}
            className="rounded-xl border border-line bg-surface p-4"
          >
            {data.messages.length === 0 ? (
              <p className="py-6 text-center text-ink-muted">{t('messages.noMessages')}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {data.messages.map((m) => (
                  <li
                    key={m.id}
                    className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}
                  >
                    <p
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-lg whitespace-pre-line ${
                        m.mine
                          ? 'rounded-br-md bg-primary text-on-primary'
                          : 'rounded-bl-md bg-canvas'
                      }`}
                    >
                      <span className="sr-only">
                        {m.mine ? `${t('messages.you')}: ` : `${data.conversation.with.name}: `}
                      </span>
                      {m.body}
                    </p>
                    <span className="mt-1 text-sm text-ink-muted">
                      {t(m.mine ? 'messages.sentAt' : 'messages.receivedAt', {
                        when: relativeTime(new Date(m.sentAt), i18n.language),
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <div ref={bottom} />
          </section>

          <form onSubmit={onSend} noValidate className="mt-5 flex flex-col gap-3">
            {sendError && <FormAlert>{sendError}</FormAlert>}
            <Textarea
              label={t('messages.label')}
              rows={3}
              maxLength={1000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              error={fieldError}
            />
            <Button type="submit" size="lg" disabled={send.isPending} className="self-start">
              <Send aria-hidden="true" className="size-5" />
              {send.isPending ? t('messages.sending') : t('messages.send')}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
