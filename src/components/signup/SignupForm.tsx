import { useEffect, useRef, useState } from 'react';
import { identify, track } from '../../lib/analytics/client';
import { CTA_LABEL, OFFER_LINE } from '../../lib/cta';
import { createUser } from '../../lib/signup/api';
import { messageFor } from '../../lib/signup/messages';
import { isAllowedEmail } from '../../lib/users/email';
import ProfileStep, { FieldError, FormAlert } from './ProfileStep';
import ProofCounter from './ProofCounter';
import { CheckIcon, GoogleIcon, InfoIcon, SpinnerIcon } from './SignupIcons';

type Phase = 'form' | 'submitting' | 'profile' | 'saving' | 'done';
interface FormError {
  code: string;
  /** Where it came from: a field rule, or the request itself. */
  source: 'client' | 'server' | 'request';
  status?: number | null;
}

// Module-level: each fires once per page load, even if the island mounts twice (StrictMode).
let viewedFired = false;
let startedFired = false;

/** empty, then a mistyped address, then a domain we don't accept. */
function validate(input: HTMLInputElement): string | null {
  const value = input.value.trim();
  if (!value) return 'required';
  if (input.validity.typeMismatch) return 'invalid_email';
  if (!isAllowedEmail(value)) return 'email_not_allowed';
  return null;
}

export default function SignupForm({ variant }: { variant: 'control' | 'counter' }) {
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<FormError | null>(null);
  const [googleNote, setGoogleNote] = useState(false);
  const [live, setLive] = useState('');
  const [userId, setUserId] = useState('');

  const emailRef = useRef<HTMLInputElement>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const mountedAt = useRef(0);
  const attemptN = useRef(0);
  const lastTracked = useRef<string | null>(null);
  // After a retryable failure, a retry with the same email reuses the first time_to_submit_ms, so
  // the body stays byte-identical and the Idempotency-Key can be reused (lib/signup/api.ts).
  const pending = useRef<{ email: string; ms: number } | null>(null);

  useEffect(() => {
    mountedAt.current = performance.now();
    if (!viewedFired) {
      viewedFired = true;
      track('signup_viewed', { entry_point: new URLSearchParams(location.search).get('entry') });
    }
  }, []);

  function trackStarted(method: 'email' | 'google') {
    if (startedFired) return;
    startedFired = true;
    track('signup_started', { method, field_first_touched: method === 'email' ? 'email' : null });
  }

  function trackFieldError(code: string, source: 'client' | 'server') {
    if (code === lastTracked.current) return;
    lastTracked.current = code;
    track('signup_field_errored', { field: 'email', error_code: code, error_source: source, attempt_n: attemptN.current });
  }

  function onBlur() {
    const input = emailRef.current;
    // A server error stays until the email is edited: re-validating here would clear it.
    if (!input || !input.value.trim() || error?.source === 'server') return;
    const code = validate(input);
    setError(code ? { code, source: 'client' } : null);
    if (code) trackFieldError(code, 'client');
  }

  async function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const input = emailRef.current!;
    attemptN.current += 1;

    const code = validate(input);
    if (code) {
      setError({ code, source: 'client' });
      trackFieldError(code, 'client');
      input.focus();
      return;
    }

    const email = input.value.trim();
    const ms = pending.current?.email === email ? pending.current.ms : Math.round(performance.now() - mountedAt.current);
    setError(null);
    setPhase('submitting');
    setLive('Creating your account…');
    track('signup_submitted', { method: 'email', time_to_submit_ms: ms, attempt_n: attemptN.current });

    const res = await createUser({ email, timeToSubmitMs: ms, website: honeypotRef.current?.value });
    if (res.ok) {
      pending.current = null;
      identify(res.user.id); // No client account_created: the server sends it.
      setUserId(res.user.id);
      setLive('Account created');
      setPhase('profile');
      return;
    }

    pending.current = res.retryable ? { email, ms } : null;
    track('signup_failed', { error_code: res.code, http_status: res.status, retryable: res.retryable });
    const fieldCode = res.fields?.email;
    if (fieldCode) {
      setError({ code: fieldCode, source: 'server' });
      trackFieldError(fieldCode, 'server');
    } else {
      setError({ code: res.code, source: 'request', status: res.status });
    }
    setLive(messageFor(fieldCode ?? res.code, res.status));
    setPhase('form');
    input.focus();
  }

  const liveRegion = (
    <div aria-live="polite" role="status" className="sr-only">
      {live}
    </div>
  );

  if (phase === 'done') {
    return (
      <div className="flex flex-col gap-6">
        {liveRegion}
        <section aria-labelledby="done-title" className="signup__panel">
          <h2 id="done-title">You're all set</h2>
          <p className="signup__lead">
            This was a demo sign-up, so there's no app to open here. On TradingFX, your next step would be your first replay session.
          </p>
          <a href="/" className="inline-link">
            Back to the home page
          </a>
        </section>
      </div>
    );
  }

  if (phase === 'profile' || phase === 'saving') {
    return (
      <div className="flex flex-col gap-6">
        {liveRegion}
        <p className="signup__badge">
          <CheckIcon className="signup__badge-icon" />
          Account created
        </p>
        <ProfileStep userId={userId} saving={phase === 'saving'} onSaving={(s) => setPhase(s ? 'saving' : 'profile')} onDone={() => setPhase('done')} />
      </div>
    );
  }

  const submitting = phase === 'submitting';
  const errorText = error ? messageFor(error.code, error.status) : null;
  const fieldError = error && error.source !== 'request' ? errorText : null;
  const requestError = error && error.source === 'request' ? errorText : null;

  return (
    <div className="flex flex-col gap-6">
      {liveRegion}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            trackStarted('google');
            setGoogleNote(true);
          }}
          aria-describedby={googleNote ? 'google-note' : undefined}
          className="signup__button signup__button--secondary"
        >
          <GoogleIcon className="signup__button-icon" />
          Continue with Google (demo)
        </button>
        {googleNote && (
          <p id="google-note" className="signup__notice">
            <InfoIcon className="signup__notice-icon" label="Note" />
            Google sign-in isn't connected in this demo. Use your email below.
          </p>
        )}
      </div>

      <p className="signup__divider" aria-hidden="true">
        <span>or</span>
      </p>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {requestError && <FormAlert text={requestError} />}

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="signup__label">
            Email
          </label>
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
            maxLength={254}
            readOnly={submitting}
            onFocus={() => trackStarted('email')}
            onBlur={onBlur}
            onChange={() => setError(null)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? 'email-error email-hint' : 'email-hint'}
            className="signup__input"
          />
          {fieldError && <FieldError id="email-error" text={fieldError} />}
          <p id="email-hint" className="signup__hint">
            Use a personal address: Gmail, Outlook, iCloud, Yahoo, Proton or AOL.
          </p>
        </div>

        {/* Honeypot: off-screen, out of the tab order and hidden from assistive tech. */}
        <div aria-hidden="true" className="signup__hp">
          <label htmlFor="website">Leave this field empty</label>
          <input ref={honeypotRef} id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <button type="submit" disabled={submitting} aria-busy={submitting} className="signup__button">
          {submitting ? (
            <>
              <SpinnerIcon className="signup__spinner" />
              Creating your account…
            </>
          ) : (
            CTA_LABEL
          )}
        </button>

        {/* Order under the button: offer line, then the counter (variant only). The offer never moves. */}
        <div className="flex flex-col gap-2">
          <p className="cta-offer">{OFFER_LINE}</p>
          {variant === 'counter' && <ProofCounter />}
        </div>
      </form>
    </div>
  );
}
