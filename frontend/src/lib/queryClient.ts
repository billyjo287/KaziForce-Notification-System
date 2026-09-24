import { QueryClient } from '@tanstack/react-query';

/**
 * Retry network hiccups (slow mobile data) and server errors, but not answers like
 * "not found" or "not allowed". (No axios import here, so the landing page stays light.)
 */
function shouldRetry(count: number, error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return count < 2 && (status === undefined || status >= 500);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
      refetchOnWindowFocus: true,
    },
  },
});
