// Calls used only by the Settings page (notification settings, account deletion). They live here,
// not in api/hooks.ts, so they download with the Settings page instead of with every page.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMeMutation } from '../../api/hooks';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import type { NotificationPreferences, PreferencesChange, User } from '../../types/api';

export const usePreferences = (enabled = true) =>
  useQuery({
    queryKey: ['preferences'],
    queryFn: async () =>
      (await api.get<{ preferences: NotificationPreferences }>('/me/preferences')).data.preferences,
    enabled,
  });

/** Applies a change to what is on screen at once; the server's answer then replaces it. */
function applyChange(old: NotificationPreferences, change: PreferencesChange) {
  const channelSettings = { ...old.channelSettings };
  for (const [channel, setting] of Object.entries(change.channelSettings ?? {})) {
    const c = channel as keyof typeof channelSettings;
    channelSettings[c] = { ...channelSettings[c], ...setting };
  }
  return { ...old, ...change, channelSettings };
}

/** Saves one change straight away (no Save button); shows it before the server answers. */
export function useUpdatePreferences() {
  const client = useQueryClient();
  const setUser = useAuth((s) => s.setUser);
  return useMutation({
    mutationFn: async (change: PreferencesChange) =>
      (
        await api.patch<{ preferences: NotificationPreferences; user: User }>(
          '/me/preferences',
          change,
        )
      ).data,
    onMutate: async (change) => {
      await client.cancelQueries({ queryKey: ['preferences'] });
      const previous = client.getQueryData<NotificationPreferences>(['preferences']);
      if (previous) client.setQueryData(['preferences'], applyChange(previous, change));
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) client.setQueryData(['preferences'], context.previous);
    },
    onSuccess: ({ preferences, user }) => {
      client.setQueryData(['preferences'], preferences);
      setUser(user);
    },
  });
}

/** "Delete my account" (needs the password) and "Keep my account". */
export const useRequestDeletion = () =>
  useMeMutation(
    async (password: string) => (await api.post<{ user: User }>('/me/deletion', { password })).data,
  );

export const useCancelDeletion = () =>
  useMeMutation(async () => (await api.delete<{ user: User }>('/me/deletion')).data);
