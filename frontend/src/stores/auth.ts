// Who is logged in. The login token lives only in memory (never localStorage), so a page reload
// asks the backend for a fresh one using the httpOnly refresh cookie.
import { create } from 'zustand';
import i18n from '../i18n';
import type { Role, Session, User } from '../types/api';

export type AuthStatus = 'unknown' | 'guest' | 'user';
/** Why the user was sent back to the log-in page, shown there in plain words. */
export type AuthNotice = 'suspended' | 'expired' | 'loggedOut' | 'loggedOutAll' | null;

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: User | null;
  notice: AuthNotice;
  /** True right after logging in with the form: shows the "Welcome back" message once. */
  justLoggedIn: boolean;
  setSession: (session: Session) => void;
  setJustLoggedIn: (value: boolean) => void;
  clearNotice: () => void;
  setUser: (user: User) => void;
  clear: (notice?: AuthNotice) => void;
}

export const useAuth = create<AuthState>()((set) => ({
  status: 'unknown',
  accessToken: null,
  user: null,
  notice: null,
  justLoggedIn: false,
  setSession: ({ accessToken, user }) => {
    // The account's saved language wins on every device.
    if (user.language !== i18n.language) void i18n.changeLanguage(user.language);
    set({ status: 'user', accessToken, user, notice: null });
  },
  setUser: (user) => set({ user }),
  setJustLoggedIn: (justLoggedIn) => set({ justLoggedIn }),
  clearNotice: () => set({ notice: null }),
  clear: (notice = null) =>
    set({ status: 'guest', accessToken: null, user: null, notice, justLoggedIn: false }),
}));

/** Where each side starts after logging in. */
export function homePath(role: Role): string {
  if (role === 'business') return '/employer/alerts';
  if (role === 'admin') return '/admin/users';
  return '/worker/alerts';
}

/** URL prefix of each side. */
export function sidePath(role: Role): string {
  return role === 'business' ? '/employer' : `/${role}`;
}
