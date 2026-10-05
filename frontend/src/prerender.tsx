// Build time only (scripts/prerender.mjs, ADR 0010): draws the pages people see before logging
// in as ready-made HTML, so a phone on a slow connection shows them without waiting for the app.
// The app then takes over (main.tsx). Never part of the website's own download.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import LandingPage from './features/landing/LandingPage';
import i18n from './i18n';

export const PAGES: { path: string; file: string; Page: ComponentType; titleKey: string }[] = [
  { path: '/', file: 'index.html', Page: LandingPage, titleKey: 'landing.title' },
  { path: '/login', file: 'login.html', Page: LoginPage, titleKey: 'auth.login.title' },
  { path: '/register', file: 'register.html', Page: RegisterPage, titleKey: 'auth.register.title' },
];

/** The page's HTML (English, the default) and its tab title. */
export function renderPage({ path, Page, titleKey }: (typeof PAGES)[number]) {
  const html = renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <StaticRouter location={path}>
        <Page />
      </StaticRouter>
    </QueryClientProvider>,
  );
  return { html, title: i18n.t('app.pageTitle', { page: i18n.t(titleKey) }) };
}
