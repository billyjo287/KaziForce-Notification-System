// Shapes of the data the backend API returns (see backend/src/modules/*).

export type Role = 'worker' | 'business' | 'admin';
export type Language = 'en' | 'sw';
export type ExternalChannel = 'whatsapp' | 'sms' | 'email';

/** FR-4b: "You usually open SMS fastest. Make SMS your first choice?" */
export interface ChannelSuggestion {
  channel: ExternalChannel;
  currentFirst: ExternalChannel;
  alerts: number;
  wins: number;
  medianMinutes: number;
}
export type PresetName = 'recommended' | 'urgent_only' | 'everything';

/** Which alerts a channel gets. */
export type Threshold = 'everything' | 'urgent_and_important' | 'urgent_only';
export type ChannelSettings = Record<ExternalChannel, { enabled: boolean; threshold: Threshold }>;

/** "HH:MM" in Kenya time (Africa/Nairobi). */
export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

/** The notification part of Settings (PRD FR-5), from GET /me/preferences. */
export interface NotificationPreferences {
  preset: PresetName | 'custom';
  /** The person's channels in order (WhatsApp only if they use it). */
  channelOrder: ExternalChannel[];
  channelSettings: ChannelSettings;
  urgentOnBothChannels: boolean;
  quietHours: QuietHours;
  dailySummary: boolean;
  usesWhatsApp: boolean;
  phoneVerified: boolean;
  /** Replied STOP (WhatsApp) or opted out with the network (SMS). */
  optedOut: { whatsapp: boolean; sms: boolean };
}

/** One change on the settings screen (or its undo). */
export interface PreferencesChange {
  channelOrder?: ExternalChannel[];
  usesWhatsApp?: boolean;
  urgentOnBothChannels?: boolean;
  preset?: PresetName;
  channelSettings?: Partial<Record<ExternalChannel, Partial<ChannelSettings[ExternalChannel]>>>;
  quietHours?: QuietHours;
  dailySummary?: boolean;
}
export type ApplicationStatus = 'received' | 'reviewed' | 'accepted' | 'rejected';

export interface Skill {
  id: string;
  nameEn: string;
  nameSw: string;
}

export interface Place {
  id: string;
  name: string;
  county?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  language: Language;
  phone: string | null;
  phoneVerified: boolean;
  usesWhatsApp: boolean;
  companyName: string | null;
  location: Place | null;
  skills: Skill[];
  onboardingCompleted: boolean;
  preference: { preset: PresetName | 'custom'; channelOrder: ExternalChannel[] } | null;
  /** Set while a deletion request waits: the day the account will be deleted (ISO-8601). */
  deletionScheduledFor: string | null;
}

export interface Session {
  accessToken: string;
  user: User;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  pay: string | null;
  deadline: string;
  urgent: boolean;
  status: 'open' | 'closed' | 'removed';
  removedReason: string | null;
  location: Place;
  skill: Skill;
  employer: { id: string; name: string };
  createdAt: string;
  myApplication?: { id: string; status: ApplicationStatus } | null;
  applicantCount?: number;
  newApplicantCount?: number;
  isMine?: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  note: string | null;
  appliedAt: string;
  statusChangedAt: string | null;
  job: Job;
}

export interface Applicant {
  id: string;
  status: ApplicationStatus;
  note: string | null;
  appliedAt: string;
  worker: { id: string; name: string; location: string | null; skills: Skill[] };
  messageCount: number;
}

export interface Conversation {
  applicationId: string;
  job: { id: string; title: string };
  with: { id: string; name: string };
  lastMessage: { body: string; sentAt: string; mine: boolean } | null;
  unreadCount: number;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  body: string;
  sentAt: string;
  mine: boolean;
  readAt: string | null;
}

export interface ApiNotification {
  id: string;
  priority: 'urgent' | 'medium' | 'low';
  type: 'job_alert' | 'status_update' | 'message' | 'announcement';
  title: string;
  body: string;
  link: string | null;
  sender: string;
  createdAt: string;
  readAt: string | null;
  deadlineAt: string | null;
  location: string | null;
  markedNotImportant: boolean;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: 'active' | 'suspended';
  companyName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  location: { name: string } | null;
}

export interface AdminUserDetail extends AdminUserRow {
  phoneVerified: boolean;
  usesWhatsApp: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  skills: { nameEn: string; nameSw: string }[];
  _count: { jobsPosted: number; applications: number };
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string | null;
  reason: string | null;
  by: string;
  at: string;
}
