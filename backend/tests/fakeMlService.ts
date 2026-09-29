// A stand-in for the ML service in tests: answers /predict with the Node copy of rules-v0
// (source "rules"), and can be told to be slow, fail, or answer nonsense.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { predictWithRules, type PredictRequest } from '../src/pipeline/rulesV0.js';

export type FakeMode = 'ok' | 'slow' | 'error' | 'nonsense';

export async function startFakeMlService() {
  let mode: FakeMode = 'ok';
  let slowMs = 800;
  let calls = 0;
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      calls++;
      const answer = () => {
        if (mode === 'error') {
          res.writeHead(500).end('boom');
          return;
        }
        const payload =
          mode === 'nonsense'
            ? { priority: 'extremely-urgent' }
            : predictWithRules(JSON.parse(body) as PredictRequest);
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
      };
      if (mode === 'slow') setTimeout(answer, slowMs);
      else answer();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    setMode(next: FakeMode, delayMs = 800) {
      mode = next;
      slowMs = delayMs;
    },
    get calls() {
      return calls;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
