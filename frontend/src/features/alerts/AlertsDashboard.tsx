import { Inbox } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/ui/EmptyState';
import { showToast } from '../../stores/toasts';
import { AlertCard } from './AlertCard';
import { AlertDetail } from './AlertDetail';
import { useAlertsStore } from './alertsStore';
import { PRIORITY_STYLE } from './priorityStyle';
import { PRIORITIES, type Alert, type AlertRole } from './types';

type Filter = 'all' | 'unread' | 'urgent' | 'last7days';
const FILTERS: Filter[] = ['all', 'unread', 'urgent', 'last7days'];
const WEEK = 7 * 24 * 60 * 60 * 1000;
/** "For later" shows this many cards, the rest behind "Show N more". */
const LOW_PRIORITY_PREVIEW = 2;

function matches(alert: Alert, filter: Filter, now: number): boolean {
  switch (filter) {
    case 'unread':
      return alert.readAt === null;
    case 'urgent':
      return alert.priority === 'urgent';
    case 'last7days':
      return now - alert.createdAt.getTime() <= WEEK;
    default:
      return true;
  }
}

// 200 ms, ease-out, no bounce (PRD section 7). MotionConfig makes these instant when
// motion is reduced.
const cardTransition = { duration: 0.2, ease: [0.2, 0, 0, 1] as const };

/**
 * Alerts dashboard, grouped Urgent / Important / For later (worker and employer).
 * Phones and tablets: list OR detail (one thing per screen). Laptops (>= 1024px): side by side.
 */
export function AlertsDashboard({ role, alerts }: { role: AlertRole; alerts: Alert[] }) {
  const { t } = useTranslation();
  const markRead = useAlertsStore((s) => s.markRead);
  const setNotImportant = useAlertsStore((s) => s.setNotImportant);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAllLow, setShowAllLow] = useState(false);
  const [now] = useState(() => Date.now());
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastOpenedId = useRef<string | null>(null);
  const focusAfterClose = useRef<'card' | 'heading'>('card');

  const shown = useMemo(() => alerts.filter((a) => !a.markedNotImportant), [alerts]);
  const selected = shown.find((a) => a.id === selectedId) ?? null;
  const unreadCount = shown.filter((a) => a.readAt === null).length;

  const groups = useMemo(() => {
    const visible = shown.filter((a) => matches(a, filter, now));
    return PRIORITIES.map((priority) => ({
      priority,
      items: visible
        .filter((a) => a.priority === priority)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    })).filter((group) => group.items.length > 0);
  }, [shown, filter, now]);

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
    markRead(role, id);
  }

  function markNotImportant(alert: Alert) {
    focusAfterClose.current = 'heading';
    setNotImportant(role, alert.id, true);
    setSelectedId(null);
    // Forgiving: undo instead of a scary "Are you sure?" (PRD 6.7).
    showToast({
      message: t('alerts.notImportantDone'),
      actionLabel: t('common.undo'),
      onAction: () => setNotImportant(role, alert.id, false),
    });
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(22rem,28rem)_1fr] lg:gap-8">
      {/* ---------- List ---------- */}
      <div className={selected ? 'hidden lg:block' : 'block'}>
        <header className="mb-5">
          <h1 ref={pageHeading} tabIndex={-1} className="text-3xl font-bold outline-none">
            {t('alerts.title')}
          </h1>
          <p className="mt-1 text-ink-muted">
            {unreadCount > 0
              ? t('alerts.unreadSummary', { count: unreadCount })
              : t('alerts.allRead')}
          </p>
        </header>

        <div role="group" aria-labelledby="filter-label" className="mb-6">
          <span id="filter-label" className="sr-only">
            {t('alerts.filters.label')}
          </span>
          <div className="flex flex-wrap gap-2">
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
        </div>

        {groups.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={
              shown.length === 0 ? t('alerts.empty.allTitle') : t('alerts.empty.filteredTitle')
            }
            body={shown.length === 0 ? t('alerts.empty.allBody') : t('alerts.empty.filteredBody')}
          />
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map(({ priority, items }) => {
              const { icon: Icon, text } = PRIORITY_STYLE[priority];
              const collapsible = priority === 'low' && items.length > LOW_PRIORITY_PREVIEW + 1;
              const hiddenCount = items.length - LOW_PRIORITY_PREVIEW;
              const visibleItems =
                collapsible && !showAllLow ? items.slice(0, LOW_PRIORITY_PREVIEW) : items;

              return (
                <section key={priority} aria-labelledby={`group-${priority}`}>
                  <h2
                    id={`group-${priority}`}
                    className={`flex items-center gap-2 text-xl font-bold ${text}`}
                  >
                    <Icon aria-hidden="true" className="size-6" strokeWidth={2.5} />
                    {t(`priority.${priority}`)}
                    <span className="font-medium text-ink-muted">({items.length})</span>
                  </h2>
                  <p className="mb-3 text-ink-muted">{t(`alerts.groups.${priority}`)}</p>
                  <ul id={`list-${priority}`} className="flex flex-col gap-3">
                    <AnimatePresence initial={false} mode="popLayout">
                      {visibleItems.map((alert) => (
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
                  {collapsible && (
                    <button
                      type="button"
                      aria-expanded={showAllLow}
                      aria-controls={`list-${priority}`}
                      onClick={() => setShowAllLow((v) => !v)}
                      className="mt-3 inline-flex min-h-11 items-center rounded-lg px-2 font-bold text-primary underline-offset-4 hover:underline"
                    >
                      {showAllLow
                        ? t('alerts.showLess')
                        : t('alerts.showMore', { count: hiddenCount })}
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        )}
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
