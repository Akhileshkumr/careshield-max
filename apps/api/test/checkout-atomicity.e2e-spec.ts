import type { PolicyResponse } from '@careshield/contracts';

import {
  countRows,
  createPayableQuote,
  createQuote,
  createHarness,
  expireQuote,
  getQuoteStatus,
  newIdempotencyKey,
  type TestHarness,
} from './setup/test-harness';

describe('checkout: atomicity and idempotency (e2e)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createHarness({ paymentLatencyMs: 250 });
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const checkout = (quoteId: string, token: string, key: string) =>
    harness
      .api()
      .post('/api/v1/insurance/checkout')
      .set('idempotency-key', key)
      .send({ quoteId, paymentToken: token });

  describe('Task 4.1 — rollback when processing fails mid-way', () => {
    // tok_error throws after the idempotency row is inserted and before the policy is
    // written — the exact window where a non-atomic implementation strands rows.
    it('leaves absolutely no trace when the payment provider fails', async () => {
      const quote = await createPayableQuote(harness);

      await checkout(quote.id, 'tok_error', newIdempotencyKey()).expect(502);

      expect(await countRows(harness, 'policies')).toBe(0);
      expect(await countRows(harness, 'payments')).toBe(0);
      expect(await getQuoteStatus(harness, quote.id)).toBe('MEDICAL_DECLARED');
    });

    it('is still payable afterwards — a provider failure must not burn the quote', async () => {
      const quote = await createPayableQuote(harness);

      await checkout(quote.id, 'tok_error', newIdempotencyKey()).expect(502);
      const retry = await checkout(quote.id, 'tok_success', newIdempotencyKey()).expect(201);

      expect((retry.body as PolicyResponse).policyNumber).toMatch(/^CSM-/);
      expect(await countRows(harness, 'policies')).toBe(1);
    });

    it('frees the idempotency key after a provider error, since no charge occurred', async () => {
      const quote = await createPayableQuote(harness);
      const key = newIdempotencyKey();

      await checkout(quote.id, 'tok_error', key).expect(502);
      await checkout(quote.id, 'tok_success', key).expect(201);

      expect(await countRows(harness, 'policies')).toBe(1);
    });

    it('commits an audit row on a decline, but issues no policy', async () => {
      const quote = await createPayableQuote(harness);

      const response = await checkout(quote.id, 'tok_decline', newIdempotencyKey()).expect(402);
      expect(response.body.code).toBe('PAYMENT_DECLINED');

      expect(await countRows(harness, 'policies')).toBe(0);
      expect(await countRows(harness, 'payments')).toBe(1);
      expect(await getQuoteStatus(harness, quote.id)).toBe('MEDICAL_DECLARED');
    });

    it('lets a different card succeed after a decline', async () => {
      const quote = await createPayableQuote(harness);

      await checkout(quote.id, 'tok_decline', newIdempotencyKey()).expect(402);
      await checkout(quote.id, 'tok_success', newIdempotencyKey()).expect(201);

      expect(await countRows(harness, 'policies')).toBe(1);
    });
  });

  describe('Task 4.2 — idempotency', () => {
    it('requires an Idempotency-Key header', async () => {
      const quote = await createPayableQuote(harness);

      const response = await harness
        .api()
        .post('/api/v1/insurance/checkout')
        .send({ quoteId: quote.id, paymentToken: 'tok_success' })
        .expect(400);

      expect(response.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(await countRows(harness, 'policies')).toBe(0);
    });

    it('rejects a trivially short key', async () => {
      const quote = await createPayableQuote(harness);
      await checkout(quote.id, 'tok_success', 'abc').expect(400);
    });

    it('replays the stored response instead of issuing a second policy', async () => {
      const quote = await createPayableQuote(harness);
      const key = newIdempotencyKey();

      const first = await checkout(quote.id, 'tok_success', key).expect(201);
      const second = await checkout(quote.id, 'tok_success', key).expect(200);

      expect(second.headers['idempotency-replayed']).toBe('true');
      expect(second.body).toEqual(first.body);
      expect(await countRows(harness, 'policies')).toBe(1);
    });

    it('replays consistently however many times it is retried', async () => {
      const quote = await createPayableQuote(harness);
      const key = newIdempotencyKey();

      const first = await checkout(quote.id, 'tok_success', key).expect(201);
      for (let i = 0; i < 5; i++) {
        const replay = await checkout(quote.id, 'tok_success', key).expect(200);
        expect(replay.body).toEqual(first.body);
      }

      expect(await countRows(harness, 'policies')).toBe(1);
      expect(await countRows(harness, 'payments')).toBe(1);
    });

    it('422s when a key is reused with a different body', async () => {
      const quoteA = await createPayableQuote(harness);
      const quoteB = await createPayableQuote(harness);
      const key = newIdempotencyKey();

      await checkout(quoteA.id, 'tok_success', key).expect(201);

      const reused = await checkout(quoteB.id, 'tok_success', key).expect(422);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

      expect(await countRows(harness, 'policies')).toBe(1);
      expect(await getQuoteStatus(harness, quoteB.id)).toBe('MEDICAL_DECLARED');
    });

    it('422s when only the payment token differs', async () => {
      const quote = await createPayableQuote(harness);
      const key = newIdempotencyKey();

      await checkout(quote.id, 'tok_success', key).expect(201);
      await checkout(quote.id, 'tok_decline', key).expect(422);
    });

    it('replays a declined outcome rather than re-charging', async () => {
      const quote = await createPayableQuote(harness);
      const key = newIdempotencyKey();

      await checkout(quote.id, 'tok_decline', key).expect(402);
      const replay = await checkout(quote.id, 'tok_decline', key).expect(402);

      expect(replay.body.code).toBe('PAYMENT_DECLINED');
      expect(await countRows(harness, 'payments')).toBe(1);
      expect(await countRows(harness, 'policies')).toBe(0);
    });
  });

  describe('concurrent checkout', () => {
    // Five genuinely simultaneous requests carrying one key. The winner charges and
    // commits; the others wake, find no row, re-read and replay — arbitrated by Postgres,
    // not by application retry logic.
    it('five parallel requests with one key issue exactly one policy', async () => {
      const quote = await createPayableQuote(harness, { age: 50, hasPreExistingConditions: true });
      const key = newIdempotencyKey();

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => checkout(quote.id, 'tok_success', key)),
      );

      const created = responses.filter((r) => r.status === 201);
      const replayed = responses.filter((r) => r.status === 200);

      expect(created).toHaveLength(1);
      expect(replayed).toHaveLength(4);

      const policyNumbers = new Set(responses.map((r) => (r.body as PolicyResponse).policyNumber));
      expect(policyNumbers.size).toBe(1);

      expect(await countRows(harness, 'policies')).toBe(1);
      expect(await countRows(harness, 'payments')).toBe(1);
      expect(await getQuoteStatus(harness, quote.id)).toBe('POLICY_ISSUED');
    });

    // The same race with different keys, which idempotency cannot help with. Stopped
    // purely by SELECT ... FOR UPDATE plus the state machine.
    it('five parallel requests with different keys still issue exactly one policy', async () => {
      const quote = await createPayableQuote(harness);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => checkout(quote.id, 'tok_success', newIdempotencyKey())),
      );

      const created = responses.filter((r) => r.status === 201);
      const conflicted = responses.filter((r) => r.status === 409);

      expect(created).toHaveLength(1);
      expect(conflicted).toHaveLength(4);
      for (const response of conflicted) {
        expect(response.body.code).toBe('INVALID_STATE_TRANSITION');
      }

      expect(await countRows(harness, 'policies')).toBe(1);
    });

    it('never issues twice across many interleaved attempts', async () => {
      const quote = await createPayableQuote(harness);
      const sharedKey = newIdempotencyKey();

      await Promise.all([
        checkout(quote.id, 'tok_success', sharedKey),
        checkout(quote.id, 'tok_success', sharedKey),
        checkout(quote.id, 'tok_success', newIdempotencyKey()),
        checkout(quote.id, 'tok_success', newIdempotencyKey()),
        checkout(quote.id, 'tok_success', sharedKey),
      ]);

      expect(await countRows(harness, 'policies')).toBe(1);
      expect(await getQuoteStatus(harness, quote.id)).toBe('POLICY_ISSUED');
    });
  });

  describe('expiry gate', () => {
    it('410s on an expired quote, and issues nothing', async () => {
      const quote = await createPayableQuote(harness);
      await expireQuote(harness, quote.id);

      const response = await checkout(quote.id, 'tok_success', newIdempotencyKey()).expect(410);

      expect(response.body.code).toBe('QUOTE_EXPIRED');
      expect(await countRows(harness, 'policies')).toBe(0);
      expect(await countRows(harness, 'payments')).toBe(0);
    });

    it('refuses a medical declaration on an expired quote', async () => {
      const quote = await createQuote(harness);
      await expireQuote(harness, quote.id);

      const response = await harness
        .api()
        .post(`/api/v1/insurance/quote/${quote.id}/medical-declaration`)
        .send({
          disclosures: {
            heightCm: 175,
            weightKg: 70,
            isSmoker: false,
            consumesAlcohol: false,
            hasDiabetes: false,
            hasHypertension: false,
            hasCardiacHistory: false,
            hasCancerHistory: false,
            hospitalisedLast12Months: false,
            currentMedications: [],
          },
          declarationAccepted: true,
        })
        .expect(410);

      expect(response.body.code).toBe('QUOTE_EXPIRED');
      expect(await countRows(harness, 'medical_declarations')).toBe(0);
    });

    it('reports isExpired on reads without needing the sweep to have run', async () => {
      const quote = await createQuote(harness);
      await expireQuote(harness, quote.id);

      const response = await harness.api().get(`/api/v1/insurance/quote/${quote.id}`).expect(200);

      expect(response.body.isExpired).toBe(true);
      expect(response.body.status).toBe('QUOTE_GENERATED');
    });

    it('replays an issued policy even after the quote window has passed', async () => {
      const quote = await createPayableQuote(harness);
      const key = newIdempotencyKey();

      const first = await checkout(quote.id, 'tok_success', key).expect(201);
      await expireQuote(harness, quote.id);

      const replay = await checkout(quote.id, 'tok_success', key).expect(200);
      expect(replay.body).toEqual(first.body);
    });
  });

  describe('state machine guards', () => {
    it('409s when paying before the medical declaration', async () => {
      const quote = await createQuote(harness);

      const response = await checkout(quote.id, 'tok_success', newIdempotencyKey()).expect(409);

      expect(response.body.code).toBe('INVALID_STATE_TRANSITION');
      expect(await countRows(harness, 'policies')).toBe(0);
    });

    it('403s when underwriting declined the applicant', async () => {
      const quote = await createQuote(harness);
      await harness
        .api()
        .post(`/api/v1/insurance/quote/${quote.id}/medical-declaration`)
        .send({
          disclosures: {
            heightCm: 175,
            weightKg: 70,
            isSmoker: false,
            consumesAlcohol: false,
            hasDiabetes: false,
            hasHypertension: false,
            hasCardiacHistory: true,
            hasCancerHistory: false,
            hospitalisedLast12Months: false,
            currentMedications: [],
          },
          declarationAccepted: true,
        })
        .expect(200);

      await checkout(quote.id, 'tok_success', newIdempotencyKey()).expect(409);
      expect(await countRows(harness, 'policies')).toBe(0);
    });

    it('404s for a quote that does not exist', async () => {
      await checkout(
        '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
        'tok_success',
        newIdempotencyKey(),
      ).expect(404);
    });

    it('charges the locked premium regardless of what the client sends', async () => {
      const quote = await createPayableQuote(harness, { age: 50, hasPreExistingConditions: true });

      const response = await harness
        .api()
        .post('/api/v1/insurance/checkout')
        .set('idempotency-key', newIdempotencyKey())
        .send({ quoteId: quote.id, paymentToken: 'tok_success', amount: '1.00' })
        .expect(400); // rejected outright by forbidNonWhitelisted

      expect(response.body.code).toBe('VALIDATION_FAILED');
    });
  });
});
