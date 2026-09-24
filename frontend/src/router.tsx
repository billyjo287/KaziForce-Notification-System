import { Navigate, createBrowserRouter } from 'react-router';
import { RootLayout } from './app/RootLayout';
import { ErrorPage, NotFoundPage, PageSkeleton } from './pages/StatusPages';

// Each part of the site is a separate download (code splitting):
//   /            landing page (GSAP; the Three.js hero is a further, optional download)
//   /login       log-in preview
//   /worker, /employer, /admin   the logged-in app
// so a phone on a slow connection only downloads what it needs.
const app = () => import('./app/appRoutes');

/** A page that arrives in a later phase; its title comes from the route's handle. */
const comingSoonRoute = (path: string, titleKey: string) => ({
  path,
  handle: { titleKey },
  lazy: async () => ({ Component: (await app()).ComingSoon }),
});

// Settings has its own download: its dropdown and switch code is not needed on other pages.
const settingsRoute = {
  path: 'settings',
  lazy: async () => ({
    Component: (await import('./features/settings/SettingsPage')).SettingsPage,
  }),
};

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    HydrateFallback: PageSkeleton,
    ErrorBoundary: ErrorPage,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('./features/landing/LandingPage')).default }),
      },
      {
        path: 'login',
        lazy: async () => ({ Component: (await import('./pages/LoginPreviewPage')).default }),
      },
      {
        path: 'ui-kit',
        lazy: async () => ({ Component: (await import('./pages/UiKitPage')).default }),
      },
      {
        path: 'worker',
        lazy: async () => ({ Component: (await app()).WorkerLayout }),
        children: [
          { index: true, element: <Navigate to="alerts" replace /> },
          { path: 'alerts', lazy: async () => ({ Component: (await app()).WorkerAlerts }) },
          comingSoonRoute('jobs', 'nav.jobs'),
          comingSoonRoute('messages', 'nav.messages'),
          settingsRoute,
        ],
      },
      {
        path: 'employer',
        lazy: async () => ({ Component: (await app()).EmployerLayout }),
        children: [
          { index: true, element: <Navigate to="alerts" replace /> },
          { path: 'alerts', lazy: async () => ({ Component: (await app()).EmployerAlerts }) },
          comingSoonRoute('jobs', 'nav.myJobs'),
          comingSoonRoute('messages', 'nav.messages'),
          settingsRoute,
        ],
      },
      {
        path: 'admin',
        lazy: async () => ({ Component: (await app()).AdminLayout }),
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          comingSoonRoute('overview', 'nav.overview'),
          comingSoonRoute('users', 'nav.users'),
          comingSoonRoute('jobs', 'nav.adminJobs'),
          comingSoonRoute('spam', 'nav.spam'),
          comingSoonRoute('delivery-logs', 'nav.deliveryLogs'),
          comingSoonRoute('announcements', 'nav.announcements'),
          comingSoonRoute('models', 'nav.models'),
          comingSoonRoute('audit-log', 'nav.auditLog'),
          settingsRoute,
        ],
      },
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
