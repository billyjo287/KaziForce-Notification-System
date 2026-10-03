// Starts the BUILT backend (API + worker, as in production) on the load-test database.
//   npm run build -w backend && npm run load:server -w backend
import { execSync, spawn } from 'node:child_process';
import { loadEnv } from './env.mjs';

execSync('npx prisma migrate deploy', { env: loadEnv, stdio: 'inherit' });

const api = spawn('node', ['dist/server.js'], { env: loadEnv, stdio: 'inherit' });
const worker = spawn('node', ['dist/worker.js'], { env: loadEnv, stdio: 'inherit' });
const stop = () => {
  api.kill('SIGTERM');
  worker.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
api.on('exit', (code) => {
  worker.kill('SIGTERM');
  process.exit(code ?? 0);
});
