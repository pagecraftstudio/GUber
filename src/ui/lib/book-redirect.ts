import { tripBookPath } from '@/features/site/plans';
import { isMockMode } from './runtime';

/**
 * Real mode: booking happens in the booking wizard (sign-in, invoice, payment instructions, deadline), not in the old
 * dialog. Returns true when it sent the visitor there. Demo (mock) mode keeps the dialog because it has no backend.
 */
export function openBookingWizard(tripId: string): boolean {
  if (isMockMode() || typeof window === 'undefined') return false;
  window.location.assign(tripBookPath(tripId));
  return true;
}
