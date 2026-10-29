# Wiring the KaziForce tokens into Tailwind

The colours live as CSS variables in `theme.css`, so dark mode works by switching
`data-theme` on `<html>`. Tailwind classes should point at those variables, never at
raw hex values. Use whichever block matches the Tailwind version in package.json.

## Tailwind v3 (tailwind.config.js)

```js
// tailwind.config.js: merge into the existing config, don't replace it
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        kf: {
          bg: 'var(--kf-bg)',
          surface: 'var(--kf-surface)',
          'surface-2': 'var(--kf-surface-2)',
          line: 'var(--kf-line)',
          'line-strong': 'var(--kf-line-strong)',
          text: 'var(--kf-text)',
          'text-2': 'var(--kf-text-2)',
          muted: 'var(--kf-muted)',
          faint: 'var(--kf-faint)',
          primary: 'var(--kf-primary)',
          'primary-strong': 'var(--kf-primary-strong)',
          'primary-text': 'var(--kf-primary-text)',
          'primary-soft': 'var(--kf-primary-soft)',
          'on-primary-soft': 'var(--kf-on-primary-soft)',
          accent: 'var(--kf-accent)',
          'on-accent': 'var(--kf-on-accent)',
          inverse: 'var(--kf-inverse)',
          'inverse-2': 'var(--kf-inverse-2)',
          'on-inverse': 'var(--kf-on-inverse)',
          'on-inverse-2': 'var(--kf-on-inverse-2)',
          'urgent-bg': 'var(--kf-urgent-bg)', 'urgent-fg': 'var(--kf-urgent-fg)', 'urgent-line': 'var(--kf-urgent-line)',
          'medium-bg': 'var(--kf-medium-bg)', 'medium-fg': 'var(--kf-medium-fg)',
          'low-bg': 'var(--kf-low-bg)', 'low-fg': 'var(--kf-low-fg)',
          'success-bg': 'var(--kf-success-bg)', 'success-fg': 'var(--kf-success-fg)',
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        body: ['Figtree', 'system-ui', 'sans-serif'],
      },
      borderRadius: { kf: '14px', 'kf-lg': '22px', 'kf-xl': '28px' },
      boxShadow: { kf: 'var(--kf-shadow)' },
    },
  },
};
```

## Tailwind v4 (in the main CSS file, after `@import "tailwindcss";`)

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

@theme inline {
  --color-kf-bg: var(--kf-bg);
  --color-kf-surface: var(--kf-surface);
  --color-kf-surface-2: var(--kf-surface-2);
  --color-kf-line: var(--kf-line);
  --color-kf-line-strong: var(--kf-line-strong);
  --color-kf-text: var(--kf-text);
  --color-kf-text-2: var(--kf-text-2);
  --color-kf-muted: var(--kf-muted);
  --color-kf-faint: var(--kf-faint);
  --color-kf-primary: var(--kf-primary);
  --color-kf-primary-strong: var(--kf-primary-strong);
  --color-kf-primary-text: var(--kf-primary-text);
  --color-kf-primary-soft: var(--kf-primary-soft);
  --color-kf-on-primary-soft: var(--kf-on-primary-soft);
  --color-kf-accent: var(--kf-accent);
  --color-kf-on-accent: var(--kf-on-accent);
  --color-kf-inverse: var(--kf-inverse);
  --color-kf-inverse-2: var(--kf-inverse-2);
  --color-kf-on-inverse: var(--kf-on-inverse);
  --color-kf-on-inverse-2: var(--kf-on-inverse-2);
  --color-kf-urgent-bg: var(--kf-urgent-bg);
  --color-kf-urgent-fg: var(--kf-urgent-fg);
  --color-kf-urgent-line: var(--kf-urgent-line);
  --color-kf-medium-bg: var(--kf-medium-bg);
  --color-kf-medium-fg: var(--kf-medium-fg);
  --color-kf-low-bg: var(--kf-low-bg);
  --color-kf-low-fg: var(--kf-low-fg);
  --color-kf-success-bg: var(--kf-success-bg);
  --color-kf-success-fg: var(--kf-success-fg);
  --font-display: "Bricolage Grotesque", system-ui, sans-serif;
  --font-body: Figtree, system-ui, sans-serif;
  --radius-kf: 14px;
  --radius-kf-lg: 22px;
  --radius-kf-xl: 28px;
  --shadow-kf: var(--kf-shadow);
}
```

Usage example: `className="bg-kf-surface text-kf-text border border-kf-line rounded-kf-lg"`.
Because the variables already switch per theme, you almost never need `dark:` variants.
