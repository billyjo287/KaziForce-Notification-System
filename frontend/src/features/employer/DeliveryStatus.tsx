import { CircleCheck, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { addPageStrings } from '../../i18n/addPageStrings';
import deliveryEn from '../../i18n/locales/employerDelivery.en.json';
import deliverySw from '../../i18n/locales/employerDelivery.sw.json';
import type { DeliveryState, JobDelivery } from '../../types/api';

// Its words arrive with the employer's job page only.
addPageStrings(deliveryEn, deliverySw);

const ORDER: DeliveryState[] = ['seen', 'delivered', 'sent', 'waiting', 'not_delivered'];

/**
 * "Who got your job alert" (Phase 7, business view): how many matching workers the job alert
 * reached and how many opened it. Totals only: which workers got it is their business.
 */
export function JobAlertReach({ jobAlert }: { jobAlert: JobDelivery['jobAlert'] }) {
  const { t } = useTranslation();
  const share = jobAlert.total > 0 ? jobAlert.seen / jobAlert.total : 0;
  const seenBy = t('employer.delivery.seenBy', { seen: jobAlert.seen, total: jobAlert.total });

  return (
    <Card className="mt-6">
      <section aria-labelledby="reach-title" className="flex flex-col gap-3">
        <div>
          <h2 id="reach-title" className="flex items-center gap-2 text-xl font-bold">
            <Radio aria-hidden="true" className="size-6 text-primary" />
            {t('employer.delivery.title')}
          </h2>
          <p className="text-ink-muted">{t('employer.delivery.help')}</p>
        </div>
        {jobAlert.total === 0 ? (
          <p>{t('employer.delivery.none')}</p>
        ) : (
          <>
            <p className="text-lg font-bold">{seenBy}</p>
            <div
              role="meter"
              aria-label={seenBy}
              aria-valuemin={0}
              aria-valuemax={jobAlert.total}
              aria-valuenow={jobAlert.seen}
              className="h-3 overflow-hidden rounded-full bg-primary-soft"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }}
              />
            </div>
            <ul className="flex flex-col gap-1">
              {ORDER.filter((state) => jobAlert[state] > 0).map((state) => (
                <li key={state} className="flex justify-between gap-3 border-b border-line py-1">
                  <span>{t(`employer.delivery.states.${state}`)}</span>
                  <span className="font-bold tabular-nums">{jobAlert[state]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </Card>
  );
}

/** Under an applicant: did they see your decision and your last message? */
export function ApplicantDelivery({
  status,
}: {
  status: JobDelivery['applicants'][string] | undefined;
}) {
  const { t } = useTranslation();
  if (!status || (!status.statusUpdate && !status.message)) return null;
  const line = (key: 'decision' | 'message', state: DeliveryState) => (
    <li className="flex items-center gap-1.5">
      {state === 'seen' && (
        <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
      )}
      {t(`employer.delivery.${key}`, { state: t(`employer.delivery.short.${state}`) })}
    </li>
  );
  return (
    <ul className="text-ink-muted">
      {status.statusUpdate && line('decision', status.statusUpdate)}
      {status.message && line('message', status.message)}
    </ul>
  );
}
