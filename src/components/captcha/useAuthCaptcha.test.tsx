// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';

vi.mock('./TurnstileWidget', () => ({ TurnstileWidget: () => <div data-testid="widget" /> }));
import { useAuthCaptcha } from './useAuthCaptcha';
import { AuthCaptchaField } from './AuthCaptchaField';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('useAuthCaptcha', () => {
  it('off: ready, no widget', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_CAPTCHA', 'off');
    const { result } = renderHook(() => useAuthCaptcha('login', 'en'));
    expect(result.current).toMatchObject({ on: false, ready: true, widget: null, misconfigured: false });
  });
  it('on with a key: widget shown, NOT ready until a token exists', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_CAPTCHA', 'on'); vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    const { result } = renderHook(() => useAuthCaptcha('signup', 'ar'));
    expect(result.current.widget).not.toBeNull(); expect(result.current.ready).toBe(false);
  });
  it('on WITHOUT a key: fails closed (never ready, no widget, flagged)', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_CAPTCHA', 'on'); vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    const { result } = renderHook(() => useAuthCaptcha('reset', 'en'));
    expect(result.current).toMatchObject({ ready: false, widget: null, misconfigured: true });
  });
});

describe('AuthCaptchaField (server-action forms)', () => {
  it('off: renders nothing, so no hidden input is posted', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_CAPTCHA', 'off');
    const { container } = render(<AuthCaptchaField action="login" />);
    expect(container.innerHTML).toBe('');
  });
  it('on: widget plus an empty hidden captchaToken (the token is filled by the widget)', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_CAPTCHA', 'on'); vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    const { container } = render(<AuthCaptchaField action="login" />);
    expect(screen.getByTestId('widget')).toBeTruthy();
    expect((container.querySelector('input[name="captchaToken"]') as HTMLInputElement).value).toBe('');
  });
  it('on without a key: visible alert, no hidden input', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_CAPTCHA', 'on'); vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    const { container } = render(<AuthCaptchaField action="login" />);
    expect(screen.getByRole('alert')).toBeTruthy(); expect(container.querySelector('input[name="captchaToken"]')).toBeNull();
  });
});
