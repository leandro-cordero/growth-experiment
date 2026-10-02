// Error code to copy. Verbatim from the reviewed copy table (copy-compliance passed): don't reword.
// Codes come from the API (`error.code` and `error.fields.*`, src/lib/users/*). The test derives
// the list from that source, so a new server code without copy fails the build.
export const FALLBACK_MESSAGE = 'Something went wrong on our side. Try again.';
const UNAVAILABLE = "We couldn't create your account just now. Try again in a moment.";

export const MESSAGES: Record<string, string> = {
  // Field errors (email)
  required: 'Enter your email address.',
  invalid_email: 'Enter an email like name@gmail.com.',
  email_not_allowed: 'Use a personal email from Gmail, Outlook, iCloud, Yahoo, Proton or AOL.',
  email_taken: 'That email is already registered. Use a different email.',
  // Request errors
  request_in_flight: "We're still creating your account. Wait a moment, then try again.",
  store_unavailable: UNAVAILABLE,
  network_error: "We couldn't reach the server. Check your connection and try again.",
  // Profile field errors
  too_long: 'Use 60 characters or fewer.',
  invalid_choice: 'Choose one of the options.',
  empty_update: 'Fill in at least one field, or skip this step.',
  user_not_found: "We couldn't save that. Try again, or skip this step.",
  // Codes a correct client never triggers: they get the fallback, listed so the table is complete.
  validation_failed: FALLBACK_MESSAGE,
  idempotency_key_required: FALLBACK_MESSAGE,
  idempotency_key_reuse: FALLBACK_MESSAGE,
  invalid_json: FALLBACK_MESSAGE,
  body_too_large: FALLBACK_MESSAGE,
  unauthorized: FALLBACK_MESSAGE,
  not_found: FALLBACK_MESSAGE,
  invalid_number: FALLBACK_MESSAGE,
  out_of_range: FALLBACK_MESSAGE,
};

/** Copy for an error code. Any 5xx reads as "unavailable"; unknown codes get the fallback. */
export function messageFor(code: string, status?: number | null): string {
  if (status !== undefined && status !== null && status >= 500) return UNAVAILABLE;
  return MESSAGES[code] ?? FALLBACK_MESSAGE;
}

export const PROFILE_FAILURE = "We couldn't save that. Try again, or skip this step.";
