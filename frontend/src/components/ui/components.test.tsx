import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog } from './Dialog';
import { EmptyState } from './EmptyState';
import { Input } from './Input';
import { Switch } from './Switch';
import { Inbox } from 'lucide-react';

describe('Input', () => {
  it('connects the label, help and error text for screen readers', () => {
    render(<Input label="Phone number" help="We send a code." error="Enter a Kenyan number." />);
    const input = screen.getByLabelText('Phone number');

    expect(input).toHaveAccessibleDescription('We send a code. Enter a Kenyan number.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('is not marked invalid without an error', () => {
    render(<Input label="Your full name" />);
    expect(screen.getByLabelText('Your full name')).not.toHaveAttribute('aria-invalid');
  });
});

describe('Switch', () => {
  function Example() {
    const [on, setOn] = useState(false);
    return (
      <Switch
        label="Daily summary email"
        help="One email a day."
        checked={on}
        onCheckedChange={setOn}
      />
    );
  }

  it('toggles with the keyboard', async () => {
    render(<Example />);
    const toggle = screen.getByRole('switch', { name: 'Daily summary email' });
    toggle.focus();
    await userEvent.keyboard(' ');
    expect(toggle).toBeChecked();
  });
});

describe('Dialog', () => {
  it('has a title and closes with the Close button', async () => {
    function Example() {
      const [open, setOpen] = useState(true);
      return <Dialog open={open} onOpenChange={setOpen} title="Turn on quiet hours?" />;
    }
    render(<Example />);

    expect(screen.getByRole('dialog', { name: 'Turn on quiet hours?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('shows a heading and plain-language text', () => {
    render(<EmptyState icon={Inbox} title="No alerts yet" body="They will show up here." />);
    expect(screen.getByRole('heading', { name: 'No alerts yet' })).toBeInTheDocument();
  });
});
