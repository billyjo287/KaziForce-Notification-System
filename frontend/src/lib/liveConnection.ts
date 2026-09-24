// The live connection to the server (Socket.IO), used for new alerts (PRD FR-6).
// socket.io-client is a separate download, fetched only after logging in, so the landing page
// and the first paint of the app never wait for it.
//
//   - Starts with long-polling and upgrades to WebSocket when it can (works on strict networks).
//   - Reconnects on its own after a drop, and sends a fresh login token each time.
//   - If the server refuses the token (expired), gets a new one and tries again.
//   - If the server closes the connection (suspended, or "log out of all devices"), checks the
//     session: that logs this tab out too when the session was ended.
import type { Socket } from 'socket.io-client';
import { create } from 'zustand';
import { useAuth } from '../stores/auth';
import type { ApiNotification } from '../types/api';
import { API_URL, refreshSession } from './api';

/** `reconnecting` is only set after a short wait, so a quick blip does not flash a banner. */
export type LiveStatus = 'off' | 'connecting' | 'connected' | 'reconnecting';

export const useLiveStatus = create<{ status: LiveStatus }>()(() => ({ status: 'off' }));
const setStatus = (status: LiveStatus) => useLiveStatus.setState({ status });

const BANNER_DELAY_MS = 2000;

export interface LiveHandlers {
  /** A new alert arrived. */
  onNotification: (notification: ApiNotification) => void;
  /** Connected (again): fetch anything missed while disconnected. */
  onConnect: () => void;
}

/** Opens the live connection. Returns a function that closes it. */
export function startLiveConnection(handlers: LiveHandlers): () => void {
  let socket: Socket | null = null;
  let stopped = false;
  let bannerTimer: ReturnType<typeof setTimeout> | undefined;

  const showReconnectingSoon = () => {
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      if (!stopped && !socket?.connected) setStatus('reconnecting');
    }, BANNER_DELAY_MS);
  };

  setStatus('connecting');
  void import('socket.io-client').then(({ io }) => {
    if (stopped) return;
    const s = io(API_URL, {
      // A function, so every (re)connection sends the newest login token.
      auth: (send) => send({ token: useAuth.getState().accessToken }),
    });
    socket = s;

    s.on('connect', () => {
      clearTimeout(bannerTimer);
      setStatus('connected');
      handlers.onConnect();
    });

    s.on('notification:new', (notification: ApiNotification) => {
      // Tell the server it arrived (records the delivery time).
      s.emit('notification:received', { id: notification.id });
      handlers.onNotification(notification);
    });

    // The server refused the connection.
    s.on('connect_error', (error) => {
      if (s.active) {
        // Network problem: Socket.IO keeps retrying by itself.
        showReconnectingSoon();
        return;
      }
      if (error.message === 'account_suspended') {
        useAuth.getState().clear('suspended');
        return;
      }
      // Token expired or refused: get a fresh one, then try again. If the session is over,
      // refreshSession logs this tab out and the connection is closed by stop().
      void refreshSession().then((ok) => {
        if (ok && !stopped) s.connect();
      });
    });

    s.on('disconnect', (reason) => {
      if (stopped) return;
      if (reason === 'io server disconnect') {
        // Closed by the server on purpose: find out if this session is still valid.
        void refreshSession().then((ok) => {
          if (ok && !stopped) s.connect();
        });
      }
      showReconnectingSoon();
    });
  });

  return () => {
    stopped = true;
    clearTimeout(bannerTimer);
    socket?.disconnect();
    socket = null;
    setStatus('off');
  };
}
