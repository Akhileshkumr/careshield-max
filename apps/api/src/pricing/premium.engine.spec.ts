import { calculatePremium, fromMinor, PREMIUM_RULES } from '@careshield/contracts';

describe('premium engine', () => {
  const rupees = (minor: number): string => fromMinor(minor);

  describe.each`
    age    | pec      | base          | ageLoading   | condLoading  | total         | why
    ${30}  | ${false} | ${'10000.00'} | ${'0.00'}    | ${'0.00'}    | ${'10000.00'} | ${'base only'}
    ${30}  | ${true}  | ${'10000.00'} | ${'0.00'}    | ${'5000.00'} | ${'15000.00'} | ${'flat condition loading'}
    ${50}  | ${false} | ${'10000.00'} | ${'5000.00'} | ${'0.00'}    | ${'15000.00'} | ${'50% age loading'}
    ${50}  | ${true}  | ${'10000.00'} | ${'5000.00'} | ${'5000.00'} | ${'20000.00'} | ${'both loadings'}
    ${18}  | ${false} | ${'10000.00'} | ${'0.00'}    | ${'0.00'}    | ${'10000.00'} | ${'minimum age'}
    ${100} | ${true}  | ${'10000.00'} | ${'5000.00'} | ${'5000.00'} | ${'20000.00'} | ${'maximum age'}
  `(
    'age $age, pre-existing $pec ($why)',
    ({ age, pec, base, ageLoading, condLoading, total }) => {
      const breakdown = calculatePremium({ age, hasPreExistingConditions: pec });

      it(`bases at ${base}`, () => expect(rupees(breakdown.basePremiumMinor)).toBe(base));
      it(`loads age by ${ageLoading}`, () =>
        expect(rupees(breakdown.ageLoadingMinor)).toBe(ageLoading));
      it(`loads conditions by ${condLoading}`, () =>
        expect(rupees(breakdown.conditionLoadingMinor)).toBe(condLoading));
      it(`totals ${total}`, () => expect(rupees(breakdown.totalPremiumMinor)).toBe(total));
    },
  );

  describe('the age > 45 boundary', () => {
    it.each`
      age   | expected      | note
      ${44} | ${'10000.00'} | ${'below threshold'}
      ${45} | ${'10000.00'} | ${'AT threshold — not loaded, the rule is strictly greater than'}
      ${46} | ${'15000.00'} | ${'above threshold — loaded'}
    `('age $age → $expected ($note)', ({ age, expected }) => {
      const breakdown = calculatePremium({ age, hasPreExistingConditions: false });
      expect(rupees(breakdown.totalPremiumMinor)).toBe(expected);
    });

    it('treats the threshold constant as the source of truth', () => {
      const atThreshold = calculatePremium({
        age: PREMIUM_RULES.AGE_LOADING_THRESHOLD,
        hasPreExistingConditions: false,
      });
      const justOver = calculatePremium({
        age: PREMIUM_RULES.AGE_LOADING_THRESHOLD + 1,
        hasPreExistingConditions: false,
      });

      expect(atThreshold.ageLoadingMinor).toBe(0);
      expect(justOver.ageLoadingMinor).toBeGreaterThan(0);
    });
  });

  describe('determinism', () => {
    it('returns an identical breakdown for identical input, every time', () => {
      const input = { age: 50, hasPreExistingConditions: true };
      const runs = Array.from({ length: 100 }, () => calculatePremium(input));

      for (const run of runs) {
        expect(run).toEqual(runs[0]);
      }
    });
  });

  describe('the loadings are independent', () => {
    it('applies the age loading to the base only, so order cannot matter', () => {
      const both = calculatePremium({ age: 50, hasPreExistingConditions: true });
      const ageOnly = calculatePremium({ age: 50, hasPreExistingConditions: false });
      const conditionOnly = calculatePremium({ age: 30, hasPreExistingConditions: true });

      expect(both.ageLoadingMinor).toBe(ageOnly.ageLoadingMinor);
      expect(both.conditionLoadingMinor).toBe(conditionOnly.conditionLoadingMinor);

      expect(rupees(both.totalPremiumMinor)).toBe('20000.00');
    });
  });

  describe('every value stays in exact minor units', () => {
    it('never produces a fractional paisa', () => {
      for (let age = PREMIUM_RULES.MIN_AGE; age <= PREMIUM_RULES.MAX_AGE; age++) {
        for (const pec of [true, false]) {
          const b = calculatePremium({ age, hasPreExistingConditions: pec });
          expect(Number.isInteger(b.basePremiumMinor)).toBe(true);
          expect(Number.isInteger(b.ageLoadingMinor)).toBe(true);
          expect(Number.isInteger(b.conditionLoadingMinor)).toBe(true);
          expect(Number.isInteger(b.totalPremiumMinor)).toBe(true);
        }
      }
    });

    it('has a total that is exactly the sum of its parts', () => {
      const b = calculatePremium({ age: 50, hasPreExistingConditions: true });
      expect(b.totalPremiumMinor).toBe(
        b.basePremiumMinor + b.ageLoadingMinor + b.conditionLoadingMinor,
      );
    });
  });
});
