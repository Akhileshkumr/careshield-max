import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ApiClientError, getQuote } from '@/lib/api-client';
import { DeclarationForm } from '@/components/declaration-form';
import { Alert, Card, PageHeading, PremiumBreakdown, Stepper } from '@/components/ui';

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const quote = await getQuote(id).catch((error: unknown) => {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  });

  if (quote.status === 'POLICY_ISSUED' && quote.policyId) {
    redirect(`/policy/${quote.policyId}`);
  }
  if (quote.status === 'MEDICAL_DECLARED') {
    redirect(`/quote/${id}/payment`);
  }

  const recalculateHref = `/?name=${encodeURIComponent(quote.applicantName)}&age=${quote.age}`;

  if (quote.status === 'DECLINED') {
    return (
      <>
        <Stepper current={2} />
        <PageHeading title="We can't offer you instant cover" />
        <Card>
          <Alert tone="warning" title="Based on your health declaration">
            <p>We are not able to issue this policy automatically.</p>
            {quote.eligibility?.reasons.length ? (
              <ul className="mt-2 list-inside list-disc space-y-1">
                {quote.eligibility.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {quote.eligibility?.decision === 'REFERRED'
              ? 'One of our underwriters can still review your application manually. Please call us on 1800-000-000.'
              : 'This does not affect your ability to apply for our other products.'}
          </p>
        </Card>
      </>
    );
  }

  if (quote.status === 'EXPIRED' || quote.isExpired) {
    return (
      <>
        <Stepper current={2} />
        <PageHeading title="Your quote has expired" />
        <Card>
          <Alert tone="error" title="Prices are held for 15 minutes">
            Please recalculate your premium to continue.
          </Alert>
          <Link
            href={recalculateHref}
            className="inline-flex min-h-12 items-center rounded-xl bg-brand-600 px-6 font-semibold text-white transition hover:bg-brand-700"
          >
            Recalculate my premium
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <Stepper current={2} />
      <PageHeading
        title="Tell us about your health"
        description="Answer honestly — we check these answers instantly and your price will not change."
      />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">Your locked quote</h2>
        <PremiumBreakdown breakdown={quote.breakdown} />
      </Card>

      <Card>
        <DeclarationForm quoteId={quote.id} />
      </Card>
    </>
  );
}
