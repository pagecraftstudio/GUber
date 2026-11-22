import { afterEach, describe, expect, it, vi } from 'vitest';

const load = async (mock: boolean) => {
  vi.resetModules();
  vi.doMock('./runtime', () => ({ isMockMode: () => mock }));
  return (await import('./book-redirect')).openBookingWizard;
};

describe('openBookingWizard', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('./runtime'); });
  it('sends real-mode visitors to the wizard with an encoded trip id', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    expect((await load(false))('abc-123')).toBe(true);
    expect(assign).toHaveBeenCalledWith('/my-bookings/book/abc-123');
  });
  it('keeps the dialog in demo mode', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    expect((await load(true))('abc')).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});
