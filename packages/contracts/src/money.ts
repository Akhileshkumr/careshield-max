// Money is held as integer paise. Binary floats cannot represent 0.1, so rupee
// arithmetic in `number` drifts and stops reconciling against the provider.
export type Minor = number;

export const MINOR_UNITS_PER_RUPEE = 100;

export const MAX_MINOR = 9_999_999_999;

const DECIMAL_STRING = /^-?\d+(\.\d{1,2})?$/;

// Throws rather than rounds: a non-2dp value means float maths leaked in upstream.
export function toMinor(amount: string | number): Minor {
  const raw = typeof amount === 'number' ? String(amount) : amount.trim();

  if (!DECIMAL_STRING.test(raw)) {
    throw new RangeError(
      `Not a valid 2dp monetary amount: ${JSON.stringify(amount)}. ` +
        `Expected a decimal string like "15000.00".`,
    );
  }

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = '0', frac = ''] = unsigned.split('.');

  const minor = Number(whole) * MINOR_UNITS_PER_RUPEE + Number(frac.padEnd(2, '0'));

  return negative ? -minor : minor;
}

export function fromMinor(minor: Minor): string {
  assertMinor(minor);

  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / MINOR_UNITS_PER_RUPEE);
  const frac = abs % MINOR_UNITS_PER_RUPEE;

  return `${negative ? '-' : ''}${whole}.${String(frac).padStart(2, '0')}`;
}

export function formatINR(minor: Minor, opts: { decimals?: boolean } = {}): string {
  assertMinor(minor);
  const decimals = opts.decimals ?? true;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(minor / MINOR_UNITS_PER_RUPEE);
}

export function sumMinor(...amounts: Minor[]): Minor {
  return amounts.reduce<Minor>((total, amount) => {
    assertMinor(amount);
    return total + amount;
  }, 0);
}

// Half-up on the paisa, stated explicitly so a future 12.5% rate inherits a defined rule.
export function percentageOf(base: Minor, rate: number): Minor {
  assertMinor(base);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new RangeError(`Loading rate must be a non-negative finite number, got ${rate}`);
  }
  return Math.round(base * rate);
}

function assertMinor(minor: number): void {
  if (!Number.isInteger(minor)) {
    throw new RangeError(
      `Monetary amounts must be integer minor units (paise), got ${minor}. ` +
        `A fractional value here means float arithmetic leaked in.`,
    );
  }
  if (Math.abs(minor) > MAX_MINOR) {
    throw new RangeError(
      `Amount ${minor} paise exceeds the NUMERIC(10,2) ceiling of ${MAX_MINOR} paise.`,
    );
  }
}
