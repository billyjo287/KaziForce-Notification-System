// Browser pop-ups go only to the browsers' own push services (BT-05). A subscription comes from
// the browser, so a logged-in person could otherwise make our server send requests to any web
// address (server-side request forgery). These are the services Chrome/Edge/Android (Google),
// Firefox (Mozilla), Safari/iPhone (Apple) and old Edge (Microsoft) use.
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

/** True for an https:// address on a known push service (or one of its sub-domains). */
export function isPushServiceUrl(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
