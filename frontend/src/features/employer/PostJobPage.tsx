import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { usePostJob } from '../../api/hooks';
import { LocationSelect, SkillSelect } from '../../components/LookupSelects';
import { BackLink } from '../../components/ui/BackLink';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ChoiceCards } from '../../components/ui/ChoiceCards';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { showToast } from '../../stores/toasts';

const schema = z
  .object({
    title: z.string().trim().min(5, 'validation.titleMin').max(120, 'validation.tooLong'),
    description: z
      .string()
      .trim()
      .min(10, 'validation.descriptionMin')
      .max(2000, 'validation.tooLong'),
    locationId: z.string().min(1, 'validation.choose'),
    skillId: z.string().min(1, 'validation.choose'),
    pay: z.string().trim().max(80, 'validation.tooLong'),
    date: z.string().min(1, 'validation.required'),
    time: z.string().min(1, 'validation.required'),
    urgent: z.enum(['yes', 'no'], 'validation.choose'),
  })
  .refine((v) => new Date(`${v.date}T${v.time}`).getTime() > Date.now(), {
    path: ['date'],
    message: 'validation.deadlinePast',
  });
type Form = z.infer<typeof schema>;

const pad = (n: number) => String(n).padStart(2, '0');
/** Tomorrow at 17:00 local time: a sensible starting point. */
function defaultDeadline() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: '17:00' };
}

/** Post a job on ONE page (PRD section 8, Phase 2 item 7). */
export default function PostJobPage() {
  const { t } = useTranslation();
  usePageTitle(t('employer.post.title'));
  const navigate = useNavigate();
  const postJob = usePostJob();
  const errorMessage = useApiErrorMessage();
  const [serverError, setServerError] = useState<string | null>(null);
  const today = defaultDeadline().date;
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { pay: '', locationId: '', skillId: '', ...defaultDeadline() },
  });
  const message = (error?: { message?: string }) =>
    error && t(error.message ?? 'validation.required');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const job = await postJob.mutateAsync({
        title: values.title,
        description: values.description,
        locationId: values.locationId,
        skillId: values.skillId,
        pay: values.pay || undefined,
        deadline: new Date(`${values.date}T${values.time}`).toISOString(),
        urgent: values.urgent === 'yes',
      });
      showToast({ message: t('employer.post.posted') });
      navigate(`/employer/jobs/${job.id}`, { replace: true });
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });

  return (
    <div className="max-w-2xl">
      <BackLink to="/employer/jobs">{t('employer.applicants.back')}</BackLink>
      <h1 className="text-3xl font-bold">{t('employer.post.title')}</h1>
      <p className="mt-2 mb-6 text-lg text-ink-muted">{t('employer.post.intro')}</p>

      <Card>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          {serverError && <FormAlert>{serverError}</FormAlert>}
          <Input
            label={t('employer.post.jobTitle')}
            help={t('employer.post.jobTitleHelp')}
            maxLength={120}
            error={message(errors.title)}
            {...register('title')}
          />
          <Textarea
            label={t('employer.post.description')}
            help={t('employer.post.descriptionHelp')}
            maxLength={2000}
            error={message(errors.description)}
            {...register('description')}
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <Controller
              control={control}
              name="locationId"
              render={({ field }) => (
                <LocationSelect
                  label={t('employer.post.location')}
                  placeholder={t('employer.post.choose')}
                  value={field.value || undefined}
                  onChange={(v) => field.onChange(v ?? '')}
                  error={message(errors.locationId)}
                />
              )}
            />
            <Controller
              control={control}
              name="skillId"
              render={({ field }) => (
                <SkillSelect
                  label={t('employer.post.skill')}
                  placeholder={t('employer.post.choose')}
                  value={field.value || undefined}
                  onChange={(v) => field.onChange(v ?? '')}
                  error={message(errors.skillId)}
                />
              )}
            />
          </div>
          <Input
            label={t('employer.post.pay')}
            help={t('employer.post.payHelp')}
            maxLength={80}
            error={message(errors.pay)}
            {...register('pay')}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('employer.post.date')}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t('employer.post.date')}
                help={t('employer.post.deadlineHelp')}
                type="date"
                min={today}
                error={message(errors.date)}
                {...register('date')}
              />
              <Input
                label={t('employer.post.time')}
                type="time"
                error={message(errors.time)}
                {...register('time')}
              />
            </div>
          </fieldset>
          <Controller
            control={control}
            name="urgent"
            render={({ field }) => (
              <ChoiceCards<'yes' | 'no'>
                legend={t('employer.post.urgent')}
                name="urgent"
                value={field.value}
                onChange={field.onChange}
                error={message(errors.urgent)}
                columns={2}
                choices={[
                  {
                    value: 'yes',
                    label: t('employer.post.urgentYes'),
                    help: t('employer.post.urgentYesHelp'),
                    icon: TriangleAlert,
                  },
                  { value: 'no', label: t('employer.post.urgentNo') },
                ]}
              />
            )}
          />
          <Button type="submit" size="lg" disabled={postJob.isPending}>
            {postJob.isPending ? t('employer.post.posting') : t('employer.post.submit')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
