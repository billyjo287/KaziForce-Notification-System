/**
 * Small buttons in page headers (theme, log out). Always icon + word, at least 44 px tall.
 * compact: word under the icon (phone top bar); otherwise side by side.
 */
export function headerButtonClasses(compact: boolean, pressed = false): string {
  const layout = compact
    ? 'min-w-13 flex-col justify-center gap-0.5 px-1.5 py-1 text-sm'
    : 'gap-2 px-3';
  const state = pressed
    ? 'border-primary bg-primary-soft text-ink'
    : 'border-line-strong bg-surface text-ink hover:bg-canvas';
  return `inline-flex min-h-11 items-center rounded-lg border-2 font-bold transition-colors duration-150 disabled:opacity-60 ${layout} ${state}`;
}
