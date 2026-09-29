// Node copy of the rule-based classifier v0, used when the ML service is slow (over 500 ms) or
// down (CLAUDE.md section 5). It is a line-by-line port of ml-service/app/classifiers/
// rule_based.py and reads the same rules (rules-v0.json, a copy of the ML service's file).
// Tests check that the two files are identical and that both give exactly the same answers for
// the 28 examples in ml-service/tests/fixtures/rules_v0_examples.json.
import rules from './rules-v0.json' with { type: 'json' };

export type NotificationKind = 'job_alert' | 'status_update' | 'message' | 'announcement';

/** The /predict request (PRD section 5). */
export interface PredictRequest {
  text: string;
  type: NotificationKind;
  recipient_role: 'worker' | 'business';
  created_at: string;
  sender_role: 'business' | 'worker' | 'admin' | 'system';
  deadline_minutes: number | null;
}

/** The /predict response (PRD section 5). */
export interface PredictResponse {
  priority: 'urgent' | 'medium' | 'low';
  priority_confidence: number;
  is_spam: boolean;
  spam_score: number;
  model_version: string;
  source: 'rules' | 'ml';
  explanation: { feature: string; weight: number }[];
}

type Fired = [feature: string, percent: number];

const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/gi;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lower case, everything except a-z and 0-9 becomes a space, padded with spaces. */
export function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/** The phrases that appear as whole words. */
function found(normalizedText: string, phrases: string[]): string[] {
  return phrases.filter((p) => normalizedText.includes(` ${normalize(p).trim()} `));
}

function urlHost(url: string): string {
  const host = url.toLowerCase().replace(/^(?:https?:\/\/)?(?:www\.)?/, '');
  return host.split(/[/?#:]/, 1)[0] ?? '';
}

const isShortener = (host: string, shorteners: string[]) =>
  shorteners.some((s) => host === s || host.endsWith(`.${s}`));

/** A shortened link written without http:// or www., e.g. "bit.ly/abc". */
const bareShortenerLink = (text: string, shorteners: string[]) =>
  shorteners.some((s) =>
    new RegExp(`(?:^|[^a-z0-9.])${escapeRegExp(s)}/`).test(text.toLowerCase()),
  );

const weight = (percent: number) => percent / 100;

function priorityOf(request: PredictRequest, text: string) {
  const p = rules.priority;
  const fired: Fired[] = [];

  const minutes = request.deadline_minutes;
  if (minutes !== null && minutes >= 0 && minutes <= p.urgent_deadline_minutes) {
    fired.push([
      `deadline_within_${p.urgent_deadline_minutes}_minutes`,
      p.urgent_deadline_confidence,
    ]);
  }

  if (request.type === 'status_update' && found(text, p.accepted_phrases).length > 0) {
    fired.push(['application_accepted', p.accepted_confidence]);
  }

  // Announcements go to everyone: a word like "urgent" in one is not an urgent personal alert.
  const skipWords = p.urgent_words_skip_types.includes(request.type);
  const words = skipWords ? [] : found(text, p.urgent_words);
  if (words.length > 0) {
    const confidence = Math.min(
      p.urgent_words_confidence + p.urgent_words_extra_per_word * (words.length - 1),
      p.urgent_words_max_confidence,
    );
    fired.push([`urgent_words:${words.join(',')}`, confidence]);
  }

  if (fired.length > 0) {
    return {
      priority: 'urgent' as const,
      confidence: Math.max(...fired.map(([, c]) => c)),
      fired,
    };
  }
  const fallback = p.by_type[request.type];
  return {
    priority: fallback.priority as PredictResponse['priority'],
    confidence: fallback.confidence,
    fired: [[fallback.feature, fallback.confidence]] as Fired[],
  };
}

function spamOf(request: PredictRequest, text: string): { score: number; fired: Fired[] } {
  const s = rules.spam;
  if (s.trusted_senders.includes(request.sender_role)) {
    return { score: 0, fired: [['spam:trusted_sender', 0]] };
  }

  const fired: Fired[] = [];
  const payments = found(text, s.payment_phrases);
  if (payments.length > 0) {
    fired.push([`spam:payment_request:${payments.join(',')}`, s.payment_request_weight]);
  }
  const blocked = found(text, s.blocked_keywords);
  if (blocked.length > 0) {
    fired.push([`spam:blocked_keyword:${blocked.join(',')}`, s.blocked_keyword_weight]);
  }

  const hosts = (request.text.match(URL_PATTERN) ?? []).map(urlHost);
  const untrusted = hosts.filter((h) => !s.trusted_link_domains.some((d) => h.includes(d)));
  if (
    untrusted.some((h) => isShortener(h, s.link_shorteners)) ||
    bareShortenerLink(request.text, s.link_shorteners)
  ) {
    fired.push(['spam:link_shortener', s.link_shortener_weight]);
  } else if (untrusted.length > 0) {
    fired.push(['spam:suspicious_link', s.suspicious_link_weight]);
  }

  const letters = (request.text.match(/[A-Za-z]/g) ?? []).length;
  const capitals = (request.text.match(/[A-Z]/g) ?? []).length;
  if (letters >= s.all_caps_min_letters && capitals * 100 >= s.all_caps_percent * letters) {
    fired.push(['spam:all_capitals', s.all_caps_weight]);
  }

  const exclamations = (request.text.match(/!/g) ?? []).length;
  if (
    request.text.includes('!!') ||
    request.text.includes('??') ||
    exclamations >= s.punctuation_min_exclamations
  ) {
    fired.push(['spam:excessive_punctuation', s.punctuation_weight]);
  }

  const score = Math.min(100, s.base_score + fired.reduce((sum, [, w]) => sum + w, 0));
  return { score, fired };
}

export const RULES_VERSION: string = rules.version;

/** Same answer as the ML service's rules-v0 for the same request. */
export function predictWithRules(request: PredictRequest): PredictResponse {
  const text = normalize(request.text);
  const priority = priorityOf(request, text);
  const spam = spamOf(request, text);
  return {
    priority: priority.priority,
    priority_confidence: weight(priority.confidence),
    is_spam: spam.score >= rules.spam.threshold,
    spam_score: weight(spam.score),
    model_version: rules.version,
    source: 'rules',
    explanation: [...priority.fired, ...spam.fired].map(([feature, w]) => ({
      feature,
      weight: weight(w),
    })),
  };
}
