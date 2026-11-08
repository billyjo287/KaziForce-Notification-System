// The user's alerts from the API. Changes (read, "Not important to me") show on screen at once
// and are undone automatically if the server refuses them. New alerts arrive live (see
// useLiveAlerts.ts) and are added to the same cached list.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import type { ApiNotification } from '../../types/api';
import type { Alert } from './types';

export const ALERTS_KEY = ['notifications'];
const KEY = ALERTS_KEY;

export function toAlert(n: ApiNotification): Alert {
  return {
    id: n.id,
    priority: n.priority,
    type: n.type,
    title: n.title,
    body: n.body,
    sender: n.sender,
    link: n.link,
    createdAt: new Date(n.createdAt),
    readAt: n.readAt ? new Date(n.readAt) : null,
    deadlineAt: n.deadlineAt ? new Date(n.deadlineAt) : undefined,
    location: n.location ?? undefined,
    markedNotImportant: n.markedNotImportant,
    markedUrgent: n.markedUrgent ?? false,
  };
}

/** The server sends the newest 200; "Show older alerts" adds 200 more each time (BT-21). */
export const ALERTS_PAGE = 200;

const fetchAlerts = async () =>
  (await api.get<{ items: ApiNotification[] }>('/notifications')).data.items.map(toAlert);

export interface AlertActions {
  markRead: (id: string) => void;
  markManyRead: (ids: string[]) => void;
  markManyUnread: (ids: string[]) => void;
  setNotImportant: (id: string, value: boolean) => void;
  /** The main action (e.g. "View job") was used. */
  markClicked: (id: string) => void;
  /** "This was urgent for me" (BT-15), or its Undo. */
  setUrgentForMe: (id: string, value: boolean) => void;
}

interface Change {
  ids: string[];
  read?: boolean;
  notImportant?: boolean;
  clicked?: true;
  urgentForMe?: boolean;
}

/** Adds a live alert to the top of the list (once, even if it arrives twice). */
export function addLiveAlert(alerts: Alert[] | undefined, alert: Alert): Alert[] | undefined {
  if (!alerts) return alerts; // not loaded yet: the first fetch will include it
  if (alerts.some((a) => a.id === alert.id)) return alerts;
  return [{ ...alert, arrivedLive: true }, ...alerts];
}

function applyChange(
  alerts: Alert[],
  { ids, read, notImportant, clicked, urgentForMe }: Change,
): Alert[] {
  const now = new Date();
  return alerts.map((a) => {
    if (!ids.includes(a.id)) return a;
    return {
      ...a,
      ...((read === true || clicked) && { readAt: a.readAt ?? now }),
      ...(read === false && { readAt: null }),
      ...(notImportant !== undefined && { markedNotImportant: notImportant }),
      ...(urgentForMe !== undefined && { markedUrgent: urgentForMe }),
    };
  });
}

export function useAlerts() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: fetchAlerts });

  const update = useMutation({
    mutationFn: (change: Change) => api.patch('/notifications', change),
    onMutate: async (change) => {
      await client.cancelQueries({ queryKey: KEY });
      const previous = client.getQueryData<Alert[]>(KEY);
      client.setQueryData<Alert[]>(KEY, (old) => applyChange(old ?? [], change));
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) client.setQueryData(KEY, context.previous);
    },
  });

  const actions: AlertActions = {
    markRead: (id) => update.mutate({ ids: [id], read: true }),
    markManyRead: (ids) => ids.length > 0 && update.mutate({ ids, read: true }),
    markManyUnread: (ids) => ids.length > 0 && update.mutate({ ids, read: false }),
    setNotImportant: (id, value) => update.mutate({ ids: [id], notImportant: value }),
    markClicked: (id) => update.mutate({ ids: [id], clicked: true }),
    setUrgentForMe: (id, value) => update.mutate({ ids: [id], urgentForMe: value }),
  };

  // "Show older alerts": the next 200 before the oldest one on screen, added to the same list.
  const [olderDone, setOlderDone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const alerts = query.data ?? [];
  async function loadOlder() {
    const oldest = alerts.reduce<Date | null>(
      (min, a) => (!min || a.createdAt < min ? a.createdAt : min),
      null,
    );
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const { items } = (
        await api.get<{ items: ApiNotification[] }>('/notifications', {
          params: { before: oldest.toISOString() },
        })
      ).data;
      client.setQueryData<Alert[]>(KEY, (old) => {
        const have = new Set((old ?? []).map((a) => a.id));
        return [...(old ?? []), ...items.map(toAlert).filter((a) => !have.has(a.id))];
      });
      if (items.length < ALERTS_PAGE) setOlderDone(true);
    } finally {
      setLoadingOlder(false);
    }
  }
  const older = {
    available: !olderDone && alerts.length >= ALERTS_PAGE,
    loading: loadingOlder,
    load: loadOlder,
  };

  const status = query.isPending ? 'loading' : query.isError ? 'error' : 'ready';
  return { status, alerts, actions, refetch: query.refetch, older } as const;
}

/** Unread "Act now" alerts (the bell wiggles while there are any). Same cached data. */
export function useUrgentUnreadCount(): number {
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: fetchAlerts,
    select: (alerts) =>
      alerts.filter((a) => a.priority === 'urgent' && !a.readAt && !a.markedNotImportant).length,
  });
  return data ?? 0;
}

/** Unread alerts still shown (the menu badge). Shares the same cached data. */
export function useUnreadCount(): number {
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: fetchAlerts,
    select: (alerts) => alerts.filter((a) => !a.readAt && !a.markedNotImportant).length,
  });
  return data ?? 0;
}
