// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormStatus: () => ({ pending: false }) }));

import { Alert } from './Alert';
import { AuthCard } from './AuthCard';
import { Field } from './Field';
import { SubmitButton } from './SubmitButton';

const bad = async (el: HTMLElement) => {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('|')}`);
};
const page = (surface?: 'auth' | 'system') => (
  <AuthCard title="Operator sign in" subtitle="For staff." {...(surface ? { surface } : {})}>
    <Alert kind="error">Wrong email or password.</Alert>
    <form action="/x" className="space-y-4">
      <input type="hidden" name="next" value="/dashboard" />
      <Field label="Email" name="email" type="email" autoComplete="email" maxLength={254} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" maxLength={72} hint="10–72 characters." />
      <SubmitButton>Sign in</SubmitButton>
    </form>
  </AuthCard>
);

afterEach(() => cleanup());

describe('auth pages', () => {
  it('MASAR frame, wordmark, quiet studio line, and the same form fields', async () => {
    const { container } = render(page());
    expect(container.textContent).toContain('Powered by MALAKY Studio');
    expect(screen.getByRole('heading', { level: 1, name: 'Operator sign in' })).toBeTruthy();
    expect(screen.getByText('MASAR')).toBeTruthy();
    const email = screen.getByLabelText(/Email/) as HTMLInputElement;
    expect([email.name, email.type, email.autocomplete, email.maxLength, email.required]).toEqual(['email', 'email', 'email', 254, true]);
    const pw = screen.getByLabelText(/Password/) as HTMLInputElement;
    expect(pw.type).toBe('password');
    expect(pw.getAttribute('aria-describedby')).toBeTruthy(); // the hint is wired to the field
    expect((container.querySelector('input[name="next"]') as HTMLInputElement).value).toBe('/dashboard');
    expect(screen.getByRole('alert').textContent).toBe('Wrong email or password.');
    expect(screen.getByRole('button', { name: 'Sign in' }).getAttribute('type')).toBe('submit');
    expect(await bad(container)).toEqual([]);
  });
  it('the account-state variant renders the same frame', () => {
    expect(render(page('system')).container.textContent).toContain('Powered by MALAKY Studio');
  });
});
