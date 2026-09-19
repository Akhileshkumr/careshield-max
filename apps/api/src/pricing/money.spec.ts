import { formatINR, fromMinor, percentageOf, sumMinor, toMinor } from '@careshield/contracts';

describe('exact money arithmetic', () => {
  describe('toMinor', () => {
    it.each([
      ['10000.00', 1_000_000],
      ['15000.00', 1_500_000],
      ['20000.00', 2_000_000],
      ['0.01', 1],
      ['0.10', 10],
      ['0.1', 10],
      ['0', 0],
      ['99999999.99', 9_999_999_999],
    ])('parses %s to %i paise', (input, expected) => {
      expect(toMinor(input)).toBe(expected);
    });

    it('rejects a value that has been through float arithmetic', () => {
      expect(() => toMinor(0.1 + 0.2)).toThrow(/Not a valid 2dp monetary amount/);
      expect(0.1 + 0.2).not.toBe(0.3); // ...because this is the world we live in
    });

    it('rejects more than two decimal places rather than rounding silently', () => {
      expect(() => toMinor('100.005')).toThrow();
      expect(() => toMinor('1.234')).toThrow();
    });

    it('rejects non-numeric input', () => {
      expect(() => toMinor('abc')).toThrow();
      expect(() => toMinor('')).toThrow();
      expect(() => toMinor('1,000.00')).toThrow();
    });
  });

  describe('fromMinor', () => {
    it.each([
      [1_000_000, '10000.00'],
      [1, '0.01'],
      [10, '0.10'],
      [0, '0.00'],
      [9_999_999_999, '99999999.99'],
    ])('renders %i paise as %s', (input, expected) => {
      expect(fromMinor(input)).toBe(expected);
    });

    it('always renders exactly two decimal places', () => {
      for (const minor of [0, 1, 10, 100, 12345, 1_000_000]) {
        expect(fromMinor(minor)).toMatch(/^\d+\.\d{2}$/);
      }
    });

    it('refuses a fractional paisa, because that means float maths leaked in', () => {
      expect(() => fromMinor(100.5)).toThrow(/integer minor units/);
    });

    it('refuses to exceed the NUMERIC(10,2) ceiling the database enforces', () => {
      expect(() => fromMinor(10_000_000_000)).toThrow(/ceiling/);
    });
  });

  describe('round-tripping', () => {
    it('is lossless across the full range of premiums we can produce', () => {
      for (const value of ['10000.00', '15000.00', '20000.00', '0.01', '99999999.99']) {
        expect(fromMinor(toMinor(value))).toBe(value);
      }
    });

    it('survives the accumulation that would break a float', () => {
      let total = 0;
      for (let i = 0; i < 1000; i++) {
        total = sumMinor(total, toMinor('0.10'));
      }
      expect(fromMinor(total)).toBe('100.00');
    });
  });

  describe('percentageOf', () => {
    it('computes the 50% age loading exactly', () => {
      expect(percentageOf(toMinor('10000.00'), 0.5)).toBe(toMinor('5000.00'));
    });

    it('rounds half-up on the paisa, per the documented rule', () => {
      expect(percentageOf(1000, 0.3333)).toBe(333);
      expect(percentageOf(101, 0.125)).toBe(13);
    });

    it('rejects a negative rate', () => {
      expect(() => percentageOf(1000, -0.5)).toThrow();
    });
  });

  describe('formatINR', () => {
    it('renders currency for display', () => {
      expect(formatINR(2_000_000)).toContain('20,000.00'); // ₹20,000
      expect(formatINR(1_000_000, { decimals: false })).toContain('10,000');
    });

    it('uses Indian lakh grouping above five digits', () => {
      expect(formatINR(10_000_000)).toContain('1,00,000.00');
    });
  });
});
