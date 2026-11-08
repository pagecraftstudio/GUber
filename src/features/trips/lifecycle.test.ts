import { describe, expect, it, vi } from 'vitest';
import { tenantCtx } from '@/test/helpers';
import { canCancel, canDelete, nextStatus } from './lifecycle';
import { makeTripService } from './service';
import type { TripRepository } from './repository';
import type { Trip } from './types';
import { genericErrorText, TRIP_UI } from '@/features/dashboard/messages';

const ID = '00000000-0000-4000-8000-0000000000f1';
const trip = (status: Trip['status']) => ({ id: ID, status }) as Trip;
function svc(status: Trip['status'] | null) {
  const transition = vi.fn(async (_c: unknown, i: { tripId: string; to: Trip['status'] }) => ({ id: i.tripId, status: i.to, changed: true, bookingsCancelled: 0 }));
  const repo = { get: vi.fn(async () => (status ? trip(status) : null)), transition, deleteDraft: vi.fn(async () => undefined) } as unknown as TripRepository;
  return { s: makeTripService(repo), transition, repo };
}
const W = tenantCtx(['trips.write', 'trips.read']);

describe('trip lifecycle: one button walks draft -> scheduled -> boarding -> in_progress -> completed', () => {
  it('next status follows exactly that order', () => {
    expect(['draft', 'scheduled', 'boarding', 'in_progress'].map((s) => nextStatus(s as Trip['status']))).toEqual(['scheduled', 'boarding', 'in_progress', 'completed']);
    expect(nextStatus('completed')).toBeNull();
    expect(nextStatus('cancelled')).toBeNull();
  });
  it('cancel is possible only before the trip is on the road; delete only for drafts', () => {
    expect((['draft', 'scheduled', 'boarding', 'in_progress', 'completed', 'cancelled'] as const).map(canCancel)).toEqual([true, true, true, false, false, false]);
    expect((['draft', 'scheduled', 'boarding', 'in_progress', 'completed', 'cancelled'] as const).map(canDelete)).toEqual([true, false, false, false, false, false]);
  });
  it('advance computes the next step from the DATABASE row, not from the client', async () => {
    const { s, transition } = svc('scheduled');
    await s.advance(W, ID, 'scheduled');
    expect(transition).toHaveBeenCalledWith(W, { tripId: ID, to: 'boarding' });
  });
  it('a stale page cannot push a trip two steps', async () => {
    const { s, transition } = svc('boarding');
    await expect(s.advance(W, ID, 'scheduled')).rejects.toMatchObject({ code: 'conflict', detail: 'trip_changed' });
    expect(transition).not.toHaveBeenCalled();
  });
  it('completed and cancelled trips have no next step', async () => {
    for (const st of ['completed', 'cancelled'] as const) {
      const { s, transition } = svc(st);
      await expect(s.advance(W, ID, st)).rejects.toMatchObject({ detail: 'trip_final' });
      expect(transition).not.toHaveBeenCalled();
    }
  });
  it('cancel is its own action, refused once the trip is on the road', async () => {
    const a = svc('boarding');
    await a.s.cancel(W, ID, 'bus broke down');
    expect(a.transition).toHaveBeenCalledWith(W, { tripId: ID, to: 'cancelled', reason: 'bus broke down' });
    const b = svc('in_progress');
    await expect(b.s.cancel(W, ID)).rejects.toMatchObject({ detail: 'trip_final' });
    expect(b.transition).not.toHaveBeenCalled();
  });
  it('without trips.write nothing is read or changed', async () => {
    const { s, repo } = svc('draft');
    const R = tenantCtx(['trips.read']);
    await expect(s.advance(R, ID, 'draft')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(s.cancel(R, ID)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(s.deleteDraft(R, ID)).rejects.toMatchObject({ code: 'forbidden' });
    expect(repo.get).not.toHaveBeenCalled();
  });
  it('a missing (or other company) trip is simply not found', async () => {
    const { s } = svc(null);
    await expect(s.advance(W, ID, 'draft')).rejects.toMatchObject({ code: 'not_found' });
  });
  it('wording exists in both languages for every step and every refusal', () => {
    for (const l of ['en', 'ar'] as const) {
      expect(Object.keys(TRIP_UI[l].next)).toEqual(['draft', 'scheduled', 'boarding', 'in_progress']);
      for (const d of ['bus_conflict', 'driver_conflict', 'trip_departed', 'trip_not_started', 'trip_not_draft', 'trip_has_bookings', 'trip_transition_invalid', 'trip_changed', 'trip_final'])
        expect(genericErrorText(l, 'business_rule', d)).not.toBe(genericErrorText(l, 'business_rule'));
    }
  });
});
