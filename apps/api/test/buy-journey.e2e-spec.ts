import type { PolicyResponse, QuoteResponse } from '@careshield/contracts';

import {
  HEALTHY_DISCLOSURES,
  TEST_SERVICE_TOKEN,
  createHarness,
  createPayableQuote,
  createQuote,
  declareHealthy,
  getQuoteStatus,
  newIdempotencyKey,
  type TestHarness,
} from './setup/test-harness';

describe('buy journey (e2e)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  describe('the complete journey', () => {
    it('takes a quote from QUOTE_GENERATED to POLICY_ISSUED', async () => {
      const quote = await createQuote(harness, { age: 50, hasPreExistingConditions: true });

      expect(quote.status).toBe('QUOTE_GENERATED');
      expect(quote.breakdown).toEqual({
        basePremium: '10000.00',
        ageLoading: '5000.00',
        conditionLoading: '5000.00',
        totalPremium: '20000.00',
      });

      const declaration = await declareHealthy(harness, quote.id);

      expect(declaration.decision).toBe('ACCEPTED');
      expect(declaration.status).toBe('MEDICAL_DECLARED');
      expect(declaration.totalPremium).toBe('20000.00');
      expect(declaration.expiresAt).toBe(quote.expiresAt);

      const response = await harness
        .api()
        .post('/api/v1/insurance/checkout')
        .set('idempotency-key', newIdempotencyKey())
        .send({ quoteId: quote.id, paymentToken: 'tok_success' })
        .expect(201);

      const policy = response.body as PolicyResponse;

      expect(policy.policyNumber).toMatch(/^CSM-\d{4}-\d{6}$/);
      expect(policy.premiumPaid).toBe('20000.00');
      expect(policy.status).toBe('POLICY_ISSUED');
      expect(policy.paymentReference).toMatch(/^pay_/);

      const from = new Date(policy.effectiveFrom);
      const to = new Date(policy.effectiveTo);
      expect(to.getFullYear() - from.getFullYear()).toBe(1);

      expect(await getQuoteStatus(harness, quote.id)).toBe('POLICY_ISSUED');
    });

    it('exposes the issued policy on the quote afterwards', async () => {
      const quote = await createPayableQuote(harness);
      const checkout = await harness
        .api()
        .post('/api/v1/insurance/checkout')
        .set('idempotency-key', newIdempotencyKey())
        .send({ quoteId: quote.id, paymentToken: 'tok_success' })
        .expect(201);

      const refetched = await harness.api().get(`/api/v1/insurance/quote/${quote.id}`).expect(200);

      expect((refetched.body as QuoteResponse).policyId).toBe(
        (checkout.body as PolicyResponse).policyId,
      );
    });
  });

  describe('POST /quote', () => {
    it.each`
      age   | pec      | total
      ${30} | ${false} | ${'10000.00'}
      ${30} | ${true}  | ${'15000.00'}
      ${50} | ${false} | ${'15000.00'}
      ${50} | ${true}  | ${'20000.00'}
      ${45} | ${false} | ${'10000.00'}
      ${46} | ${false} | ${'15000.00'}
    `('prices age $age / pre-existing $pec at $total', async ({ age, pec, total }) => {
      const quote = await createQuote(harness, { age, hasPreExistingConditions: pec });
      expect(quote.breakdown.totalPremium).toBe(total);
    });

    it('locks the quote for exactly 15 minutes, per the database clock', async () => {
      const quote = await createQuote(harness);

      const lifetimeMs = Date.parse(quote.expiresAt) - Date.parse(quote.createdAt);
      expect(lifetimeMs).toBe(15 * 60 * 1000);
      expect(quote.isExpired).toBe(false);
    });

    it('returns the server clock so the client can correct its own', async () => {
      const quote = await createQuote(harness);

      expect(Number.isNaN(Date.parse(quote.serverTime))).toBe(false);
      expect(Date.parse(quote.expiresAt)).toBeGreaterThan(Date.parse(quote.serverTime));
    });

    it('is deterministic — identical input yields an identical premium', async () => {
      const inputs = { age: 50, hasPreExistingConditions: true };
      const [a, b, c] = await Promise.all([
        createQuote(harness, inputs),
        createQuote(harness, inputs),
        createQuote(harness, inputs),
      ]);

      expect(a.breakdown).toEqual(b.breakdown);
      expect(b.breakdown).toEqual(c.breakdown);
      expect(a.id).not.toBe(b.id); // ...but each is its own quote
    });

    describe('validation', () => {
      const post = (body: unknown) =>
        harness.api().post('/api/v1/insurance/quote').send(body as object);

      it.each`
        body                                                                            | why
        ${{ age: 30, hasPreExistingConditions: false }}                                 | ${'missing applicantName'}
        ${{ applicantName: 'A', age: 30, hasPreExistingConditions: false }}             | ${'name too short'}
        ${{ applicantName: 'Asha R', hasPreExistingConditions: false }}                 | ${'missing age'}
        ${{ applicantName: 'Asha R', age: 17, hasPreExistingConditions: false }}        | ${'below minimum age'}
        ${{ applicantName: 'Asha R', age: 101, hasPreExistingConditions: false }}       | ${'above maximum age'}
        ${{ applicantName: 'Asha R', age: 30.5, hasPreExistingConditions: false }}      | ${'fractional age'}
        ${{ applicantName: 'Asha R', age: 30 }}                                         | ${'missing hasPreExistingConditions'}
      `('rejects $why with 400', async ({ body }) => {
        const response = await post(body).expect(400);
        expect(response.body.code).toBe('VALIDATION_FAILED');
      });

      it('rejects a stringified age rather than coercing it', async () => {
        await post({ applicantName: 'Asha R', age: '50', hasPreExistingConditions: false }).expect(
          400,
        );
      });

      it('rejects a stringified boolean rather than coercing it', async () => {
        await post({
          applicantName: 'Asha R',
          age: 50,
          hasPreExistingConditions: 'false',
        }).expect(400);
      });

      it('rejects unknown fields instead of ignoring them', async () => {
        await post({
          applicantName: 'Asha R',
          age: 30,
          hasPreExistingConditions: false,
          hasPreExisting: true, // typo
        }).expect(400);
      });

      it('refuses a client-supplied premium', async () => {
        await post({
          applicantName: 'Asha R',
          age: 30,
          hasPreExistingConditions: false,
          totalPremium: '1.00',
        }).expect(400);
      });
    });
  });

  describe('POST /quote/:id/medical-declaration', () => {
    it('accepts a healthy applicant and advances the state', async () => {
      const quote = await createQuote(harness);
      const declaration = await declareHealthy(harness, quote.id);

      expect(declaration.decision).toBe('ACCEPTED');
      expect(await getQuoteStatus(harness, quote.id)).toBe('MEDICAL_DECLARED');
    });

    it('returns 200 with a DECLINED decision, and moves the quote to DECLINED', async () => {
      const quote = await createQuote(harness);
      const response = await harness
        .api()
        .post(`/api/v1/insurance/quote/${quote.id}/medical-declaration`)
        .send({
          disclosures: { ...HEALTHY_DISCLOSURES, hasCancerHistory: true },
          declarationAccepted: true,
        })
        .expect(200);

      expect(response.body.decision).toBe('DECLINED');
      expect(response.body.reasons.length).toBeGreaterThan(0);
      expect(await getQuoteStatus(harness, quote.id)).toBe('DECLINED');
    });

    it('treats a referral as non-instant, stopping the quote', async () => {
      const quote = await createQuote(harness);
      const response = await harness
        .api()
        .post(`/api/v1/insurance/quote/${quote.id}/medical-declaration`)
        .send({
          disclosures: { ...HEALTHY_DISCLOSURES, weightKg: 130 },
          declarationAccepted: true,
        })
        .expect(200);

      expect(response.body.decision).toBe('REFERRED');
      expect(await getQuoteStatus(harness, quote.id)).toBe('DECLINED');
    });

    it('requires the truthfulness attestation', async () => {
      const quote = await createQuote(harness);
      await harness
        .api()
        .post(`/api/v1/insurance/quote/${quote.id}/medical-declaration`)
        .send({ disclosures: HEALTHY_DISCLOSURES, declarationAccepted: false })
        .expect(400);
    });

    it('refuses a second declaration for the same quote', async () => {
      const quote = await createQuote(harness);
      await declareHealthy(harness, quote.id);

      await harness
        .api()
        .post(`/api/v1/insurance/quote/${quote.id}/medical-declaration`)
        .send({ disclosures: HEALTHY_DISCLOSURES, declarationAccepted: true })
        .expect(409);
    });

    it('404s for a quote that does not exist', async () => {
      await harness
        .api()
        .post('/api/v1/insurance/quote/3f2504e0-4f89-41d3-9a0c-0305e82c3301/medical-declaration')
        .send({ disclosures: HEALTHY_DISCLOSURES, declarationAccepted: true })
        .expect(404);
    });
  });

  describe('the service-token boundary', () => {
    it('rejects a request with no service token', async () => {
      await harness
        .anonymousApi()
        .post('/api/v1/insurance/quote')
        .send({ applicantName: 'Asha R', age: 30, hasPreExistingConditions: false })
        .expect(401);
    });

    it('rejects a wrong service token', async () => {
      await harness
        .anonymousApi()
        .post('/api/v1/insurance/quote')
        .set('x-service-token', 'not-the-token')
        .send({ applicantName: 'Asha R', age: 30, hasPreExistingConditions: false })
        .expect(401);
    });

    it('leaves /health open, because infrastructure should not hold credentials', async () => {
      const response = await harness.anonymousApi().get('/health').expect(200);
      expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    });

    it('accepts the correct token', async () => {
      await harness
        .anonymousApi()
        .post('/api/v1/insurance/quote')
        .set('x-service-token', TEST_SERVICE_TOKEN)
        .send({ applicantName: 'Asha R', age: 30, hasPreExistingConditions: false })
        .expect(201);
    });
  });

  describe('GET /quote/:id', () => {
    it('404s for an unknown quote', async () => {
      await harness
        .api()
        .get('/api/v1/insurance/quote/3f2504e0-4f89-41d3-9a0c-0305e82c3301')
        .expect(404);
    });

    it('400s for a malformed id', async () => {
      await harness.api().get('/api/v1/insurance/quote/not-a-uuid').expect(400);
    });
  });
});
