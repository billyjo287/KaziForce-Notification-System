import { Switch as RadixSwitch } from 'radix-ui';
import { useId } from 'react';
import { describedBy } from '../../lib/describedBy';
import { HelpText } from './Field';

interface SwitchProps {
  label: string;
  help?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** On/off setting: label and help on the left, a large switch on the right. */
export function Switch({ label, help, checked, onCheckedChange }: SwitchProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-lg font-bold">
          {label}
        </label>
        {help && helpId && <HelpText id={helpId}>{help}</HelpText>}
      </div>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={describedBy(helpId)}
        className="relative mt-0.5 inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 border-line-strong bg-canvas transition-colors duration-150 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      >
        {/* The thumb moves AND changes colour, so on/off is clear without colour alone. */}
        <RadixSwitch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-line-strong transition-transform duration-150 ease-out-soft data-[state=checked]:translate-x-6 data-[state=checked]:bg-on-primary" />
      </RadixSwitch.Root>
    </div>
  );
}
