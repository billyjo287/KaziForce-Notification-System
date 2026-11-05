// "Pop-ups on this device" (Web Push, ADR 0017): registers the service worker (public/sw.js),
// asks the browser for permission, and tells the server where to send pop-ups. Loaded with the
// Settings page only.
import { api } from '../../lib/api';

export type PushState =
  /** The server has no keys: the switch is hidden. */
  | 'not_set_up'
  /** This browser cannot do pop-ups (e.g. an iPhone before "Add to Home Screen"). */
  | 'unsupported'
  /** The person said "Block" in the browser: only the browser's own settings can undo it. */
  | 'blocked'
  | 'off'
  | 'on';

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** The key the browser needs, from base64url text to bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function existingSubscription() {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Where this browser stands now, and the server's key. */
export async function pushState(): Promise<{ state: PushState; publicKey: string | null }> {
  const { publicKey } = (await api.get<{ publicKey: string | null }>('/me/push')).data;
  if (!publicKey) return { state: 'not_set_up', publicKey };
  if (!pushSupported()) return { state: 'unsupported', publicKey };
  if (Notification.permission === 'denied') return { state: 'blocked', publicKey };
  const subscription = await existingSubscription();
  return { state: subscription ? 'on' : 'off', publicKey };
}

/** Switches pop-ups on for this browser; the browser asks "Allow notifications?". */
export async function enablePush(publicKey: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  await api.post('/me/push', subscription.toJSON());
  return 'on';
}

/** Switches pop-ups off for this browser. */
export async function disablePush(): Promise<PushState> {
  const subscription = await existingSubscription();
  if (subscription) {
    await api.delete('/me/push', { data: { endpoint: subscription.endpoint } });
    await subscription.unsubscribe();
  }
  return 'off';
}
