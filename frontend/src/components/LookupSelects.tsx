import { useLocations, useSkills } from '../api/hooks';
import { useSkillName } from '../lib/useSkillName';
import { Select } from './ui/Select';

const ANY = 'any';

interface LookupSelectProps {
  label: string;
  help?: string;
  error?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Label of the "no filter" option, e.g. "Any place". Omit to require a choice. */
  anyLabel?: string;
  /** Placeholder shown before anything is chosen (when there is no "any" option). */
  placeholder?: string;
}

/** Kenyan places, alphabetical. */
export function LocationSelect({
  anyLabel,
  value,
  onChange,
  placeholder,
  ...props
}: LookupSelectProps) {
  const { data = [] } = useLocations();
  const options = [
    ...(anyLabel ? [{ value: ANY, label: anyLabel }] : []),
    ...data.map((l) => ({ value: l.id, label: l.name })),
  ];
  return (
    <Select
      {...props}
      value={value ?? (anyLabel ? ANY : '')}
      placeholder={placeholder}
      options={options}
      onValueChange={(v) => onChange(v === ANY ? undefined : v)}
    />
  );
}

/** Skills in the current language. */
export function SkillSelect({
  anyLabel,
  value,
  onChange,
  placeholder,
  ...props
}: LookupSelectProps) {
  const { data = [] } = useSkills();
  const skillName = useSkillName();
  const options = [
    ...(anyLabel ? [{ value: ANY, label: anyLabel }] : []),
    ...data
      .map((s) => ({ value: s.id, label: skillName(s) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  return (
    <Select
      {...props}
      value={value ?? (anyLabel ? ANY : '')}
      placeholder={placeholder}
      options={options}
      onValueChange={(v) => onChange(v === ANY ? undefined : v)}
    />
  );
}
