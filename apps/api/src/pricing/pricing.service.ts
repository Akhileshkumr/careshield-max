import { Injectable } from '@nestjs/common';
import {
  calculatePremium,
  fromMinor,
  type PremiumBreakdown,
  type PremiumInput,
} from '@careshield/contracts';

export interface PersistablePremium {
  basePremium: string;
  ageLoading: string;
  conditionLoading: string;
  totalPremium: string;
}

@Injectable()
export class PricingService {
  calculate(input: PremiumInput): PremiumBreakdown {
    return calculatePremium(input);
  }

  toPersistable(breakdown: PremiumBreakdown): PersistablePremium {
    return {
      basePremium: fromMinor(breakdown.basePremiumMinor),
      ageLoading: fromMinor(breakdown.ageLoadingMinor),
      conditionLoading: fromMinor(breakdown.conditionLoadingMinor),
      totalPremium: fromMinor(breakdown.totalPremiumMinor),
    };
  }
}
