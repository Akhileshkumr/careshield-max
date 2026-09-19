import { Injectable } from '@nestjs/common';
import type { MedicalDisclosures } from '@careshield/contracts';

import { evaluateEligibility, type EligibilityResult } from './eligibility.rules';

@Injectable()
export class UnderwritingService {
  evaluate(disclosures: MedicalDisclosures): EligibilityResult {
    return evaluateEligibility(disclosures);
  }
}
