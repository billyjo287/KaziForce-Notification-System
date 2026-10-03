// Calls used only by the admin pages added in Phase 7 (they download with those pages).
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Page } from '../../types/api';
import type { Priority } from '../alerts/types';

export type Channel = 'in_app' | 'whatsapp' | 'sms' | 'email';
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed';
export type Audience = 'everyone' | 'worker' | 'business';

export interface ChannelRate {
  channel: Channel;
  delivered: number;
  failed: number;
  pending: number;
  /** delivered / (delivered + failed); null when nothing was sent */
  rate: number | null;
}

export interface QueueBacklog {
  name: string;
  waiting: number;
  scheduled: number;
  failed: number;
}

export interface Overview {
  generatedAt: string;
  channels: { last24h: ChannelRate[]; last7d: ChannelRate[] };
  today: { notifications: number; spamBlocked: number; failedDeliveries: number };
  spamWaiting: number;
  heldNow: number;
  /** null when Redis could not be reached */
  queues: QueueBacklog[] | null;
  recentFailures: {
    id: string;
    channel: Channel;
    error: string | null;
    at: string;
    notification: { id: string; title: string };
  }[];
}

export interface DeliveryLogRow {
  id: string;
  channel: Channel;
  status: DeliveryStatus;
  attempt: number;
  isEscalation: boolean;
  error: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  notification: {
    id: string;
    title: string;
    category: string;
    priority: Priority;
    corrected: boolean;
    recipient: { id: string; name: string };
  };
}

export interface DeliveryLogFilters {
  channel?: string;
  status?: string;
  from?: string;
  to?: string;
  page: number;
}

export interface SpamItem {
  id: string;
  type: string;
  title: string;
  message: string;
  sender: { id: string; name: string } | null;
  recipient: { id: string; name: string };
  spamScore: number | null;
  predictedPriority: Priority | null;
  modelVersion: string | null;
  predictionSource: string | null;
  explanation: { feature: string; weight: number }[] | null;
  createdAt: string;
}

export interface ModelVersion {
  id: string;
  version: string;
  algorithm: string;
  description: string | null;
  metrics: Record<string, number | string> | null;
  datasetInfo: Record<string, unknown> | null;
  isActive: boolean;
  trainedAt: string | null;
  deployedAt: string | null;
  classified: number;
  fallback: number;
  corrected: number;
}

const OVERVIEW_REFRESH_MS = 30_000;

export const useOverview = () =>
  useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => (await api.get<Overview>('/admin/overview')).data,
    refetchInterval: OVERVIEW_REFRESH_MS,
  });

export const useDeliveryLogs = (filters: DeliveryLogFilters) =>
  useQuery({
    queryKey: ['admin', 'deliveryLogs', filters],
    queryFn: async () =>
      (await api.get<Page<DeliveryLogRow>>('/admin/delivery-logs', { params: filters })).data,
    placeholderData: keepPreviousData,
  });

export const useSpamQueue = (page: number) =>
  useQuery({
    queryKey: ['admin', 'spam', page],
    queryFn: async () =>
      (await api.get<Page<SpamItem>>('/admin/review/spam', { params: { page } })).data,
    placeholderData: keepPreviousData,
  });

/** After a decision: the item leaves the list, and the overview numbers change. */
function useAdminMutation<TInput>(request: (input: TInput) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export const useReleaseSpam = () =>
  useAdminMutation(({ id, priority }: { id: string; priority: Priority }) =>
    api.post(`/admin/review/spam/${id}/release`, { priority }),
  );

export const useConfirmSpam = () =>
  useAdminMutation((id: string) => api.post(`/admin/review/spam/${id}/confirm`));

export const useCorrectPriority = () =>
  useAdminMutation(({ id, priority }: { id: string; priority: Priority }) =>
    api.post(`/admin/notifications/${id}/priority`, { priority }),
  );

export const useAudienceSize = (audience: Audience) =>
  useQuery({
    queryKey: ['admin', 'audience', audience],
    queryFn: async () =>
      (
        await api.get<{ people: number }>('/admin/announcements/audience', {
          params: { audience },
        })
      ).data.people,
  });

export const useSendAnnouncement = () =>
  useAdminMutation((input: { audience: Audience; title: string; message: string }) =>
    api.post('/admin/announcements', input),
  );

export const useModels = () =>
  useQuery({
    queryKey: ['admin', 'models'],
    queryFn: async () => (await api.get<{ models: ModelVersion[] }>('/admin/models')).data.models,
  });

/** Downloads the anonymised training CSV (with the login token, so not a plain link). */
export async function downloadTrainingData(range: { from?: string; to?: string }) {
  const res = await api.get<Blob>('/admin/export/training.csv', {
    params: range,
    responseType: 'blob',
  });
  const name =
    /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ??
    'kaziforce-training.csv';
  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
