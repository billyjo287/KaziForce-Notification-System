// Shapes of the data the backend API returns (see backend/src/modules/*).

export type Role = 'worker' | 'business' | 'admin';
export type Language = 'en' | 'sw';
export type ExternalChannel = 'whatsapp' | 'sms' | 'email';
export type PresetName = 'recommended' | 'urgent_only' | 'everything';
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
