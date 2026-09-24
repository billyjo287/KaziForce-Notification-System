// The user's alerts from the API. Changes (read, "Not important to me") show on screen at once
// and are undone automatically if the server refuses them.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { ApiNotification } from '../../types/api';
import type { Alert } from './types';

const KEY = ['notifications'];

function toAlert(n: ApiNotification): Alert {
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
  };
}

const fetchAlerts = async () =>
  (await api.get<{ items: ApiNotification[] }>('/notifications')).data.items.map(toAlert);

export interface AlertActions {
  markRead: (id: string) => void;
  markManyRead: (ids: string[]) => void;
  markManyUnread: (ids: string[]) => void;
  setNotImportant: (id: string, value: boolean) => void;
}

interface Change {
  ids: string[];
  read?: boolean;
  notImportant?: boolean;
}

function applyChange(alerts: Alert[], { ids, read, notImportant }: Change): Alert[] {
  const now = new Date();
  return alerts.map((a) => {
    if (!ids.includes(a.id)) return a;
    return {
      ...a,
      ...(read === true && { readAt: a.readAt ?? now }),
      ...(read === false && { readAt: null }),
      ...(notImportant !== undefined && { markedNotImportant: notImportant }),
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
  };

  const status = query.isPending ? 'loading' : query.isError ? 'error' : 'ready';
  return { status, alerts: query.data ?? [], actions, refetch: query.refetch } as const;
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
