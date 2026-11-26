import { describe, expect, it } from 'vitest';
import { EVENT_KEYS } from './events';

const PERSONAL = /(email|phone|name|passw|token|address|masar|student|(^|_)ip(_|$)|text|note|message|query)/i;

describe('EVENT_KEYS', () => {
  it('has no personal or free-text property keys and no personal event names', () => {
    for (const [event, keys] of Object.entries(EVENT_KEYS)) {
      expect(event).not.toMatch(/(email|phone|name|passw|token|address|masar|student|(^|[._])ip([._]|$))/i);
      for (const k of keys) expect(k, `${event}.${k}`).not.toMatch(PERSONAL);
    }
  });
  it('has valid event names and unique keys per event', () => {
    for (const [event, keys] of Object.entries(EVENT_KEYS)) {
      expect(event).toMatch(/^[a-z][a-z0-9_.]{1,63}$/);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
