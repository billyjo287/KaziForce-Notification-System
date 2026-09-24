export type Priority = 'urgent' | 'medium' | 'low';
export type AlertType = 'job_alert' | 'status_update' | 'message' | 'announcement';
/** The two sides that receive alerts. "business" is shown as "Employer". */
export type AlertRole = 'worker' | 'business';

export interface Alert {
  id: string;
  priority: Priority;
  type: AlertType;
  title: string;
  body: string;
  sender: string;
  createdAt: Date;
  readAt: Date | null;
  deadlineAt?: Date;
  location?: string;
  /** The user tapped "Not important to me" (hidden from the list; a training signal later). */
  markedNotImportant?: boolean;
  /** Arrived while the page was open, so it slides in. */
  arrivedLive?: boolean;
}

/** Display order of the groups on the dashboard. */
export const PRIORITIES: Priority[] = ['urgent', 'medium', 'low'];
