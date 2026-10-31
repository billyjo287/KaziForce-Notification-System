import { Bell, BellRing, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import '../../components/brand/strings';
import { SuccessBurst } from '../../components/brand/SuccessBurst';
import { useFinishOnboarding, useSetChannels, useSetPreset } from '../../api/hooks';
import { useRestoreSession } from '../../lib/useRestoreSession';
import { Button } from '../../components/ui/Button';
import { ChoiceCards } from '../../components/ui/ChoiceCards';
import { FormAlert } from '../../components/ui/FormAlert';
import { formatPhone } from '../../lib/phone';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { PageSkeleton } from '../../pages/StatusPages';
import { homePath, useAuth } from '../../stores/auth';
import type { ExternalChannel, PresetName } from '../../types/api';
import { AuthLayout } from '../auth/AuthLayout';
import { PhoneVerification } from './PhoneVerification';
import './strings';

type Step = 'phone' | 'questions' | 'preset';

/**
 * Onboarding steps 2 and 3 (step 1, "looking for work / hiring", is on the sign-up page).
 * Step 2: phone + consent + SMS code, then "WhatsApp on this number?" and "where do you check
 * messages most?". Step 3: a notification preset. Steps 2 and 3 can be skipped.
 */
export default function OnboardingPage() {
  const { t } = useTranslation();
  const status = useRestoreSession();
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const errorMessage = useApiErrorMessage();
  const setChannels = useSetChannels();
  const setPreset = useSetPreset();
  const finish = useFinishOnboarding();
  const [step, setStepState] = useState<Step>(() => (user?.phoneVerified ? 'questions' : 'phone'));
  const [usesWhatsApp, setUsesWhatsApp] = useState<'yes' | 'no' | undefined>();
  const [checksMost, setChecksMost] = useState<ExternalChannel | undefined>();
  const [preset, setPresetChoice] = useState<PresetName>('recommended');
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Set as the last step (or Skip) is saved: the account then counts as onboarded, and this page
  // shows "You're all set" instead of sending the person straight on.
  const [finishing, setFinishing] = useState(false);
  const done = finishing && !!user?.onboardingCompleted;
  const heading = useRef<HTMLHeadingElement>(null);
  usePageTitle(
    done
      ? t('brand.success.profileCreated.titleNoName')
      : t(step === 'preset' ? 'onboarding.preset.title' : 'onboarding.phone.title'),
  );

  // Each new step starts clean, and focus moves to its heading for screen readers.
  const setStep = (next: Step) => {
    setServerError(null);
    setShowErrors(false);
    setStepState(next);
  };
  useEffect(() => {
    heading.current?.focus();
  }, [step, done]);

  if (status === 'unknown') return <PageSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin' || (user.onboardingCompleted && !finishing))
    return <Navigate to={homePath(user.role)} replace />;

  const goHome = () => navigate(homePath(user.role), { replace: true });

  async function saveQuestions() {
    if (!usesWhatsApp || !checksMost) {
      setShowErrors(true);
      return;
    }
    try {
      await setChannels.mutateAsync({ usesWhatsApp: usesWhatsApp === 'yes', checksMost });
      setStep('preset');
    } catch (error) {
      setServerError(errorMessage(error));
    }
  }

  async function savePreset() {
    setFinishing(true);
    try {
      await setPreset.mutateAsync(preset);
    } catch (error) {
      setFinishing(false);
      setServerError(errorMessage(error));
    }
  }

  async function skipAll() {
    setFinishing(true);
    try {
      await finish.mutateAsync();
    } catch (error) {
      setFinishing(false);
      setServerError(errorMessage(error));
    }
  }

  if (done) {
    const firstName = user.name.split(' ')[0];
    const worker = user.role === 'worker';
    return (
      <AuthLayout>
        {/* The confetti flies wider than the column; clip it sideways so phones never scroll. */}
        <div className="flex flex-col items-center gap-4 overflow-x-clip py-6 text-center">
          <SuccessBurst size={112} />
          <h1 ref={heading} tabIndex={-1} className="mt-4 text-3xl font-bold outline-none">
            {firstName
              ? t('brand.success.profileCreated.title', { name: firstName })
              : t('brand.success.profileCreated.titleNoName')}
          </h1>
          <p className="text-lg text-ink-muted">
            {t(
              worker
                ? 'brand.success.profileCreated.body'
                : 'brand.success.profileCreated.bodyBusiness',
            )}
          </p>
          <Button
            size="lg"
            className="mt-2 w-full"
            onClick={() => (worker ? navigate('/worker/jobs', { replace: true }) : goHome())}
          >
            {t(
              worker
                ? 'brand.success.profileCreated.cta'
                : 'brand.success.profileCreated.ctaBusiness',
            )}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const stepNumber = step === 'preset' ? 3 : 2;
  const channelChoices = [
    ...(usesWhatsApp === 'no'
      ? []
      : [
          {
            value: 'whatsapp' as const,
            label: t('onboarding.questions.channelWhatsapp'),
            icon: MessageSquare,
          },
        ]),
    { value: 'sms' as const, label: t('onboarding.questions.channelSms'), icon: Smartphone },
    { value: 'email' as const, label: t('onboarding.questions.channelEmail'), icon: Mail },
  ];

  return (
    <AuthLayout>
      <p className="font-bold text-ink-muted">{t('onboarding.step', { step: stepNumber })}</p>

      {step === 'phone' && (
        <>
          <div>
            <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold outline-none">
              {t('onboarding.phone.title')}
            </h1>
            <p className="mt-2 text-lg text-ink-muted">{t('onboarding.phone.intro')}</p>
          </div>
          <PhoneVerification onVerified={() => setStep('questions')} />
          <Button variant="ghost" onClick={() => setStep('preset')}>
            {t('onboarding.skip')}
          </Button>
        </>
      )}

      {step === 'questions' && (
        <>
          <div>
            <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold outline-none">
              {t('onboarding.questions.title')}
            </h1>
            {user.phone && (
              <p className="mt-2 text-lg text-ink-muted">
                {t('onboarding.phone.verified', { phone: formatPhone(user.phone) })}
              </p>
            )}
          </div>
          {serverError && <FormAlert>{serverError}</FormAlert>}
          <ChoiceCards<'yes' | 'no'>
            legend={t('onboarding.questions.whatsapp')}
            name="usesWhatsApp"
            value={usesWhatsApp}
            columns={2}
            error={showErrors && !usesWhatsApp ? t('validation.choose') : undefined}
            onChange={(value) => {
              setUsesWhatsApp(value);
              if (value === 'no' && checksMost === 'whatsapp') setChecksMost(undefined);
            }}
            choices={[
              { value: 'yes', label: t('onboarding.questions.yes') },
              { value: 'no', label: t('onboarding.questions.no') },
            ]}
          />
          <ChoiceCards<ExternalChannel>
            legend={t('onboarding.questions.checksMost')}
            name="checksMost"
            value={checksMost}
            error={showErrors && !checksMost ? t('validation.choose') : undefined}
            onChange={setChecksMost}
            choices={channelChoices}
          />
          <Button size="lg" onClick={saveQuestions} disabled={setChannels.isPending}>
            {t('common.continue')}
          </Button>
          <Button variant="ghost" onClick={() => setStep('preset')}>
            {t('onboarding.skip')}
          </Button>
        </>
      )}

      {step === 'preset' && (
        <>
          <div>
            <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold outline-none">
              {t('onboarding.preset.title')}
            </h1>
            <p className="mt-2 text-lg text-ink-muted">{t('onboarding.preset.intro')}</p>
          </div>
          {serverError && <FormAlert>{serverError}</FormAlert>}
          <ChoiceCards<PresetName>
            legend={t('onboarding.preset.title')}
            hideLegend
            name="preset"
            value={preset}
            onChange={setPresetChoice}
            choices={[
              {
                value: 'recommended',
                label: t('onboarding.preset.recommended'),
                help: t('onboarding.preset.recommendedHelp'),
                icon: Bell,
              },
              {
                value: 'urgent_only',
                label: t('onboarding.preset.urgent_only'),
                help: t('onboarding.preset.urgent_onlyHelp'),
                icon: BellRing,
              },
              {
                value: 'everything',
                label: t('onboarding.preset.everything'),
                help: t('onboarding.preset.everythingHelp'),
                icon: Mail,
              },
            ]}
          />
          <Button size="lg" onClick={savePreset} disabled={setPreset.isPending}>
            {t('onboarding.preset.finish')}
          </Button>
          <Button variant="ghost" onClick={skipAll} disabled={finish.isPending}>
            {t('onboarding.skip')}
          </Button>
        </>
      )}
    </AuthLayout>
  );
}
