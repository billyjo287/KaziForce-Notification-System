import { useTranslation } from 'react-i18next';

/**
 * The KaziForce logo (design refresh): a K that is also a person, its head a mint dot sending
 * out a signal. The files live in public/brand; the light-background and dark-background
 * versions are both in the page and CSS shows the one that matches the theme (styles/theme.css,
 * .kf-only-light / .kf-only-dark), so it is right before any code runs. Images, not code: the
 * app's first download stays small. Never recoloured or stretched (handover section 3).
 *
 * `markClassName` sets the height (at least 28 px, the logo's minimum).
 */
export function Logo({ markClassName = 'h-9' }: { markClassName?: string }) {
  const { t } = useTranslation();
  const size = `${markClassName} w-auto max-w-none`;
  return (
    <span className="kf-logo-link flex items-center">
      <img
        src="/brand/kaziforce-logo-light.svg"
        alt={t('app.name')}
        width={463}
        height={100}
        className={`kf-only-light ${size}`}
      />
      <img
        src="/brand/kaziforce-logo-dark.svg"
        alt={t('app.name')}
        width={463}
        height={100}
        className={`kf-only-dark ${size}`}
      />
    </span>
  );
}
