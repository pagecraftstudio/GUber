// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '@/ds/test-setup';
import { DsLangProvider } from '@/ds/lang';
import { DsFlagProvider } from '@/ds/shell/flag';
import { LocaleProvider } from '../../context/LocaleContext';

const auth = vi.hoisted(() => ({ signIn: vi.fn(async () => undefined), signUp: vi.fn(async () => undefined), resetPassword: vi.fn(async () => undefined) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

import { AuthModal } from '../auth/AuthModal';

beforeAll(polyfillDialog);
afterEach(() => { cleanup(); localStorage.clear(); Object.values(auth).forEach((f) => f.mockClear()); });
const bad = async (el: HTMLElement) => {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('|')}`);
};
const open = (lang: 'en' | 'ar', mode: 'login' | 'register' | 'forgot_password' = 'login', onClose = vi.fn()) => {
  localStorage.setItem('malaky_locale', lang);
  return render(<LocaleProvider><DsLangProvider value={lang}><DsFlagProvider value><AuthModal isOpen onClose={onClose} defaultMode={mode} /></DsFlagProvider></DsLangProvider></LocaleProvider>);
};

describe('passenger sign-in dialog, MASAR look', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: login, register and reset are accessible`, async () => {
      for (const mode of ['login', 'register', 'forgot_password'] as const) {
        const { baseElement } = open(lang, mode);
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(await bad(baseElement)).toEqual([]);
        cleanup();
      }
    });
  }

  it('login submits the typed values to the same signIn and closes', async () => {
    const u = userEvent.setup(); const onClose = vi.fn();
    open('en', 'login', onClose);
    await u.type(screen.getByLabelText(/Email/), 'a@b.co');
    await u.type(screen.getByLabelText(/Password/), 'Pass1234!');
    await u.click(screen.getAllByRole('button', { name: /Sign in/i }).find((b) => b.getAttribute('type') === 'submit')!);
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith({ email: 'a@b.co', password: 'Pass1234!' }));
    expect(onClose).toHaveBeenCalled();
  });
  it('empty login shows the same message as before, as an alert, and calls nothing', async () => {
    const u = userEvent.setup();
    open('en');
    await u.click(screen.getAllByRole('button', { name: /Sign in/i }).find((b) => b.getAttribute('type') === 'submit')!);
    expect(screen.getByRole('alert').textContent).toBe('Please enter your email and password.');
    expect(auth.signIn).not.toHaveBeenCalled();
  });
  it('register: an Arabic-keyboard phone number arrives as ASCII digits', async () => {
    const u = userEvent.setup();
    open('ar', 'register');
    await u.type(screen.getByLabelText(/الاسم/), 'كريم');
    await u.type(screen.getAllByLabelText(/البريد/)[0]!, 'k@b.co');
    await u.type(screen.getByLabelText(/الهاتف/), '٠١٠١٢٣٤٥٦٧٨');
    await u.type(screen.getAllByLabelText(/كلمة المرور/)[0]!, 'secret1');
    await u.click(screen.getAllByRole('button').find((b) => b.getAttribute('type') === 'submit')!);
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(1));
    expect((auth.signUp.mock.calls[0] as unknown as [{ phone: string }])[0].phone).toBe('01012345678');
  });
  it('forgot password: sends the reset email and confirms', async () => {
    const u = userEvent.setup();
    open('en', 'forgot_password');
    await u.type(screen.getByLabelText(/Email/), 'a@b.co');
    await u.click(screen.getAllByRole('button').find((b) => b.getAttribute('type') === 'submit')!);
    await waitFor(() => expect(auth.resetPassword).toHaveBeenCalledWith('a@b.co'));
    expect(await screen.findByText('Instructions sent')).toBeTruthy();
  });
  it('switching between sign in and sign up keeps one dialog', async () => {
    const u = userEvent.setup();
    open('en');
    await u.click(screen.getAllByRole('button', { name: /create account/i })[0]!);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByLabelText(/Full name/i)).toBeTruthy();
  });
});
