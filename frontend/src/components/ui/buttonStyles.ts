export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-[background-color,border-color,opacity] duration-150 ease-out-soft disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary: 'border-2 border-line-strong bg-surface text-ink hover:bg-canvas',
  ghost: 'text-primary underline-offset-4 hover:underline',
  danger: 'border-2 border-urgent bg-surface text-urgent hover:bg-urgent-soft',
};

// md = 48px tall, lg = 56px tall: both above the 44px minimum tap target.
const sizes: Record<ButtonSize, string> = {
  md: 'min-h-12 px-5',
  lg: 'min-h-14 px-7 text-lg',
};

/** Classes for anything that should look like a button (also links). */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra = '',
): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}
