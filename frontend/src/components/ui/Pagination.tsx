import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonClasses } from './buttonStyles';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/** "Previous · Page 2 of 5 · Next" (only shown when there is more than one page). */
export function Pagination({ page, total, pageSize, onPageChange }: PaginationProps) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  return (
    <nav aria-label={t('common.pages')} className="mt-6 flex items-center justify-between gap-3">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={buttonClasses('secondary')}
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t('common.previous')}
      </button>
      <span aria-live="polite">{t('common.pageOf', { page, pages })}</span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        className={buttonClasses('secondary')}
      >
        {t('common.next')}
        <ChevronRight aria-hidden="true" className="size-5" />
      </button>
    </nav>
  );
}
