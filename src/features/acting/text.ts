/** Plain-language messages for the acting actions. Keyed by the stable error detail, never by raw database text. */
export const ACTING_ERRORS: Record<string, string> = {
  reason_required: 'Write a reason of at least 3 characters. It is kept in the audit log.',
  reason_too_long: 'The reason can be at most 300 characters.',
  acting_company_inactive: 'This company is suspended or cancelled. You can look at it, but not change it.',
  acting_no_session: 'Your session has ended. Open the dashboard again from the company page.',
  acting_no_delete: 'Deleting is not available while acting as a company.',
};
export const actingMessage = (detail: string | undefined, fallback: string): string => (detail && ACTING_ERRORS[detail]) || fallback;
