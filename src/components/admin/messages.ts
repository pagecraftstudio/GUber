/**
 * Field error codes (zod messages and mapDbError field codes) -> text for people.
 * Unknown codes fall back to a generic line, so a raw library message can never reach the screen.
 */
const MESSAGES: Record<string, string> = {
  taken: 'Already in use.',
  invalid: 'This value is not valid.',
  invalid_slug: 'Use 3 to 40 lowercase letters, digits or hyphens. No hyphen at the start or end.',
  reserved_slug: 'This name is reserved. Choose another.',
  invalid_phone: 'Enter an international number, for example +201012345678.',
  invalid_country: 'Use a 2-letter country code, for example EG.',
  invalid_characters: 'Remove unsupported characters.',
  reason_required: 'Enter a reason (at least 3 characters).',
  unknown_plan: 'Choose a plan from the list.',
  invalid_trial_days: 'Enter a whole number from 1 to 365.',
  already_member: 'This person already belongs to a company.',
  pending: 'An invite for this email is already pending.',
  invalid_period: 'Enter a whole number of days from 1 to 1830.',
  no_changes: 'Nothing to change.',
};

export const fieldMessage = (code: string | undefined): string | undefined => (code ? (MESSAGES[code] ?? 'This value is not valid.') : undefined);
