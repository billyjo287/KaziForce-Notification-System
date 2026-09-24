import { Check, ChevronDown } from 'lucide-react';
import { Select as RadixSelect } from 'radix-ui';
import { useId } from 'react';
import { describedBy } from '../../lib/describedBy';
import { HelpText } from './Field';

export interface SelectOption {
  value: string;
  label: string;
  /** Language of the label, e.g. "sw" for "Kiswahili", so screen readers pronounce it well. */
  lang?: string;
}

interface SelectProps {
  label: string;
  help?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
}

export function Select({ label, help, value, options, onValueChange }: SelectProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-lg font-bold">
        {label}
      </label>
      {help && helpId && <HelpText id={helpId}>{help}</HelpText>}
      <RadixSelect.Root value={value} onValueChange={onValueChange}>
        <RadixSelect.Trigger
          id={id}
          aria-describedby={describedBy(helpId)}
          className="inline-flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border-2 border-line-strong bg-surface px-4 text-left text-lg sm:max-w-sm"
        >
          <RadixSelect.Value />
          <RadixSelect.Icon>
            <ChevronDown aria-hidden="true" className="size-5" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={6}
            className="z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-xl border-2 border-line-strong bg-surface text-ink shadow-lg"
          >
            <RadixSelect.Viewport className="p-1.5">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  lang={option.lang}
                  className="relative flex min-h-12 cursor-pointer items-center rounded-lg pr-3 pl-10 text-lg outline-none select-none data-highlighted:bg-primary-soft"
                >
                  <RadixSelect.ItemIndicator className="absolute left-3">
                    <Check aria-hidden="true" className="size-5 text-primary" />
                  </RadixSelect.ItemIndicator>
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}
