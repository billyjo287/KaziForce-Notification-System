import { lazy, Suspense } from 'react';

// Toast messages only appear after the user does something, so their code is downloaded right
// after the page is shown instead of being part of the first download.
const Toaster = lazy(() => import('./Toaster'));

export function LazyToaster() {
  return (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  );
}
