// "Add KaziForce to this phone" (SRS FR-NOT-016/017, ADR 0019). Installed from the browser,
// KaziForce opens from the home screen like any app and gets its pop-ups even when closed:
// on Android as an app (Chrome makes a real app package), on iPhone after "Add to Home Screen"
// (pop-ups need it there, iOS 16.4+). Chrome offers the install once, early, often before the
// Settings page is open, so the offer is kept here from the first page.

/** Chrome's install offer (not in TypeScript's built-in types). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offer: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep it for our own button instead of Chrome's small bar at the bottom.
    event.preventDefault();
    offer = event as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    changed();
  });
}

export type InstallState = 'installed' | 'can_install' | 'iphone' | 'menu';

/** Running from the home screen already? */
function runningInstalled() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const isIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function installState(): InstallState {
  if (runningInstalled()) return 'installed';
  if (offer) return 'can_install';
  return isIphone() ? 'iphone' : 'menu';
}

/** Shows the browser's own "Install KaziForce?" box. True when the person said yes. */
export async function install(): Promise<boolean> {
  if (!offer) return false;
  const current = offer;
  await current.prompt();
  const { outcome } = await current.userChoice;
  offer = null;
  changed();
  return outcome === 'accepted';
}

export function onInstallChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
