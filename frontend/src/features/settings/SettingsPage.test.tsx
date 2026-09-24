import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettings } from '../../stores/settings';
import { renderWithRouter } from '../../test/renderWithRouter';
import { SettingsPage } from './SettingsPage';

describe('Settings', () => {
  beforeEach(() => {
    useSettings.setState({ textSize: 'normal', reduceMotion: false });
  });

  it('every setting has a visible label and one line of help', () => {
    renderWithRouter(<SettingsPage />);

    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveAccessibleDescription(
      'The language used in the app and in your messages.',
    );
    expect(screen.getByRole('group', { name: 'Text size' })).toHaveAccessibleDescription(
      'Large makes all text and buttons bigger.',
    );
    expect(screen.getByRole('switch', { name: 'Reduce motion' })).toHaveAccessibleDescription(
      'Turns off movement and animation on the screen.',
    );
  });

  it('Large text makes the whole app bigger and is remembered', async () => {
    renderWithRouter(<SettingsPage />);
    await userEvent.click(screen.getByRole('radio', { name: 'Large' }));

    expect(document.documentElement.dataset.textSize).toBe('large');
    expect(JSON.parse(localStorage.getItem('kf.settings') ?? '{}').state.textSize).toBe('large');
  });

  it('Reduce motion switches animations off', async () => {
    renderWithRouter(<SettingsPage />);
    const toggle = screen.getByRole('switch', { name: 'Reduce motion' });
    await userEvent.click(toggle);

    expect(toggle).toBeChecked();
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
  });
});
