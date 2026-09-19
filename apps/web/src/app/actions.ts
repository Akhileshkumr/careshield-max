'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  createQuoteRequestSchema,
  medicalDisclosuresSchema,
  type MedicalDisclosures,
} from '@careshield/contracts';

import type { ActionState } from '@/lib/action-state';
import { ApiClientError, checkout, createQuote, submitDeclaration } from '@/lib/api-client';

export async function createQuoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createQuoteRequestSchema.safeParse({
    applicantName: formData.get('applicantName'),
    age: toNumber(formData.get('age')),
    hasPreExistingConditions: formData.get('hasPreExistingConditions') === 'yes',
  });

  if (!parsed.success) {
    return { status: 'error', message: 'Please check the details below.', fieldErrors: fieldErrorsOf(parsed.error) };
  }

  let quoteId: string;
  try {
    const quote = await createQuote(parsed.data);
    quoteId = quote.id;
  } catch (error) {
    return toErrorState(error);
  }

  // Outside the try/catch: redirect signals by throwing, and catching it here would turn
  // a successful navigation into an error state.
  redirect(`/quote/${quoteId}`);
}

export async function submitDeclarationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const quoteId = String(formData.get('quoteId') ?? '');

  const disclosures: Record<string, unknown> = {
    heightCm: toNumber(formData.get('heightCm')),
    weightKg: toNumber(formData.get('weightKg')),
    currentMedications: splitMedications(formData.get('currentMedications')),
  };

  for (const field of BOOLEAN_DISCLOSURES) {
    disclosures[field] = formData.get(field) === 'yes';
  }

  const parsed = medicalDisclosuresSchema.safeParse(disclosures);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check your answers below.',
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  if (formData.get('declarationAccepted') !== 'on') {
    return {
      status: 'error',
      message: 'Please confirm your declaration is true and complete.',
      fieldErrors: { declarationAccepted: 'This confirmation is required.' },
    };
  }

  try {
    await submitDeclaration(quoteId, {
      disclosures: parsed.data as MedicalDisclosures,
      declarationAccepted: true,
    });
  } catch (error) {
    return toErrorState(error);
  }

  redirect(`/quote/${quoteId}`);
}

export async function checkoutAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const quoteId = String(formData.get('quoteId') ?? '');
  const paymentToken = String(formData.get('paymentToken') ?? '');

  // Minted by the CLIENT, once per attempt. Generating it here would make every
  // submission a new key — and therefore a new charge.
  const idempotencyKey = String(formData.get('idempotencyKey') ?? '');

  if (!z.uuid().safeParse(idempotencyKey).success) {
    return { status: 'error', message: 'Your session is out of date. Please reload the page.' };
  }
  if (!paymentToken) {
    return {
      status: 'error',
      message: 'Please choose a payment method.',
      fieldErrors: { paymentToken: 'Select a card to pay with.' },
    };
  }

  let policyId: string;
  try {
    const policy = await checkout({ quoteId, paymentToken }, idempotencyKey);
    policyId = policy.policyId;
  } catch (error) {
    return toErrorState(error);
  }

  redirect(`/policy/${policyId}`);
}

const BOOLEAN_DISCLOSURES = [
  'isSmoker',
  'consumesAlcohol',
  'hasDiabetes',
  'hasHypertension',
  'hasCardiacHistory',
  'hasCancerHistory',
  'hospitalisedLast12Months',
] as const;

function toNumber(value: FormDataEntryValue | null): number | undefined {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitMedications(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (key && !errors[key]) {
      errors[key] = issue.message;
    }
  }
  return errors;
}

function toErrorState(error: unknown): ActionState {
  if (error instanceof ApiClientError) {
    return { status: 'error', message: error.message, code: error.code };
  }
  if (isRedirectError(error)) throw error;

  return { status: 'error', message: 'Something went wrong. Please try again.' };
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}
