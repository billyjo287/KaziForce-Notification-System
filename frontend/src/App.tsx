// Phase 0 placeholder: proves the frontend runs and can reach the backend.
// Replaced by the real app shell in Phase 1 (which also moves all text into the i18n files).
import { useEffect, useState } from 'react';

type Health =
  | { state: 'loading' }
  | { state: 'ok'; checks: Record<string, { status: string }> }
  | { state: 'error'; message: string };

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export default function App() {
  const [health, setHealth] = useState<Health>({ state: 'loading' });

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then(async (res) => {
        const body = await res.json();
        if (res.ok) setHealth({ state: 'ok', checks: body.checks });
        else
          setHealth({ state: 'error', message: 'The server is running, but something is down.' });
      })
      .catch(() =>
        setHealth({ state: 'error', message: 'Cannot reach the server. Is the backend running?' }),
      );
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 py-12 text-slate-900">
      <h1 className="text-3xl font-bold">KaziForce</h1>
      <p className="mt-2 text-slate-700">Job alerts that reach you on time.</p>

      <section
        aria-labelledby="status-heading"
        className="mt-8 rounded-lg border border-slate-300 p-4"
      >
        <h2 id="status-heading" className="text-xl font-semibold">
          System status
        </h2>
        <div role="status" aria-live="polite" className="mt-2">
          {health.state === 'loading' && <p>Checking…</p>}
          {health.state === 'error' && <p className="text-red-800">{health.message}</p>}
          {health.state === 'ok' && (
            <ul className="space-y-1">
              {Object.entries(health.checks).map(([name, check]) => (
                <li key={name}>
                  {name}: <strong>{check.status === 'up' ? 'working' : 'not working'}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
