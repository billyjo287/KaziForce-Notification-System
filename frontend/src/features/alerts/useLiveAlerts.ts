// Keeps the alerts list up to date without refreshing the page (PRD FR-6):
//   - a new alert slides into the list and the menu badge counts it;
//   - on any other page, Urgent and Important alerts also show a short message with "Open"
//     ("For later" alerts stay quiet, PRD FR-4);
//   - after a lost connection, the list is fetched again, so nothing sent meanwhile is missed;
//   - related pages (messages, applications, jobs) refresh their data too.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { startLiveConnection } from '../../lib/liveConnection';
import { showToast } from '../../stores/toasts';
import type { ApiNotification } from '../../types/api';
import type { AlertRole } from './types';
import { ALERTS_KEY, addLiveAlert, toAlert } from './useAlerts';

/** Other data that a new alert of this type makes out of date. */
const RELATED: Record<ApiNotification['type'], string[][]> = {
  job_alert: [['jobs']],
  status_update: [['myApplications'], ['employerJobs'], ['employerJob']],
  message: [['conversations'], ['conversation']],
  announcement: [],
};

export function useLiveAlerts(role: AlertRole) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const alertsPath = role === 'business' ? '/employer/alerts' : '/worker/alerts';

  // The handlers read the latest values without reconnecting on every page change.
  const latest = useRef({ pathname, t, navigate });
  useEffect(() => {
    latest.current = { pathname, t, navigate };
  });

  useEffect(
    () =>
      startLiveConnection({
        onConnect: () => void client.invalidateQueries({ queryKey: ALERTS_KEY }),
        onNotification: (notification) => {
          client.setQueryData(ALERTS_KEY, (old: ReturnType<typeof toAlert>[] | undefined) =>
            addLiveAlert(old, toAlert(notification)),
          );
          for (const queryKey of RELATED[notification.type]) {
            void client.invalidateQueries({ queryKey });
          }

          const { pathname: here, t: translate, navigate: go } = latest.current;
          if (notification.priority !== 'low' && here !== alertsPath) {
            showToast({
              message: translate('alerts.newAlertAnnouncement', {
                priority: translate(`priority.${notification.priority}`),
                title: notification.title,
              }),
              actionLabel: translate('alerts.openAlert'),
              onAction: () => void go(`${alertsPath}?open=${notification.id}`),
            });
          }
        },
      }),
    [client, alertsPath],
  );
}
