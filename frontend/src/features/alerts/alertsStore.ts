// Mock alerts for the design phase. Phase 3 replaces this store with real data from the API
// (TanStack Query + Socket.IO); the dashboard components stay the same.
//
// Preview helpers: add ?mock=empty or ?mock=error to the address to see those states.
import { create } from 'zustand';
import { createEmployerMockAlerts, createMockAlerts } from './mockAlerts';
import type { Alert, AlertRole } from './types';

export type LoadStatus = 'loading' | 'ready' | 'error';

interface AlertsState {
  status: Record<AlertRole, LoadStatus>;
  alerts: Record<AlertRole, Alert[]>;
  load: (role: AlertRole) => void;
  markRead: (role: AlertRole, id: string) => void;
  setNotImportant: (role: AlertRole, id: string, value: boolean) => void;
  add: (role: AlertRole, alert: Alert) => void;
}

const FAKE_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 400;

function mockMode(): string | null {
  return new URLSearchParams(window.location.search).get('mock');
}

function updateAlert(
  alerts: Record<AlertRole, Alert[]>,
  role: AlertRole,
  id: string,
  change: (alert: Alert) => Alert,
) {
  return { ...alerts, [role]: alerts[role].map((a) => (a.id === id ? change(a) : a)) };
}

export const useAlertsStore = create<AlertsState>()((set, get) => ({
  status: { worker: 'loading', business: 'loading' },
  alerts: { worker: [], business: [] },

  load: (role) => {
    if (get().status[role] === 'ready') return;
    set((s) => ({ status: { ...s.status, [role]: 'loading' } }));
    setTimeout(() => {
      const mode = mockMode();
      if (mode === 'error') {
        set((s) => ({ status: { ...s.status, [role]: 'error' } }));
        return;
      }
      const data =
        mode === 'empty' ? [] : role === 'worker' ? createMockAlerts() : createEmployerMockAlerts();
      set((s) => ({
        status: { ...s.status, [role]: 'ready' },
        alerts: { ...s.alerts, [role]: data },
      }));
    }, FAKE_DELAY_MS);
  },

  markRead: (role, id) =>
    set((s) => ({
      alerts: updateAlert(s.alerts, role, id, (a) => (a.readAt ? a : { ...a, readAt: new Date() })),
    })),

  setNotImportant: (role, id, value) =>
    set((s) => ({
      alerts: updateAlert(s.alerts, role, id, (a) => ({ ...a, markedNotImportant: value })),
    })),

  add: (role, alert) =>
    set((s) => ({ alerts: { ...s.alerts, [role]: [alert, ...s.alerts[role]] } })),
}));

/** Number of unread alerts that are still shown (used by the menu badge). */
export function useUnreadCount(role: AlertRole): number {
  return useAlertsStore(
    (s) => s.alerts[role].filter((a) => a.readAt === null && !a.markedNotImportant).length,
  );
}
