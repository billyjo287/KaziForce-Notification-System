// Load test, step 2 (runs next to k6): one Socket.IO connection per worker, like 100 open
// browsers. Records when each live alert arrives, confirms it like the website does, and writes
// loadtest/data/inapp.json every 5 seconds (and when stopped with Ctrl+C).
//   npm run load:listen -w backend
import { readFileSync, writeFileSync } from 'node:fs';
import { io } from 'socket.io-client';
import { DATA_DIR, LOAD_PORT } from './env.mjs';

interface Pair {
  workerToken: string;
}
type Incoming = { id: string; priority: string; createdAt: string };
interface Arrival {
  id: string;
  priority: string;
  createdAt: string;
  receivedAt: number;
}

const pairs = JSON.parse(readFileSync(`${DATA_DIR}pairs.json`, 'utf8')) as Pair[];
const arrivals: Arrival[] = [];
const seen = new Set<string>();
const reconnects = { count: 0 };
const caughtUp = { resyncs: 0, alerts: 0 };

const record = (n: Incoming, viaCatchUp = false) => {
  if (seen.has(n.id)) return;
  seen.add(n.id);
  arrivals.push({ id: n.id, priority: n.priority, createdAt: n.createdAt, receivedAt: Date.now() });
  if (viaCatchUp) caughtUp.alerts++;
};

const sockets = pairs.map(({ workerToken }) => {
  const socket = io(`http://localhost:${LOAD_PORT}`, { auth: { token: workerToken } });
  socket.on('notification:new', (n: Incoming) => {
    record(n);
    socket.emit('notification:received', { id: n.id });
  });
  // Like the website: fetch the list again when the server says live alerts may have been missed.
  socket.on('notifications:resync', async () => {
    caughtUp.resyncs++;
    const res = await fetch(`http://localhost:${LOAD_PORT}/api/notifications`, {
      headers: { Authorization: `Bearer ${workerToken}` },
    });
    const body = (await res.json()) as { items: Incoming[] };
    for (const n of body.items) record(n, true);
  });
  socket.io.on('reconnect', () => reconnects.count++);
  return socket;
});

const save = () =>
  writeFileSync(
    `${DATA_DIR}inapp.json`,
    JSON.stringify({ reconnects: reconnects.count, caughtUp, arrivals }),
  );
const timer = setInterval(save, 5000);
setInterval(() => {
  const connected = sockets.filter((s) => s.connected).length;
  console.log(
    `${new Date().toISOString()} connected ${connected}/${sockets.length}, alerts ${arrivals.length}`,
  );
}, 30_000);

process.on('SIGINT', () => {
  clearInterval(timer);
  save();
  for (const s of sockets) s.close();
  console.log(`Saved ${arrivals.length} arrivals to loadtest/data/inapp.json`);
  process.exit(0);
});
console.log(`Listening as ${pairs.length} workers. Stop with Ctrl+C after the test.`);
