'use client';

import { useActionState } from 'react';

import { submitDeclarationAction } from '@/app/actions';
import { IDLE } from '@/lib/action-state';
import { Alert, Field, SubmitButton, YesNo, inputClass, inputStyle } from './ui';

export function DeclarationForm({ quoteId }: { quoteId: string }) {
  const [state, formAction, isPending] = useActionState(submitDeclarationAction, IDLE);
  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="quoteId" value={quoteId} />

      {state.status === 'error' ? (
        <Alert tone="error" title="We couldn't submit your declaration">
          {state.message}
        </Alert>
      ) : null}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Height (cm)" name="heightCm" error={fieldErrors.heightCm}>
          {(props) => (
            <input
              {...props}
              type="number"
              inputMode="numeric"
              min={50}
              max={272}
              required
              className={inputClass}
              style={inputStyle}
            />
          )}
        </Field>

        <Field label="Weight (kg)" name="weightKg" error={fieldErrors.weightKg}>
          {(props) => (
            <input
              {...props}
              type="number"
              inputMode="numeric"
              min={20}
              max={500}
              required
              className={inputClass}
              style={inputStyle}
            />
          )}
        </Field>
      </div>

      <fieldset className="mt-2">
        <legend className="mb-4 text-sm font-semibold">Your medical history</legend>

        <YesNo legend="Do you smoke or use tobacco?" name="isSmoker" />
        <YesNo legend="Do you drink alcohol?" name="consumesAlcohol" />
        <YesNo legend="Have you been diagnosed with diabetes?" name="hasDiabetes" />
        <YesNo legend="Have you been diagnosed with hypertension?" name="hasHypertension" />
        <YesNo
          legend="Do you have any history of heart disease?"
          name="hasCardiacHistory"
          hint="Including angina, heart attack, bypass or stent procedures."
        />
        <YesNo legend="Do you have any history of cancer?" name="hasCancerHistory" />
        <YesNo
          legend="Have you been hospitalised in the last 12 months?"
          name="hospitalisedLast12Months"
          hint="Excluding routine check-ups and childbirth."
        />
      </fieldset>

      <Field
        label="Current medications"
        name="currentMedications"
        hint="Optional. Separate multiple medications with commas."
        error={fieldErrors.currentMedications}
      >
        {(props) => (
          <input
            {...props}
            type="text"
            placeholder="e.g. Metformin, Amlodipine"
            className={inputClass}
            style={inputStyle}
          />
        )}
      </Field>

      <div
        className="mb-5 rounded-xl border p-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="declarationAccepted"
            required
            aria-describedby={
              fieldErrors.declarationAccepted ? 'declaration-error' : undefined
            }
            aria-invalid={Boolean(fieldErrors.declarationAccepted)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[oklch(0.54_0.13_195)]"
          />
          <span>
            I confirm the information above is true and complete. I understand that cover may be
            void if it is not.
          </span>
        </label>
        {fieldErrors.declarationAccepted ? (
          <p id="declaration-error" className="mt-2 text-xs font-medium text-danger-700">
            {fieldErrors.declarationAccepted}
          </p>
        ) : null}
      </div>

      <SubmitButton pending={isPending} pendingLabel="Checking eligibility…">
        Submit declaration
      </SubmitButton>
    </form>
  );
}
