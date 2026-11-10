import { describe, expect, it } from 'vitest';
import { BOARD_MESSAGES, classifyBoardError } from './driverApi';

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

describe('classifyBoardError: poor network', () => {
  it.each(['TypeError: Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'fetch failed'])('%s -> network', (msg) => {
    expect(classifyBoardError(undefined, msg)).toBe('network');
    expect(classifyBoardError('', msg)).toBe('network');
  });
  it('a database error that mentions nothing about the network stays unknown, and a coded error is never network', () => {
    expect(classifyBoardError(undefined, 'boom')).toBe('unknown');
    expect(classifyBoardError('XX000', 'Failed to fetch')).toBe('unknown');
  });
  it('the network message says the scan was not recorded', () => expect(BOARD_MESSAGES.network).toMatch(/not recorded/));
});

describe('classifyBoardError: rate limiting (0020)', () => {
  it('PT429 -> rate_limited (and does not leak the database message)', () => {
    expect(classifyBoardError('PT429', 'rate limit exceeded')).toBe('rate_limited');
  });
});
