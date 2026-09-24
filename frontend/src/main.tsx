import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { i18nReady } from './i18n';
import './index.css';
import { router } from './router';
import './stores/settings';

// Design preview helper: ?theme=dark or ?theme=light forces a theme. Without it, the
// phone/computer setting decides.
const theme = new URLSearchParams(window.location.search).get('theme');
if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

// Draw once the starting language is ready (instant for English; Kiswahili is a small download).
void i18nReady.finally(() => {
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});
