/** Whitelisted UI messages. Pages render these by code, never text taken from the URL. */
export const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Please confirm your email first. Check your inbox for the confirmation link.',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  login_failed: 'We could not sign you in. Please try again.',
  invalid_form: 'Please check the form and try again.',
  weak_password: 'Password must be 10–72 characters and not too common.',
  password_mismatch: 'Passwords do not match.',
  signup_failed: 'We could not create the account. Please try again.',
  invalid_invite: 'This invitation is invalid, expired, or was sent to a different email address.',
  already_member: 'This account already belongs to a company.',
  plan_limit: 'The company has reached its plan limit for users. Ask the company owner to upgrade.',
  no_subscription: 'The company does not have an active subscription.',
  confirm_failed: 'This link is invalid or has expired. Please request a new one.',
  forbidden: 'You do not have permission to open that page.',
  generic: 'Something went wrong. Please try again.',
};

export const NOTICE_MESSAGES: Record<string, string> = {
  check_email:
    'If this is a new account, we sent a confirmation link to your email. If you already have an account, sign in instead.',
  reset_sent: 'If an account exists for that email, a password reset link is on its way.',
  password_updated: 'Password updated.',
};
