import { useEffect, useRef, useState } from 'react';
import { track } from '../../lib/analytics/client';
import { updateUser, type UpdateInput } from '../../lib/signup/api';
import { messageFor, PROFILE_FAILURE } from '../../lib/signup/messages';
import { SpinnerIcon, WarningIcon } from './SignupIcons';

const LEVELS = [
  { value: 'new', label: "I'm new to trading" },
  { value: 'some', label: 'Some experience' },
  { value: 'experienced', label: 'Experienced' },
] as const;

interface Props {
  userId: string;
  saving: boolean;
  onSaving: (saving: boolean) => void;
  onDone: () => void;
}

export default function ProfileStep({ userId, saving, onSaving, onDone }: Props) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState<UpdateInput['experience_level']>();
  const [errors, setErrors] = useState<{ form?: string; name?: string; level?: string }>({});
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step so keyboard and screen-reader users land on it.
  useEffect(() => heading.current?.focus(), []);

  async function save(e: React.SyntheticEvent) {
    e.preventDefault();
    const patch: UpdateInput = { ...(name.trim() ? { display_name: name.trim() } : {}), ...(level ? { experience_level: level } : {}) };
    if (Object.keys(patch).length === 0) {
      setErrors({ form: messageFor('empty_update') });
      return;
    }
    setErrors({});
    onSaving(true);
    const res = await updateUser(userId, patch);
    if (res.ok) {
      track('profile_updated', {});
      onDone();
      return;
    }
    onSaving(false);
    const f = res.fields ?? {};
    setErrors({
      name: f.display_name ? messageFor(f.display_name) : undefined,
      level: f.experience_level ? messageFor(f.experience_level) : undefined,
      form: f.display_name || f.experience_level ? undefined : PROFILE_FAILURE,
    });
  }

  function skip() {
    track('profile_skipped', {});
    onDone();
  }

  return (
    <section aria-labelledby="profile-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 id="profile-title" ref={heading} tabIndex={-1}>
          Your account is ready
        </h2>
        <p className="signup__lead">Tell us how you trade. It's optional, and you can skip it.</p>
      </div>

      <form onSubmit={save} noValidate className="signup__panel">
        {errors.form && <FormAlert text={errors.form} />}

        <div className="flex flex-col gap-2">
          <label htmlFor="display-name" className="signup__label">
            What should we call you?
          </label>
          <input
            id="display-name"
            name="display_name"
            type="text"
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            readOnly={saving}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'display-name-error' : undefined}
            className="signup__input"
          />
          {errors.name && <FieldError id="display-name-error" text={errors.name} />}
        </div>

        <fieldset aria-describedby={errors.level ? 'level-error' : undefined} className="signup__fieldset">
          <legend className="signup__legend">How much trading experience do you have?</legend>
          <div className="signup__options">
            {LEVELS.map((l) => (
              <label key={l.value} className="signup__option">
                <input
                  type="radio"
                  name="experience_level"
                  value={l.value}
                  checked={level === l.value}
                  disabled={saving}
                  onChange={() => setLevel(l.value)}
                  className="signup__radio"
                />
                {l.label}
              </label>
            ))}
          </div>
          {errors.level && <FieldError id="level-error" text={errors.level} />}
        </fieldset>

        <div className="signup__actions">
          <button type="submit" disabled={saving} aria-busy={saving} className="signup__button">
            {saving ? (
              <>
                <SpinnerIcon className="signup__spinner" />
                Saving…
              </>
            ) : (
              'Save'
            )}
          </button>
          <button type="button" onClick={skip} disabled={saving} className="signup__button signup__button--secondary">
            Skip for now
          </button>
        </div>
      </form>
    </section>
  );
}

// Text plus a labelled icon: an error is never colour alone.
export function FieldError({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className="signup__field-error">
      <WarningIcon className="signup__field-error-icon" label="Error" />
      {text}
    </p>
  );
}

/** A form-level error (not tied to one field). */
export function FormAlert({ text }: { text: string }) {
  return (
    <div className="signup__alert">
      <WarningIcon className="signup__alert-icon" label="Error" />
      <p className="signup__alert-text">{text}</p>
    </div>
  );
}
