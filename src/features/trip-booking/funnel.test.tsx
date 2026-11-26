// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.fn();
vi.mock('@/lib/analytics/events', () => ({ track: (...a: unknown[]) => track(...a) }));
import { useBookingFunnel, type FunnelStep } from './funnel';

type P = { step: FunnelStep; booked: boolean; paymentShown: boolean };
const setup = (init: P) => renderHook((p: P) => useBookingFunnel({ lang: 'ar', tripId: 'trip-1', ...p }), { initialProps: init });
const names = () => track.mock.calls.map((c) => c[1]);
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

beforeEach(() => track.mockClear());
afterEach(cleanup);

describe('useBookingFunnel', () => {
  it('sends booking_start once, with the trip id and nothing else', () => {
    const { rerender } = setup({ step: 'trip', booked: false, paymentShown: false });
    rerender({ step: 'trip', booked: false, paymentShown: false });
    expect(track.mock.calls.filter((c) => c[1] === 'booking_start')).toEqual([['ar', 'booking_start', { trip_id: 'trip-1' }]]);
  });
  it('sends one booking_step per step reached, not on re-render or going back', () => {
    const { rerender } = setup({ step: 'trip', booked: false, paymentShown: false });
    rerender({ step: 'passenger', booked: false, paymentShown: false });
    rerender({ step: 'review', booked: false, paymentShown: false });
    rerender({ step: 'passenger', booked: false, paymentShown: false });
    rerender({ step: 'review', booked: false, paymentShown: false });
    expect(track.mock.calls.filter((c) => c[1] === 'booking_step').map((c) => c[2].step)).toEqual(['passenger', 'review']);
  });
  it('submit, success (free flag) and proof click are explicit actions', () => {
    const { result } = setup({ step: 'review', booked: false, paymentShown: false });
    result.current.submit(); result.current.success(true); result.current.proofClick();
    expect(track).toHaveBeenCalledWith('ar', 'booking_submit', { trip_id: 'trip-1' });
    expect(track).toHaveBeenCalledWith('ar', 'booking_success', { trip_id: 'trip-1', free: true });
    expect(track).toHaveBeenCalledWith('ar', 'whatsapp_proof_click', { trip_id: 'trip-1' });
  });
  it('payment_info_shown only once the instructions are on screen', () => {
    const { rerender } = setup({ step: 'pay', booked: true, paymentShown: false });
    expect(names()).not.toContain('payment_info_shown');
    rerender({ step: 'pay', booked: true, paymentShown: true });
    rerender({ step: 'pay', booked: true, paymentShown: true });
    expect(names().filter((n) => n === 'payment_info_shown')).toHaveLength(1);
  });
  it('leaving the page mid-wizard is an abandon at that step, once', () => {
    setup({ step: 'review', booked: false, paymentShown: false });
    window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pagehide'));
    expect(track.mock.calls.filter((c) => c[1] === 'booking_abandon')).toEqual([['ar', 'booking_abandon', { trip_id: 'trip-1', step: 'review' }]]);
  });
  it('unmounting mid-wizard (in-app navigation) is an abandon too', async () => {
    const { unmount } = setup({ step: 'passenger', booked: false, paymentShown: false });
    unmount(); await flush();
    expect(track).toHaveBeenCalledWith('ar', 'booking_abandon', { trip_id: 'trip-1', step: 'passenger' });
  });
  it('never an abandon once the booking exists', async () => {
    const { unmount } = setup({ step: 'pay', booked: true, paymentShown: true });
    window.dispatchEvent(new Event('pagehide')); unmount(); await flush();
    expect(names()).not.toContain('booking_abandon');
  });
});
