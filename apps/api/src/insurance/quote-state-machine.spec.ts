import { ALLOWED_TRANSITIONS, QUOTE_STATUSES, isTerminal, type QuoteStatus } from '@careshield/contracts';

import { InvalidStateTransitionException } from '../common/domain.exceptions';
import { assertTransition } from './quote-state-machine';

describe('quote state machine', () => {
  describe('the happy path the brief specifies', () => {
    it('allows QUOTE_GENERATED → MEDICAL_DECLARED → PREMIUM_PAID → POLICY_ISSUED', () => {
      expect(() => assertTransition('QUOTE_GENERATED', 'MEDICAL_DECLARED')).not.toThrow();
      expect(() => assertTransition('MEDICAL_DECLARED', 'PREMIUM_PAID')).not.toThrow();
      expect(() => assertTransition('PREMIUM_PAID', 'POLICY_ISSUED')).not.toThrow();
    });
  });

  describe('illegal transitions', () => {
    it('refuses to skip the medical declaration', () => {
      expect(() => assertTransition('QUOTE_GENERATED', 'PREMIUM_PAID')).toThrow(
        InvalidStateTransitionException,
      );
    });

    it('refuses to skip payment', () => {
      expect(() => assertTransition('MEDICAL_DECLARED', 'POLICY_ISSUED')).toThrow(
        InvalidStateTransitionException,
      );
    });

    it('refuses to move backwards', () => {
      expect(() => assertTransition('POLICY_ISSUED', 'PREMIUM_PAID')).toThrow();
      expect(() => assertTransition('PREMIUM_PAID', 'MEDICAL_DECLARED')).toThrow();
      expect(() => assertTransition('MEDICAL_DECLARED', 'QUOTE_GENERATED')).toThrow();
    });

    it('refuses to re-issue an already issued policy', () => {
      expect(() => assertTransition('POLICY_ISSUED', 'POLICY_ISSUED')).toThrow();
    });

    it('reports a 409 with both states in the details', () => {
      try {
        assertTransition('QUOTE_GENERATED', 'PREMIUM_PAID');
        throw new Error('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidStateTransitionException);
        const domainError = error as InvalidStateTransitionException;
        expect(domainError.getStatus()).toBe(409);
        expect(domainError.details).toEqual({ from: 'QUOTE_GENERATED', to: 'PREMIUM_PAID' });
      }
    });
  });

  describe('terminal states', () => {
    it.each(['POLICY_ISSUED', 'EXPIRED', 'DECLINED'] as QuoteStatus[])(
      '%s can never progress',
      (status) => {
        expect(isTerminal(status)).toBe(true);
        for (const target of QUOTE_STATUSES) {
          expect(() => assertTransition(status, target)).toThrow();
        }
      },
    );

    it.each(['QUOTE_GENERATED', 'MEDICAL_DECLARED', 'PREMIUM_PAID'] as QuoteStatus[])(
      '%s is not terminal',
      (status) => {
        expect(isTerminal(status)).toBe(false);
      },
    );
  });

  describe('the map itself', () => {
    it('covers every declared status, so a new state cannot be silently unhandled', () => {
      for (const status of QUOTE_STATUSES) {
        expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
      }
    });

    it('only ever points at declared statuses', () => {
      for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
        for (const target of targets) {
          expect(QUOTE_STATUSES).toContain(target);
        }
      }
    });

    it('has no state that transitions to itself', () => {
      for (const status of QUOTE_STATUSES) {
        expect(ALLOWED_TRANSITIONS[status]).not.toContain(status);
      }
    });
  });
});
