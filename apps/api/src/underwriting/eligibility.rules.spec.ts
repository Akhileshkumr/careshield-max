import type { MedicalDisclosures } from '@careshield/contracts';

import { calculateBmi, evaluateEligibility } from './eligibility.rules';

const healthy: MedicalDisclosures = {
  heightCm: 175,
  weightKg: 70, // BMI 22.9
  isSmoker: false,
  consumesAlcohol: false,
  hasDiabetes: false,
  hasHypertension: false,
  hasCardiacHistory: false,
  hasCancerHistory: false,
  hospitalisedLast12Months: false,
  currentMedications: [],
};

const withDisclosure = (overrides: Partial<MedicalDisclosures>): MedicalDisclosures => ({
  ...healthy,
  ...overrides,
});

describe('underwriting rules', () => {
  describe('ACCEPTED', () => {
    it('accepts a healthy applicant with no reasons', () => {
      expect(evaluateEligibility(healthy)).toEqual({ decision: 'ACCEPTED', reasons: [] });
    });

    it('accepts conditions that are priced by the loading rather than declined', () => {
      expect(evaluateEligibility(withDisclosure({ hasDiabetes: true })).decision).toBe('ACCEPTED');
      expect(evaluateEligibility(withDisclosure({ isSmoker: true })).decision).toBe('ACCEPTED');
      expect(evaluateEligibility(withDisclosure({ hasHypertension: true })).decision).toBe(
        'ACCEPTED',
      );
      expect(evaluateEligibility(withDisclosure({ consumesAlcohol: true })).decision).toBe(
        'ACCEPTED',
      );
    });
  });

  describe('DECLINED — outside appetite at any price', () => {
    it('declines a cancer history', () => {
      const result = evaluateEligibility(withDisclosure({ hasCancerHistory: true }));
      expect(result.decision).toBe('DECLINED');
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toMatch(/cancer/i);
    });

    it('declines a cardiac history', () => {
      expect(evaluateEligibility(withDisclosure({ hasCardiacHistory: true })).decision).toBe(
        'DECLINED',
      );
    });

    it('reports every applicable reason, not just the first', () => {
      const result = evaluateEligibility(
        withDisclosure({ hasCancerHistory: true, hasCardiacHistory: true }),
      );
      expect(result.reasons).toHaveLength(2);
    });

    it('takes precedence over a referral', () => {
      const result = evaluateEligibility(
        withDisclosure({ hasCancerHistory: true, hospitalisedLast12Months: true }),
      );
      expect(result.decision).toBe('DECLINED');
    });
  });

  describe('REFERRED — insurable, but not instantly', () => {
    it('refers a BMI above the instant-cover limit', () => {
      const result = evaluateEligibility(withDisclosure({ weightKg: 120 }));
      expect(result.decision).toBe('REFERRED');
      expect(result.reasons[0]).toMatch(/BMI/);
    });

    it('refers a BMI below the instant-cover limit', () => {
      expect(evaluateEligibility(withDisclosure({ weightKg: 45 })).decision).toBe('REFERRED');
    });

    it('refers recent hospitalisation', () => {
      expect(
        evaluateEligibility(withDisclosure({ hospitalisedLast12Months: true })).decision,
      ).toBe('REFERRED');
    });

    it('refers smoking combined with hypertension, though neither alone', () => {
      expect(evaluateEligibility(withDisclosure({ isSmoker: true })).decision).toBe('ACCEPTED');
      expect(evaluateEligibility(withDisclosure({ hasHypertension: true })).decision).toBe(
        'ACCEPTED',
      );
      expect(
        evaluateEligibility(withDisclosure({ isSmoker: true, hasHypertension: true })).decision,
      ).toBe('REFERRED');
    });
  });

  describe('determinism', () => {
    it('gives the same answer for the same disclosures, every time', () => {
      const disclosures = withDisclosure({ weightKg: 120, isSmoker: true });
      const results = Array.from({ length: 50 }, () => evaluateEligibility(disclosures));
      for (const result of results) {
        expect(result).toEqual(results[0]);
      }
    });
  });

  describe('calculateBmi', () => {
    it.each([
      [175, 70, 22.9],
      [180, 81, 25.0],
      [160, 90, 35.2],
    ])('%icm / %ikg → ~%f', (height, weight, expected) => {
      expect(calculateBmi(height, weight)).toBeCloseTo(expected, 1);
    });
  });
});
