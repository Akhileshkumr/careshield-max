import type { EligibilityDecision, MedicalDisclosures } from '@careshield/contracts';

export interface EligibilityResult {
  decision: EligibilityDecision;
  reasons: string[];
}

const BMI_REFERRAL_UPPER = 35;
const BMI_REFERRAL_LOWER = 16;

export function evaluateEligibility(disclosures: MedicalDisclosures): EligibilityResult {
  const declineReasons: string[] = [];
  const referralReasons: string[] = [];

  if (disclosures.hasCancerHistory) {
    declineReasons.push('A history of cancer requires full medical underwriting.');
  }
  if (disclosures.hasCardiacHistory) {
    declineReasons.push('A cardiac history requires full medical underwriting.');
  }

  const bmi = calculateBmi(disclosures.heightCm, disclosures.weightKg);
  if (bmi > BMI_REFERRAL_UPPER) {
    referralReasons.push(`A BMI of ${bmi.toFixed(1)} is above the instant-cover limit.`);
  } else if (bmi < BMI_REFERRAL_LOWER) {
    referralReasons.push(`A BMI of ${bmi.toFixed(1)} is below the instant-cover limit.`);
  }

  if (disclosures.hospitalisedLast12Months) {
    referralReasons.push('Hospitalisation in the last 12 months requires a manual review.');
  }

  if (disclosures.isSmoker && disclosures.hasHypertension) {
    referralReasons.push('Smoking combined with hypertension requires a manual review.');
  }

  if (declineReasons.length > 0) {
    return { decision: 'DECLINED', reasons: declineReasons };
  }
  if (referralReasons.length > 0) {
    return { decision: 'REFERRED', reasons: referralReasons };
  }
  return { decision: 'ACCEPTED', reasons: [] };
}

export function calculateBmi(heightCm: number, weightKg: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}
