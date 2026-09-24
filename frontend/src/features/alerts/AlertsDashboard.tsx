import { CheckCheck, Inbox } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Tabs } from 'radix-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/ui/EmptyState';
import { showToast } from '../../stores/toasts';
import { AlertCard } from './AlertCard';
import { AlertDetail } from './AlertDetail';
import type { AlertActions } from './useAlerts';
import { PRIORITY_STYLE } from './priorityStyle';
import { PRIORITIES, type Alert, type AlertRole, type Priority } from './types';

type Filter = 'all' | 'unread' | 'last7days';
const FILTERS: Filter[] = ['all', 'unread', 'last7days'];
const WEEK = 7 * 24 * 60 * 60 * 1000;

function matches(alert: Alert, filter: Filter, now: number): boolean {
  if (filter === 'unread') return alert.readAt === null;
  if (filter === 'last7days') return now - alert.createdAt.getTime() <= WEEK;
  return true;
}

const byNewest = (a: Alert, b: Alert) => b.createdAt.getTime() - a.createdAt.getTime();

// 200 ms, ease-out, no bounce (PRD section 7). MotionConfig makes these instant when
// motion is reduced.
const cardTransition = { duration: 0.2, ease: [0.2, 0, 0, 1] as const };

/** Open on the most important category that has something new. */
function firstTabWithUnread(alerts: Alert[]): Priority {
  return PRIORITIES.find((p) => alerts.some((a) => a.priority === p && !a.readAt)) ?? 'urgent';
}

/**
 * Alerts dashboard (worker and employer). One tab per category: Urgent, Important, For later.
 * Every tab has the same filters (All, Unread, Last 7 days) and "Mark all as read".
 * Phones and tablets: list OR detail (one thing per screen). Laptops (>= 1024px): side by side.
 */
export function AlertsDashboard({
  role,
  alerts,
  actions,
}: {
  role: AlertRole;
  alerts: Alert[];
  actions: AlertActions;
}) {
  const { t } = useTranslation();
  const { markRead, markManyRead, markManyUnread, setNotImportant } = actions;

  const shown = useMemo(() => alerts.filter((a) => !a.markedNotImportant), [alerts]);
  const [tab, setTab] = useState<Priority>(() => firstTabWithUnread(shown));
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastOpenedId = useRef<string | null>(null);
  const focusAfterClose = useRef<'card' | 'heading'>('card');

  const selected = shown.find((a) => a.id === selectedId) ?? null;
  const unreadTotal = shown.filter((a) => a.readAt === null).length;
  const inTab = useMemo(() => shown.filter((a) => a.priority === tab).sort(byNewest), [shown, tab]);
  const visible = inTab.filter((a) => matches(a, filter, now));
  const unreadInTab = inTab.filter((a) => a.readAt === null);

  // Move keyboard/screen-reader focus to the details when they open, and back when they close.
  useEffect(() => {
    if (selectedId) {
      detailHeading.current?.focus();
    } else if (lastOpenedId.current) {
      const card = cardRefs.current.get(lastOpenedId.current);
      if (focusAfterClose.current === 'card' && card) card.focus();
      else pageHeading.current?.focus();
    }
  }, [selectedId]);

  function open(id: string) {
    lastOpenedId.current = id;
    focusAfterClose.current = 'card';
    setSelectedId(id);
    markRead(id);
  }

  function markAllRead() {
    const ids = unreadInTab.map((a) => a.id);
    markManyRead(ids);
    showToast({
      message: t('alerts.markedAllRead', { count: ids.length }),
      actionLabel: t('common.undo'),
      onAction: () => markManyUnread(ids),
    });
  }

  function markNotImportant(alert: Alert) {
    focusAfterClose.current = 'heading';
    setNotImportant(alert.id, true);
    setSelectedId(null);
    // Forgiving: undo instead of a scary "Are you sure?" (PRD 6.7).
    showToast({
      message: t('alerts.notImportantDone'),
      actionLabel: t('common.undo'),
      onAction: () => setNotImportant(alert.id, false),
    });
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(24rem,30rem)_1fr] lg:gap-8">
      {/* ---------- List ---------- */}
      <div className={selected ? 'hidden lg:block' : 'block'}>
        <header className="mb-5">
          <h1 ref={pageHeading} tabIndex={-1} className="text-3xl font-bold outline-none">
            {t('alerts.title')}
          </h1>
          <p className="mt-1 text-ink-muted">
            {unreadTotal > 0
              ? t('alerts.unreadSummary', { count: unreadTotal })
              : t('alerts.allRead')}
          </p>
        </header>

        <Tabs.Root
          value={tab}
          onValueChange={(value) => {
            setTab(value as Priority);
            setSelectedId(null);
          }}
        >
          {/* One tab per category: colour + icon + word + how many are new. */}
          {/* Wraps onto a second row only when the words would not fit (very small screens or Large text). */}
          <Tabs.List aria-label={t('alerts.tabsLabel')} className="flex flex-wrap gap-2">
            {PRIORITIES.map((priority) => {
              const { icon: Icon, text, bar } = PRIORITY_STYLE[priority];
              const count = shown.filter((a) => a.priority === priority && !a.readAt).length;
              return (
                <Tabs.Trigger
                  key={priority}
                  value={priority}
                  className="group relative flex min-h-16 min-w-fit flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border-2 border-line bg-surface px-2 pt-2 pb-3 text-center font-bold text-ink-muted transition-colors duration-150 hover:border-line-strong data-[state=active]:border-line-strong data-[state=active]:text-ink"
                >
                  {/* Thick coloured bar under the chosen tab (plus bold text and a border). */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 bottom-0 h-1.5 opacity-0 group-data-[state=active]:opacity-100 ${bar}`}
                  />
                  <span className="flex flex-col items-center gap-0.5 sm:flex-row sm:gap-1.5">
                    <Icon
                      aria-hidden="true"
                      className={`size-5 shrink-0 ${text}`}
                      strokeWidth={2.5}
                    />
                    <span className="leading-tight whitespace-nowrap">
                      {t(`priority.${priority}`)}
                    </span>
                  </span>
                  <span className={`text-sm font-medium ${count > 0 ? text : 'text-ink-muted'}`}>
                    {t('alerts.tabUnread', { count })}
                  </span>
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>

          {PRIORITIES.map((priority) => (
            <Tabs.Content key={priority} value={priority} className="mt-5 outline-none">
              <p className="mb-4 text-ink-muted">{t(`alerts.groups.${priority}`)}</p>

              {/* The same filters in every category. */}
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <div role="group" aria-label={t('alerts.filters.label')} className="contents">
                  {FILTERS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                      className={`min-h-11 rounded-full border-2 px-4 font-bold transition-colors duration-150 ${
                        filter === f
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-line-strong bg-surface text-ink hover:bg-canvas'
                      }`}
                    >
                      {t(`alerts.filters.${f}`)}
                    </button>
                  ))}
                </div>
                {unreadInTab.length > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-bold text-primary underline-offset-4 hover:underline"
                  >
                    <CheckCheck aria-hidden="true" className="size-5" />
                    {t('alerts.markAllRead')}
                  </button>
                )}
              </div>

              {visible.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title={
                    inTab.length === 0
                      ? t('alerts.empty.tabTitle', { category: t(`priority.${priority}`) })
                      : t('alerts.empty.filteredTitle')
                  }
                  body={
                    inTab.length === 0 ? t('alerts.empty.tabBody') : t('alerts.empty.filteredBody')
                  }
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  <AnimatePresence initial={false} mode="popLayout">
                    {visible.map((alert) => (
                      <m.li
                        key={alert.id}
                        layout
                        // New live alerts slide in from above; others fade in place.
                        initial={alert.arrivedLive ? { opacity: 0, y: -24 } : { opacity: 0 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -32 }}
                        transition={cardTransition}
                      >
                        <AlertCard
                          ref={(el) => {
                            if (el) cardRefs.current.set(alert.id, el);
                            else cardRefs.current.delete(alert.id);
                          }}
                          alert={alert}
                          selected={alert.id === selectedId}
                          onOpen={open}
                        />
                      </m.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </div>

      {/* ---------- Detail ---------- */}
      <div className={selected ? 'block' : 'hidden lg:block'}>
        <div className="lg:sticky lg:top-8 lg:rounded-2xl lg:border lg:border-line lg:bg-surface lg:p-8">
          {/* No exit wait: the details must exist at once so keyboard focus can move there. */}
          <AnimatePresence initial={false}>
            {selected ? (
              <m.div
                key={selected.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={cardTransition}
              >
                <AlertDetail
                  ref={detailHeading}
                  role={role}
                  alert={selected}
                  onBack={() => setSelectedId(null)}
                  onNotImportant={() => markNotImportant(selected)}
                />
              </m.div>
            ) : (
              <p key="empty" className="py-16 text-center text-lg text-ink-muted">
                {t('alerts.detail.choose')}
              </p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
