import { CloudOff, ScrollText, Search, SearchX, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  useAdminJobs,
  useAdminUser,
  useAdminUsers,
  useAuditLog,
  useRemoveJob,
  useSetUserStatus,
} from '../../api/hooks';
import { Badge } from '../../components/ui/Badge';
import { BackLink } from '../../components/ui/BackLink';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { formatPhone } from '../../lib/phone';
import { relativeTime } from '../../lib/relativeTime';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { showToast } from '../../stores/toasts';
import type { Role } from '../../types/api';
import { JobCard } from '../jobs/JobCard';
import { ReasonDialog } from './ReasonDialog';

const ANY = 'any';

function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
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

/** Search box that only searches when the button is pressed (fewer requests on slow data). */
function SearchForm({
  label,
  help,
  initial,
  onSearch,
}: {
  label: string;
  help: string;
  initial: string;
  onSearch: (q: string) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState(initial);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(q.trim());
      }}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <Input
          label={label}
          help={help}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Button type="submit" variant="secondary">
        <Search aria-hidden="true" className="size-5" />
        {t('admin.users.searchButton')}
      </Button>
    </form>
  );
}

function useParamSetter() {
  const [params, setParams] = useSearchParams();
  return {
    params,
    set: (key: string, value: string | undefined) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      setParams(next);
    },
  };
}

// ---------- Users ----------

export function UsersPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('admin.users.title'));
  const { params, set } = useParamSetter();
  const filters = {
    q: params.get('q') ?? undefined,
    role: params.get('role') ?? undefined,
    status: params.get('status') ?? undefined,
    page: Number(params.get('page') ?? 1) || 1,
  };
  const { data, isPending, isError, refetch } = useAdminUsers(filters);

  return (
    <div className="max-w-5xl">
      <h1 className="mb-6 text-3xl font-bold">{t('admin.users.title')}</h1>
      <div className="mb-6 flex flex-col gap-4">
        <SearchForm
          label={t('admin.users.search')}
          help={t('admin.users.searchHelp')}
          initial={filters.q ?? ''}
          onSearch={(q) => set('q', q || undefined)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t('admin.users.role')}
            value={filters.role ?? ANY}
            onValueChange={(v) => set('role', v === ANY ? undefined : v)}
            options={[
              { value: ANY, label: t('common.any') },
              ...(['worker', 'business', 'admin'] as const).map((r) => ({
                value: r,
                label: t(`roles.${r}`),
              })),
            ]}
          />
          <Select
            label={t('admin.users.status')}
            value={filters.status ?? ANY}
            onValueChange={(v) => set('status', v === ANY ? undefined : v)}
            options={[
              { value: ANY, label: t('common.any') },
              { value: 'active', label: t('admin.users.active') },
              { value: 'suspended', label: t('admin.users.suspended') },
            ]}
          />
        </div>
      </div>

      {isPending && <CardListSkeleton count={4} />}
      {isError && <LoadError title={t('admin.users.errorTitle')} onRetry={() => void refetch()} />}
      {data?.items.length === 0 && (
        <EmptyState
          icon={SearchX}
          title={t('admin.users.emptyTitle')}
          body={t('admin.users.emptyBody')}
        />
      )}
      {data && data.items.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {data.items.map((u) => (
              <li key={u.id}>
                <article className="relative flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 hover:border-line-strong sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold">
                      <Link
                        to={`/admin/users/${u.id}`}
                        className="underline-offset-4 after:absolute after:inset-0 after:rounded-xl hover:underline"
                      >
                        {u.companyName ? `${u.name} (${u.companyName})` : u.name}
                      </Link>
                    </h2>
                    <p className="break-all text-ink-muted">
                      {u.email}
                      {u.phone && ` · ${formatPhone(u.phone)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Badge>{t(`roles.${u.role}`)}</Badge>
                    {u.status === 'suspended' && (
                      <Badge tone="urgent" icon={ShieldAlert}>
                        {t('admin.users.suspended')}
                      </Badge>
                    )}
                    <span className="text-ink-muted">
                      {t('admin.users.joined', {
                        when: relativeTime(new Date(u.createdAt), i18n.language),
                      })}
                    </span>
                  </div>
                </article>
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            total={data.total}
            pageSize={data.pageSize}
            onPageChange={(p) => set('page', String(p))}
          />
        </>
      )}
    </div>
  );
}

export function UserDetailPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const { data, isPending, isError, refetch } = useAdminUser(id);
  const setStatus = useSetUserStatus(id);
  const errorMessage = useApiErrorMessage();
  const [suspendOpen, setSuspendOpen] = useState(false);
  usePageTitle(data?.user.name ?? t('admin.users.title'));

  if (isPending) return <CardListSkeleton count={2} />;
  if (isError)
    return <LoadError title={t('admin.users.errorTitle')} onRetry={() => void refetch()} />;

  const { user, history } = data;
  const when = (iso: string | null) =>
    iso ? relativeTime(new Date(iso), i18n.language) : t('admin.user.never');
  const role = user.role as Role;

  return (
    <div className="max-w-3xl">
      <BackLink to="/admin/users">{t('admin.user.back')}</BackLink>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{user.name}</h1>
        <Badge>{t(`roles.${role}`)}</Badge>
        {user.status === 'suspended' && (
          <Badge tone="urgent" icon={ShieldAlert}>
            {t('admin.users.suspended')}
          </Badge>
        )}
      </div>
      {user.companyName && <p className="mt-1 text-lg text-ink-muted">{user.companyName}</p>}

      <Card className="mt-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-bold">{t('admin.user.email')}</dt>
            <dd className="break-all">{user.email}</dd>
          </div>
          <div>
            <dt className="font-bold">{t('admin.user.phone')}</dt>
            <dd>{user.phone ? formatPhone(user.phone) : '—'}</dd>
          </div>
          <div>
            <dt className="font-bold">{t('admin.user.location')}</dt>
            <dd>{user.location?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-bold">{t('admin.user.lastLogin')}</dt>
            <dd>{when(user.lastLoginAt)}</dd>
          </div>
          <div>
            <dt className="font-bold">
              {t(role === 'business' ? 'admin.user.jobs' : 'admin.user.applications')}
            </dt>
            <dd>{role === 'business' ? user._count.jobsPosted : user._count.applications}</dd>
          </div>
        </dl>
      </Card>

      <Card className="mt-6">
        {user.status === 'suspended' && user.suspendedAt && (
          <p className="mb-4 text-lg">
            {t('admin.user.suspendedSince', {
              when: when(user.suspendedAt),
              reason: user.suspendedReason ?? '—',
            })}
          </p>
        )}
        {role === 'admin' ? (
          <p className="text-ink-muted">{t('admin.user.adminNote')}</p>
        ) : user.status === 'active' ? (
          <Button variant="danger" onClick={() => setSuspendOpen(true)}>
            {t('admin.user.suspend')}
          </Button>
        ) : (
          <Button
            disabled={setStatus.isPending}
            onClick={() =>
              setStatus.mutate(
                { action: 'reactivate' },
                {
                  onSuccess: () => showToast({ message: t('admin.user.reactivatedToast') }),
                  onError: (e) => showToast({ message: errorMessage(e) }),
                },
              )
            }
          >
            {t('admin.user.reactivate')}
          </Button>
        )}
      </Card>

      <h2 className="mt-8 mb-3 text-xl font-bold">{t('admin.user.history')}</h2>
      {history.length === 0 ? (
        <p className="text-ink-muted">{t('admin.user.noHistory')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {history.map((h) => (
            <li key={h.id} className="rounded-xl border border-line bg-surface p-3">
              <p className="font-bold">
                {t(`admin.audit.actions.${h.action.replace('.', '_')}`, { defaultValue: h.action })}
              </p>
              <p className="text-ink-muted">
                {t('admin.audit.by', { name: h.by })} · {when(h.at)}
                {h.reason && ` · ${h.reason}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      <ReasonDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title={t('admin.user.suspendTitle', { name: user.name })}
        description={t('admin.user.suspendBody')}
        reasonHelp={t('admin.user.reasonHelp')}
        confirmLabel={t('admin.user.suspendConfirm')}
        onConfirm={async (reason) => {
          try {
            await setStatus.mutateAsync({ action: 'suspend', reason });
            showToast({ message: t('admin.user.suspendedToast') });
          } catch (e) {
            throw new Error(errorMessage(e), { cause: e });
          }
        }}
      />
    </div>
  );
}

// ---------- Jobs ----------

export function AdminJobsPage() {
  const { t } = useTranslation();
  usePageTitle(t('admin.jobs.title'));
  const { params, set } = useParamSetter();
  const filters = {
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    page: Number(params.get('page') ?? 1) || 1,
  };
  const { data, isPending, isError, refetch } = useAdminJobs(filters);
  const remove = useRemoveJob();
  const errorMessage = useApiErrorMessage();
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);

  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-3xl font-bold">{t('admin.jobs.title')}</h1>
      <div className="mb-6 flex flex-col gap-4">
        <SearchForm
          label={t('admin.users.search')}
          help={t('admin.jobs.searchHelp')}
          initial={filters.q ?? ''}
          onSearch={(q) => set('q', q || undefined)}
        />
        <Select
          label={t('admin.users.status')}
          value={filters.status ?? ANY}
          onValueChange={(v) => set('status', v === ANY ? undefined : v)}
          options={[
            { value: ANY, label: t('common.any') },
            { value: 'open', label: t('employer.myJobs.open') },
            { value: 'closed', label: t('jobs.closed') },
            { value: 'removed', label: t('jobs.removed') },
          ]}
        />
      </div>

      {isPending && <CardListSkeleton count={4} />}
      {isError && <LoadError title={t('admin.jobs.errorTitle')} onRetry={() => void refetch()} />}
      {data?.items.length === 0 && (
        <EmptyState
          icon={SearchX}
          title={t('admin.jobs.emptyTitle')}
          body={t('admin.users.emptyBody')}
        />
      )}
      {data && data.items.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {data.items.map((job) => (
              <li key={job.id}>
                <JobCard
                  job={job}
                  footer={
                    <div className="flex flex-wrap items-center gap-3">
                      <span>
                        {t('employer.myJobs.applicants', { count: job.applicantCount ?? 0 })}
                      </span>
                      {job.status === 'removed' ? (
                        job.removedReason && (
                          <span className="text-ink-muted">
                            {t('admin.jobs.removedReason', { reason: job.removedReason })}
                          </span>
                        )
                      ) : (
                        <Button
                          variant="danger"
                          onClick={() => setRemoving({ id: job.id, title: job.title })}
                        >
                          {t('admin.jobs.remove')}
                        </Button>
                      )}
                    </div>
                  }
                />
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            total={data.total}
            pageSize={data.pageSize}
            onPageChange={(p) => set('page', String(p))}
          />
        </>
      )}

      <ReasonDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('admin.jobs.removeTitle', { title: removing?.title ?? '' })}
        description={t('admin.jobs.removeBody')}
        reasonHelp={t('admin.jobs.reasonHelp')}
        confirmLabel={t('admin.jobs.removeConfirm')}
        onConfirm={async (reason) => {
          if (!removing) return;
          try {
            await remove.mutateAsync({ id: removing.id, reason });
            showToast({ message: t('admin.jobs.removedToast') });
          } catch (e) {
            throw new Error(errorMessage(e), { cause: e });
          }
        }}
      />
    </div>
  );
}

// ---------- Audit log ----------

export function AuditLogPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('admin.audit.title'));
  const [page, setPage] = useState(1);
  const { data, isPending, isError, refetch } = useAuditLog(page);

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold">{t('admin.audit.title')}</h1>
      <p className="mt-2 mb-6 text-lg text-ink-muted">{t('admin.audit.intro')}</p>
      {isPending && <CardListSkeleton count={4} />}
      {isError && <LoadError title={t('admin.audit.errorTitle')} onRetry={() => void refetch()} />}
      {data?.items.length === 0 && (
        <EmptyState
          icon={ScrollText}
          title={t('admin.audit.emptyTitle')}
          body={t('admin.audit.emptyBody')}
        />
      )}
      {data && data.items.length > 0 && (
        <>
          <ol className="flex flex-col gap-2">
            {data.items.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-line bg-surface p-4">
                <p className="font-bold">
                  {t(`admin.audit.actions.${entry.action.replace('.', '_')}`, {
                    defaultValue: entry.action,
                  })}
                  {entry.targetName && (
                    <>
                      {': '}
                      {entry.targetType === 'user' ? (
                        <Link
                          to={`/admin/users/${entry.targetId}`}
                          className="text-primary underline underline-offset-4"
                        >
                          {entry.targetName}
                        </Link>
                      ) : (
                        entry.targetName
                      )}
                    </>
                  )}
                </p>
                <p className="text-ink-muted">
                  {t('admin.audit.by', { name: entry.by })} ·{' '}
                  {relativeTime(new Date(entry.at), i18n.language)}
                </p>
                {entry.reason && <p className="mt-1">{entry.reason}</p>}
              </li>
            ))}
          </ol>
          <Pagination
            page={data.page}
            total={data.total}
            pageSize={data.pageSize}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
