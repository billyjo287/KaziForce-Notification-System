import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet, ScrollRestoration } from 'react-router';
import { queryClient } from '../lib/queryClient';

export function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <ScrollRestoration />
    </QueryClientProvider>
  );
}
