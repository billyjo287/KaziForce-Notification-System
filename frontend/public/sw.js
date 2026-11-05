// KaziForce service worker: browser pop-ups only (Web Push, ADR 0017). It caches nothing, so it
// never shows an old version of the site. Registered only when someone switches pop-ups on
// (src/features/settings/browserPush.ts).
//
// Each message carries the summary line only ("You have a new message"), never names or
// details, so a locked phone shows nothing private (CLAUDE.md decision 10).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || 'KaziForce';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/brand/kaziforce-app-icon-192.png',
      badge: '/brand/favicon-32.png',
      // One pop-up per alert, even if it arrives twice.
      tag: data.tag,
      // Quiet hours: no sound or vibration (SRS FR-NOT-020).
      silent: Boolean(data.silent),
      // "Act now" stays until the person deals with it.
      requireInteraction: Boolean(data.urgent),
      data: { url: data.url || '/' },
    }),
  );
});

// Tapping the pop-up opens that alert: in a KaziForce tab that is already open, or a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if (new URL(tab.url).origin === self.location.origin && 'navigate' in tab) {
          return tab.navigate(url).then((t) => (t || tab).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
