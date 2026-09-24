// Decides a notification's priority and whether it is spam.
// Phase 3: everything is MEDIUM and nothing is spam. Phase 4 replaces the body of this function
// with a call to the ML service's /predict (500 ms timeout, then Node's own rules), so nothing
// else in the pipeline changes.
import type { Priority, PredictionSource } from '../generated/prisma/client.js';

export interface Verdict {
  priority: Priority;
  priorityConfidence: number | null;
  isSpam: boolean;
  spamScore: number | null;
  modelVersion: string | null;
  predictionSource: PredictionSource | null;
}

export function classify(): Verdict {
  return {
    priority: 'medium',
    priorityConfidence: null,
    isSpam: false,
    spamScore: null,
    // No model or rule has looked at it yet, so these stay empty (kept out of training data).
    modelVersion: null,
    predictionSource: null,
  };
}
