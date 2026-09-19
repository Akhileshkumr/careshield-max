import { percentageOf, sumMinor, type Minor } from './money';

// Read by the API DTOs, the DB CHECK constraints and the web forms, so the bounds
// and rates have exactly one definition.
export const PREMIUM_RULES = {
  BASE_PREMIUM_MINOR: 1_000_000 as Minor,

  AGE_LOADING_THRESHOLD: 45,

  AGE_LOADING_RATE: 0.5,

  PRE_EXISTING_CONDITION_LOADING_MINOR: 500_000 as Minor,

  MIN_AGE: 18,
  MAX_AGE: 100,

  DEFAULT_TTL_MINUTES: 15,
} as const;

// ASSUMPTION: the 50% is 50% of BASE, so the two loadings are independent and the
// order they are applied in cannot change the answer. Worst case ₹20,000, not ₹22,500.
export interface PremiumBreakdown {
  basePremiumMinor: Minor;
  ageLoadingMinor: Minor;
  conditionLoadingMinor: Minor;
  totalPremiumMinor: Minor;
}

export interface PremiumInput {
  age: number;
  hasPreExistingConditions: boolean;
}

// Pure — no clock, no database, no randomness. That is what makes a quote
// deterministic, and what lets the rules be tested as a plain truth table.
export function calculatePremium(input: PremiumInput): PremiumBreakdown {
  const basePremiumMinor = PREMIUM_RULES.BASE_PREMIUM_MINOR;

  const ageLoadingMinor =
    input.age > PREMIUM_RULES.AGE_LOADING_THRESHOLD
      ? percentageOf(basePremiumMinor, PREMIUM_RULES.AGE_LOADING_RATE)
      : 0;

  const conditionLoadingMinor = input.hasPreExistingConditions
    ? PREMIUM_RULES.PRE_EXISTING_CONDITION_LOADING_MINOR
    : 0;

  return {
    basePremiumMinor,
    ageLoadingMinor,
    conditionLoadingMinor,
    totalPremiumMinor: sumMinor(basePremiumMinor, ageLoadingMinor, conditionLoadingMinor),
  };
}
