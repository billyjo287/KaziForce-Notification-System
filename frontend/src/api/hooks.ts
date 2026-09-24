// Every call to the backend, as TanStack Query hooks (loading / error / data handled for us,
// with caching so going back to a page is instant).
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../stores/auth';
import type {
  AdminUserDetail,
  AdminUserRow,
  Applicant,
  AuditEntry,
  ChatMessage,
  Conversation,
  ExternalChannel,
  Job,
  MyApplication,
  Page,
  Place,
  PresetName,
  Skill,
  User,
} from '../types/api';

const HOUR = 60 * 60 * 1000;
/** Messages also refresh at once when a live "new message" alert arrives; this is the backup. */
const MESSAGE_POLL_MS = 15_000;

// ---------- Lookups ----------

export const useLocations = () =>
  useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get<{ locations: Place[] }>('/locations')).data.locations,
    staleTime: HOUR,
  });

export const useSkills = () =>
  useQuery({
    queryKey: ['skills'],
    queryFn: async () => (await api.get<{ skills: Skill[] }>('/skills')).data.skills,
    staleTime: HOUR,
  });

// ---------- My account ----------

/** Mutations on /me return the updated user; keep the login store in step. */
function useMeMutation<TInput>(request: (input: TInput) => Promise<{ user: User }>) {
  const setUser = useAuth((s) => s.setUser);
  return useMutation({
    mutationFn: request,
    onSuccess: ({ user }) => setUser(user),
  });
}

export const useUpdateProfile = () =>
  useMeMutation(
    async (input: {
      name?: string;
      locationId?: string | null;
      skillIds?: string[];
      companyName?: string;
    }) => (await api.patch<{ user: User }>('/me/profile', input)).data,
  );

export const useUpdateLanguage = () =>
  useMeMutation(
    async (language: 'en' | 'sw') =>
      (await api.patch<{ user: User }>('/me/language', { language })).data,
  );

export const useSendPhoneCode = () =>
  useMutation({
    mutationFn: async (phone: string) =>
      (await api.post<{ ok: true; mockCode?: string }>('/me/phone', { phone, consent: true })).data,
  });

export const useVerifyPhone = () =>
  useMeMutation(
    async (code: string) => (await api.post<{ user: User }>('/me/phone/verify', { code })).data,
  );

export const useSetChannels = () =>
  useMeMutation(
    async (input: { usesWhatsApp: boolean; checksMost: ExternalChannel }) =>
      (await api.patch<{ user: User }>('/me/channels', input)).data,
  );

export const useSetPreset = () =>
  useMeMutation(
    async (preset: PresetName) => (await api.patch<{ user: User }>('/me/preset', { preset })).data,
  );

export const useFinishOnboarding = () =>
  useMeMutation(async () => (await api.post<{ user: User }>('/me/onboarding/finish')).data);

// ---------- Jobs (workers) ----------

export interface JobFilters {
  locationId?: string;
  skillId?: string;
  page?: number;
}

export const useJobs = (filters: JobFilters) =>
  useQuery({
    queryKey: ['jobs', filters],
    queryFn: async () => (await api.get<Page<Job>>('/jobs', { params: filters })).data,
    placeholderData: keepPreviousData,
  });

export const useJob = (id: string) =>
  useQuery({
    queryKey: ['job', id],
    queryFn: async () => (await api.get<{ job: Job }>(`/jobs/${id}`)).data.job,
  });

export function useApply(jobId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (note: string) =>
      (await api.post(`/jobs/${jobId}/apply`, { note: note || undefined })).data,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['job', jobId] });
      void client.invalidateQueries({ queryKey: ['jobs'] });
      void client.invalidateQueries({ queryKey: ['myApplications'] });
      void client.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export const useMyApplications = () =>
  useQuery({
    queryKey: ['myApplications'],
    queryFn: async () =>
      (await api.get<{ items: MyApplication[] }>('/applications/mine')).data.items,
  });

// ---------- Jobs (employers) ----------

export interface NewJob {
  title: string;
  description: string;
  locationId: string;
  skillId: string;
  pay?: string;
  deadline: string;
  urgent: boolean;
}

export function usePostJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (job: NewJob) => (await api.post<{ job: Job }>('/jobs', job)).data.job,
    onSuccess: () => void client.invalidateQueries({ queryKey: ['employerJobs'] }),
  });
}

export const useEmployerJobs = () =>
  useQuery({
    queryKey: ['employerJobs'],
    queryFn: async () => (await api.get<{ items: Job[] }>('/employer/jobs')).data.items,
  });

export const useEmployerJob = (id: string) =>
  useQuery({
    queryKey: ['employerJob', id],
    queryFn: async () =>
      (await api.get<{ job: Job; applicants: Applicant[] }>(`/employer/jobs/${id}`)).data,
  });

export function useSetApplicationStatus(jobId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { applicationId: string; status: 'accepted' | 'rejected' }) =>
      (
        await api.patch<{ undoId: string | null; undoSeconds: number }>(
          `/applications/${input.applicationId}/status`,
          { status: input.status },
        )
      ).data,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['employerJob', jobId] });
      void client.invalidateQueries({ queryKey: ['employerJobs'] });
    },
  });
}

export function useUndoApplicationStatus(jobId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { applicationId: string; undoId: string }) =>
      (await api.post(`/applications/${input.applicationId}/undo`, { undoId: input.undoId })).data,
    onSettled: () => void client.invalidateQueries({ queryKey: ['employerJob', jobId] }),
  });
}

// ---------- Messages ----------

export const useConversations = () =>
  useQuery({
    queryKey: ['conversations'],
    queryFn: async () => (await api.get<{ items: Conversation[] }>('/conversations')).data.items,
    refetchInterval: MESSAGE_POLL_MS,
  });

export const useConversation = (applicationId: string) =>
  useQuery({
    queryKey: ['conversation', applicationId],
    queryFn: async () =>
      (
        await api.get<{
          conversation: Pick<Conversation, 'applicationId' | 'job' | 'with'>;
          messages: ChatMessage[];
        }>(`/conversations/${applicationId}`)
      ).data,
    refetchInterval: MESSAGE_POLL_MS,
  });

export function useSendMessage(applicationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) =>
      (await api.post<{ message: ChatMessage }>(`/conversations/${applicationId}`, { body })).data
        .message,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['conversation', applicationId] });
      void client.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// ---------- Admin ----------

export interface UserFilters {
  q?: string;
  role?: string;
  status?: string;
  page?: number;
}

export const useAdminUsers = (filters: UserFilters) =>
  useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: async () =>
      (await api.get<Page<AdminUserRow>>('/admin/users', { params: filters })).data,
    placeholderData: keepPreviousData,
  });

export const useAdminUser = (id: string) =>
  useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: async () =>
      (
        await api.get<{
          user: AdminUserDetail;
          history: { id: string; action: string; reason: string | null; by: string; at: string }[];
        }>(`/admin/users/${id}`)
      ).data,
  });

export function useSetUserStatus(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { action: 'suspend' | 'reactivate'; reason?: string }) =>
      (await api.post(`/admin/users/${id}/${input.action}`, { reason: input.reason })).data,
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export const useAdminJobs = (filters: { q?: string; status?: string; page?: number }) =>
  useQuery({
    queryKey: ['admin', 'jobs', filters],
    queryFn: async () => (await api.get<Page<Job>>('/admin/jobs', { params: filters })).data,
    placeholderData: keepPreviousData,
  });

export function useRemoveJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string }) =>
      (await api.post(`/admin/jobs/${input.id}/remove`, { reason: input.reason })).data,
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export const useAuditLog = (page: number) =>
  useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: async () =>
      (await api.get<Page<AuditEntry>>('/admin/audit-log', { params: { page } })).data,
    placeholderData: keepPreviousData,
  });
