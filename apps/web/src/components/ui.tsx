import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border p-6 shadow-sm sm:p-8 ${className}`}
      style={{ borderColor: 'var(--border)', background: 'var(--surface-raised)' }}
    >
      {children}
    </section>
  );
}

export function PageHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h1 id="step-heading" tabIndex={-1} className="text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

const STEPS = ['Your details', 'Health declaration', 'Payment'] as const;

export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center gap-2">
        {STEPS.map((label, index) => {
          const step = index + 1;
          const isDone = step < current;
          const isCurrent = step === current;

          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isDone
                    ? 'bg-success-600 text-white'
                    : isCurrent
                      ? 'bg-brand-600 text-white'
                      : 'border'
                }`}
                style={
                  !isDone && !isCurrent
                    ? { borderColor: 'var(--border)', color: 'var(--text-muted)' }
                    : undefined
                }
              >
                {isDone ? '✓' : step}
              </span>
              <span
                className={`hidden text-xs sm:inline ${isCurrent ? 'font-semibold' : ''}`}
                style={!isCurrent ? { color: 'var(--text-muted)' } : undefined}
              >
                {label}
              </span>
              {isCurrent ? <span className="sr-only">(current step)</span> : null}
              {step < STEPS.length ? (
                <span
                  aria-hidden="true"
                  className="h-px flex-1"
                  style={{ background: 'var(--border)' }}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type AlertTone = 'error' | 'warning' | 'success' | 'info';

const TONE_STYLES: Record<AlertTone, { bg: string; fg: string; border: string }> = {
  error: { bg: 'bg-danger-100', fg: 'text-danger-700', border: 'border-danger-600/30' },
  warning: { bg: 'bg-warn-100', fg: 'text-warn-700', border: 'border-warn-600/30' },
  success: { bg: 'bg-success-100', fg: 'text-success-700', border: 'border-success-600/30' },
  info: { bg: 'bg-brand-50', fg: 'text-brand-700', border: 'border-brand-600/30' },
};

// role=alert for errors, which interrupts because the user must act; role=status
// otherwise, announced politely at the next pause.
export function Alert({
  tone,
  title,
  children,
}: {
  tone: AlertTone;
  title?: string;
  children: ReactNode;
}) {
  const style = TONE_STYLES[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mb-6 rounded-xl border px-4 py-3 text-sm ${style.bg} ${style.fg} ${style.border}`}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : ''}>{children}</div>
    </div>
  );
}

// Centralises the aria-describedby / aria-invalid wiring: a visible message that is not
// programmatically associated is invisible to a screen reader.
export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    name: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const id = `field-${name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mb-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      ) : null}
      {children({
        id,
        name,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
      })}
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition ' +
  'aria-[invalid=true]:border-danger-600 min-h-11';

export const inputStyle = {
  borderColor: 'var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
} as const;

// Radio rather than checkbox: a checkbox cannot distinguish 'no' from 'not answered
// yet', and on a medical declaration that difference matters.
export function YesNo({
  legend,
  name,
  defaultValue,
  hint,
}: {
  legend: string;
  name: string;
  defaultValue?: 'yes' | 'no';
  hint?: string;
}) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {hint ? (
        <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      ) : null}
      <div className="flex gap-2">
        {(['no', 'yes'] as const).map((value) => (
          <label
            key={value}
            className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
            style={{ borderColor: 'var(--border)' }}
          >
            <input
              type="radio"
              name={name}
              value={value}
              defaultChecked={(defaultValue ?? 'no') === value}
              className="sr-only"
            />
            {value === 'yes' ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SubmitButton({
  children,
  pending,
  disabled,
  pendingLabel,
}: {
  children: ReactNode;
  pending: boolean;
  disabled?: boolean;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

// Formats the string the API returned; never parses it back into a number to do maths.
export function Money({ amount, className = '' }: { amount: string; className?: string }) {
  const [whole = '0', frac = '00'] = amount.split('.');
  const grouped = new Intl.NumberFormat('en-IN').format(Number(whole));

  return (
    <span className={className}>
      ₹{grouped}
      <span className="text-[0.7em] opacity-70">.{frac}</span>
    </span>
  );
}

export function PremiumBreakdown({
  breakdown,
}: {
  breakdown: { basePremium: string; ageLoading: string; conditionLoading: string; totalPremium: string };
}) {
  const rows = [
    { label: 'Base premium', amount: breakdown.basePremium, always: true },
    { label: 'Age loading (50%)', amount: breakdown.ageLoading, always: false },
    { label: 'Pre-existing condition loading', amount: breakdown.conditionLoading, always: false },
  ].filter((row) => row.always || row.amount !== '0.00');

  return (
    <dl className="text-sm">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between border-b py-2.5 last:border-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <dt style={{ color: 'var(--text-muted)' }}>{row.label}</dt>
          <dd className="font-medium tabular-nums">
            <Money amount={row.amount} />
          </dd>
        </div>
      ))}
      <div
        className="mt-2 flex items-baseline justify-between border-t-2 pt-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <dt className="font-semibold">Annual premium</dt>
        <dd className="text-xl font-bold tabular-nums text-brand-700">
          <Money amount={breakdown.totalPremium} />
        </dd>
      </div>
    </dl>
  );
}
