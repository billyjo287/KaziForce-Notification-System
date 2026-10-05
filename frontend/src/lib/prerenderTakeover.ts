// The landing, log-in and sign-up pages arrive as ready-made HTML (scripts/prerender.mjs,
// ADR 0010), so people can start typing before the app has downloaded. When the app replaces
// that copy with the live page, nothing they did is lost: typed text and choices are carried
// over, the focus stays in the same box, the page does not jump, and the last button they
// pressed (for example "Log in") is pressed again.
// Downloaded separately, at the same time as the page's own code, so the app shell stays small.

type Field = { name: string; type: string; value: string; checked: boolean };

/** Sets a box's value the way typing would, so the form library notices the change. */
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Notes what the person did on the ready-made copy; the returned function replays it. */
export function snapshot(copy: HTMLElement) {
  const fields: Field[] = [...copy.querySelectorAll<HTMLInputElement>('input[name]')].map((i) => ({
    name: i.name,
    type: i.type,
    value: i.value,
    checked: i.checked,
  }));
  const active = document.activeElement;
  const focused =
    active instanceof HTMLInputElement && copy.contains(active) && active.name ? active.name : null;
  const scrollY = window.scrollY;

  return function replay(root: HTMLElement) {
    const find = (name: string, value?: string) =>
      root.querySelector<HTMLInputElement>(
        `input[name="${CSS.escape(name)}"]${value === undefined ? '' : `[value="${CSS.escape(value)}"]`}`,
      );
    for (const field of fields) {
      if (field.type === 'radio' || field.type === 'checkbox') {
        const input = find(field.name, field.type === 'radio' ? field.value : undefined);
        if (input && field.checked !== input.checked) input.click();
      } else if (field.value) {
        const input = find(field.name);
        if (input && input.value !== field.value) typeInto(input, field.value);
      }
    }
    if (focused) find(focused)?.focus({ preventScroll: true });
    window.scrollTo(0, scrollY);
    const press = (window as { kfPendingPress?: number }).kfPendingPress;
    if (press !== undefined) root.querySelectorAll('button')[press]?.click();
  };
}
