import { trackEvents } from './client';
import type { AnalyticsLocale } from './copy';

/**
 * Typed mirror of public.analytics_event_catalog (migrations 0068 + 0069). Change both together.
 * Properties are scalars only and never personal or free text; the database refuses anything else.
 */
export const EVENT_KEYS = {
  page_view: [],
  language_switch: ['to'],
  result_click: ['position'],
  trip_view: ['trip_id'],
  booking_start: ['trip_id'],
  booking_step: ['trip_id', 'step'],
  booking_submit: ['trip_id'],
  booking_success: ['trip_id', 'free'],
  booking_abandon: ['trip_id', 'step'],
  payment_info_shown: ['trip_id'],
  whatsapp_proof_click: ['trip_id'],
  sign_in: ['method'],
  sign_up: ['method'],
  section_view: ['section'],
  cta_click: ['section', 'cta'],
  book_click: ['trip_id'],
  contact_click: ['channel'],
  subscription_request_click: ['plan_id'],
  feature_use: ['screen', 'action'],
  ui_error: ['screen', 'code'],
  scan_outcome: ['verdict'],
  scan_offline: [],
} as const satisfies Record<string, readonly string[]>;

export type EventName = keyof typeof EVENT_KEYS;
export type EventProps<E extends EventName> = { [K in (typeof EVENT_KEYS)[E][number]]?: string | number | boolean };

/** Fire-and-forget. Drops silently without consent (the server decides). Never throws. */
export function track<E extends EventName>(locale: AnalyticsLocale, event: E, properties?: EventProps<E>): void {
  void trackEvents(locale, [{ event, properties: properties as Record<string, string | number | boolean> | undefined }]);
}
