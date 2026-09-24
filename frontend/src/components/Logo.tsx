import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function Logo() {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-2.5 text-xl font-bold">
      <span className="grid size-9 place-items-center rounded-lg bg-primary text-on-primary">
        <Bell aria-hidden="true" className="size-5" strokeWidth={2.5} />
      </span>
      {t('app.name')}
    </span>
  );
}
