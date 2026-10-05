import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshot } from './prerenderTakeover';

/** The live page: an ordinary React form, like the log-in and sign-up pages. */
function LivePage({ onPress }: { onPress: (email: string, role?: string) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>();
  return (
    <form onSubmit={(e) => (e.preventDefault(), onPress(email, role))}>
      <input name="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {['worker', 'business'].map((value) => (
        <input
          key={value}
          type="radio"
          name="role"
          value={value}
          checked={role === value}
          onChange={() => setRole(value)}
        />
      ))}
      <button type="button">Show password</button>
      <button type="submit">Log in</button>
    </form>
  );
}

describe('taking over from the ready-made page', () => {
  beforeEach(() => void vi.spyOn(window, 'scrollTo').mockImplementation(() => {}));

  it('keeps typed text and choices, keeps the focus, and presses the last button again', () => {
    // The ready-made copy, as the person left it before the app arrived.
    const copy = document.createElement('div');
    copy.innerHTML = `
      <input name="email" /><input type="radio" name="role" value="worker" />
      <input type="radio" name="role" value="business" />
      <button type="button">Show password</button><button type="submit">Log in</button>`;
    document.body.append(copy);
    copy.querySelector<HTMLInputElement>('[name=email]')!.value = 'faith@example.com';
    copy.querySelector<HTMLInputElement>('[value=business]')!.checked = true;
    copy.querySelector<HTMLInputElement>('[name=email]')!.focus();
    (window as { kfPendingPress?: number }).kfPendingPress = 1; // "Log in"

    const replay = snapshot(copy);
    copy.remove();
    const onPress = vi.fn();
    const { container } = render(<LivePage onPress={onPress} />);
    act(() => replay(container));

    expect(container.querySelector<HTMLInputElement>('[name=email]')!.value).toBe(
      'faith@example.com',
    );
    expect(document.activeElement).toBe(container.querySelector('[name=email]'));
    expect(onPress).toHaveBeenCalledWith('faith@example.com', 'business');
    delete (window as { kfPendingPress?: number }).kfPendingPress;
  });

  it('does nothing when the person did nothing', () => {
    const copy = document.createElement('div');
    copy.innerHTML = '<input name="email" /><button type="submit">Log in</button>';
    const replay = snapshot(copy);
    const onPress = vi.fn();
    const { container } = render(<LivePage onPress={onPress} />);
    act(() => replay(container));
    expect(container.querySelector<HTMLInputElement>('[name=email]')!.value).toBe('');
    expect(onPress).not.toHaveBeenCalled();
  });
});
