import { describe, expect, it } from 'vitest';
import { classifyBoardError } from './driverApi';

describe('classifyBoardError', () => {
  it.each([
    ['P0002', 'trip not found', 'trip_not_found'],
    ['P0002', 'invalid ticket', 'invalid_ticket'],
    ['23514', 'ticket is for another trip', 'wrong_trip'],
    ['23514', 'ticket is cancelled', 'cancelled'],
    ['23514', 'boarding has not opened yet', 'not_open'],
    ['23514', 'trip is closed for boarding', 'boarding_closed'],
    ['28000', 'not authenticated', 'not_signed_in'],
    ['42501', 'permission denied for function board_ticket', 'not_signed_in'],
    ['XX000', 'boom', 'unknown'],
  ])('%s / %s -> %s', (code, msg, want) => expect(classifyBoardError(code, msg)).toBe(want));
});

describe('classifyBoardError: rate limiting (0020)', () => {
  it('PT429 -> rate_limited (and does not leak the database message)', () => {
    expect(classifyBoardError('PT429', 'rate limit exceeded')).toBe('rate_limited');
  });
});
