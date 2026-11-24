// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const enforced = vi.fn(async () => false);
vi.mock('@/features/captcha/actions', () => ({ captchaEnforcedAction: () => enforced() }));
vi.mock('./TurnstileWidget', () => ({ TurnstileWidget: () => null }));
import { useCaptchaGate } from './useCaptchaGate';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); enforced.mockReset(); });

describe('useCaptchaGate', () => {
  it('enforcement off: ready, no widget, no token', async () => {
    enforced.mockResolvedValue(false);
    const { result } = renderHook(() => useCaptchaGate('booking', 'en'));
    expect(result.current.ready).toBe(false);   // unknown yet: the button stays disabled for a moment instead of firing without a token
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.widget).toBeNull(); expect(result.current.token).toBeNull();
  });
  it('enforcement on with a site key: not ready until a token exists; spent() clears it', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    enforced.mockResolvedValue(true);
    const { result } = renderHook(() => useCaptchaGate('subscription', 'ar'));
    await waitFor(() => expect(result.current.widget).not.toBeNull());
    expect(result.current.ready).toBe(false);
  });
  it('enforcement on but NO site key: fails closed (never ready, no widget, flagged)', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    enforced.mockResolvedValue(true);
    const { result } = renderHook(() => useCaptchaGate('booking', 'en'));
    await waitFor(() => expect(result.current.misconfigured).toBe(true));
    expect(result.current.ready).toBe(false); expect(result.current.widget).toBeNull();
    act(() => result.current.spent());
    expect(result.current.ready).toBe(false);
  });
});
