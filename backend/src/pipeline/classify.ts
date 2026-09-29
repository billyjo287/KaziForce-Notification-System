// Decides a notification's priority and whether it is spam (PRD FR-3, CLAUDE.md section 5):
//   1. ask the ML service (POST /predict), waiting at most ML_TIMEOUT_MS (500 ms);
//   2. if it is slow, down, or answers with something unexpected, use the same rules here in
//      Node (rulesV0.ts) and record predictionSource = "rules_fallback".
// Either way the notification gets predictedPriority, spamScore, modelVersion and the reasons.
import { z } from 'zod';
import type { NotificationType, Priority, PredictionSource } from '../generated/prisma/client.js';
import { predictWithRules, type PredictRequest } from './rulesV0.js';

export interface Verdict {
  priority: Priority;
  priorityConfidence: number;
  isSpam: boolean;
  spamScore: number;
  modelVersion: string;
  predictionSource: PredictionSource;
  explanation: { feature: string; weight: number }[];
  /** Why the fallback was used (for the log), e.g. "timeout". */
  fallbackReason?: string;
}

export interface ClassifyOptions {
  /** e.g. http://127.0.0.1:8000 */
  mlServiceUrl: string;
  timeoutMs: number;
}

/** What the ML service must answer (PRD section 5); anything else counts as an error. */
const responseSchema = z.object({
  priority: z.enum(['urgent', 'medium', 'low']),
  priority_confidence: z.number().min(0).max(1),
  is_spam: z.boolean(),
  spam_score: z.number().min(0).max(1),
  model_version: z.string().min(1).max(100),
  source: z.enum(['rules', 'ml']),
  explanation: z.array(z.object({ feature: z.string(), weight: z.number() })).max(50),
});

/** The fields of a notification the classifier looks at. */
export interface ClassifyInput {
  title: string;
  message: string;
  type: NotificationType;
  recipientRole: 'worker' | 'business' | 'admin';
  senderRole: 'worker' | 'business' | 'admin' | 'system';
  createdAt: Date;
  deadlineAt: Date | null;
}

/** Builds the /predict request (the contract allows at most 1,000 characters of text). */
export function toPredictRequest(input: ClassifyInput, now = new Date()): PredictRequest {
  const minutesLeft =
    input.deadlineAt === null
      ? null
      : Math.max(0, Math.round((input.deadlineAt.getTime() - now.getTime()) / 60_000));
  return {
    text: `${input.title}\n${input.message}`.slice(0, 1000),
    type: input.type,
    // The contract only knows the two sides that receive alerts.
    recipient_role: input.recipientRole === 'business' ? 'business' : 'worker',
    created_at: input.createdAt.toISOString(),
    sender_role: input.senderRole,
    deadline_minutes: minutesLeft,
  };
}

function fromResponse(response: z.infer<typeof responseSchema>, source: PredictionSource): Verdict {
  return {
    priority: response.priority,
    priorityConfidence: response.priority_confidence,
    isSpam: response.is_spam,
    spamScore: response.spam_score,
    modelVersion: response.model_version,
    predictionSource: source,
    explanation: response.explanation,
  };
}

export async function classify(input: ClassifyInput, options: ClassifyOptions): Promise<Verdict> {
  const request = toPredictRequest(input);
  let reason: string;
  try {
    const res = await fetch(`${options.mlServiceUrl}/predict`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (res.ok) {
      const parsed = responseSchema.safeParse(await res.json());
      if (parsed.success) return fromResponse(parsed.data, parsed.data.source);
      reason = 'unexpected answer';
    } else {
      reason = `status ${res.status}`;
    }
  } catch (error) {
    reason =
      error instanceof DOMException && error.name === 'TimeoutError'
        ? `timeout after ${options.timeoutMs} ms`
        : 'unreachable';
  }
  return { ...fromResponse(predictWithRules(request), 'rules_fallback'), fallbackReason: reason };
}
