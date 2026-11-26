// Keeps the MLMetadata table (the list of classifier versions) up to date: the first time the
// worker sees a model version on an answer, it is registered and marked as the active one.
// "rules-v0", "rules-v1" and the trained "ml-v1" and "ml-v2" are registered this way (and by the
// seed), without any change here.
import type { PrismaClient } from '../generated/prisma/client.js';

const DESCRIPTIONS: Record<string, string> = {
  rules:
    'Rule-based classifier (PRD section 5): deadline, keywords and application status for ' +
    'priority; payment requests, scam phrases, links, capitals and punctuation for spam.',
  ml:
    'Trained on synthetic data (Phase 9, docs/ml-training.md): TF-IDF words, letter pieces and ' +
    'message details; Logistic Regression or Naive Bayes, chosen by cross-validation (the model ' +
    'card says which); guardrails: a job ' +
    'closing within 3 hours is urgent, and the scam check of the rules still blocks.',
};

export function createModelRegistry(prisma: PrismaClient) {
  const known = new Set<string>();

  return async function register(version: string) {
    if (known.has(version)) return;
    const algorithm = version.startsWith('rules')
      ? 'rules'
      : version.startsWith('ml')
        ? 'ml'
        : 'unknown';
    await prisma.$transaction(async (tx) => {
      const existing = await tx.mLMetadata.findUnique({ where: { version } });
      if (existing?.isActive) return;
      await tx.mLMetadata.updateMany({
        where: { isActive: true, version: { not: version } },
        data: { isActive: false },
      });
      await tx.mLMetadata.upsert({
        where: { version },
        create: {
          version,
          algorithm,
          description: DESCRIPTIONS[algorithm] ?? null,
          isActive: true,
          deployedAt: new Date(),
        },
        update: { isActive: true, deployedAt: new Date() },
      });
    });
    known.add(version);
  };
}
