import { canTransition, type QuoteStatus } from '@careshield/contracts';

import { InvalidStateTransitionException } from '../common/domain.exceptions';

// Every state change routes through here, so a checkout arriving before the medical
// declaration is a 409 instead of a policy issued to an undeclared applicant.
//
// Called inside the transaction AFTER the row lock — checking before locking would
// reopen the check-then-act race the lock exists to close.
export function assertTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionException(from, to);
  }
}
