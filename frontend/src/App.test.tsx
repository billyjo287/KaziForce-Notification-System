import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

function mockFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

describe('App (Phase 0 placeholder)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows each backend dependency as working when healthy', async () => {
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ checks: { database: { status: 'up' }, redis: { status: 'up' } } }),
      }),
    );

    render(<App />);

    expect(screen.getByRole('heading', { name: 'KaziForce' })).toBeInTheDocument();
    expect(await screen.findByText(/database/)).toHaveTextContent('database: working');
    expect(screen.getByText(/redis/)).toHaveTextContent('redis: working');
  });

  it('explains the problem in plain words when the server cannot be reached', async () => {
    mockFetch(() => Promise.reject(new Error('network')));

    render(<App />);

    expect(await screen.findByText(/Cannot reach the server/)).toBeInTheDocument();
  });
});
