// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => { delete process.env.DS_SURFACES; });
afterEach(() => { cleanup(); delete process.env.DS_SURFACES; });

describe('auth pages follow the allow-list', () => {
  it('off by default: the old card, no MASAR scope', () => {
    const { container } = render(page());
    expect(container.querySelector('[data-ds="masar"]')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Operator sign in' })).toBeTruthy();
    expect(container.textContent).not.toContain('Powered by MALAKY Studio');
  });
  it('on: MASAR frame, wordmark, quiet studio line, and the same form fields', async () => {
    process.env.DS_SURFACES = 'auth';
    const { container } = render(page());
    expect(container.querySelector('[data-ds="masar"]')).toBeTruthy();
    expect(screen.getByText('MASAR')).toBeTruthy();
    expect(container.textContent).toContain('Powered by MALAKY Studio');
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
  it('"auth" does not flip the account-state pages, "system" does', () => {
    process.env.DS_SURFACES = 'auth';
    const a = render(page('system'));
    expect(a.container.querySelector('[data-ds="masar"]')).toBeNull();
    cleanup();
    process.env.DS_SURFACES = 'system';
    const b = render(page('system'));
    expect(b.container.querySelector('[data-ds="masar"]')).toBeTruthy();
  });
  it('"all" flips both', () => {
    process.env.DS_SURFACES = 'all';
    expect(render(page('system')).container.querySelector('[data-ds="masar"]')).toBeTruthy();
    cleanup();
    expect(render(page()).container.querySelector('[data-ds="masar"]')).toBeTruthy();
  });
});
