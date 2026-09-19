'use client';

import { useActionState } from 'react';
import { PREMIUM_RULES } from '@careshield/contracts';

import { createQuoteAction } from '@/app/actions';
import { IDLE } from '@/lib/action-state';
import { Alert, Field, SubmitButton, YesNo, inputClass, inputStyle } from './ui';

export function QuoteForm({ defaults }: { defaults?: { name?: string; age?: string } }) {
  const [state, formAction, isPending] = useActionState(createQuoteAction, IDLE);
  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} noValidate>
      {state.status === 'error' ? (
        <Alert tone="error" title="We couldn't calculate your premium">
          {state.message}
        </Alert>
      ) : null}

      <Field label="Full name" name="applicantName" error={fieldErrors.applicantName}>
        {(props) => (
          <input
            {...props}
            type="text"
            autoComplete="name"
            required
            defaultValue={defaults?.name}
            className={inputClass}
            style={inputStyle}
          />
        )}
      </Field>

      <Field
        label="Age"
        name="age"
        error={fieldErrors.age}
        hint={`Between ${PREMIUM_RULES.MIN_AGE} and ${PREMIUM_RULES.MAX_AGE}. Cover is loaded by 50% above age ${PREMIUM_RULES.AGE_LOADING_THRESHOLD}.`}
      >
        {(props) => (
          <input
            {...props}
            type="number"
            inputMode="numeric"
            min={PREMIUM_RULES.MIN_AGE}
            max={PREMIUM_RULES.MAX_AGE}
            step={1}
            required
            defaultValue={defaults?.age}
            className={inputClass}
            style={inputStyle}
          />
        )}
      </Field>

      <YesNo
        legend="Do you have any pre-existing medical conditions?"
        name="hasPreExistingConditions"
        hint="For example diabetes, hypertension or thyroid disorders. This adds a flat ₹5,000 to your premium."
      />

      <SubmitButton pending={isPending} pendingLabel="Calculating…">
        Calculate my premium
      </SubmitButton>

      <p className="mt-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        Your quoted price is locked for {PREMIUM_RULES.DEFAULT_TTL_MINUTES} minutes.
      </p>
    </form>
  );
}
