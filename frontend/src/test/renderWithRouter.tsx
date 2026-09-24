import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';

/** Renders `element` at `path` inside an in-memory router (no real browser address bar). */
export function renderWithRouter(element: ReactElement, path = '/') {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] });
  return { router, ...render(<RouterProvider router={router} />) };
}
