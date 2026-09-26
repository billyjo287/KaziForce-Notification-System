// Component gallery: every base component in one place, for review, screenshots and
// accessibility testing. Not linked from the menus.
import { Bell, Clock, Inbox, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageToggle } from '../components/LanguageToggle';
import { Logo } from '../components/Logo';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Dialog, DialogClose } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { Select } from '../components/ui/Select';
import { CardListSkeleton } from '../components/ui/Skeleton';
import { Switch } from '../components/ui/Switch';
import { Toaster } from '../components/ui/Toaster';
import { buttonClasses } from '../components/ui/buttonStyles';
import { addPageStrings } from '../i18n/addPageStrings';
import uiKitEn from '../i18n/locales/uiKit.en.json';
import uiKitSw from '../i18n/locales/uiKit.sw.json';
import { usePageTitle } from '../lib/usePageTitle';
import { showToast } from '../stores/toasts';

addPageStrings(uiKitEn, uiKitSw);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function UiKitPage() {
  const { t } = useTranslation();
  usePageTitle(t('uiKit.title'));
  const [dailySummary, setDailySummary] = useState(true);
  const [language, setLanguage] = useState('en');
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="min-h-dvh px-4 py-6 sm:px-8">
      <header className="mx-auto flex max-w-3xl items-center justify-between">
        <Link to="/" className="rounded-lg">
          <Logo />
        </Link>
        <LanguageToggle />
      </header>

      <main className="mx-auto mt-8 flex max-w-3xl flex-col gap-12 pb-16">
        <div>
          <h1 className="text-3xl font-bold">{t('uiKit.title')}</h1>
          <p className="mt-2 text-lg text-ink-muted">{t('uiKit.intro')}</p>
        </div>

        <Section title={t('uiKit.buttons')}>
          <div className="flex flex-wrap gap-3">
            <Button>{t('uiKit.primary')}</Button>
            <Button variant="secondary">{t('uiKit.secondary')}</Button>
            <Button variant="ghost">{t('uiKit.ghost')}</Button>
            <Button variant="danger">{t('uiKit.danger')}</Button>
            <Button size="lg">{t('landing.hero.cta')}</Button>
          </div>
        </Section>

        <Section title={t('uiKit.inputs')}>
          <Input label={t('uiKit.nameLabel')} help={t('uiKit.nameHelp')} autoComplete="name" />
          <Input
            label={t('uiKit.phoneLabel')}
            help={t('uiKit.phoneHelp')}
            error={t('uiKit.phoneError')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue="0712"
          />
        </Section>

        <Section title={t('uiKit.switches')}>
          <Switch
            label={t('uiKit.switchLabel')}
            help={t('uiKit.switchHelp')}
            checked={dailySummary}
            onCheckedChange={setDailySummary}
          />
        </Section>

        <Section title={t('uiKit.selects')}>
          <Select
            label={t('settings.language.label')}
            help={t('settings.language.help')}
            value={language}
            onValueChange={setLanguage}
            options={[
              { value: 'en', label: 'English', lang: 'en' },
              { value: 'sw', label: 'Kiswahili', lang: 'sw' },
            ]}
          />
        </Section>

        <Section title={t('uiKit.dialogs')}>
          <div>
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              {t('uiKit.openDialog')}
            </Button>
          </div>
          <Dialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title={t('uiKit.dialogTitle')}
            description={t('uiKit.dialogBody')}
          >
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <DialogClose className={buttonClasses('secondary')}>
                {t('uiKit.secondary')}
              </DialogClose>
              <DialogClose className={buttonClasses('primary')}>
                {t('uiKit.dialogConfirm')}
              </DialogClose>
            </div>
          </Dialog>
        </Section>

        <Section title={t('uiKit.toasts')}>
          <div>
            <Button
              variant="secondary"
              onClick={() =>
                showToast({
                  message: t('uiKit.toastMessage'),
                  actionLabel: t('common.undo'),
                  onAction: () => showToast({ message: t('settings.saved') }),
                })
              }
            >
              {t('uiKit.showToast')}
            </Button>
          </div>
        </Section>

        <Section title={t('uiKit.badges')}>
          <div className="flex flex-wrap gap-3">
            <Badge tone="urgent" icon={TriangleAlert}>
              {t('priority.urgent')}
            </Badge>
            <Badge tone="important" icon={Bell}>
              {t('priority.medium')}
            </Badge>
            <Badge tone="later" icon={Clock}>
              {t('priority.low')}
            </Badge>
            <Badge tone="success">{t('alerts.new')}</Badge>
            <Badge>{t('roles.worker')}</Badge>
          </div>
        </Section>

        <Section title={t('uiKit.cards')}>
          <Card>
            <h3 className="text-xl font-bold">{t('uiKit.cardTitle')}</h3>
            <p className="mt-1 text-ink-muted">{t('uiKit.cardBody')}</p>
          </Card>
        </Section>

        <Section title={t('uiKit.skeletons')}>
          <CardListSkeleton count={2} />
        </Section>

        <Section title={t('uiKit.empty')}>
          <EmptyState
            icon={Inbox}
            title={t('alerts.empty.tabTitle', { category: t('priority.urgent') })}
            body={t('alerts.empty.tabBody')}
            headingLevel="h2"
          />
        </Section>

        <Section title={t('uiKit.offline')}>
          <OfflineBanner forceShow />
        </Section>
      </main>
      <Toaster />
    </div>
  );
}
