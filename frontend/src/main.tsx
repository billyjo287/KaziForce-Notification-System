import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { i18nReady } from './i18n';
import './index.css';
import { router } from './router';
import './stores/settings'; // applies the theme, text size and reduce motion before drawing

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

// The landing, log-in and sign-up pages arrive as ready-made HTML (ADR 0010). Keep showing that
// copy until this page's own code has arrived, then swap in the live page in one go.
const copy =
  document.documentElement.dataset.prerender === 'off'
    ? null
    : root.querySelector<HTMLElement>('[data-prerendered]');

const routerReady = new Promise<void>((resolve) => {
  if (router.state.initialized) return resolve();
  const stop = router.subscribe((state) => {
    if (state.initialized) {
      stop();
      resolve();
    }
  });
});

const app = (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

// Draw once the starting language is ready (instant for English; Kiswahili is a small download).
if (copy) {
  void Promise.all([import('./lib/prerenderTakeover'), routerReady, i18nReady]).then(
    ([{ snapshot }]) => {
      const replay = snapshot(copy);
      flushSync(() => createRoot(root).render(app));
      replay(root);
    },
    () => createRoot(root).render(app),
  );
} else {
  void i18nReady.finally(() => createRoot(root).render(app));
}
