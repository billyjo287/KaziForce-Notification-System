import { useCountUp } from './hooks';

/**
 * A number that counts up once when it appears (design refresh: stat cards and KPI tiles). The
 * counting is only drawn (CSS `content`, not text), so screen readers, copy and search get the
 * real number at once, never the numbers in between. Reduced motion: the real number, no
 * counting (useCountUp).
 */
export function CountUp({
  value,
  format = String,
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const shown = format(Math.round(useCountUp(value)));
  return (
    <>
      <span aria-hidden="true" data-n={shown} className="before:content-[attr(data-n)]" />
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
