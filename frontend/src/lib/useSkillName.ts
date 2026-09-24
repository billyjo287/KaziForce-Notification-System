import { useTranslation } from 'react-i18next';
import type { Skill } from '../types/api';

/** Skill name in the current language. */
export function useSkillName() {
  const { i18n } = useTranslation();
  return (skill: Pick<Skill, 'nameEn' | 'nameSw'>) =>
    i18n.language === 'sw' ? skill.nameSw : skill.nameEn;
}
