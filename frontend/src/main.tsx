import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { i18nReady } from './i18n';
import './index.css';
import { router } from './router';
import './stores/settings'; // applies the theme, text size and reduce motion before drawing

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
