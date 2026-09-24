import { Check, Phone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSkills, useUpdateProfile } from '../../api/hooks';
import { LocationSelect } from '../../components/LookupSelects';
import { useSkillName } from '../../lib/useSkillName';
import { BackLink } from '../../components/ui/BackLink';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { formatPhone } from '../../lib/phone';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { sidePath, useAuth } from '../../stores/auth';
import { showToast } from '../../stores/toasts';
import type { User } from '../../types/api';
import { PhoneVerification } from '../onboarding/PhoneVerification';

const MAX_SKILLS = 5;

/**
 * Worker "Your profile" (name, place, up to 5 skills) and employer "Company profile"
 * (company name, place). Both can change their phone number.
 */
export default function ProfilePage() {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  return <ProfileForm user={user} />;
}

function ProfileForm({ user }: { user: User }) {
  const { t } = useTranslation();
  const isEmployer = user.role === 'business';
  usePageTitle(t(isEmployer ? 'employer.company.title' : 'profile.title'));
  const update = useUpdateProfile();
  const errorMessage = useApiErrorMessage();
  const { data: allSkills = [] } = useSkills();
  const skillName = useSkillName();
  const [name, setName] = useState(isEmployer ? (user.companyName ?? '') : user.name);
  const [locationId, setLocationId] = useState(user.location?.id);
  const [skillIds, setSkillIds] = useState(user.skills.map((s) => s.id));
  const [nameError, setNameError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [changingPhone, setChangingPhone] = useState(false);

  const toggleSkill = (id: string) =>
    setSkillIds((current) =>
      current.includes(id)
        ? current.filter((s) => s !== id)
        : current.length < MAX_SKILLS
          ? [...current, id]
          : current,
    );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setNameError(t('validation.nameMin'));
      return;
    }
    setNameError(undefined);
    setServerError(null);
    try {
      await update.mutateAsync(
        isEmployer
          ? { companyName: name.trim(), locationId: locationId ?? null }
          : { name: name.trim(), locationId: locationId ?? null, skillIds },
      );
      showToast({ message: t('common.saved') });
    } catch (error) {
      setServerError(errorMessage(error));
    }
  }

  return (
    <div className="max-w-2xl">
      <BackLink to={`${sidePath(user.role)}/settings`}>{t('profile.back')}</BackLink>
      <h1 className="mb-6 text-3xl font-bold">
        {t(isEmployer ? 'employer.company.title' : 'profile.title')}
      </h1>

      <Card>
        <form onSubmit={save} noValidate className="flex flex-col gap-6">
          {serverError && <FormAlert>{serverError}</FormAlert>}
          <Input
            label={t(isEmployer ? 'employer.company.name' : 'profile.name')}
            help={isEmployer ? t('employer.company.nameHelp') : undefined}
            autoComplete={isEmployer ? 'organization' : 'name'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={nameError}
          />
          <LocationSelect
            label={t(isEmployer ? 'employer.company.location' : 'profile.location')}
            help={isEmployer ? undefined : t('profile.locationHelp')}
            placeholder={t('employer.post.choose')}
            value={locationId}
            onChange={setLocationId}
          />

          {!isEmployer && (
            <fieldset aria-describedby="skills-help skills-count">
              <legend className="text-lg font-bold">{t('profile.skills')}</legend>
              <p id="skills-help" className="text-ink-muted">
                {t('profile.skillsHelp')}
              </p>
              <p id="skills-count" className="mt-1 font-bold" aria-live="polite">
                {skillIds.length >= MAX_SKILLS
                  ? t('profile.skillsFull')
                  : t('profile.skillsCount', { count: skillIds.length })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...allSkills]
                  .sort((a, b) => skillName(a).localeCompare(skillName(b)))
                  .map((skill) => {
                    const chosen = skillIds.includes(skill.id);
                    const disabled = !chosen && skillIds.length >= MAX_SKILLS;
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        aria-pressed={chosen}
                        disabled={disabled}
                        onClick={() => toggleSkill(skill.id)}
                        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                          chosen
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-line-strong bg-surface text-ink hover:bg-canvas'
                        }`}
                      >
                        {chosen && <Check aria-hidden="true" className="size-4" strokeWidth={3} />}
                        {skillName(skill)}
                      </button>
                    );
                  })}
              </div>
            </fieldset>
          )}

          <Button type="submit" size="lg" disabled={update.isPending} className="self-start">
            {update.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </form>
      </Card>

      <Card className="mt-6">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Phone aria-hidden="true" className="size-5" />
          {t('profile.phoneTitle')}
        </h2>
        {changingPhone ? (
          <div className="mt-4">
            <PhoneVerification onVerified={() => setChangingPhone(false)} />
          </div>
        ) : (
          <div className="mt-2 flex flex-col items-start gap-3">
            <p className="text-lg">
              {user.phone && user.phoneVerified
                ? t('profile.phoneVerified', { phone: formatPhone(user.phone) })
                : t('profile.phoneNone')}
            </p>
            <Button variant="secondary" onClick={() => setChangingPhone(true)}>
              {user.phone ? t('profile.changePhone') : t('profile.addPhone')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
