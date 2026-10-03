// k6 load test (PRD NFR-1): 1,000 notifications a minute for 10 minutes, in mock mode.
// Each request is an employer messaging a worker (one notification each); one in five says
// "URGENT ... today", which the classifier marks Urgent (in-app + WhatsApp, with the safety net).
// At the same time, a light stream of direct /predict calls measures the ML service under load.
//
// Run with Docker (no install), from the repository root, after `npm run load:setup -w backend`:
//   docker run --rm -v "$PWD/loadtest:/loadtest" -w /loadtest grafana/k6 run notifications.js
// Shorter rehearsal: add  -e DURATION=1m
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

const API = __ENV.API || 'http://host.docker.internal:4002/api';
const ML = __ENV.ML || 'http://host.docker.internal:8000';
const RATE = Number(__ENV.RATE || 1000); // notifications per minute
const DURATION = __ENV.DURATION || '10m';

const pairs = new SharedArray('pairs', () => JSON.parse(open('./data/pairs.json')));
const predictMs = new Trend('predict_ms', true);
const urgentSent = new Counter('urgent_messages');
const messagesSent = new Counter('messages_sent');

export const options = {
  scenarios: {
    notifications: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1m',
      duration: DURATION,
      preAllocatedVUs: 50,
      maxVUs: 300,
      exec: 'sendMessage',
    },
    predict: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: 'predict',
    },
  },
  thresholds: {
    'http_req_failed{scenario:notifications}': ['rate<0.01'],
    'http_req_duration{scenario:notifications}': ['p(95)<500'],
    predict_ms: ['p(95)<300'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function sendMessage() {
  const n = exec.scenario.iterationInTest;
  const pair = pairs[n % pairs.length];
  const urgent = n % 5 === 0;
  messagesSent.add(1);
  if (urgent) urgentSent.add(1);
  const body = urgent
    ? `URGENT: the shift starts in 30 minutes, can you come today? (load ${n})`
    : `Thanks for applying. Can we talk about the job this week? (load ${n})`;
  const res = http.post(`${API}/conversations/${pair.applicationId}`, JSON.stringify({ body }), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pair.employerToken}` },
    tags: { name: 'send message' },
  });
  check(res, { 'message accepted (201)': (r) => r.status === 201 });
}

const predictBody = JSON.stringify({
  text: 'Warehouse packers needed today. Apply within 45 minutes.',
  type: 'job_alert',
  recipient_role: 'worker',
  created_at: new Date().toISOString(),
  sender_role: 'business',
  deadline_minutes: 45,
});

export function predict() {
  const res = http.post(`${ML}/predict`, predictBody, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'predict' },
  });
  predictMs.add(res.timings.duration);
  check(res, { 'predict answered (200)': (r) => r.status === 200 });
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    '/loadtest/data/k6-summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const ms = (metric, stat) => (m[metric] ? `${m[metric].values[stat].toFixed(1)} ms` : 'n/a');
  const sendDuration = 'http_req_duration{scenario:notifications}';
  return [
    '',
    `messages sent:        ${m['messages_sent'] ? m['messages_sent'].values.count : 0} (urgent ${m['urgent_messages'] ? m['urgent_messages'].values.count : 0})`,
    `failed requests:      ${(100 * (m['http_req_failed{scenario:notifications}'] || m['http_req_failed']).values.rate).toFixed(2)} %`,
    `send message p50/p95: ${ms(sendDuration, 'med')} / ${ms(sendDuration, 'p(95)')}`,
    `/predict p50/p95:     ${ms('predict_ms', 'med')} / ${ms('predict_ms', 'p(95)')}`,
    `dropped iterations:   ${m['dropped_iterations'] ? m['dropped_iterations'].values.count : 0}`,
    '',
  ].join('\n');
}
