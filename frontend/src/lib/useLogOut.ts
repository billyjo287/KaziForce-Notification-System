// Logging out, used by the Log out button on every page and by Settings ("log out of all
// devices" stays in Settings only, behind a confirmation).
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth, type AuthNotice } from '../stores/auth';
import { showToast } from '../stores/toasts';
import { api } from './api';
import { queryClient } from './queryClient';
import { useApiErrorMessage } from './useApiErrorMessage';

export function useLogOut() {
  const navigate = useNavigate();
  const clear = useAuth((s) => s.clear);
  const errorMessage = useApiErrorMessage();
  const [busy, setBusy] = useState(false);

  async function logOut(everywhere = false) {
    setBusy(true);
    try {
      await api.post(everywhere ? '/auth/logout-all' : '/auth/logout');
      const notice: AuthNotice = everywhere ? 'loggedOutAll' : 'loggedOut';
      queryClient.clear(); // forget this person's data on this device
      clear(notice);
      navigate('/login', { replace: true });
    } catch (error) {
      showToast({ message: errorMessage(error) });
      setBusy(false);
    }
  }

  return { logOut, busy };
}
