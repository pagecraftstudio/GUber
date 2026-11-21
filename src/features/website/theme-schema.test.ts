import { describe, expect, it } from 'vitest';
import { websiteSettingsUpdateSchema } from './schema';

describe('settings schema: look', () => {
  it('accepts listed fonts and button styles', () => { expect(websiteSettingsUpdateSchema.safeParse({ fontHeading: 'cairo', fontBody: 'plex', buttonStyle: 'pill' }).success).toBe(true); });
  it('refuses anything else', () => {
    for (const bad of [{ fontHeading: 'comic-sans' }, { fontBody: 'x;}' }, { buttonStyle: 'round' }, { buttonStyle: 'url(javascript:1)' }]) expect(websiteSettingsUpdateSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});
