import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService.hashRequest', () => {
  const service = new IdempotencyService();

  it('produces the same hash for the same request', () => {
    const body = { quoteId: 'a-quote', paymentToken: 'tok_success' };
    expect(service.hashRequest(body)).toBe(service.hashRequest(body));
  });

  it('ignores object key order', () => {
    const a = service.hashRequest({ quoteId: 'q1', paymentToken: 'tok_success' });
    const b = service.hashRequest({ paymentToken: 'tok_success', quoteId: 'q1' });
    expect(a).toBe(b);
  });

  it('canonicalises nested objects too', () => {
    const a = service.hashRequest({ outer: { x: 1, y: 2 }, z: 3 });
    const b = service.hashRequest({ z: 3, outer: { y: 2, x: 1 } });
    expect(a).toBe(b);
  });

  it('preserves array order', () => {
    expect(service.hashRequest({ items: ['a', 'b'] })).not.toBe(
      service.hashRequest({ items: ['b', 'a'] }),
    );
  });

  it('differs when any value differs — this is what catches key reuse', () => {
    const base = { quoteId: 'q1', paymentToken: 'tok_success' };
    expect(service.hashRequest(base)).not.toBe(
      service.hashRequest({ ...base, paymentToken: 'tok_decline' }),
    );
    expect(service.hashRequest(base)).not.toBe(
      service.hashRequest({ ...base, quoteId: 'q2' }),
    );
  });

  it('distinguishes types that stringify alike', () => {
    expect(service.hashRequest({ v: 1 })).not.toBe(service.hashRequest({ v: '1' }));
    expect(service.hashRequest({ v: null })).not.toBe(service.hashRequest({ v: 'null' }));
  });
});
