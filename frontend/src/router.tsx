import { Navigate, createBrowserRouter, type RouteObject } from 'react-router';
import { RootLayout } from './app/RootLayout';
import { ErrorPage, NotFoundPage, PageSkeleton } from './pages/StatusPages';

// Each part of the site is a separate download (code splitting), so a phone on a slow
// connection only downloads the page it opens:
//   /                        landing page (GSAP; the Three.js hero is a further, optional file)
//   /login, /register, ...   account pages
//   /worker, /employer, /admin   the logged-in app (shell + alerts), then one file per page
const app = () => import('./app/appRoutes');
const guards = () => import('./app/RequireAuth');
const admin = () => import('./features/admin/AdminPages');
const messages = () => import('./features/messages/MessagesPages');
const passwordPages = () => import('./features/auth/PasswordResetPages');

/** A page that arrives in a later phase; its title comes from the route's handle. */
const comingSoon = (path: string, titleKey: string): RouteObject => ({
  path,
  handle: { titleKey },
  lazy: async () => ({ Component: (await app()).ComingSoon }),
});

const settingsRoute: RouteObject = {
  path: 'settings',
  lazy: async () => ({
    Component: (await import('./features/settings/SettingsPage')).SettingsPage,
  }),
};

const sharedSideRoutes: RouteObject[] = [
  settingsRoute,
  {
    path: 'settings/profile',
    lazy: async () => ({ Component: (await import('./features/profile/ProfilePage')).default }),
  },
  { path: 'messages', lazy: async () => ({ Component: (await messages()).ConversationsPage }) },
  {
    path: 'messages/:applicationId',
    lazy: async () => ({ Component: (await messages()).ConversationPage }),
  },
];

/** Log-in and sign-up: people who are already logged in go straight to their side. */
const guestOnly = (load: () => Promise<{ default: () => React.ReactNode }>) => async () => {
  const [{ default: Page }, { RedirectIfLoggedIn }] = await Promise.all([load(), guards()]);
  return {
    Component: () => (
      <RedirectIfLoggedIn>
        <Page />
      </RedirectIfLoggedIn>
    ),
  };
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

      // ---------- Accounts ----------
      { path: 'login', lazy: guestOnly(() => import('./features/auth/LoginPage')) },
      { path: 'register', lazy: guestOnly(() => import('./features/auth/RegisterPage')) },
      {
        path: 'forgot-password',
        lazy: async () => ({ Component: (await passwordPages()).ForgotPasswordPage }),
      },
      {
        path: 'reset-password',
        lazy: async () => ({ Component: (await passwordPages()).ResetPasswordPage }),
      },
      {
        path: 'onboarding',
        lazy: async () => ({
          Component: (await import('./features/onboarding/OnboardingPage')).default,
        }),
      },
      {
        path: 'ui-kit',
        lazy: async () => ({ Component: (await import('./pages/UiKitPage')).default }),
      },

      // ---------- Worker ----------
      {
        path: 'worker',
        lazy: async () => ({ Component: (await app()).WorkerLayout }),
        children: [
          { index: true, element: <Navigate to="alerts" replace /> },
          { path: 'alerts', lazy: async () => ({ Component: (await app()).WorkerAlerts }) },
          {
            path: 'jobs',
            lazy: async () => ({ Component: (await import('./features/jobs/JobsPage')).default }),
          },
          {
            path: 'jobs/:id',
            lazy: async () => ({
              Component: (await import('./features/jobs/JobDetailPage')).default,
            }),
          },
          ...sharedSideRoutes,
        ],
      },

      // ---------- Employer ----------
      {
        path: 'employer',
        lazy: async () => ({ Component: (await app()).EmployerLayout }),
        children: [
          { index: true, element: <Navigate to="alerts" replace /> },
          { path: 'alerts', lazy: async () => ({ Component: (await app()).EmployerAlerts }) },
          {
            path: 'jobs',
            lazy: async () => ({
              Component: (await import('./features/employer/MyJobsPage')).default,
            }),
          },
          {
            path: 'jobs/new',
            lazy: async () => ({
              Component: (await import('./features/employer/PostJobPage')).default,
            }),
          },
          {
            path: 'jobs/:id',
            lazy: async () => ({
              Component: (await import('./features/employer/ApplicantsPage')).default,
            }),
          },
          ...sharedSideRoutes,
        ],
      },

      // ---------- Admin ----------
      {
        path: 'admin',
        lazy: async () => ({ Component: (await app()).AdminLayout }),
        children: [
          { index: true, element: <Navigate to="users" replace /> },
          { path: 'users', lazy: async () => ({ Component: (await admin()).UsersPage }) },
          { path: 'users/:id', lazy: async () => ({ Component: (await admin()).UserDetailPage }) },
          { path: 'jobs', lazy: async () => ({ Component: (await admin()).AdminJobsPage }) },
          { path: 'audit-log', lazy: async () => ({ Component: (await admin()).AuditLogPage }) },
          comingSoon('overview', 'nav.overview'),
          comingSoon('spam', 'nav.spam'),
          comingSoon('delivery-logs', 'nav.deliveryLogs'),
          comingSoon('announcements', 'nav.announcements'),
          comingSoon('models', 'nav.models'),
          settingsRoute,
        ],
      },
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
