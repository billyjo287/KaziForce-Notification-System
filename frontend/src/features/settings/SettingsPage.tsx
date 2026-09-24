import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { HelpText } from '../../components/ui/Field';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { LANGUAGES, type Language } from '../../i18n';
import { usePageTitle } from '../../lib/usePageTitle';
import { useSettings, type TextSize } from '../../stores/settings';
import { showToast } from '../../stores/toasts';

const TEXT_SIZES: TextSize[] = ['normal', 'large'];

/**
 * Settings shared by all three sides. Phase 1: language, text size, reduce motion.
 * Notification settings (channels, quiet hours, presets) are added in Phase 6.
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('settings.title'));
  const { textSize, reduceMotion, setTextSize, setReduceMotion } = useSettings();
  const textSizeId = useId();

  const confirm = () => showToast({ message: t('settings.saved') });

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-3xl font-bold">{t('settings.title')}</h1>

      <Card>
        <h2 className="mb-5 text-xl font-bold">{t('settings.display')}</h2>
        <div className="flex flex-col gap-8">
          <Select
            label={t('settings.language.label')}
            help={t('settings.language.help')}
            value={i18n.language}
            options={LANGUAGES.map((lng) => ({
              value: lng,
              label: t(`languages.${lng}`),
              lang: lng,
            }))}
            onValueChange={(lng) => {
              void i18n.changeLanguage(lng as Language).then(confirm);
            }}
          />

          {/* Two choices: big radio buttons are simpler than a dropdown. */}
          <fieldset aria-describedby={`${textSizeId}-help`}>
            <legend className="text-lg font-bold">{t('settings.textSize.label')}</legend>
            <HelpText id={`${textSizeId}-help`}>{t('settings.textSize.help')}</HelpText>
            <div className="mt-3 flex flex-wrap gap-3">
              {TEXT_SIZES.map((size) => (
                <label
                  key={size}
                  className="flex min-h-12 min-w-40 flex-1 cursor-pointer items-center gap-3 rounded-xl border-2 sm:flex-none border-line-strong bg-surface px-4 font-bold has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
                >
                  <input
                    type="radio"
                    name="text-size"
                    value={size}
                    checked={textSize === size}
                    onChange={() => {
                      setTextSize(size);
                      confirm();
                    }}
                    className="size-5 accent-(--kf-primary) focus-visible:outline-none"
                  />
                  <span className={size === 'large' ? 'text-xl' : ''}>
                    {t(`settings.textSize.${size}`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Switch
            label={t('settings.reduceMotion.label')}
            help={t('settings.reduceMotion.help')}
            checked={reduceMotion}
            onCheckedChange={(on) => {
              setReduceMotion(on);
              confirm();
            }}
          />
        </div>
      </Card>
    </div>
  );
}
