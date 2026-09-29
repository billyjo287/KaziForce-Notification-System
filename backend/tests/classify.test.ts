// Phase 4: the Node copy of rules-v0 gives exactly the ML service's answers, and the worker's
// classify() falls back to it when /predict is slow (over 500 ms), down or answers nonsense.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classify, toPredictRequest, type ClassifyInput } from '../src/pipeline/classify.js';
import { predictWithRules, type PredictRequest } from '../src/pipeline/rulesV0.js';
import { startFakeMlService } from './fakeMlService.js';

const mlFile = (path: string) => new URL(`../../ml-service/${path}`, import.meta.url);

const EXAMPLES = JSON.parse(
  readFileSync(mlFile('tests/fixtures/rules_v0_examples.json'), 'utf8'),
) as { name: string; request: PredictRequest; expected: unknown }[];

describe('Node copy of rules-v0', () => {
  it('uses exactly the same rules as the ML service', () => {
    // Compared as data, so formatting differences (Prettier here, none in Python) do not matter.
    const read = (url: URL) => JSON.parse(readFileSync(url, 'utf8')) as unknown;
    expect(read(new URL('../src/pipeline/rules-v0.json', import.meta.url))).toEqual(
      read(mlFile('app/classifiers/rules_v0.json')),
    );
  });

  it.each(EXAMPLES.map((e) => [e.name, e] as const))(
    'same answer as the ML service: %s',
    (_name, example) => {
      expect(predictWithRules(example.request)).toEqual(example.expected);
    },
  );
});

const scam: ClassifyInput = {
  title: 'New message from Pwani Events',
  message:
    'CONGRATULATIONS!!! You are hired. Send KSh 500 registration fee to secure your job NOW!!!',
  type: 'message',
  recipientRole: 'worker',
  senderRole: 'business',
  createdAt: new Date(),
  deadlineAt: null,
};

describe('classify(): ML service first, Node rules as the fallback', () => {
  let ml: Awaited<ReturnType<typeof startFakeMlService>>;
  beforeAll(async () => {
    ml = await startFakeMlService();
  });
  afterAll(() => ml.close());

  const options = () => ({ mlServiceUrl: ml.url, timeoutMs: 500 });

  it('uses the ML service answer when it replies in time', async () => {
    ml.setMode('ok');
    const verdict = await classify(scam, options());
    expect(verdict).toMatchObject({
      isSpam: true,
      spamScore: 1,
      priority: 'medium',
      modelVersion: 'rules-v0',
      predictionSource: 'rules',
    });
    expect(verdict.fallbackReason).toBeUndefined();
  });

  it('gives up after 500 ms and uses the Node rules (rules_fallback)', async () => {
    ml.setMode('slow', 900);
    const started = Date.now();
    const verdict = await classify(scam, options());
    const waited = Date.now() - started;
    expect(verdict).toMatchObject({ isSpam: true, predictionSource: 'rules_fallback' });
    expect(verdict.fallbackReason).toBe('timeout after 500 ms');
    expect(waited).toBeGreaterThanOrEqual(450);
    expect(waited).toBeLessThan(800);
  });

  it('falls back when the ML service errors, answers nonsense, or is not running', async () => {
    ml.setMode('error');
    expect(await classify(scam, options())).toMatchObject({
      predictionSource: 'rules_fallback',
      fallbackReason: 'status 500',
    });
    ml.setMode('nonsense');
    expect(await classify(scam, options())).toMatchObject({
      predictionSource: 'rules_fallback',
      fallbackReason: 'unexpected answer',
    });
    const down = await classify(scam, { mlServiceUrl: 'http://127.0.0.1:9', timeoutMs: 500 });
    expect(down).toMatchObject({ predictionSource: 'rules_fallback', isSpam: true });
  });

  it('sends the deadline as minutes left and keeps the text within 1,000 characters', () => {
    const now = new Date('2026-10-02T09:00:00Z');
    const request = toPredictRequest(
      {
        ...scam,
        type: 'job_alert',
        message: 'x'.repeat(1200),
        deadlineAt: new Date('2026-10-02T09:45:00Z'),
      },
      now,
    );
    expect(request.deadline_minutes).toBe(45);
    expect(request.text).toHaveLength(1000);
    expect(toPredictRequest({ ...scam, deadlineAt: new Date(0) }, now).deadline_minutes).toBe(0);
  });
});
